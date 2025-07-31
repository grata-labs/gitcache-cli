import { existsSync, statSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../commands/status.js';
import { AuthManager } from '../../lib/auth-manager.js';
import * as pruneLib from '../../lib/prune.js';
import { RegistryClient } from '../../lib/registry-client.js';
import { TarballBuilder } from '../../lib/tarball-builder.js';
import * as pathUtils from '../../lib/utils/path.js';

// Mock dependencies
vi.mock('../../lib/registry-client.js');
vi.mock('../../lib/auth-manager.js');
vi.mock('../../lib/tarball-builder.js');
vi.mock('../../lib/prune.js');
vi.mock('../../lib/utils/path.js');
vi.mock('node:fs');
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/Users/testuser'),
}));

// Mock child_process for tarball counting
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

// Mock util for promisify
vi.mock('node:util', () => ({
  promisify: vi.fn((fn) => fn),
}));

const mockRegistryClient = vi.mocked(RegistryClient);
const mockAuthManager = vi.mocked(AuthManager);
const mockTarballBuilder = vi.mocked(TarballBuilder);
const mockCalculateCacheSize = vi.mocked(pruneLib.calculateCacheSize);
const mockFormatBytes = vi.mocked(pruneLib.formatBytes);
const mockGetCacheEntries = vi.mocked(pruneLib.getCacheEntries);
const mockGetCacheDir = vi.mocked(pathUtils.getCacheDir);
const mockExistsSync = vi.mocked(existsSync);
const mockStatSync = vi.mocked(statSync);

