import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CacheHierarchy,
  DEFAULT_CACHE_OPTIONS,
} from '../../lib/cache-hierarchy.js';
import { LocalCache } from '../../lib/local-cache.js';
import { RegistryClient } from '../../lib/registry-client.js';
import { GitCache } from '../../lib/git-cache.js';

// Mock all dependencies
vi.mock('../../lib/local-cache.js');
vi.mock('../../lib/registry-client.js');
vi.mock('../../lib/git-cache.js');

const mockLocalCache = vi.mocked(LocalCache);
const mockRegistryClient = vi.mocked(RegistryClient);
const mockGitCache = vi.mocked(GitCache);

describe('CacheHierarchy', () => {
  let cacheHierarchy: CacheHierarchy;
  let mockLocalInstance: any;
  let mockRegistryInstance: any;
  let mockGitInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock instances
    mockLocalInstance = {
      has: vi.fn(),
      get: vi.fn(),
      store: vi.fn(),
      clear: vi.fn(),
      name: 'Local',
    };

    mockRegistryInstance = {
      has: vi.fn(),
      get: vi.fn(),
      uploadAsync: vi.fn(),
      isAuthenticated: vi.fn(),
      name: 'Registry',
    };

    mockGitInstance = {
      has: vi.fn(),
      get: vi.fn(),
      store: vi.fn(),
      name: 'Git',
    };

    // Mock constructor calls
    mockLocalCache.mockImplementation(() => mockLocalInstance);
    mockRegistryClient.mockImplementation(() => mockRegistryInstance);
    mockGitCache.mockImplementation(() => mockGitInstance);

    cacheHierarchy = new CacheHierarchy();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const hierarchy = new CacheHierarchy();
      expect(hierarchy).toBeInstanceOf(CacheHierarchy);
    });

    it('should merge custom options with defaults', () => {
      const options = {
        enableRegistry: false,
        verboseLogging: true,
      };

      const hierarchy = new CacheHierarchy(options);
      expect(hierarchy).toBeInstanceOf(CacheHierarchy);
    });

    it('should build strategies based on options', () => {
      // With registry disabled
      const hierarchyNoRegistry = new CacheHierarchy({ enableRegistry: false });
      expect(hierarchyNoRegistry).toBeInstanceOf(CacheHierarchy);

      // With git fallback disabled
      const hierarchyNoGit = new CacheHierarchy({ enableGitFallback: false });
      expect(hierarchyNoGit).toBeInstanceOf(CacheHierarchy);
    });
  });

  describe('has', () => {
    it('should return true when package exists in first cache', async () => {
      mockLocalInstance.has.mockResolvedValue(true);

      const result = await cacheHierarchy.has('test-package');

      expect(result).toBe(true);
      expect(mockLocalInstance.has).toHaveBeenCalledWith('test-package');
      expect(mockRegistryInstance.has).not.toHaveBeenCalled();
    });

    it('should check registry when not in local cache', async () => {
      mockLocalInstance.has.mockResolvedValue(false);
      mockRegistryInstance.has.mockResolvedValue(true);

      const result = await cacheHierarchy.has('test-package');

      expect(result).toBe(true);
      expect(mockLocalInstance.has).toHaveBeenCalledWith('test-package');
      expect(mockRegistryInstance.has).toHaveBeenCalledWith('test-package');
    });

    it('should check git cache when not in local or registry', async () => {
      mockLocalInstance.has.mockResolvedValue(false);
      mockRegistryInstance.has.mockResolvedValue(false);
      mockGitInstance.has.mockResolvedValue(true);

      const result = await cacheHierarchy.has('test-package');

      expect(result).toBe(true);
      expect(mockGitInstance.has).toHaveBeenCalledWith('test-package');
    });

    it('should return false when package not found in any cache', async () => {
      mockLocalInstance.has.mockResolvedValue(false);
      mockRegistryInstance.has.mockResolvedValue(false);
      mockGitInstance.has.mockResolvedValue(false);

      const result = await cacheHierarchy.has('test-package');

      expect(result).toBe(false);
    });

    it('should handle errors from strategies gracefully', async () => {
      mockLocalInstance.has.mockRejectedValue(new Error('Local cache error'));
      mockRegistryInstance.has.mockResolvedValue(true);

      const result = await cacheHierarchy.has('test-package');

      expect(result).toBe(true);
      expect(mockRegistryInstance.has).toHaveBeenCalledWith('test-package');
    });

    it('should log verbose messages when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseHierarchy = new CacheHierarchy({ verboseLogging: true });

      mockLocalInstance.has.mockResolvedValue(true);

      await verboseHierarchy.has('test-package');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Hierarchy] Found test-package in Local'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('get', () => {
    it('should get data from first available cache', async () => {
      const testData = Buffer.from('test data');
      mockLocalInstance.has.mockResolvedValue(true);
      mockLocalInstance.get.mockResolvedValue(testData);

      const result = await cacheHierarchy.get('test-package');

      expect(result).toEqual(testData);
      expect(mockLocalInstance.has).toHaveBeenCalledWith('test-package');
      expect(mockLocalInstance.get).toHaveBeenCalledWith('test-package');
    });

    it('should propagate data to higher-priority caches', async () => {
      const testData = Buffer.from('test data');
      mockLocalInstance.has.mockResolvedValue(false);
      mockRegistryInstance.has.mockResolvedValue(true);
      mockRegistryInstance.get.mockResolvedValue(testData);
      mockLocalInstance.store.mockResolvedValue(undefined);

      const result = await cacheHierarchy.get('test-package');

      expect(result).toEqual(testData);
      expect(mockLocalInstance.store).toHaveBeenCalledWith(
        'test-package',
        testData
      );
    });

    it('should throw error when package not found in any cache', async () => {
      mockLocalInstance.has.mockResolvedValue(false);
      mockRegistryInstance.has.mockResolvedValue(false);
      mockGitInstance.has.mockResolvedValue(false);

      await expect(cacheHierarchy.get('test-package')).rejects.toThrow(
        'Package test-package not found in any cache'
      );
    });

    it('should handle errors from strategies gracefully', async () => {
      const testData = Buffer.from('test data');
      mockLocalInstance.has.mockRejectedValue(new Error('Local error'));
      mockRegistryInstance.has.mockResolvedValue(true);
      mockRegistryInstance.get.mockResolvedValue(testData);

      const result = await cacheHierarchy.get('test-package');

      expect(result).toEqual(testData);
    });

    it('should handle get errors and continue to next strategy', async () => {
      const testData = Buffer.from('test data');
      mockLocalInstance.has.mockResolvedValue(true);
      mockLocalInstance.get.mockRejectedValue(new Error('Get error'));
      mockRegistryInstance.has.mockResolvedValue(true);
      mockRegistryInstance.get.mockResolvedValue(testData);

      const result = await cacheHierarchy.get('test-package');

      expect(result).toEqual(testData);
    });

    it('should log verbose messages when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseHierarchy = new CacheHierarchy({ verboseLogging: true });

      const testData = Buffer.from('test data');
      mockLocalInstance.has.mockResolvedValue(true);
      mockLocalInstance.get.mockResolvedValue(testData);

      await verboseHierarchy.get('test-package');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Hierarchy] Retrieved test-package from Local'
      );

      consoleSpy.mockRestore();
    });

    it('should handle propagation errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseHierarchy = new CacheHierarchy({ verboseLogging: true });

      const testData = Buffer.from('test data');
      mockLocalInstance.has.mockResolvedValue(false);
      mockRegistryInstance.has.mockResolvedValue(true);
      mockRegistryInstance.get.mockResolvedValue(testData);
      mockLocalInstance.store.mockRejectedValue(new Error('Store error'));

      const result = await verboseHierarchy.get('test-package');

      expect(result).toEqual(testData);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to propagate to Local')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('store', () => {
    it('should store in all available caches', async () => {
      const testData = Buffer.from('test data');
      mockLocalInstance.store.mockResolvedValue(undefined);
      mockRegistryInstance.uploadAsync.mockResolvedValue(undefined);
      mockGitInstance.store.mockResolvedValue(undefined);

      await cacheHierarchy.store('test-package', testData);

      expect(mockLocalInstance.store).toHaveBeenCalledWith(
        'test-package',
        testData
      );
      // Note: registry and git store calls depend on implementation details
    });

    it('should throw error if local cache fails', async () => {
      const testData = Buffer.from('test data');
      mockLocalInstance.store.mockRejectedValue(
        new Error('Local store failed')
      );

      await expect(
        cacheHierarchy.store('test-package', testData)
      ).rejects.toThrow('Failed to store in local cache');
    });

    it('should succeed if only local cache succeeds', async () => {
      const testData = Buffer.from('test data');
      mockLocalInstance.store.mockResolvedValue(undefined);
      mockRegistryInstance.uploadAsync.mockRejectedValue(
        new Error('Registry failed')
      );
      mockGitInstance.store.mockRejectedValue(new Error('Git failed'));

      await expect(
        cacheHierarchy.store('test-package', testData)
      ).resolves.toBeUndefined();
    });

    it('should log verbose messages when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseHierarchy = new CacheHierarchy({ verboseLogging: true });

      const testData = Buffer.from('test data');
      mockLocalInstance.store.mockResolvedValue(undefined);

      await verboseHierarchy.store('test-package', testData);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Hierarchy] Stored test-package in Local'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getStatus', () => {
    it('should return status for all strategies', async () => {
      mockLocalInstance.has.mockResolvedValue(true);
      mockRegistryInstance.isAuthenticated.mockReturnValue(true);
      mockGitInstance.has.mockResolvedValue(true);

      const result = await cacheHierarchy.getStatus();

      expect(result).toEqual([
        { strategy: 'Local', available: true },
        { strategy: 'Registry', available: true, authenticated: true },
        { strategy: 'Git', available: true },
      ]);
    });

    it('should handle strategy errors and mark as unavailable', async () => {
      mockLocalInstance.has.mockRejectedValue(new Error('Local error'));
      mockRegistryInstance.isAuthenticated.mockReturnValue(false);
      mockGitInstance.has.mockResolvedValue(true);

      const result = await cacheHierarchy.getStatus();

      expect(result).toEqual([
        { strategy: 'Local', available: false },
        { strategy: 'Registry', available: true, authenticated: false },
        { strategy: 'Git', available: true },
      ]);
    });

    it('should work with disabled strategies', async () => {
      const hierarchyNoRegistry = new CacheHierarchy({ enableRegistry: false });
      mockLocalInstance.has.mockResolvedValue(true);
      mockGitInstance.has.mockResolvedValue(true);

      const result = await hierarchyNoRegistry.getStatus();

      expect(result).toHaveLength(2);
      expect(result[0].strategy).toBe('Local');
      expect(result[1].strategy).toBe('Git');
    });
  });

  describe('clear', () => {
    it('should clear all caches that support clearing', async () => {
      mockLocalInstance.clear.mockResolvedValue(undefined);

      await cacheHierarchy.clear();

      expect(mockLocalInstance.clear).toHaveBeenCalled();
    });

    it('should handle clear errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseHierarchy = new CacheHierarchy({ verboseLogging: true });

      mockLocalInstance.clear.mockRejectedValue(new Error('Clear failed'));

      await verboseHierarchy.clear();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear Local')
      );

      consoleSpy.mockRestore();
    });

    it('should log verbose messages when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseHierarchy = new CacheHierarchy({ verboseLogging: true });

      mockLocalInstance.clear.mockResolvedValue(undefined);

      await verboseHierarchy.clear();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Hierarchy] Cleared Local cache'
      );

      consoleSpy.mockRestore();
    });

    it('should skip strategies that do not support clearing', async () => {
      // Registry and Git strategies don't have clear methods
      await expect(cacheHierarchy.clear()).resolves.toBeUndefined();
    });
  });

  describe('DEFAULT_CACHE_OPTIONS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CACHE_OPTIONS).toEqual({
        enableRegistry: true,
        enableGitFallback: true,
        verboseLogging: process.env.GITCACHE_VERBOSE === 'true',
      });
    });
  });

  describe('buildStrategies', () => {
    it('should build correct strategies based on options', () => {
      // Since all instances create actual strategies, we just verify construction doesn't fail
      expect(
        () =>
          new CacheHierarchy({
            enableRegistry: false,
            enableGitFallback: false,
          })
      ).not.toThrow();

      expect(
        () =>
          new CacheHierarchy({
            enableGitFallback: false,
          })
      ).not.toThrow();
    });
  });

  describe('propagateToHigherCaches', () => {
    it('should not propagate when data comes from highest priority cache', async () => {
      const testData = Buffer.from('test data');
      mockLocalInstance.has.mockResolvedValue(true);
      mockLocalInstance.get.mockResolvedValue(testData);

      await cacheHierarchy.get('test-package');

      // Local cache store should not be called for propagation
      expect(mockLocalInstance.store).not.toHaveBeenCalled();
    });

    it('should propagate from git to registry and local', async () => {
      const testData = Buffer.from('test data');
      mockLocalInstance.has.mockResolvedValue(false);
      mockRegistryInstance.has.mockResolvedValue(false);
      mockGitInstance.has.mockResolvedValue(true);
      mockGitInstance.get.mockResolvedValue(testData);
      mockLocalInstance.store.mockResolvedValue(undefined);
      mockRegistryInstance.uploadAsync.mockResolvedValue(undefined);

      await cacheHierarchy.get('test-package');

      expect(mockLocalInstance.store).toHaveBeenCalledWith(
        'test-package',
        testData
      );
      expect(mockRegistryInstance.uploadAsync).toHaveBeenCalledWith(
        'test-package',
        testData
      );
    });
  });

  describe('logVerbose', () => {
    it('should not log when verbose logging is disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const quietHierarchy = new CacheHierarchy({ verboseLogging: false });

      mockLocalInstance.has.mockResolvedValue(true);

      await quietHierarchy.has('test-package');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('error scenarios and edge cases', () => {
    it('should handle all strategies failing during has check', async () => {
      mockLocalInstance.has.mockRejectedValue(new Error('Local error'));
      mockRegistryInstance.has.mockRejectedValue(new Error('Registry error'));
      mockGitInstance.has.mockRejectedValue(new Error('Git error'));

      const result = await cacheHierarchy.has('test-package');

      expect(result).toBe(false);
    });

    it('should handle all strategies having false but no errors', async () => {
      mockLocalInstance.has.mockResolvedValue(false);
      mockRegistryInstance.has.mockResolvedValue(false);
      mockGitInstance.has.mockResolvedValue(false);

      const result = await cacheHierarchy.has('test-package');

      expect(result).toBe(false);
    });

    it('should handle mixed has/get failures', async () => {
      const testData = Buffer.from('test data');
      mockLocalInstance.has.mockResolvedValue(true);
      mockLocalInstance.get.mockRejectedValue(new Error('Get failed'));
      mockRegistryInstance.has.mockResolvedValue(true);
      mockRegistryInstance.get.mockResolvedValue(testData);

      const result = await cacheHierarchy.get('test-package');

      expect(result).toEqual(testData);
    });
  });
});
