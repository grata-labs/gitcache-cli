import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { AuthManager } from '../../lib/auth-manager.js';
import { getCacheDir } from '../../lib/utils/path.js';

// Mock dependencies
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  promises: {
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

vi.mock('../../lib/utils/path.js', () => ({
  getCacheDir: vi.fn().mockReturnValue('/home/test/.gitcache'),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockGetCacheDir = vi.mocked(getCacheDir);

describe('AuthManager', () => {
  let authManager: AuthManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup consistent mocks
    mockGetCacheDir.mockReturnValue('/home/test/.gitcache');

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
        'https://gitcache.grata-labs.com/auth/validate',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tokenType: 'user',
            orgId: 'test-org',
          }),
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
        'https://gitcache.grata-labs.com/auth/validate',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tokenType: 'ci',
            orgId: 'test-org',
          }),
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
        'https://custom-api.com/auth/validate',
        expect.any(Object)
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
});
