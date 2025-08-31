import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getCacheDir } from './utils/path.js';

export interface AuthData {
  token: string;
  email?: string;
  orgId: string;
  tokenType: 'user' | 'ci';
  expiresAt: number | null;
  refreshToken?: string; // Add refresh token for user tokens
}

export class AuthManager {
  private authData: AuthData | null = null;
  private authPath: string;
  private refreshPromise: Promise<void> | null = null;

  constructor() {
    this.authPath = join(getCacheDir(), 'auth.json');
    this.loadAuthData();
  }

  /**
   * Check if user is authenticated with a valid token
   * Includes environment variable detection
   */
  isAuthenticated(): boolean {
    // Check environment variable first (CI tokens)
    const envToken = process.env.GITCACHE_TOKEN;
    if (envToken && envToken.startsWith('ci_')) {
      return true; // CI tokens are considered always valid
    }

    // Check stored authentication
    if (
      !this.authData ||
      !this.authData.token ||
      !this.authData.orgId ||
      !this.authData.tokenType
    ) {
      return false;
    }

    // Check if token is expired (only for user tokens)
    if (this.authData.tokenType === 'user' && this.authData.expiresAt) {
      if (Date.now() > this.authData.expiresAt) {
        this.authData = null;
        return false;
      }
    }

    return true;
  }

  /**
   * Get the current authentication token
   * Priority: 1. Environment variable (CI), 2. Stored auth (user)
   */
  getAuthToken(): string | null {
    // Priority 1: CI environment variable
    const envToken = process.env.GITCACHE_TOKEN;
    if (envToken && envToken.startsWith('ci_')) {
      return envToken;
    }

    // Priority 2: Stored authentication
    return this.isAuthenticated() ? this.authData!.token : null;
  }

  /**
   * Get the current organization ID
   * Priority: 1. Extract from CI token, 2. Stored auth
   */
  getOrgId(): string | null {
    // Priority 1: Extract from CI token
    const envToken = process.env.GITCACHE_TOKEN;
    if (envToken && envToken.startsWith('ci_')) {
      // Extract org from CI token format: ci_orgname_randomstring
      const parts = envToken.split('_');
      if (parts.length >= 3) {
        return parts[1]; // Organization name is the second part
      }
    }

    // Priority 2: Stored authentication
    return this.isAuthenticated() ? this.authData!.orgId : null;
  }

  /**
   * Get the token type (user or ci)
   * Priority: 1. Environment variable (CI), 2. Stored auth
   */
  getTokenType(): 'user' | 'ci' | null {
    // Priority 1: CI environment variable
    const envToken = process.env.GITCACHE_TOKEN;
    if (envToken && envToken.startsWith('ci_')) {
      return 'ci';
    }

    // Priority 2: Stored authentication
    return this.isAuthenticated() ? this.authData!.tokenType : null;
  }

  /**
   * Get the current user's email address (only for user tokens)
   */
  getEmail(): string | null {
    // CI tokens don't have email addresses
    const tokenType = this.getTokenType();
    if (tokenType === 'ci') {
      return null;
    }

    // User tokens may have email stored
    return this.isAuthenticated() ? this.authData?.email || null : null;
  }

