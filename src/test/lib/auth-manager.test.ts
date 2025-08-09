import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AuthManager } from '../../lib/auth-manager.js';
import { getCacheDir } from '../../lib/utils/path.js';

// Mock dependencies
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  promises: {
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// Test constants for cross-platform path handling
const TEST_CACHE_DIR = join('home', 'test', '.gitcache');
const TEST_AUTH_FILE = join(TEST_CACHE_DIR, 'auth.json');
const TEST_NESTED_CACHE_DIR = join('home', 'test', 'nested', '.gitcache');
const TEST_NESTED_AUTH_FILE = join(TEST_NESTED_CACHE_DIR, 'auth.json');

vi.mock('../../lib/utils/path.js', () => ({
  getCacheDir: vi.fn().mockReturnValue(join('home', 'test', '.gitcache')),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockGetCacheDir = vi.mocked(getCacheDir);

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup consistent mocks
    mockGetCacheDir.mockReturnValue(TEST_CACHE_DIR);

    // Default to no auth file existing
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with no auth data when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      authManager = new AuthManager();

      expect(authManager).toBeDefined();
      expect(authManager.isAuthenticated()).toBe(false);
    });

    it('should load auth data when file exists', () => {
      const validData = {
        token: 'valid-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();

      expect(authManager.isAuthenticated()).toBe(true);
      expect(authManager.getAuthToken()).toBe('valid-token');
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when auth file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      authManager = new AuthManager();
      const result = authManager.isAuthenticated();

      expect(result).toBe(false);
    });

    it('should return false when auth file contains invalid JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json');

      authManager = new AuthManager();
      const result = authManager.isAuthenticated();

      expect(result).toBe(false);
    });

    it('should return false when token is missing', () => {
      const dataWithoutToken = {
        orgId: 'test-org',
        tokenType: 'user',
        // No token field
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(dataWithoutToken));

      authManager = new AuthManager();
      const result = authManager.isAuthenticated();

      expect(result).toBe(false);
    });

    it('should return false when user token is expired', () => {
      const expiredData = {
        token: 'expired-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() - 1000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(expiredData));

      authManager = new AuthManager();
      const result = authManager.isAuthenticated();

      expect(result).toBe(false);
    });

    it('should return true when user token is valid and not expired', () => {
      const validData = {
        token: 'valid-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();
      const result = authManager.isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return true for CI token regardless of expiration', () => {
      const ciData = {
        token: 'ci-token',
        orgId: 'test-org',
        tokenType: 'ci' as const,
        expiresAt: null,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(ciData));

      authManager = new AuthManager();
      const result = authManager.isAuthenticated();

      expect(result).toBe(true);
    });

    it('should return true when user token has no expiration', () => {
      const validData = {
        token: 'valid-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: null,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();
      const result = authManager.isAuthenticated();

      expect(result).toBe(true);
    });
  });

  describe('getAuthToken', () => {
    it('should return null when not authenticated', () => {
      mockExistsSync.mockReturnValue(false);

      authManager = new AuthManager();
      const result = authManager.getAuthToken();

      expect(result).toBe(null);
    });

    it('should return token when authenticated', () => {
      const validData = {
        token: 'valid-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();
      const result = authManager.getAuthToken();

      expect(result).toBe('valid-token');
    });

    it('should return null for expired token', () => {
      const expiredData = {
        token: 'expired-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() - 1000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(expiredData));

      authManager = new AuthManager();
      const result = authManager.getAuthToken();

      expect(result).toBe(null);
    });
  });

  describe('validateToken', () => {
    it('should return false when no token available', async () => {
      mockExistsSync.mockReturnValue(false);

      authManager = new AuthManager();
      const result = await authManager.validateToken();

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return false when API validation fails', async () => {
      const validData = {
        token: 'valid-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await authManager.validateToken();

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.grata-labs.com/api/organizations',
        {
          headers: {
            Authorization: 'Bearer valid-token',
          },
        }
      );
    });

    it('should return true when API validation succeeds', async () => {
      const validData = {
        token: 'valid-token',
        orgId: 'test-org',
        tokenType: 'ci' as const,
        expiresAt: null,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await authManager.validateToken();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.grata-labs.com/artifacts/health',
        {
          headers: {
            Authorization: 'Bearer valid-token',
          },
        }
      );
    });

    it('should return true on network errors (fail gracefully)', async () => {
      const validData = {
        token: 'valid-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();

      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await authManager.validateToken();

      expect(result).toBe(true);
    });

    it('should use custom API URL from environment', async () => {
      process.env.GITCACHE_API_URL = 'https://custom-api.com';

      const validData = {
        token: 'valid-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await authManager.validateToken();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-api.com/api/organizations',
        {
          headers: {
            Authorization: 'Bearer valid-token',
          },
        }
      );

      delete process.env.GITCACHE_API_URL;
    });
  });

  describe('refreshTokenIfNeeded', () => {
    it('should do nothing when not authenticated', async () => {
      mockExistsSync.mockReturnValue(false);

      authManager = new AuthManager();
      await authManager.refreshTokenIfNeeded();

      // Should complete without errors (placeholder implementation)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should do nothing for CI tokens', async () => {
      const ciData = {
        token: 'ci-token',
        orgId: 'test-org',
        tokenType: 'ci' as const,
        expiresAt: null,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(ciData));

      authManager = new AuthManager();
      await authManager.refreshTokenIfNeeded();

      // Should complete without errors (placeholder implementation)
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle user tokens gracefully (placeholder)', async () => {
      const userData = {
        token: 'user-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 1000, // Expires soon
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(userData));

      authManager = new AuthManager();
      await authManager.refreshTokenIfNeeded();

      // Should complete without errors (placeholder implementation)
      // Future implementation would handle token refresh
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getOrgId', () => {
    it('should return null when not authenticated', () => {
      mockExistsSync.mockReturnValue(false);

      authManager = new AuthManager();
      const result = authManager.getOrgId();

      expect(result).toBe(null);
    });

    it('should return orgId when authenticated', () => {
      const validData = {
        token: 'valid-token',
        orgId: 'test-organization',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();
      const result = authManager.getOrgId();

      expect(result).toBe('test-organization');
    });
  });

  describe('getTokenType', () => {
    it('should return null when not authenticated', () => {
      mockExistsSync.mockReturnValue(false);

      authManager = new AuthManager();
      const result = authManager.getTokenType();

      expect(result).toBe(null);
    });

    it('should return token type when authenticated', () => {
      const validData = {
        token: 'valid-token',
        orgId: 'test-organization',
        tokenType: 'ci' as const,
        expiresAt: Date.now() + 3600000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();
      const result = authManager.getTokenType();

      expect(result).toBe('ci');
    });
  });

  describe('edge cases', () => {
    it('should handle malformed JSON in auth file gracefully', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{ invalid json }');

      authManager = new AuthManager();

      expect(authManager.isAuthenticated()).toBe(false);
      expect(authManager.getAuthToken()).toBe(null);
      expect(authManager.getOrgId()).toBe(null);
    });

    it('should handle missing required fields in auth data', () => {
      const incompleteData = {
        token: 'some-token',
        // Missing orgId and tokenType
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(incompleteData));

      authManager = new AuthManager();

      // Should reject incomplete data for security (strict validation)
      expect(authManager.isAuthenticated()).toBe(false);
      expect(authManager.getAuthToken()).toBe(null);
    });

    it('should handle file read errors gracefully', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      authManager = new AuthManager();

      expect(authManager.isAuthenticated()).toBe(false);
    });

    it('should clear auth data when token validation fails', async () => {
      const validData = {
        token: 'invalid-token',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validData));

      authManager = new AuthManager();

      // Token should be valid initially
      expect(authManager.isAuthenticated()).toBe(true);

      // Mock failed validation
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const isValid = await authManager.validateToken();

      expect(isValid).toBe(false);
      // Auth data should be cleared after failed validation
      expect(authManager.isAuthenticated()).toBe(false);
    });
  });

  describe('storeAuthData', () => {
    beforeEach(() => {
      // Setup fresh state for each storeAuthData test
      mockExistsSync.mockReturnValue(false);
      mockWriteFileSync.mockClear();
      mockMkdirSync.mockClear();
    });

    it('should store valid user auth data successfully', () => {
      const authData = {
        token: 'user-token-123',
        email: 'test@example.com',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };

      // Directory already exists
      mockExistsSync.mockReturnValue(true);

      authManager = new AuthManager();
      authManager.storeAuthData(authData);

      // Verify writeFileSync was called with correct parameters
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_AUTH_FILE,
        JSON.stringify(authData, null, 2),
        'utf8'
      );

      // Verify directory creation was not needed
      expect(mockMkdirSync).not.toHaveBeenCalled();

      // Verify in-memory data was updated
      expect(authManager.isAuthenticated()).toBe(true);
      expect(authManager.getAuthToken()).toBe('user-token-123');
      expect(authManager.getOrgId()).toBe('test-org');
      expect(authManager.getTokenType()).toBe('user');
    });

    it('should store valid CI auth data successfully', () => {
      const authData = {
        token: 'ci_token_456',
        orgId: 'ci-org',
        tokenType: 'ci' as const,
        expiresAt: null,
      };

      // Directory already exists
      mockExistsSync.mockReturnValue(true);

      authManager = new AuthManager();
      authManager.storeAuthData(authData);

      // Verify writeFileSync was called with correct parameters
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_AUTH_FILE,
        JSON.stringify(authData, null, 2),
        'utf8'
      );

      // Verify directory creation was not needed
      expect(mockMkdirSync).not.toHaveBeenCalled();

      // Verify in-memory data was updated
      expect(authManager.isAuthenticated()).toBe(true);
      expect(authManager.getAuthToken()).toBe('ci_token_456');
      expect(authManager.getOrgId()).toBe('ci-org');
      expect(authManager.getTokenType()).toBe('ci');
    });

    it('should create directory when it does not exist', () => {
      const authData = {
        token: 'token-123',
        orgId: 'test-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };

      // Directory does not exist
      mockExistsSync.mockReturnValue(false);

      authManager = new AuthManager();
      authManager.storeAuthData(authData);

      // Verify directory was created recursively
      expect(mockMkdirSync).toHaveBeenCalledWith(TEST_CACHE_DIR, {
        recursive: true,
      });

      // Verify file was written
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_AUTH_FILE,
        JSON.stringify(authData, null, 2),
        'utf8'
      );

      // Verify in-memory data was updated
      expect(authManager.isAuthenticated()).toBe(true);
    });

    it('should handle nested directory structure', () => {
      // Mock a deeper cache directory path
      mockGetCacheDir.mockReturnValue(TEST_NESTED_CACHE_DIR);

      const authData = {
        token: 'token-deep',
        orgId: 'deep-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };

      // Directory does not exist
      mockExistsSync.mockReturnValue(false);

      authManager = new AuthManager();
      authManager.storeAuthData(authData);

      // Verify directory was created recursively for nested path
      expect(mockMkdirSync).toHaveBeenCalledWith(TEST_NESTED_CACHE_DIR, {
        recursive: true,
      });

      // Verify file was written to correct path
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_NESTED_AUTH_FILE,
        JSON.stringify(authData, null, 2),
        'utf8'
      );
    });

    it('should overwrite existing auth data', () => {
      // Start with existing auth data
      const existingData = {
        token: 'old-token',
        orgId: 'old-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 1000,
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(existingData));

      authManager = new AuthManager();

      // Verify initial state
      expect(authManager.getAuthToken()).toBe('old-token');
      expect(authManager.getOrgId()).toBe('old-org');

      // Store new auth data
      const newData = {
        token: 'new-token',
        email: 'new@example.com',
        orgId: 'new-org',
        tokenType: 'ci' as const,
        expiresAt: null,
      };

      authManager.storeAuthData(newData);

      // Verify new data was written
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_AUTH_FILE,
        JSON.stringify(newData, null, 2),
        'utf8'
      );

      // Verify in-memory data was updated
      expect(authManager.getAuthToken()).toBe('new-token');
      expect(authManager.getOrgId()).toBe('new-org');
      expect(authManager.getTokenType()).toBe('ci');
    });

    it('should handle filesystem errors gracefully', () => {
      const authData = {
        token: 'token-error',
        orgId: 'error-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };

      // Directory exists but writeFileSync throws
      mockExistsSync.mockReturnValue(true);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      authManager = new AuthManager();

      // Should throw error when filesystem operation fails
      expect(() => {
        authManager.storeAuthData(authData);
      }).toThrow('Permission denied');

      // Verify the file write was attempted
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_AUTH_FILE,
        JSON.stringify(authData, null, 2),
        'utf8'
      );
    });

    it('should handle directory creation errors gracefully', () => {
      const authData = {
        token: 'token-mkdir-error',
        orgId: 'mkdir-error-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 3600000,
      };

      // Directory doesn't exist and mkdirSync throws
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockImplementation(() => {
        throw new Error('Cannot create directory');
      });

      authManager = new AuthManager();

      // Should throw error when directory creation fails
      expect(() => {
        authManager.storeAuthData(authData);
      }).toThrow('Cannot create directory');

      // Verify directory creation was attempted
      expect(mockMkdirSync).toHaveBeenCalledWith(TEST_CACHE_DIR, {
        recursive: true,
      });

      // File write should not be attempted if directory creation fails
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should handle auth data with optional fields', () => {
      // Test with minimal required fields only
      const minimalData = {
        token: 'minimal-token',
        orgId: 'minimal-org',
        tokenType: 'ci' as const,
        expiresAt: null,
      };

      mockExistsSync.mockReturnValue(true);

      authManager = new AuthManager();
      authManager.storeAuthData(minimalData);

      // Verify data was stored correctly
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_AUTH_FILE,
        JSON.stringify(minimalData, null, 2),
        'utf8'
      );

      // Verify in-memory data
      expect(authManager.getAuthToken()).toBe('minimal-token');
      expect(authManager.getOrgId()).toBe('minimal-org');
      expect(authManager.getTokenType()).toBe('ci');
    });

    it('should format JSON with proper indentation', () => {
      const authData = {
        token: 'format-test-token',
        email: 'format@example.com',
        orgId: 'format-org',
        tokenType: 'user' as const,
        expiresAt: 1234567890,
      };

      mockExistsSync.mockReturnValue(true);

      authManager = new AuthManager();
      authManager.storeAuthData(authData);

      // Verify JSON.stringify was called with proper formatting
      const expectedJson = JSON.stringify(authData, null, 2);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        TEST_AUTH_FILE,
        expectedJson,
        'utf8'
      );

      // Verify the formatted JSON has proper indentation
      expect(expectedJson).toContain('  "token":');
      expect(expectedJson).toContain('  "email":');
      expect(expectedJson).toContain('  "orgId":');
    });

    it('should update in-memory data even when previously unauthenticated', () => {
      // Start with no auth data
      mockExistsSync.mockReturnValue(false);

      authManager = new AuthManager();

      // Verify initially unauthenticated
      expect(authManager.isAuthenticated()).toBe(false);

      const authData = {
        token: 'new-user-token',
        email: 'newuser@example.com',
        orgId: 'new-user-org',
        tokenType: 'user' as const,
        expiresAt: Date.now() + 7200000,
      };

      authManager.storeAuthData(authData);

      // Verify now authenticated with new data
      expect(authManager.isAuthenticated()).toBe(true);
      expect(authManager.getAuthToken()).toBe('new-user-token');
      expect(authManager.getOrgId()).toBe('new-user-org');
      expect(authManager.getTokenType()).toBe('user');
    });
  });
});
