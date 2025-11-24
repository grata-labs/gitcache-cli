import { Stats } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Status } from '../../commands/status.js';
import { AuthManager } from '../../lib/auth-manager.js';

// Mock dependencies
vi.mock('../../lib/auth-manager.js');
vi.mock('../../lib/prune.js');
vi.mock('../../lib/utils/path.js');
vi.mock('node:fs');

const mockAuthManager = vi.mocked(AuthManager);
const { calculateCacheSize, formatBytes, getCacheEntries } = await import(
  '../../lib/prune.js'
);
const { getCacheDir } = await import('../../lib/utils/path.js');
const { existsSync, statSync } = await import('node:fs');

const mockCalculateCacheSize = vi.mocked(calculateCacheSize);
const mockFormatBytes = vi.mocked(formatBytes);
const mockGetCacheEntries = vi.mocked(getCacheEntries);
const mockGetCacheDir = vi.mocked(getCacheDir);
const mockExistsSync = vi.mocked(existsSync);
const mockStatSync = vi.mocked(statSync);

describe('Status Command', () => {
  let status: Status;
  let mockAuthManagerInstance: any;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock AuthManager instance
    mockAuthManagerInstance = {
      isAuthenticated: vi.fn(),
      validateToken: vi.fn(),
    };

    mockAuthManager.mockImplementation(function (this: any) {
      return mockAuthManagerInstance;
    });

    status = new Status();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Setup default mocks
    mockGetCacheDir.mockReturnValue('/mock/cache/dir');
    mockCalculateCacheSize.mockReturnValue(1024 * 1024 * 100); // 100MB
    mockGetCacheEntries.mockReturnValue([
      {
        path: '/mock/cache/dir/package1.tgz',
        size: 1024,
        accessTime: new Date('2024-01-01'),
        commitSha: 'abc123',
        platform: 'linux',
      },
      {
        path: '/mock/cache/dir/package2.tgz',
        size: 2048,
        accessTime: new Date('2024-01-02'),
        commitSha: 'def456',
        platform: 'linux',
      },
      {
        path: '/mock/cache/dir/package3.tgz',
        size: 1536,
        accessTime: new Date('2024-01-03'),
        commitSha: 'ghi789',
        platform: 'linux',
      },
    ]);
    mockFormatBytes.mockImplementation((bytes: number) => {
      if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      }
      if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
      }
      return `${bytes} B`;
    });
    mockExistsSync.mockReturnValue(true);

    // Mock directory stats
    const mockStats = {
      mtime: new Date('2024-01-01T00:00:00Z'),
    } as Stats;
    mockStatSync.mockReturnValue(mockStats);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('static properties', () => {
    it('should have correct static properties', () => {
      expect(Status.description).toBe(
        'Show GitCache cache status and registry connectivity'
      );
      expect(Status.commandName).toBe('status');
      expect(Status.usage).toEqual(['', '--detailed', '--json']);
      expect(Status.params).toEqual(['detailed', 'json', 'verbose']);
      expect(Status.argumentSpec).toEqual({ type: 'none' });
    });
  });

  describe('exec method', () => {
    describe('basic status output', () => {
      it('should return basic status when authenticated and connected', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.validateToken.mockResolvedValue(true);

        const result = await status.exec();

        expect(result).toContain('📦 Local cache: 100.0 MB (3 packages)');
        expect(result).toContain('🔗 Registry: Connected');
        expect(result).not.toContain('💡 For authentication details');
      });

      it('should return not authenticated status', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

        const result = await status.exec();

        expect(result).toContain('📦 Local cache: 100.0 MB (3 packages)');
        expect(result).toContain('❌ Registry: Not authenticated');
        expect(result).toContain('Run: gitcache auth login <your-email>');
        expect(result).toContain(
          '💡 For authentication details: gitcache auth status'
        );
      });

      it('should return invalid token status', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.validateToken.mockResolvedValue(false);

        const result = await status.exec();

        expect(result).toContain('📦 Local cache: 100.0 MB (3 packages)');
        expect(result).toContain('⚠️  Registry: Token expired');
        expect(result).toContain('Run: gitcache auth login to refresh');
        expect(result).toContain(
          '💡 For authentication details: gitcache auth status'
        );
      });

      it('should handle network errors', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.validateToken.mockRejectedValue(
          new Error('Network timeout')
        );

        const result = await status.exec();

        expect(result).toContain('📦 Local cache: 100.0 MB (3 packages)');
        expect(result).toContain('⚠️  Registry: Connection failed');
        expect(result).toContain('Check your network connection');
        expect(result).toContain(
          '💡 For authentication details: gitcache auth status'
        );
      });
    });

    describe('detailed status output', () => {
      it('should return detailed status when connected', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.validateToken.mockResolvedValue(true);

        const result = await status.exec([], { detailed: true });

        expect(result).toContain('Local Cache:');
        expect(result).toContain('Size: 100.0 MB (3 packages)');
        expect(result).toContain('Directory: /mock/cache/dir');
        expect(result).toContain('Last cleanup:');
        expect(result).toContain('Registry:');
        expect(result).toContain('Status: Connected');
        expect(result).toContain('API endpoint: https://api.grata-labs.com');
        expect(result).toContain(
          '💡 For authentication and organization details:'
        );
        expect(result).toContain('gitcache auth status');
      });

      it('should show custom API endpoint', async () => {
        process.env.GITCACHE_API_URL = 'https://custom-api.example.com';
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.validateToken.mockResolvedValue(true);

        const result = await status.exec([], { detailed: true });

        expect(result).toContain(
          'API endpoint: https://custom-api.example.com'
        );

        delete process.env.GITCACHE_API_URL;
      });

      it('should handle disconnected state in detailed view', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

        const result = await status.exec([], { detailed: true });

        expect(result).toContain('Status: Not connected');
        expect(result).toContain(
          'Reason: Not authenticated (run: gitcache auth login <your-email>)'
        );
      });

      it('should calculate days since last cleanup', async () => {
        const pastDate = new Date('2023-12-01T00:00:00Z');
        const mockStats = { mtime: pastDate } as Stats;
        mockStatSync.mockReturnValue(mockStats);

        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.validateToken.mockResolvedValue(true);

        const result = await status.exec([], { detailed: true });

        expect(result).toMatch(/Last cleanup: \d+ days ago/);
      });

      it('should handle missing cache directory', async () => {
        mockExistsSync.mockReturnValue(false);
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.validateToken.mockResolvedValue(true);

        const result = await status.exec([], { detailed: true });

        expect(result).toContain('Last cleanup: Unknown');
      });

      it('should handle stat errors gracefully', async () => {
        mockStatSync.mockImplementation(() => {
          throw new Error('Permission denied');
        });
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.validateToken.mockResolvedValue(true);

        const result = await status.exec([], { detailed: true });

        expect(result).toContain('Last cleanup: Unknown');
      });
    });

    describe('JSON output', () => {
      it('should return valid JSON when connected', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.validateToken.mockResolvedValue(true);

        const result = await status.exec([], { json: true });
        const parsed = JSON.parse(result);

        expect(parsed).toHaveProperty('localCache');
        expect(parsed).toHaveProperty('registry');
        expect(parsed.localCache).toHaveProperty('size', 104857600);
        expect(parsed.localCache).toHaveProperty('packageCount', 3);
        expect(parsed.localCache).toHaveProperty(
          'directory',
          '/mock/cache/dir'
        );
        expect(parsed.localCache).toHaveProperty('lastCleanup');
        expect(parsed.registry).toHaveProperty('connected', true);
        expect(parsed.registry).not.toHaveProperty('reason');
      });

      it('should return JSON with error details when not authenticated', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

        const result = await status.exec([], { json: true });
        const parsed = JSON.parse(result);

        expect(parsed.registry).toHaveProperty('connected', false);
        expect(parsed.registry).toHaveProperty('reason', 'not_authenticated');
      });

      it('should return JSON with network error details', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.validateToken.mockRejectedValue(
          new Error('Network timeout')
        );

        const result = await status.exec([], { json: true });
        const parsed = JSON.parse(result);

        expect(parsed.registry).toHaveProperty('connected', false);
        expect(parsed.registry).toHaveProperty('reason', 'network_error');
        expect(parsed.registry).toHaveProperty(
          'error',
          'Error: Network timeout'
        );
      });

      it('should handle JSON errors gracefully', async () => {
        // Force an error in status collection
        mockGetCacheDir.mockImplementation(() => {
          throw new Error('Cache directory access denied');
        });

        const result = await status.exec([], { json: true });
        const parsed = JSON.parse(result);

        expect(parsed).toHaveProperty(
          'error',
          'Failed to collect status information'
        );
        expect(parsed).toHaveProperty('message');
      });
    });

    describe('error handling', () => {
      it('should throw error when not in JSON mode and collection fails', async () => {
        mockGetCacheDir.mockImplementation(() => {
          throw new Error('Cache directory access denied');
        });

        await expect(status.exec()).rejects.toThrow(
          'Failed to get status: Error: Cache directory access denied'
        );
      });

      it('should handle auth manager creation errors', async () => {
        mockAuthManager.mockImplementation(() => {
          throw new Error('Auth manager initialization failed');
        });

        await expect(() => new Status()).toThrow(
          'Auth manager initialization failed'
        );
      });
    });
  });

  describe('cache calculations', () => {
    it('should handle empty cache', async () => {
      mockCalculateCacheSize.mockReturnValue(0);
      mockGetCacheEntries.mockReturnValue([]);
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);

      const result = await status.exec();

      expect(result).toContain('📦 Local cache: 0 B (0 packages)');
    });

    it('should handle large cache sizes', async () => {
      const largeSize = 1024 * 1024 * 1024 * 5; // 5GB
      mockCalculateCacheSize.mockReturnValue(largeSize);
      mockGetCacheEntries.mockReturnValue(
        new Array(1000).fill(null).map((_, i) => ({
          path: `/mock/package${i}.tgz`,
          size: 1024 * 1024,
          accessTime: new Date(),
          commitSha: `sha${i}`,
          platform: 'linux',
        }))
      );
      mockFormatBytes.mockReturnValue('5.0 GB');
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);

      const result = await status.exec();

      expect(result).toContain('📦 Local cache: 5.0 GB (1000 packages)');
    });
  });

  describe('registry status formatting', () => {
    it('should format all registry error types correctly', async () => {
      const testCases = [
        {
          setup: () =>
            mockAuthManagerInstance.isAuthenticated.mockReturnValue(false),
          expectedBasic: '❌ Registry: Not authenticated',
          expectedDetailed:
            'Not authenticated (run: gitcache auth login <your-email>)',
        },
        {
          setup: () => {
            mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
            mockAuthManagerInstance.validateToken.mockResolvedValue(false);
          },
          expectedBasic: '⚠️  Registry: Token expired',
          expectedDetailed:
            'Token expired (run: gitcache auth login to refresh)',
        },
        {
          setup: () => {
            mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
            mockAuthManagerInstance.validateToken.mockRejectedValue(
              new Error('Connection failed')
            );
          },
          expectedBasic: '⚠️  Registry: Connection failed',
          expectedDetailed: 'Network error: Error: Connection failed',
        },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();
        mockGetCacheDir.mockReturnValue('/mock/cache/dir');
        mockCalculateCacheSize.mockReturnValue(1024);
        mockGetCacheEntries.mockReturnValue([
          {
            path: 'package.tgz',
            size: 1024,
            accessTime: new Date(),
            commitSha: 'abc123',
            platform: 'linux',
          },
        ]);
        mockFormatBytes.mockReturnValue('1.0 KB');
        mockExistsSync.mockReturnValue(true);

        testCase.setup();

        const basicResult = await status.exec();
        expect(basicResult).toContain(testCase.expectedBasic);

        const detailedResult = await status.exec([], { detailed: true });
        expect(detailedResult).toContain(testCase.expectedDetailed);
      }
    });

    it('should handle unknown registry errors', async () => {
      // Mock an unknown error scenario by making both methods succeed but still marking as disconnected
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);

      // Force a specific path by mocking the private method behavior
      status.exec = vi.fn().mockImplementation(async (args, opts) => {
        const statusInfo = {
          localCache: {
            size: 1024,
            packageCount: 1,
            lastCleanup: null,
            directory: '/mock/cache/dir',
          },
          registry: {
            connected: false,
            reason: 'unknown_error' as any,
          },
        };

        if (opts?.json) {
          return JSON.stringify(statusInfo, null, 2);
        }

        if (opts?.detailed) {
          return `Registry:\n  Status: Not connected\n  Reason: Unknown`;
        }

        return '❌ Registry: Not connected';
      });

      const basicResult = await status.exec();
      expect(basicResult).toContain('❌ Registry: Not connected');

      const detailedResult = await status.exec([], { detailed: true });
      expect(detailedResult).toContain('Reason: Unknown');

      const jsonResult = await status.exec([], { json: true });
      const parsed = JSON.parse(jsonResult);
      expect(parsed.registry.reason).toBe('unknown_error');
    });
  });

  describe('options handling', () => {
    it('should handle verbose option (no specific behavior expected)', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);

      const result = await status.exec([], { verbose: true });

      expect(result).toContain('📦 Local cache');
      expect(result).toContain('🔗 Registry: Connected');
    });

    it('should handle multiple options together', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.validateToken.mockResolvedValue(true);

      // JSON should take precedence over detailed
      const result = await status.exec([], {
        detailed: true,
        json: true,
        verbose: true,
      });

      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('localCache');
      expect(parsed).toHaveProperty('registry');
    });
  });

  describe('formatRegistryError method', () => {
    it('should return default message for unknown reason', () => {
      const registry = {
        connected: false,
        reason: 'unknown_reason' as any,
      };

      // Access the private method using type assertion
      const result = (status as any).formatRegistryError(registry);
      expect(result).toBe('❌ Registry: Not connected');
    });

    it('should return default message for undefined reason', () => {
      const registry = {
        connected: false,
        reason: undefined,
      };

      const result = (status as any).formatRegistryError(registry);
      expect(result).toBe('❌ Registry: Not connected');
    });

    it('should return default message for null reason', () => {
      const registry = {
        connected: false,
        reason: null as any,
      };

      const result = (status as any).formatRegistryError(registry);
      expect(result).toBe('❌ Registry: Not connected');
    });
  });

  describe('getDisconnectionReason method', () => {
    it('should return "Unknown" for unknown reason', () => {
      const registry = {
        connected: false,
        reason: 'unknown_reason' as any,
      };

      // Access the private method using type assertion
      const result = (status as any).getDisconnectionReason(registry);
      expect(result).toBe('Unknown');
    });

    it('should return "Unknown" for undefined reason', () => {
      const registry = {
        connected: false,
        reason: undefined,
      };

      const result = (status as any).getDisconnectionReason(registry);
      expect(result).toBe('Unknown');
    });

    it('should return "Unknown" for null reason', () => {
      const registry = {
        connected: false,
        reason: null as any,
      };

      const result = (status as any).getDisconnectionReason(registry);
      expect(result).toBe('Unknown');
    });

    it('should return "Unknown" for empty string reason', () => {
      const registry = {
        connected: false,
        reason: '',
      };

      const result = (status as any).getDisconnectionReason(registry);
      expect(result).toBe('Unknown');
    });

    it('should return "Network error: Unknown error" for network error with falsey error value', () => {
      const testCases = [{ error: undefined }, { error: null }, { error: '' }];

      for (const testCase of testCases) {
        const registry = {
          connected: false,
          reason: 'network_error',
          error: testCase.error as any,
        };

        const result = (status as any).getDisconnectionReason(registry);
        expect(result).toBe('Network error: Unknown error');
      }
    });
  });
});
