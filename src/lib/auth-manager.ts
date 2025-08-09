import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getCacheDir } from './utils/path.js';

export interface AuthData {
  token: string;
  email?: string;
  orgId: string;
  tokenType: 'user' | 'ci';
  expiresAt: number | null;
}

export class AuthManager {
  private authData: AuthData | null = null;
  private authPath: string;

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
   * Refresh token if needed (placeholder for future implementation)
   */
  async refreshTokenIfNeeded(): Promise<void> {
    // For now, we don't support token refresh
    // Future implementation would handle token renewal for user tokens
    if (!this.isAuthenticated()) {
      return;
    }

    // User tokens close to expiry could be refreshed here
    if (this.authData!.tokenType === 'user' && this.authData!.expiresAt) {
      const timeUntilExpiry = this.authData!.expiresAt - Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      if (timeUntilExpiry < oneDayMs) {
        // Token expires within a day - could refresh here
        // For now, just log that refresh would be needed
      }
    }
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
    });
  }

  /**
   * Get the API URL from environment or default
   */
  private getApiUrl(): string {
    return process.env.GITCACHE_API_URL || 'https://api.grata-labs.com';
  }
}
