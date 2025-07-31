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
   */
  isAuthenticated(): boolean {
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
   */
  getAuthToken(): string | null {
    return this.isAuthenticated() ? this.authData!.token : null;
  }

  /**
   * Get the current organization ID
   */
  getOrgId(): string | null {
    return this.isAuthenticated() ? this.authData!.orgId : null;
  }

  /**
   * Get the token type (user or ci)
   */
  getTokenType(): 'user' | 'ci' | null {
    return this.isAuthenticated() ? this.authData!.tokenType : null;
  }

  /**
   * Validate the current token with the registry
   */
  async validateToken(): Promise<boolean> {
    if (!this.isAuthenticated()) {
      return false;
    }

    try {
      const apiUrl = this.getApiUrl();
      const response = await fetch(`${apiUrl}/auth/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authData!.token}`,
        },
        body: JSON.stringify({
          tokenType: this.authData!.tokenType,
          orgId: this.authData!.orgId,
        }),
      });

      if (!response.ok) {
        // Token is invalid, clear it
        this.authData = null;
        return false;
      }

      return true;
    } catch {
      // Network error - assume token is still valid
      // We'll fail gracefully in the registry client
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
   * Get the API URL from environment or default
   */
  private getApiUrl(): string {
    return process.env.GITCACHE_API_URL || 'https://gitcache.grata-labs.com';
  }
}