  /**
   * Validate the current token with the registry
   */
  async validateToken(): Promise<boolean> {
    if (!this.isAuthenticated()) {
      return false;
    }

    const token = this.getAuthToken();
    const tokenType = this.getTokenType();

    if (!token) {
      return false;
    }

    try {
      const apiUrl = this.getApiUrl();

      // For CI tokens, validate via artifacts endpoint (no API Gateway auth)
      if (tokenType === 'ci' || token.startsWith('ci_')) {
        const response = await fetch(`${apiUrl}/artifacts/health`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const isValid = response.status !== 401;
        if (!isValid) {
          this.clearAuthData();
        }
        return isValid;
      }

      // For user tokens, validate via dashboard API (Cognito auth)
      const response = await fetch(`${apiUrl}/api/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const isValid = response.status !== 401;
      if (!isValid) {
        this.clearAuthData();
      }
      return isValid;
    } catch {
      // Network error - assume token is still valid for graceful degradation
      return true;
    }
  }

  /**
   * Refresh token if needed (automatically handles token renewal for user tokens)
   */
  async refreshTokenIfNeeded(): Promise<void> {
    // If a refresh is already in progress, wait for it to complete
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    // Skip CI tokens completely (they don't expire)
    const envToken = process.env.GITCACHE_TOKEN;
    if (envToken && envToken.startsWith('ci_')) {
      return;
    }

    // Check if we have user auth data with refresh token
    if (
      !this.authData ||
      this.authData.tokenType !== 'user' ||
      !this.authData.refreshToken
    ) {
      return;
    }

    const authData = this.authData;

    // Refresh if token is empty/missing or expires within 5 minutes
    const timeUntilExpiry = authData.expiresAt
      ? authData.expiresAt - Date.now()
      : -1;
    const timeLeft = 5 * 60 * 1000;

    // Skip refresh if token exists and has more than 5 minutes left
    if (authData.token && authData.expiresAt && timeUntilExpiry > timeLeft) {
      return;
    }

    // Start the refresh operation and store the promise
    this.refreshPromise = this.performTokenRefresh(authData);

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Perform the actual token refresh operation
   */
  private async performTokenRefresh(authData: AuthData): Promise<void> {
    try {
      console.log('🔄 Refreshing authentication token...');
      const newAuthData = await this.refreshToken(authData.refreshToken!);

      // Update stored auth data with new tokens
      this.storeAuthData({
        ...authData,
        token: newAuthData.token,
        expiresAt: newAuthData.expiresAt,
        refreshToken: newAuthData.refreshToken || authData.refreshToken,
      });

      console.log('✅ Token refreshed successfully');
    } catch (error) {
      console.warn('⚠️  Token refresh failed:', error);
      // Don't throw - allow the operation to continue with the current token
      // The token might still be valid for a while
    }
  }

  /**
   * Refresh an authentication token using the refresh token
   */
  private async refreshToken(refreshToken: string): Promise<{
    token: string;
    expiresAt: number;
    refreshToken?: string;
  }> {
    const apiUrl = this.getApiUrl();

    const response = await fetch(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
      }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: 'Unknown error' }));
      throw new Error(
        `Token refresh failed: ${errorData.message || response.statusText}`
      );
    }

    const result = await response.json();

    // Extract expiration from the new token
    let expiresAt: number;
    try {
      const jwtPayload = JSON.parse(
        Buffer.from(result.idToken.split('.')[1], 'base64').toString()
      );
      expiresAt = jwtPayload.exp * 1000; // Convert to milliseconds
    } catch {
      // Fallback to 1 hour if JWT parsing fails
      expiresAt = Date.now() + 60 * 60 * 1000;
    }

    return {
      token: result.idToken || result.accessToken,
      expiresAt,
      refreshToken: result.refreshToken, // May be the same or new refresh token
    };
  }

  /**
   * Load authentication data from disk
   */
  private loadAuthData(): void {
    try {
      if (existsSync(this.authPath)) {
        const data = readFileSync(this.authPath, 'utf8');
        this.authData = JSON.parse(data);
      }
    } catch {
      // Invalid auth file - ignore and start fresh
      this.authData = null;
    }
  }

  /**
   * Store authentication data to disk
   */
  storeAuthData(authData: AuthData): void {
    const authDir = dirname(this.authPath);

    // Ensure directory exists
    if (!existsSync(authDir)) {
      mkdirSync(authDir, { recursive: true });
    }

    writeFileSync(this.authPath, JSON.stringify(authData, null, 2), 'utf8');

    // Update in-memory data
    this.authData = authData;
  }

  /**
   * Clear auth data (for logout or failed validation)
   */
  private clearAuthData(): void {
    this.authData = null;
    this.storeAuthData({
      token: '',
      orgId: '',
      tokenType: 'user',
      expiresAt: null,
      refreshToken: undefined, // Clear refresh token too
    });
  }

  /**
   * Get the API URL from environment or default
   */
  private getApiUrl(): string {
    return process.env.GITCACHE_API_URL || 'https://api.grata-labs.com';
  }

  /**
   * Update organization context for authenticated user
   */
  updateOrgContext(newOrgId: string): boolean {
    if (!this.isAuthenticated() || this.getTokenType() !== 'user') {
      return false;
    }

    if (!this.authData) {
      return false;
    }

    // Update the organization ID while preserving other auth data
    this.storeAuthData({
      ...this.authData,
      orgId: newOrgId,
    });

    return true;
  }
}