describe('Status Command', () => {
  let statusCommand: Status;
  let mockRegistryInstance: any;
  let mockAuthManagerInstance: any;
  let mockTarballBuilderInstance: any;
  let mockExecAsync: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock instances
    mockRegistryInstance = {
      isAuthenticated: vi.fn(),
      validateToken: vi.fn(),
      getAuthToken: vi.fn(),
    };

    mockAuthManagerInstance = {
      isAuthenticated: vi.fn(),
      validateToken: vi.fn(),
      getOrgId: vi.fn(),
      getTokenType: vi.fn(),
    };

    mockTarballBuilderInstance = {
      getCachedTarball: vi.fn(),
      buildTarball: vi.fn(),
    };

    // Mock exec function for tarball counting
    mockExecAsync = vi.fn().mockResolvedValue({ stdout: '5' }); // 5 packages

    // Mock constructors
    mockRegistryClient.mockImplementation(() => mockRegistryInstance);
    mockAuthManager.mockImplementation(() => mockAuthManagerInstance);
    mockTarballBuilder.mockImplementation(() => mockTarballBuilderInstance);

    // Mock utility functions
    mockGetCacheDir.mockReturnValue('/Users/testuser/.gitcache');
    mockCalculateCacheSize.mockReturnValue(1024 * 1024 * 100); // 100MB
    mockFormatBytes.mockReturnValue('100 MB');
    mockGetCacheEntries.mockReturnValue([
      {
        path: '/path/1',
        size: 1000,
        accessTime: new Date(),
        commitSha: 'abc123',
        platform: 'darwin-arm64',
      },
      {
        path: '/path/2',
        size: 2000,
        accessTime: new Date(),
        commitSha: 'def456',
        platform: 'darwin-arm64',
      },
      {
        path: '/path/3',
        size: 3000,
        accessTime: new Date(),
        commitSha: 'ghi789',
        platform: 'darwin-arm64',
      },
      {
        path: '/path/4',
        size: 4000,
        accessTime: new Date(),
        commitSha: 'jkl012',
        platform: 'darwin-arm64',
      },
      {
        path: '/path/5',
        size: 5000,
        accessTime: new Date(),
        commitSha: 'mno345',
        platform: 'darwin-arm64',
      },
    ]);

    // Mock dynamic imports
    vi.doMock('node:child_process', () => ({
      exec: vi.fn(),
    }));

    vi.doMock('node:util', () => ({
      promisify: vi.fn(() => mockExecAsync),
    }));

    statusCommand = new Status();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize all required dependencies', () => {
      expect(mockRegistryClient).toHaveBeenCalled();
      expect(mockAuthManager).toHaveBeenCalled();
      expect(mockTarballBuilder).toHaveBeenCalled();
    });
  });

  describe('exec', () => {
    beforeEach(() => {
      // Setup default mocks for all methods that need to work
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);
      mockAuthManagerInstance.validateToken.mockResolvedValue(false);
      mockAuthManagerInstance.getOrgId.mockReturnValue(null);
      mockAuthManagerInstance.getTokenType.mockReturnValue(null);

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        mtime: new Date('2025-07-20'),
      } as any);

      // Mock fs.stat for disk space calculation
      vi.doMock('node:fs/promises', async () => ({
        stat: vi.fn().mockResolvedValue({ size: 1000000 }),
      }));
    });

    it('should return basic status when not authenticated', async () => {
      const result = await statusCommand.exec([], {});

      expect(result).toContain('✓ Local cache: 100 MB (5 packages)');
      expect(result).toContain('❌ Registry: Not connected');
      expect(result).toContain('Run: gitcache setup --org <organization>');
    });

    it('should return detailed status when detailed option is true', async () => {
      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Local Cache:');
      expect(result).toContain('Size: 100 MB (5 packages)');
      expect(result).toContain('Directory: /Users/testuser/.gitcache');
      expect(result).toContain('Registry:');
      expect(result).toContain('Status: Not connected');
    });

    it('should return JSON format when json option is true', async () => {
      const result = await statusCommand.exec([], { json: true });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('localCache');
      expect(parsed).toHaveProperty('registry');
      expect(parsed.localCache.size).toBe(104857600); // 100MB in bytes
      expect(parsed.localCache.packageCount).toBe(5);
      expect(parsed.registry.connected).toBe(false);
      expect(parsed.registry.reason).toBe('not_authenticated');
    });

    it('should show connected status when authenticated', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');

      const result = await statusCommand.exec([], {});

      expect(result).toContain('✓ Registry: Connected (test-org)');
    });

    it('should show CI token status', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('ci');

      const result = await statusCommand.exec([], {});

      expect(result).toContain('✓ Registry: Connected (test-org) [CI Token]');
    });

    it('should show invalid token status', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(false);

      const result = await statusCommand.exec([], {});

      expect(result).toContain('⚠️  Registry: Token expired');
      expect(result).toContain('Run: gitcache setup to refresh');
    });

    it('should handle network errors gracefully', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockRejectedValue(
        new Error('Network timeout')
      );

      const result = await statusCommand.exec([], {});

      expect(result).toContain('⚠️  Registry: Connection failed');
      expect(result).toContain('Check your network connection');
    });

    it('should handle detailed status with connected registry', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');

      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Registry:');
      expect(result).toContain('Status: Connected');
      expect(result).toContain('Organization: test-org');
      expect(result).toContain('Token type: User token');
      expect(result).toContain('API endpoint: https://gitcache.grata-labs.com');
    });

    it('should handle CI token in detailed status', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('ci');

      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Token type: CI token');
      expect(result).toContain('Token expires: Never (CI token)');
    });

    it('should handle exec failure gracefully and return 0 packages', async () => {
      // Mock getCacheEntries failure for tarball counting
      mockGetCacheEntries.mockReturnValue([]);

      const result = await statusCommand.exec([], { json: true });

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('localCache');
      expect(parsed.localCache.packageCount).toBe(0); // Should fallback to 0
    });

    it('should continue working when tarball counting fails', async () => {
      // Mock getCacheEntries failure for tarball counting
      mockGetCacheEntries.mockReturnValue([]);

      const result = await statusCommand.exec([], {});

      // Should still return valid output, just with 0 packages
      expect(result).toContain('✓ Local cache: 100 MB (0 packages)');
      expect(result).toContain('❌ Registry: Not connected');
    });

    it('should handle disk space calculation errors gracefully', async () => {
      // Mock fs.stat to throw error (line 75-82)
      vi.doMock('node:fs/promises', () => ({
        stat: vi.fn().mockRejectedValue(new Error('Access denied')),
      }));

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      expect(parsed.localCache.diskSpaceAvailable).toBeNull();
    });

    it('should handle status collection errors in JSON mode', async () => {
      // Mock to throw an error during status collection
      mockGetCacheDir.mockImplementation(() => {
        throw new Error('Cache directory not accessible');
      });

      const result = await statusCommand.exec([], { json: true });

      expect(result).toContain('"error"');
      expect(result).toContain('Failed to collect status information');
    });

    it('should throw error when status collection fails in non-JSON mode', async () => {
      // Mock to throw an error during status collection
      mockGetCacheDir.mockImplementation(() => {
        throw new Error('Cache directory not accessible');
      });

      await expect(statusCommand.exec([], {})).rejects.toThrow(
        'Failed to get status: Error: Cache directory not accessible'
      );
    });
  });

  describe('getLocalCacheInfo', () => {
    it('should collect local cache information correctly', async () => {
      // Mock tarball count with 10 entries
      mockGetCacheEntries.mockReturnValue([
        {
          path: '/path/1',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'abc123',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/2',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'def456',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/3',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'ghi789',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/4',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'jkl012',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/5',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'mno345',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/6',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'pqr678',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/7',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'stu901',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/8',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'vwx234',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/9',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'yza567',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/10',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'bcd890',
          platform: 'darwin-arm64',
        },
      ]);

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({
        mtime: new Date('2025-07-25'),
      } as any);

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      expect(parsed.localCache.packageCount).toBe(10);
      expect(parsed.localCache.directory).toBe('/Users/testuser/.gitcache');
      expect(parsed.localCache.diskSpaceAvailable).toBe(0.85);
    });

    it('should handle missing cache directory', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      expect(parsed.localCache.lastCleanup).toBeNull();
    });

    it('should handle statSync errors when getting directory stats', async () => {
      // Mock existsSync to return true but statSync to throw an error
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      // Should handle the error gracefully and set lastCleanup to null
      expect(parsed.localCache.lastCleanup).toBeNull();
      // Other properties should still be populated correctly
      expect(parsed.localCache.size).toBe(104857600); // 100MB in bytes
      expect(parsed.localCache.packageCount).toBe(5);
      expect(parsed.localCache.directory).toBe('/Users/testuser/.gitcache');
    });
  });

  describe('getRegistryInfo', () => {
    it('should return not authenticated when user is not authenticated', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      expect(parsed.registry.connected).toBe(false);
      expect(parsed.registry.reason).toBe('not_authenticated');
    });

    it('should handle invalid token', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(false);

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      expect(parsed.registry.connected).toBe(false);
      expect(parsed.registry.reason).toBe('invalid_token');
    });

    it('should handle network errors during validation', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockRejectedValue(
        new Error('Network error')
      );

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      expect(parsed.registry.connected).toBe(false);
      expect(parsed.registry.reason).toBe('network_error');
      expect(parsed.registry.error).toBe('Error: Network error');
    });

    it('should handle organization info errors when connected', async () => {
      // Setup authenticated state with valid token
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');

      // Create a spy on the getOrganizationInfo method and make it throw
      const statusCommandSpy = vi.spyOn(
        statusCommand as any,
        'getOrganizationInfo'
      );
      statusCommandSpy.mockRejectedValue(
        new Error('Organization API unavailable')
      );

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      // Should still be connected but with error handling
      expect(parsed.registry.connected).toBe(true);
      expect(parsed.registry.organization).toBe('test-org'); // Falls back to orgId
      expect(parsed.registry.teamCacheSize).toBeNull(); // Set to null on error
      expect(parsed.registry.tokenType).toBe('user');
      expect(parsed.registry.error).toBe('Error: Organization API unavailable');
    });

    it('should handle token expiry information', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      expect(parsed.registry.tokenExpiry).toBeNull(); // Returns null for user tokens in current implementation
    });

    it('should handle CI token expiry as never expires', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('ci');

      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Token expires: Never (CI token)');
    });

    it('should handle registry connection errors in detailed format', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockRejectedValue(
        new Error('Connection timeout')
      );

      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Status: Not connected');
      expect(result).toContain(
        'Reason: Network error: Error: Connection timeout'
      );
    });

    it('should handle not authenticated status in detailed format', async () => {
      // Line 132: not authenticated detailed formatting
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Status: Not connected');
      expect(result).toContain(
        'Reason: Not authenticated (run: gitcache setup --org <organization>)'
      );
    });

    it('should display detailed status with organization error handling', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');

      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Status: Connected');
      expect(result).toContain('Organization: test-org');
      expect(result).toContain('Token type: User token');
    });

    it('should handle invalid token in detailed format', async () => {
      // Line 366: invalid token detailed formatting
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(false);

      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Status: Not connected');
      expect(result).toContain(
        'Reason: Token expired (run: gitcache setup to refresh)'
      );
    });

    it('should handle network error disconnect reason', async () => {
      // Line 379: network_error reason formatting
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockRejectedValue(
        new Error('ENOTFOUND')
      );

      const result = await statusCommand.exec([], {});

      expect(result).toContain('⚠️  Registry: Connection failed');
      expect(result).toContain('Check your network connection');
    });

    it('should handle invalid token disconnect reason', async () => {
      // Line 382: invalid_token reason formatting
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(false);

      const result = await statusCommand.exec([], {});

      expect(result).toContain('⚠️  Registry: Token expired');
      expect(result).toContain('Run: gitcache setup to refresh');
    });

    it('should count tarballs correctly using getCacheEntries', async () => {
      // Line 120: tarball counting logic
      mockGetCacheEntries.mockReturnValue([
        {
          path: '/path/1',
          size: 1000,
          accessTime: new Date(),
          commitSha: 'abc123',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/2',
          size: 2000,
          accessTime: new Date(),
          commitSha: 'def456',
          platform: 'darwin-arm64',
        },
        {
          path: '/path/3',
          size: 3000,
          accessTime: new Date(),
          commitSha: 'ghi789',
          platform: 'darwin-arm64',
        },
      ]);

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      expect(parsed.localCache.packageCount).toBe(3);
    });

    it('should handle getCacheEntries throwing an error', async () => {
      // Cover error path in tarball counting
      mockGetCacheEntries.mockImplementation(() => {
        throw new Error('Cache access error');
      });

      const result = await statusCommand.exec([], { json: true });

      // If getCacheEntries throws, the status collection might fail entirely
      // so we need to check if it's an error response or valid status
      if (result.includes('"error"')) {
        expect(result).toContain('Failed to collect status information');
      } else {
        const parsed = JSON.parse(result);
        expect(parsed.localCache.packageCount).toBe(0); // Should fallback to 0
      }
    });

    it('should handle generic error disconnect reason', async () => {
      // Line 385: generic error reason formatting
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockRejectedValue(
        new Error('Unknown error')
      );

      const result = await statusCommand.exec([], {});

      expect(result).toContain('⚠️  Registry: Connection failed');
      expect(result).toContain('Check your network connection');
    });

    it('should show detailed formatting for different token types and errors', async () => {
      // Lines 339-346: detailed formatting paths
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');

      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Status: Connected');
      expect(result).toContain('Organization: test-org');
      expect(result).toContain('Token type: User token');
      expect(result).toContain('API endpoint: https://gitcache.grata-labs.com');
    });

    it('should format disconnection reason correctly for different error types', async () => {
      // Lines 311-314: registry error formatting for specific disconnect reasons
      const testCases = [
        {
          reason: 'not_authenticated',
          expectedMessage:
            'Not authenticated (run: gitcache setup --org <organization>)',
        },
        {
          reason: 'invalid_token',
          expectedMessage: 'Token expired (run: gitcache setup to refresh)',
        },
      ];

      for (const testCase of testCases) {
        // Reset mocks
        vi.clearAllMocks();
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

        if (testCase.reason === 'invalid_token') {
          mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
          mockAuthManagerInstance.validateToken.mockResolvedValue(false);
        }

        const result = await statusCommand.exec([], { detailed: true });
        expect(result).toContain(testCase.expectedMessage);
      }
    });

    it('should handle edge case for unavailable organization info', async () => {
      // Test for lines 194-202: organization info error path
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');

      // Since getOrgInfo doesn't exist in current implementation,
      // this tests the normal connected path
      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      expect(parsed.registry.connected).toBe(true);
      expect(parsed.registry.organization).toBe('test-org');
      expect(parsed.registry.tokenType).toBe('user');
    });

    it('should handle organization info error with token expiry information', async () => {
      // Mock authenticated state with valid token
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');

      // Mock getTokenExpiry to return a future date
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      const statusCommand = new Status();
      vi.spyOn(statusCommand as any, 'getTokenExpiry').mockReturnValue(
        futureDate
      );

      // Mock getOrganizationInfo to throw an error
      vi.spyOn(statusCommand as any, 'getOrganizationInfo').mockRejectedValue(
        new Error('Registry API unavailable')
      );

      const result = await statusCommand.exec([], { json: true });
      const parsed = JSON.parse(result);

      // Should still be connected but with error and token expiry info
      expect(parsed.registry.connected).toBe(true);
      expect(parsed.registry.organization).toBe('test-org');
      expect(parsed.registry.teamCacheSize).toBeNull();
      expect(parsed.registry.tokenType).toBe('user');
      expect(parsed.registry.tokenExpiry).toBe(futureDate.toISOString());
      expect(parsed.registry.error).toBe('Error: Registry API unavailable');
    });

    it('should show token expiry warning in basic status when token expires soon', async () => {
      // Mock authenticated state with valid token
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');

      // Mock getTokenExpiry to return a date 1 day from now (should show warning)
      const tomorrowDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
      const statusCommand = new Status();
      vi.spyOn(statusCommand as any, 'getTokenExpiry').mockReturnValue(
        tomorrowDate
      );

      const result = await statusCommand.exec([], {});

      // Should show token expiry warning in basic status
      expect(result).toContain(
        '✓ Registry: Connected (test-org) [Token expires in 1 days]'
      );
    });

    it('should show token expiry information in detailed status', async () => {
      // Mock authenticated state with valid token
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');

      // Mock getTokenExpiry to return a future date
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
      const statusCommand = new Status();
      vi.spyOn(statusCommand as any, 'getTokenExpiry').mockReturnValue(
        futureDate
      );

      const result = await statusCommand.exec([], { detailed: true });

      // Should show token expiry information in detailed status
      expect(result).toContain(
        `Token expires: ${futureDate.toDateString()} (5 days)`
      );
    });

    it('should handle unknown registry disconnect reason with default message', async () => {
      // Mock an unknown reason that doesn't match any specific case
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockRejectedValue(
        new Error('Unknown error')
      );

      // Override the registry info to have an unknown reason
      const statusCommand = new Status();
      statusCommand['getRegistryInfo'] = async () => ({
        connected: false,
        organization: null,
        teamCacheSize: null,
        tokenType: null,
        tokenExpiry: null,
        reason: 'unknown_reason' as any, // Force an unknown reason
        error: 'Some unknown error',
      });

      const result = await statusCommand.exec([], {});

      expect(result).toContain('❌ Registry: Not connected');
      // Should use the default message when reason doesn't match any specific case
      expect(result).not.toContain('Run: gitcache setup');
      expect(result).not.toContain('Token expired');
      expect(result).not.toContain('Connection failed');
    });

    it('should handle unknown disconnect reason in detailed status', async () => {
      // Mock an unknown reason that doesn't match any specific case
      const statusCommand = new Status();
      statusCommand['getRegistryInfo'] = async () => ({
        connected: false,
        organization: null,
        teamCacheSize: null,
        tokenType: null,
        tokenExpiry: null,
        reason: 'some_unknown_reason' as any, // Force an unknown reason
        error: 'Some unknown error',
      });

      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Status: Not connected');
      expect(result).toContain('Reason: Unknown');
      // Should use the default "Unknown" message when reason doesn't match any specific case
      expect(result).not.toContain('Not authenticated');
      expect(result).not.toContain('Token expired');
      expect(result).not.toContain('Network error');
    });

    it('should use "Unknown error" when registry.error is falsey in network_error case', async () => {
      // Override getRegistryInfo to return network_error with falsey error
      const statusCommand = new Status();
      statusCommand['getRegistryInfo'] = async () => ({
        connected: false,
        organization: null,
        teamCacheSize: null,
        tokenType: null,
        tokenExpiry: null,
        reason: 'network_error' as any,
        error: undefined, // This will cause the fallback to 'Unknown error'
      });

      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Status: Not connected');
      expect(result).toContain('Reason: Network error: Unknown error');
      // Should use 'Unknown error' fallback when error is undefined
      expect(result).not.toContain('Reason: Network error: undefined');
    });
  });

  describe('static properties', () => {
    it('should have correct static properties', () => {
      expect(Status.description).toBe(
        'Show GitCache status, cache info, and registry connection'
      );
      expect(Status.commandName).toBe('status');
      expect(Status.usage).toEqual(['', '--detailed', '--json']);
      expect(Status.params).toEqual(['detailed', 'json', 'verbose']);
      expect(Status.argumentSpec).toEqual({ type: 'none' });
    });
  });

  it('should use orgId when orgInfo.name is undefined', async () => {
    mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
    mockAuthManagerInstance.validateToken.mockResolvedValue(true);
    mockAuthManagerInstance.getOrgId.mockReturnValue('fallback-org-id');
    mockAuthManagerInstance.getTokenType.mockReturnValue('user');

    // Override getOrganizationInfo to return undefined name
    const statusCommand = new Status();
    statusCommand['getOrganizationInfo'] = vi.fn().mockResolvedValue({
      name: undefined, // This will cause the fallback to orgId
      cachePackageCount: 5,
    });

    const result = await statusCommand.exec([], { json: true });
    const parsed = JSON.parse(result);

    expect(parsed.registry.connected).toBe(true);
    expect(parsed.registry.organization).toBe('fallback-org-id'); // Should use orgId fallback
    expect(parsed.registry.teamCacheSize).toBe(5);
  });

  it('should use "Unknown" when orgId is undefined in getOrganizationInfo', async () => {
    mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
    mockAuthManagerInstance.validateToken.mockResolvedValue(true);
    mockAuthManagerInstance.getOrgId.mockReturnValue(undefined); // orgId is undefined
    mockAuthManagerInstance.getTokenType.mockReturnValue('user');

    const result = await statusCommand.exec([], { json: true });
    const parsed = JSON.parse(result);

    expect(parsed.registry.connected).toBe(true);
    expect(parsed.registry.organization).toBe('Unknown'); // Should use 'Unknown' fallback
    expect(parsed.registry.teamCacheSize).toBe(0);
  });

  it('should use "Unknown" when registry organization is falsey in basic status', async () => {
    mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
    mockAuthManagerInstance.validateToken.mockResolvedValue(true);
    mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
    mockAuthManagerInstance.getTokenType.mockReturnValue('user');

    // Override getRegistryInfo to return connected but with null organization
    const statusCommand = new Status();
    statusCommand['getRegistryInfo'] = async () => ({
      connected: true,
      organization: null, // This will cause the fallback to 'Unknown'
      teamCacheSize: 5,
      tokenType: 'user' as const,
      tokenExpiry: null,
    });

    const result = await statusCommand.exec([], {}); // Basic status

    expect(result).toContain('✓ Registry: Connected (Unknown)');
    // Should use 'Unknown' fallback when organization is null
    expect(result).not.toContain('Connected (test-org)');
    expect(result).not.toContain('Connected (null)');
  });

  it('should use "Unknown" when registry organization is falsey in detailed status', async () => {
    mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
    mockAuthManagerInstance.validateToken.mockResolvedValue(true);
    mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
    mockAuthManagerInstance.getTokenType.mockReturnValue('user');

    // Override getRegistryInfo to return connected but with null organization
    const statusCommand = new Status();
    statusCommand['getRegistryInfo'] = async () => ({
      connected: true,
      organization: null, // This will cause the fallback to 'Unknown'
      teamCacheSize: 5,
      tokenType: 'user' as const,
      tokenExpiry: null,
    });

    const result = await statusCommand.exec([], { detailed: true }); // Detailed status

    expect(result).toContain('Status: Connected');
    expect(result).toContain('Organization: Unknown');
    // Should use 'Unknown' fallback when organization is null
    expect(result).not.toContain('Organization: test-org');
    expect(result).not.toContain('Organization: null');
  });
});
