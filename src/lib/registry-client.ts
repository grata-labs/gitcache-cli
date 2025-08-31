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
import { createHash } from 'node:crypto';
import { AuthManager } from './auth-manager.js';

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
   * List organizations the user has access to
   */
  async listOrganizations(): Promise<{
    organizations: Array<{
      id: string;
      name: string;
      isDefault: boolean;
      role: string;
    }>;
    defaultOrganization?: string;
  }> {
    try {
      const response = await this.makeRequest('/api/organizations', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to list organizations: ${response.status}`);
      }

      const result = await response.json();

      // Find the default organization (marked as isDefault or the first one)
      const defaultOrg =
        result.organizations?.find(
          (org: { isDefault?: boolean; id: string }) => org.isDefault
        )?.id || result.organizations?.[0]?.id;

      return {
        organizations: result.organizations,
        defaultOrganization: defaultOrg,
      };
    } catch (error) {
      throw new Error(`Failed to fetch organizations: ${String(error)}`);
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
      const encodedPackageId = encodeURIComponent(packageId);
      const lookupUrl = `/artifacts/lookup/${encodedPackageId}`;

      const response = await this.makeRequest(lookupUrl, {
        method: 'GET',
      });

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
      // First, lookup the artifact to get its metadata
      const lookupResponse = await this.makeRequest(
        `/artifacts/lookup/${encodeURIComponent(packageId)}`,
        {
          method: 'GET',
        }
      );

      if (!lookupResponse.ok) {
        throw new Error(`Artifact lookup failed: ${lookupResponse.status}`);
      }

      const artifactData = await lookupResponse.json();

      // Extract artifact ID from the standard response structure
      const artifactId = artifactData.data?.id;

      if (!artifactId) {
        throw new Error('No artifact ID found in lookup response');
      }

      // The API expects POST /artifacts/{id}/download with the ID in the path
      const downloadUrlResponse = await this.makeRequest(
        `/artifacts/${artifactId}/download`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}), // Empty body
        }
      );

      if (!downloadUrlResponse.ok) {
        const errorText = await downloadUrlResponse.text();

        // Since the download endpoint seems to not be working correctly,
        // let's check if we can construct a direct S3 URL from the artifact data
        if (artifactData.data?.s3Key) {
          throw new Error(
            'Download endpoint not available. The artifact exists but cannot be downloaded due to API configuration issue.'
          );
        }

        throw new Error(`Failed to get download URL: ${errorText}`);
      }

      const downloadData = await downloadUrlResponse.json();

      // Extract download URL from the standard response structure
      const downloadUrl = downloadData.data?.downloadUrl;

      if (!downloadUrl) {
        throw new Error('No download URL found in response');
      }

      // Download from S3
      const s3Response = await fetch(downloadUrl);
      if (!s3Response.ok) {
        throw new Error(`S3 download failed: ${s3Response.status}`);
      }

      const arrayBuffer = await s3Response.arrayBuffer();

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

      // If uploadUrl is empty, artifact already exists
      if (!uploadInfo.uploadUrl || uploadInfo.uploadUrl === '') {
        this.logVerbose(`Artifact ${packageId} already exists in registry`);
        return;
      }

      this.logVerbose(`Uploading ${data.length} bytes to S3...`);

      // Upload the artifact directly to S3 using presigned URL
      const response = await fetch(uploadInfo.uploadUrl, {
        method: 'PUT',
        body: data as BodyInit,
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Length': data.length.toString(),
          // Remove the authorization header for S3 presigned URLs
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logVerbose(`S3 upload failed: ${response.status} - ${errorText}`);

        if (response.status === 413 || response.status === 429) {
          // Quota exceeded - handle gracefully
          this.logVerbose('Upload skipped: quota exceeded');
          return;
        }
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      this.logVerbose(`Successfully uploaded ${packageId} to S3`);

      // Notify server that upload completed
      await this.confirmUpload(uploadInfo.metadata);

      this.logVerbose(`Upload confirmed for ${packageId}`);
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
    // Prepare the request body according to the API's UploadRequest interface
    const requestBody = {
      fileName: `${packageId}.tar.gz`,
      contentType: 'application/gzip',
      size: metadata.size,
      hash: metadata.sha256,
    };

    const response = await this.makeRequest(`/artifacts`, {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logVerbose(`Upload URL request failed: ${errorBody}`);
      throw new Error(`Failed to get upload URL: ${response.status}`);
    }

    const result = await response.json();

    // Backend returns: { success: true, data: { uploadUrl, artifactId } }
    const data = result.data || result; // Handle both wrapped and direct responses
    const uploadUrl = data.uploadUrl || '';
    const artifactId = data.artifactId || packageId;

    this.logVerbose(
      `Got upload URL for ${artifactId}: ${uploadUrl ? 'Present' : 'Empty (already exists)'}`
    );

    return {
      uploadUrl,
      metadata: { artifactId, ...data.metadata },
    };
  }

  /**
   * Make an authenticated request to the registry API
   */
  private async makeRequest(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    // Refresh token if needed before making the request
    await this.refreshTokenIfNeeded();

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
   * Confirm upload completion to the server
   */
  private async confirmUpload(
    metadata: Record<string, unknown>
  ): Promise<void> {
    const artifactId = metadata.artifactId as string;
    if (!artifactId) {
      throw new Error('No artifact ID in upload metadata');
    }

    const response = await this.makeRequest(
      `/artifacts/${artifactId}/complete`,
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Upload confirmation failed: ${response.status} - ${errorText}`
      );
    }
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
