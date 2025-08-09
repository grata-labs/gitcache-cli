export interface RegistryConfig {
  apiUrl: string;
  timeout: number;
  retryAttempts: number;
  uploadInBackground: boolean;
  verboseLogging: boolean;
}

export interface UploadInfo {
  uploadUrl: string;
  metadata: Record<string, unknown>;
}

/**
 * Default registry configuration
 */
export const DEFAULT_REGISTRY_CONFIG: RegistryConfig = {
  apiUrl: process.env.GITCACHE_API_URL || 'https://api.grata-labs.com',
  timeout: 5000, // 5 second timeout
  retryAttempts: 2,
  uploadInBackground: true,
  verboseLogging: process.env.GITCACHE_VERBOSE === 'true',
};

/**
 * Registry client for interacting with GitCache cloud registry
 */
import { AuthManager } from './auth-manager.js';
import { createHash } from 'node:crypto';

export class RegistryClient {
  private auth: AuthManager;
  private config: RegistryConfig;

  constructor(config: Partial<RegistryConfig> = {}) {
    this.auth = new AuthManager();
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.auth.isAuthenticated();
  }

  /**
   * Get current auth token
   */
  getAuthToken(): string | null {
    return this.auth.getAuthToken();
  }

  /**
   * Validate authentication token
   */
  async validateToken(): Promise<boolean> {
    return this.auth.validateToken();
  }

  /**
   * Refresh token if needed
   */
  async refreshTokenIfNeeded(): Promise<void> {
    return this.auth.refreshTokenIfNeeded();
  }

  /**
   * Validate CI token and extract organization information
   *
   * Note: This assumes the /api/auth/validate-token endpoint exists in the GitCache infrastructure.
   * The endpoint should accept a POST request with Authorization header and return:
   * - 200: { organization: "org-name" }
   * - 401: Invalid/expired token
   * - 403: Access denied
   */
  async validateCIToken(
    token: string
  ): Promise<{ valid: boolean; organization?: string; error?: string }> {
    if (!token.startsWith('ci_')) {
      return { valid: false, error: 'Token is not a CI token' };
    }

    try {
      const response = await fetch(
        `${this.config.apiUrl}/api/auth/validate-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token }),
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          return { valid: false, error: 'Invalid or expired CI token' };
        }
        if (response.status === 403) {
          return { valid: false, error: 'CI token access denied' };
        }
        return {
          valid: false,
          error: `Validation failed: HTTP ${response.status}`,
        };
      }

      const result = await response.json();
      return {
        valid: true,
        organization: result.organization,
      };
    } catch (error) {
      return {
        valid: false,
        error:
          error instanceof Error
            ? error.message
            : 'Network error during validation',
      };
    }
  }

  /**
   * Check if an artifact exists in the registry
   */
  async has(packageId: string): Promise<boolean> {
    if (!this.isAuthenticated()) {
      return false;
    }

    try {
      const response = await this.makeRequest(
        `/artifacts/${packageId}/exists`,
        {
          method: 'HEAD',
        }
      );

      return response.ok;
    } catch (error) {
      this.logVerbose(`Registry check failed for ${packageId}: ${error}`);
      return false;
    }
  }

  /**
   * Download an artifact from the registry
   */
  async get(packageId: string): Promise<Buffer> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.makeRequest(`/artifacts/${packageId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Registry download failed: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logVerbose(`Registry download failed for ${packageId}: ${error}`);
      throw error;
    }
  }

  /**
   * Upload an artifact to the registry (non-blocking)
   */
  async uploadAsync(packageId: string, data: Buffer): Promise<void> {
    if (!this.config.uploadInBackground) {
      return this.upload(packageId, data);
    }

    // Background upload - don't await
    this.upload(packageId, data).catch((error) => {
      this.logVerbose(`Background upload failed for ${packageId}: ${error}`);
    });
  }

  /**
   * Upload an artifact to the registry
   */
  async upload(packageId: string, data: Buffer): Promise<void> {
    if (!this.isAuthenticated()) {
      this.logVerbose('Upload skipped: not authenticated');
      return;
    }

    try {
      // Get upload URL and metadata
      const uploadInfo = await this.getUploadUrl(packageId, {
        size: data.length,
        sha256: this.calculateSHA256(data),
      });

      // Upload the artifact
      const response = await fetch(uploadInfo.uploadUrl, {
        method: 'PUT',
        body: data,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': data.length.toString(),
        },
      });

      if (!response.ok) {
        if (response.status === 413 || response.status === 429) {
          // Quota exceeded - handle gracefully
          this.logVerbose('Upload skipped: quota exceeded');
          return;
        }
        throw new Error(`Upload failed: ${response.status}`);
      }

      this.logVerbose(`Successfully uploaded ${packageId}`);
    } catch (error) {
      this.logVerbose(`Upload failed for ${packageId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get a download URL for an artifact
   */
  async getDownloadUrl(packageId: string): Promise<string> {
    const response = await this.makeRequest(
      `/artifacts/${packageId}/download-url`,
      {
        method: 'GET',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get download URL: ${response.status}`);
    }

    const result = await response.json();
    return result.downloadUrl;
  }

  /**
   * Get an upload URL for an artifact
   */
  async getUploadUrl(
    packageId: string,
    metadata: Record<string, unknown>
  ): Promise<UploadInfo> {
    const response = await this.makeRequest(
      `/artifacts/${packageId}/upload-url`,
      {
        method: 'POST',
        body: JSON.stringify(metadata),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get upload URL: ${response.status}`);
    }

    const result = await response.json();
    return {
      uploadUrl: result.uploadUrl,
      metadata: result.metadata || {},
    };
  }

  /**
   * Make an authenticated request to the registry API
   */
  private async makeRequest(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const url = `${this.config.apiUrl}${path}`;

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Registry request timeout after ${this.config.timeout}ms`
        );
      }

      throw error;
    }
  }

  /**
   * Calculate SHA256 hash of data
   */
  private calculateSHA256(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Log verbose messages if enabled
   */
  private logVerbose(message: string): void {
    if (this.config.verboseLogging) {
      console.log(`[GitCache Registry] ${message}`);
    }
  }
}
