import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistryClient } from '../../lib/registry-client.js';

// Mock dependencies
vi.mock('node:crypto', () => ({
  createHash: vi.fn(),
}));

// Create mock AuthManager instance that persists across tests
const mockAuthManager = {
  isAuthenticated: vi.fn(),
  getAuthToken: vi.fn(),
  getOrgId: vi.fn(),
  getTokenType: vi.fn(),
  validateToken: vi.fn(),
  refreshTokenIfNeeded: vi.fn(),
};

// Mock AuthManager constructor
vi.mock('../../lib/auth-manager.js', () => ({
  AuthManager: vi.fn(() => mockAuthManager),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockCreateHash = vi.mocked(createHash);

describe('RegistryClient', () => {
  let registryClient: RegistryClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock AuthManager to default behavior
    mockAuthManager.isAuthenticated.mockReturnValue(true);
    mockAuthManager.getAuthToken.mockReturnValue('test-token');
    mockAuthManager.getOrgId.mockReturnValue('test-org');
    mockAuthManager.getTokenType.mockReturnValue('user');
    mockAuthManager.validateToken.mockResolvedValue(true);
    mockAuthManager.refreshTokenIfNeeded.mockResolvedValue(undefined);

    registryClient = new RegistryClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const client = new RegistryClient();
      expect(client).toBeDefined();
    });

    it('should use custom configuration when provided', () => {
      const customConfig = {
        apiUrl: 'https://custom-registry.example.com',
        timeout: 10000,
        retryAttempts: 5,
        uploadInBackground: false,
        verboseLogging: true,
      };
      const client = new RegistryClient(customConfig);
      expect(client).toBeDefined();
    });

    it('should merge partial configuration with defaults', () => {
      const partialConfig = {
        timeout: 15000,
        verboseLogging: true,
      };
      const client = new RegistryClient(partialConfig);
      expect(client).toBeDefined();
    });
  });

  describe('isAuthenticated', () => {
    it('should return authentication status from AuthManager', () => {
      const result = registryClient.isAuthenticated();
      expect(result).toBe(true);
    });
  });

  describe('getAuthToken', () => {
    it('should return token from AuthManager', () => {
      const result = registryClient.getAuthToken();
      expect(result).toBe('test-token');
    });
  });

  describe('has', () => {
    it('should return true when artifact exists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await registryClient.has('test-package-id');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.grata-labs.com/artifacts/lookup/test-package-id',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should return false when artifact does not exist', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await registryClient.has('test-package-id');

      expect(result).toBe(false);
    });

    it('should return false when not authenticated', async () => {
      // Mock AuthManager to return false for isAuthenticated
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      const result = await registryClient.has('test-package-id');

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await registryClient.has('test-package-id');

      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should download artifact successfully', async () => {
      const mockArrayBuffer = new ArrayBuffer(8);

      // Mock the lookup response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            id: 'artifact-123',
            data: { id: 'artifact-123' },
          }),
        })
        // Mock the download URL response
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              downloadUrl: 'https://s3.example.com/download-url',
              artifactId: 'artifact-123',
              name: 'test-package',
              size: 1024,
              hash: 'abc123',
            },
          }),
        })
        // Mock the S3 download response
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
        });

      const result = await registryClient.get('test-package-id');

      expect(result).toBeInstanceOf(Buffer);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Check the lookup call
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.grata-labs.com/artifacts/lookup/test-package-id',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      );

      // Check the download URL call
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.grata-labs.com/artifacts/artifact-123/download',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({}),
        })
      );
    });

    it('should throw error when download fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(registryClient.get('test-package-id')).rejects.toThrow(
        'Artifact lookup failed: 404'
      );
    });

    it('should throw error when not authenticated', async () => {
      // Mock AuthManager to return false for isAuthenticated
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await expect(registryClient.get('test-package-id')).rejects.toThrow(
        'Not authenticated'
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(registryClient.get('test-package-id')).rejects.toThrow(
        'Network error'
      );
    });

    it('should throw error when S3 download fails', async () => {
      // Mock the lookup response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            id: 'artifact-123',
            data: { id: 'artifact-123' },
          }),
        })
        // Mock the download URL response
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              downloadUrl: 'https://s3.example.com/download-url',
              artifactId: 'artifact-123',
            },
          }),
        })
        // Mock the S3 download response with failure
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
        });

      await expect(registryClient.get('test-package-id')).rejects.toThrow(
        'S3 download failed: 403'
      );

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should throw error when no download URL found in response', async () => {
      // Mock the lookup response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            id: 'artifact-123',
            data: { id: 'artifact-123' },
          }),
        })
        // Mock the download URL response without downloadUrl
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              artifactId: 'artifact-123',
              name: 'test-package',
              size: 1024,
              hash: 'abc123',
              // Note: no downloadUrl field
            },
          }),
        });

      await expect(registryClient.get('test-package-id')).rejects.toThrow(
        'No download URL found in response'
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error when no artifact ID found in lookup response', async () => {
      // Mock the lookup response without artifact ID
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            // Note: no id field
            name: 'test-package',
            size: 1024,
            hash: 'abc123',
          },
        }),
      });

      await expect(registryClient.get('test-package-id')).rejects.toThrow(
        'No artifact ID found in lookup response'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error when download URL request fails without s3Key', async () => {
      // Mock the lookup response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              id: 'artifact-123',
              name: 'test-package',
            },
          }),
        })
        // Mock the download URL response with failure
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: vi.fn().mockResolvedValue('Internal server error'),
        });

      await expect(registryClient.get('test-package-id')).rejects.toThrow(
        'Failed to get download URL: Internal server error'
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw special error when download URL request fails but artifact has s3Key', async () => {
      // Mock the lookup response with s3Key
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              id: 'artifact-123',
              name: 'test-package',
              s3Key: 'artifacts/artifact-123.tar.gz',
            },
          }),
        })
        // Mock the download URL response with failure
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: vi.fn().mockResolvedValue('Endpoint not found'),
        });

      await expect(registryClient.get('test-package-id')).rejects.toThrow(
        'Download endpoint not available. The artifact exists but cannot be downloaded due to API configuration issue.'
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('upload', () => {
    const mockBuffer = Buffer.from('test data');
    const mockHash = 'mocked-hash';

    beforeEach(() => {
      const mockHashInstance = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue(mockHash),
      };
      mockCreateHash.mockReturnValue(mockHashInstance as any);
    });

    it('should upload artifact successfully', async () => {
      // Mock getUploadUrl response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              uploadUrl: 'https://upload.example.com/presigned-url',
              artifactId: 'test-package-id',
              metadata: { artifactId: 'test-package-id' },
            },
          }),
        })
        // Mock actual upload response
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue('Success'),
        })
        // Mock confirmUpload response
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue('Success'),
        });

      await registryClient.upload('test-package-id', mockBuffer);

      expect(mockFetch).toHaveBeenCalledTimes(3);

      // First call should be to get upload URL
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.grata-labs.com/artifacts',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            fileName: 'test-package-id.tar.gz',
            contentType: 'application/gzip',
            size: mockBuffer.length,
            hash: mockHash,
          }),
        })
      );

      // Second call should be the actual upload
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://upload.example.com/presigned-url',
        expect.objectContaining({
          method: 'PUT',
          body: mockBuffer,
          headers: expect.objectContaining({
            'Content-Type': 'application/gzip',
            'Content-Length': mockBuffer.length.toString(),
          }),
        })
      );

      // Third call should be confirmUpload
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.grata-labs.com/artifacts/test-package-id/complete',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle quota exceeded gracefully', async () => {
      // Mock getUploadUrl response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              uploadUrl: 'https://upload.example.com/presigned-url',
              artifactId: 'test-package-id',
              metadata: {},
            },
          }),
        })
        // Mock upload response with quota exceeded
        .mockResolvedValueOnce({
          ok: false,
          status: 413,
          text: vi.fn().mockResolvedValue('Quota exceeded'),
        });

      // Should not throw error for quota exceeded
      await expect(
        registryClient.upload('test-package-id', mockBuffer)
      ).resolves.not.toThrow();
    });

    it('should handle rate limiting gracefully', async () => {
      // Mock getUploadUrl response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              uploadUrl: 'https://upload.example.com/presigned-url',
              artifactId: 'test-package-id',
              metadata: {},
            },
          }),
        })
        // Mock upload response with rate limiting
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: vi.fn().mockResolvedValue('Rate limited'),
        });

      // Should not throw error for rate limiting
      await expect(
        registryClient.upload('test-package-id', mockBuffer)
      ).resolves.not.toThrow();
    });

    it('should throw error for other upload failures', async () => {
      // Mock getUploadUrl response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              uploadUrl: 'https://upload.example.com/presigned-url',
              artifactId: 'test-package-id',
              metadata: {},
            },
          }),
        })
        // Mock upload response with server error
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: vi.fn().mockResolvedValue('Internal server error'),
        });

      await expect(
        registryClient.upload('test-package-id', mockBuffer)
      ).rejects.toThrow('Upload failed: 500 - Internal server error');
    });

    it('should skip upload when not authenticated', async () => {
      // Mock AuthManager to return false for isAuthenticated
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      // Should not throw error when not authenticated
      await expect(
        registryClient.upload('test-package-id', mockBuffer)
      ).resolves.not.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle network errors in getUploadUrl', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        registryClient.upload('test-package-id', mockBuffer)
      ).rejects.toThrow('Network error');
    });

    it('should handle upload URL fetch failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server error'),
      });

      await expect(
        registryClient.upload('test-package-id', mockBuffer)
      ).rejects.toThrow('Failed to get upload URL: 500');
    });

    it('should skip upload when artifact already exists and log appropriate message', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = new RegistryClient({ verboseLogging: true });

      // Mock getUploadUrl response with empty uploadUrl (indicating artifact exists)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            uploadUrl: '', // Empty URL indicates artifact already exists
            artifactId: 'test-package-id',
            metadata: {},
          },
        }),
      });

      await client.upload('test-package-id', mockBuffer);

      // Should only call fetch once (for getUploadUrl), not for actual upload
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should log the "already exists" message
      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Registry] Artifact test-package-id already exists in registry'
      );

      consoleSpy.mockRestore();
    });

    it('should skip upload when artifact already exists (null uploadUrl) and log appropriate message', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = new RegistryClient({ verboseLogging: true });

      // Mock getUploadUrl response with null uploadUrl
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            uploadUrl: null, // Null URL also indicates artifact already exists
            artifactId: 'test-package-id',
            metadata: {},
          },
        }),
      });

      await client.upload('test-package-id', mockBuffer);

      // Should only call fetch once (for getUploadUrl), not for actual upload
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should log the "already exists" message
      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Registry] Artifact test-package-id already exists in registry'
      );

      consoleSpy.mockRestore();
    });

    it('should throw error when artifactId is missing from upload metadata', async () => {
      // We need to test the confirmUpload method directly since the upload flow has a fallback
      // that prevents this scenario from occurring naturally

      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthToken.mockReturnValue('test-token');

      // Test confirmUpload directly with empty metadata
      await expect((registryClient as any).confirmUpload({})).rejects.toThrow(
        'No artifact ID in upload metadata'
      );
    });

    it('should throw error when artifactId is empty string in upload metadata', async () => {
      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthToken.mockReturnValue('test-token');

      // Test confirmUpload directly with empty string artifactId
      await expect(
        (registryClient as any).confirmUpload({ artifactId: '' })
      ).rejects.toThrow('No artifact ID in upload metadata');
    });

    it('should throw error when auth token is not available during confirmUpload', async () => {
      // Mock getUploadUrl response with valid artifactId
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              uploadUrl: 'https://upload.example.com/presigned-url',
              metadata: { artifactId: 'test-package-id' },
            },
          }),
        })
        // Mock successful S3 upload
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue('Success'),
        });

      // Mock auth token to be null during confirmUpload
      mockAuthManager.getAuthToken
        .mockReturnValueOnce('test-token') // For getUploadUrl
        .mockReturnValueOnce(null); // For confirmUpload

      await expect(
        registryClient.upload('test-package-id', mockBuffer)
      ).rejects.toThrow('Not authenticated');

      // Should have called fetch twice (getUploadUrl + S3 upload) but failed before confirmUpload
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw error when confirmUpload request fails', async () => {
      // Mock getUploadUrl response with valid artifactId
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            success: true,
            data: {
              uploadUrl: 'https://upload.example.com/presigned-url',
              metadata: { artifactId: 'test-package-id' },
            },
          }),
        })
        // Mock successful S3 upload
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: vi.fn().mockResolvedValue('Success'),
        })
        // Mock failed confirmUpload response
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: vi.fn().mockResolvedValue('Internal server error'),
        });

      await expect(
        registryClient.upload('test-package-id', mockBuffer)
      ).rejects.toThrow(
        'Upload confirmation failed: 500 - Internal server error'
      );

      // Should have called fetch three times (getUploadUrl + S3 upload + confirmUpload)
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify confirmUpload was called with correct parameters
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.grata-labs.com/artifacts/test-package-id/complete',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });

  describe('uploadAsync', () => {
    it('should upload synchronously when background upload is disabled', async () => {
      const client = new RegistryClient({ uploadInBackground: false });
      const testData = Buffer.from('test data');

      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthToken.mockReturnValue('test-token');

      // Mock crypto hash calculation
      const mockHashInstance = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('test-hash'),
      };
      mockCreateHash.mockReturnValue(mockHashInstance as any);

      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              uploadUrl: 'https://upload.example.com/presigned-url',
              artifactId: 'test-package-id',
              metadata: { artifactId: 'test-package-id' },
            },
          }),
      };

      mockFetch
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue('Success'),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue('Success'),
        });

      await client.uploadAsync('test-package-id', testData);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should upload in background when background upload is enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = new RegistryClient({
        uploadInBackground: true,
        verboseLogging: true,
      });
      const testData = Buffer.from('test data');

      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthToken.mockReturnValue('test-token');

      // Mock crypto hash calculation
      const mockHashInstance = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('test-hash'),
      };
      mockCreateHash.mockReturnValue(mockHashInstance as any);

      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              uploadUrl: 'https://upload.example.com/presigned-url',
              artifactId: 'test-package-id',
              metadata: { artifactId: 'test-package-id' },
            },
          }),
      };

      mockFetch
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue('Success'),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue('Success'),
        });

      // Call uploadAsync and don't await the background upload
      await client.uploadAsync('test-package-id', testData);

      // Give time for background promise to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFetch).toHaveBeenCalledTimes(3);
      consoleSpy.mockRestore();
    });

    it('should log background upload failure', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = new RegistryClient({
        uploadInBackground: true,
        verboseLogging: true,
      });
      const testData = Buffer.from('test data');

      mockAuthManager.isAuthenticated.mockReturnValue(true);
      mockAuthManager.getAuthToken.mockReturnValue('test-token');

      // Mock crypto hash calculation
      const mockHashInstance = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('test-hash'),
      };
      mockCreateHash.mockReturnValue(mockHashInstance as any);

      mockFetch.mockRejectedValue(new Error('Upload failed'));

      // Call uploadAsync and don't await the background upload
      await client.uploadAsync('test-package-id', testData);

      // Give time for background promise to settle
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Registry] Background upload failed for test-package-id: Error: Upload failed'
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getDownloadUrl', () => {
    it('should get download URL successfully', async () => {
      const client = new RegistryClient();
      mockAuthManager.getAuthToken.mockReturnValue('test-token');

      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            downloadUrl: 'https://download.example.com/artifact',
          }),
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await client.getDownloadUrl('test-package-id');

      expect(result).toBe('https://download.example.com/artifact');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.grata-labs.com/artifacts/test-package-id/download-url',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should throw error when getting download URL fails', async () => {
      const client = new RegistryClient();
      mockAuthManager.getAuthToken.mockReturnValue('test-token');

      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      await expect(client.getDownloadUrl('test-package-id')).rejects.toThrow(
        'Failed to get download URL: 404'
      );
    });
  });

  describe('calculateSHA256', () => {
    it('should calculate SHA256 hash correctly', () => {
      const testData = Buffer.from('test data');
      const mockHashInstance = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue('calculated-hash'),
      };
      mockCreateHash.mockReturnValue(mockHashInstance as any);

      const result = registryClient['calculateSHA256'](testData);

      expect(mockCreateHash).toHaveBeenCalledWith('sha256');
      expect(mockHashInstance.update).toHaveBeenCalledWith(testData);
      expect(mockHashInstance.digest).toHaveBeenCalledWith('hex');
      expect(result).toBe('calculated-hash');
    });
  });

  describe('getUploadUrl', () => {
    it('should get upload URL successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          uploadUrl: 'https://upload.example.com/presigned-url',
          artifactId: 'test-package',
          metadata: {},
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await registryClient['getUploadUrl']('test-package', {
        size: 1024,
        sha256: 'test-hash',
      });

      expect(result).toEqual({
        uploadUrl: 'https://upload.example.com/presigned-url',
        metadata: { artifactId: 'test-package' },
      });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.grata-labs.com/artifacts',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
          body: JSON.stringify({
            fileName: 'test-package.tar.gz',
            contentType: 'application/gzip',
            size: 1024,
            hash: 'test-hash',
          }),
        })
      );
    });

    it('should throw error when getting upload URL fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server error'),
      });

      await expect(
        registryClient['getUploadUrl']('test-package', {
          size: 1024,
          sha256: 'test-hash',
        })
      ).rejects.toThrow('Failed to get upload URL: 500');
    });

    it('should handle missing metadata in upload URL response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            uploadUrl: 'https://upload.example.com/presigned-url',
            artifactId: 'test-package-id',
            // metadata is missing
          },
        }),
      });

      const result = await registryClient.getUploadUrl('test-package-id', {
        size: 1024,
        sha256: 'test-hash',
      });

      expect(result).toEqual({
        uploadUrl: 'https://upload.example.com/presigned-url',
        metadata: { artifactId: 'test-package-id' },
      });
    });

    it('should handle direct response format (no data wrapper)', async () => {
      // Test the fallback: result.data || result
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          // Direct response without data wrapper
          uploadUrl: 'https://upload.example.com/presigned-url',
          artifactId: 'test-package-id',
          metadata: { custom: 'value' },
        }),
      });

      const result = await registryClient.getUploadUrl('test-package-id', {
        size: 1024,
        sha256: 'test-hash',
      });

      expect(result).toEqual({
        uploadUrl: 'https://upload.example.com/presigned-url',
        metadata: {
          artifactId: 'test-package-id',
          custom: 'value',
        },
      });
    });

    it('should fallback to packageId when artifactId is missing', async () => {
      // Test the fallback: data.artifactId || packageId
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            uploadUrl: 'https://upload.example.com/presigned-url',
            // artifactId is missing
            metadata: { custom: 'value' },
          },
        }),
      });

      const result = await registryClient.getUploadUrl('fallback-package-id', {
        size: 1024,
        sha256: 'test-hash',
      });

      expect(result).toEqual({
        uploadUrl: 'https://upload.example.com/presigned-url',
        metadata: {
          artifactId: 'fallback-package-id', // Should use packageId as fallback
          custom: 'value',
        },
      });
    });

    it('should fallback to empty string when uploadUrl is null', async () => {
      // Test the fallback: data.uploadUrl || ''
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            uploadUrl: null, // Explicitly null
            artifactId: 'test-package-id',
            metadata: {},
          },
        }),
      });

      const result = await registryClient.getUploadUrl('test-package-id', {
        size: 1024,
        sha256: 'test-hash',
      });

      expect(result).toEqual({
        uploadUrl: '', // Should fallback to empty string
        metadata: { artifactId: 'test-package-id' },
      });
    });
  });

  describe('makeRequest', () => {
    it('should make authenticated requests with proper headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const response = await registryClient['makeRequest']('/test-endpoint', {
        method: 'GET',
      });

      expect(response).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.grata-labs.com/test-endpoint',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle timeout with AbortController', async () => {
      const client = new RegistryClient({ timeout: 1000 });

      mockFetch.mockImplementation((url, options) => {
        return new Promise((resolve, reject) => {
          // Simulate a request that takes 2 seconds
          const timeoutId = setTimeout(
            () => resolve({ ok: true } as Response),
            2000
          );

          // If the signal is aborted, reject the promise
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }
        });
      });

      // The request should timeout before the fetch resolves
      await expect(client['makeRequest']('/test-endpoint')).rejects.toThrow(
        'Registry request timeout after 1000ms'
      );
    });

    it('should throw error when no authentication token is available', async () => {
      const client = new RegistryClient();
      mockAuthManager.getAuthToken.mockReturnValue(null);

      await expect(client['makeRequest']('/test-endpoint')).rejects.toThrow(
        'No authentication token available'
      );
    });
  });

  describe('logVerbose', () => {
    it('should log when verbose logging is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = new RegistryClient({ verboseLogging: true });

      client['logVerbose']('Test message');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Registry] Test message'
      );

      consoleSpy.mockRestore();
    });

    it('should not log when verbose logging is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = new RegistryClient({ verboseLogging: false });

      client['logVerbose']('Test message');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('validateToken', () => {
    it('should validate authentication token', async () => {
      const client = new RegistryClient();
      mockAuthManager.validateToken.mockResolvedValue(true);

      const result = await client.validateToken();

      expect(result).toBe(true);
      expect(mockAuthManager.validateToken).toHaveBeenCalled();
    });
  });

  describe('refreshTokenIfNeeded', () => {
    it('should refresh token if needed', async () => {
      const client = new RegistryClient();
      mockAuthManager.refreshTokenIfNeeded.mockResolvedValue(undefined);

      await client.refreshTokenIfNeeded();

      expect(mockAuthManager.refreshTokenIfNeeded).toHaveBeenCalled();
    });
  });

  describe('validateCIToken', () => {
    it('should return invalid for token not starting with ci_', async () => {
      const result = await registryClient.validateCIToken('invalid-token');

      expect(result).toEqual({
        valid: false,
        error: 'Token is not a CI token',
      });

      // Verify that no network request was made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return invalid for user token', async () => {
      const result = await registryClient.validateCIToken('user_token_123');

      expect(result).toEqual({
        valid: false,
        error: 'Token is not a CI token',
      });

      // Verify that no network request was made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return invalid for empty token', async () => {
      const result = await registryClient.validateCIToken('');

      expect(result).toEqual({
        valid: false,
        error: 'Token is not a CI token',
      });

      // Verify that no network request was made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return invalid for null-like token', async () => {
      const result = await registryClient.validateCIToken('null');

      expect(result).toEqual({
        valid: false,
        error: 'Token is not a CI token',
      });

      // Verify that no network request was made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should validate valid CI token successfully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          organization: 'test-org',
        }),
      });

      const result = await registryClient.validateCIToken('ci_valid_token_123');

      expect(result).toEqual({
        valid: true,
        organization: 'test-org',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.grata-labs.com/api/auth/validate-token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ci_valid_token_123',
          },
          body: JSON.stringify({ token: 'ci_valid_token_123' }),
        }
      );
    });

    it('should handle 401 unauthorized', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await registryClient.validateCIToken('ci_invalid_token');

      expect(result).toEqual({
        valid: false,
        error: 'Invalid or expired CI token',
      });
    });

    it('should handle 403 access denied', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await registryClient.validateCIToken('ci_denied_token');

      expect(result).toEqual({
        valid: false,
        error: 'CI token access denied',
      });
    });

    it('should handle other HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await registryClient.validateCIToken('ci_error_token');

      expect(result).toEqual({
        valid: false,
        error: 'Validation failed: HTTP 500',
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network connection failed'));

      const result = await registryClient.validateCIToken('ci_network_error');

      expect(result).toEqual({
        valid: false,
        error: 'Network connection failed',
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('String error');

      const result = await registryClient.validateCIToken('ci_string_error');

      expect(result).toEqual({
        valid: false,
        error: 'Network error during validation',
      });
    });
  });

  describe('listOrganizations', () => {
    it('should list organizations successfully', async () => {
      const mockResponse = {
        organizations: [
          {
            id: 'org1',
            name: 'Organization 1',
            isDefault: true,
            role: 'admin',
          },
          {
            id: 'org2',
            name: 'Organization 2',
            isDefault: false,
            role: 'member',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await registryClient.listOrganizations();

      expect(result).toEqual({
        organizations: mockResponse.organizations,
        defaultOrganization: 'org1',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.grata-labs.com/api/organizations',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(registryClient.listOrganizations()).rejects.toThrow(
        'Failed to list organizations: 404'
      );
    });

    it('should handle server errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(registryClient.listOrganizations()).rejects.toThrow(
        'Failed to list organizations: 500'
      );
    });

    it('should handle unauthorized errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(registryClient.listOrganizations()).rejects.toThrow(
        'Failed to list organizations: 401'
      );
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(registryClient.listOrganizations()).rejects.toThrow(
        'Failed to fetch organizations: Error: Network error'
      );
    });

    it('should use first organization as default when none marked as default', async () => {
      const mockResponse = {
        organizations: [
          {
            id: 'org1',
            name: 'Organization 1',
            isDefault: false,
            role: 'admin',
          },
          {
            id: 'org2',
            name: 'Organization 2',
            isDefault: false,
            role: 'member',
          },
        ],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await registryClient.listOrganizations();

      expect(result).toEqual({
        organizations: mockResponse.organizations,
        defaultOrganization: 'org1',
      });
    });

    it('should handle empty organizations list', async () => {
      const mockResponse = {
        organizations: [],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await registryClient.listOrganizations();

      expect(result).toEqual({
        organizations: [],
        defaultOrganization: undefined,
      });
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle JSON parsing errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      await expect(
        registryClient['getUploadUrl']('test-package', {
          size: 1024,
          sha256: 'test-hash',
        })
      ).rejects.toThrow('Invalid JSON');
    });

    it('should handle network timeouts', async () => {
      mockFetch.mockRejectedValue(new Error('AbortError'));

      const result = await registryClient.has('test-package');
      expect(result).toBe(false);
    });

    it('should handle various HTTP status codes', async () => {
      const statusCodes = [400, 401, 403, 404, 429, 500, 502, 503];

      for (const status of statusCodes) {
        mockFetch.mockResolvedValue({
          ok: false,
          status,
        });

        const result = await registryClient.has('test-package');
        expect(result).toBe(false);
      }
    });
  });
});
