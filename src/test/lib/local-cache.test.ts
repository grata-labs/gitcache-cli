import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { LocalCache } from '../../lib/local-cache.js';

// Mock dependencies
vi.mock('node:fs', () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    rm: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
  },
}));

vi.mock('node:crypto', () => ({
  createHash: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn().mockReturnValue('/home/testuser'),
}));

const mockFs = vi.mocked(fs);
const mockCreateHash = vi.mocked(createHash);
const mockHomedir = vi.mocked(homedir);

describe('LocalCache', () => {
  let localCache: LocalCache;
  const testCacheDir = '/home/testuser/.gitcache/cache';

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockHomedir.mockReturnValue('/home/testuser');

    // Mock crypto hash
    const mockHashInstance = {
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('abcdef1234567890'),
    };
    mockCreateHash.mockReturnValue(mockHashInstance as any);

    // Initialize cache with explicit test directory
    localCache = new LocalCache({ cacheDir: testCacheDir });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const cache = new LocalCache();
      expect(cache).toBeInstanceOf(LocalCache);
    });

    it('should merge custom options with defaults', () => {
      const customOptions = {
        cacheDir: '/custom/cache',
        maxSizeMB: 2048,
        verboseLogging: true,
      };

      const cache = new LocalCache(customOptions);
      expect(cache).toBeInstanceOf(LocalCache);
    });

    it('should use partial options correctly', () => {
      const cache = new LocalCache({ verboseLogging: true });
      expect(cache).toBeInstanceOf(LocalCache);
    });
  });

  describe('has', () => {
    it('should return true when artifact exists', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const result = await localCache.has('test-package');

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(
        expect.stringContaining('ab/abcdef1234567890.cache')
      );
    });

    it('should return false when artifact does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await localCache.has('test-package');

      expect(result).toBe(false);
    });

    it('should use correct cache path structure', async () => {
      mockFs.access.mockResolvedValue(undefined);

      await localCache.has('test-package');

      expect(mockFs.access).toHaveBeenCalledWith(
        join('/home/testuser/.gitcache/cache', 'ab', 'abcdef1234567890.cache')
      );
    });
  });

  describe('get', () => {
    it('should return cached artifact data', async () => {
      const testData = Buffer.from('cached data');
      mockFs.readFile.mockResolvedValue(testData);

      const result = await localCache.get('test-package');

      expect(result).toEqual(testData);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('ab/abcdef1234567890.cache')
      );
    });

    it('should throw error when file cannot be read', async () => {
      mockFs.readFile.mockRejectedValue(new Error('ENOENT: file not found'));

      await expect(localCache.get('test-package')).rejects.toThrow(
        'Failed to read from local cache'
      );
    });

    it('should log verbose message when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseCache = new LocalCache({ verboseLogging: true });

      const testData = Buffer.from('cached data');
      mockFs.readFile.mockResolvedValue(testData);

      await verboseCache.get('test-package');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Local] Retrieved test-package from local cache'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('store', () => {
    it('should store artifact successfully', async () => {
      const testData = Buffer.from('test data');

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await localCache.store('test-package', testData);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('/ab'),
        { recursive: true }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('ab/abcdef1234567890.cache'),
        testData
      );
    });

    it('should write metadata file', async () => {
      const testData = Buffer.from('test data');

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await localCache.store('test-package', testData);

      // Check the second call which should be the metadata file
      const secondCall = mockFs.writeFile.mock.calls[1];
      expect(secondCall[0]).toContain('ab/abcdef1234567890.meta');

      const metadataJson = JSON.parse(secondCall[1] as string);
      expect(metadataJson.packageId).toBe('test-package');
      expect(metadataJson.size).toBe(9);
      expect(metadataJson.accessCount).toBe(1);
    });

    it('should enforce cache size before storing', async () => {
      const testData = Buffer.from('test data');

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue(['subdir'] as any);
      mockFs.stat.mockResolvedValue({ size: 100, mtime: new Date() } as any);

      await localCache.store('test-package', testData);

      expect(mockFs.readdir).toHaveBeenCalled(); // Called during enforceSize
    });

    it('should handle metadata write failures gracefully', async () => {
      const testData = Buffer.from('test data');

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile
        .mockResolvedValueOnce(undefined) // main file write succeeds
        .mockRejectedValueOnce(new Error('metadata write failed')); // metadata fails
      mockFs.readdir.mockResolvedValue([]);

      // Should not throw even if metadata fails
      await expect(
        localCache.store('test-package', testData)
      ).resolves.toBeUndefined();
    });

    it('should throw error when main write fails', async () => {
      const testData = Buffer.from('test data');

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));
      mockFs.readdir.mockResolvedValue([]);

      await expect(localCache.store('test-package', testData)).rejects.toThrow(
        'Failed to store in local cache'
      );
    });

    it('should log verbose message when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseCache = new LocalCache({ verboseLogging: true });

      const testData = Buffer.from('test data');
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await verboseCache.store('test-package', testData);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Local] Stored test-package in local cache'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('clear', () => {
    it('should remove entire cache directory', async () => {
      mockFs.rm.mockResolvedValue(undefined);

      await localCache.clear();

      expect(mockFs.rm).toHaveBeenCalledWith('/home/testuser/.gitcache/cache', {
        recursive: true,
        force: true,
      });
    });

    it('should throw error when removal fails', async () => {
      mockFs.rm.mockRejectedValue(new Error('Permission denied'));

      await expect(localCache.clear()).rejects.toThrow(
        'Failed to clear local cache'
      );
    });

    it('should log verbose message when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseCache = new LocalCache({ verboseLogging: true });

      mockFs.rm.mockResolvedValue(undefined);

      await verboseCache.clear();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Local] Cleared local cache'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      // Mock the directory structure that getAllCacheFiles expects
      mockFs.readdir
        .mockResolvedValueOnce(['ab', 'cd'] as any) // subdirectories in cache root
        .mockResolvedValueOnce(['file1.cache', 'file1.meta'] as any) // files in ab/
        .mockResolvedValueOnce(['file2.cache', 'file2.meta'] as any); // files in cd/

      // Mock stat calls for the actual cache files
      mockFs.stat
        .mockResolvedValueOnce({
          size: 1024,
          mtime: new Date('2023-01-01'),
        } as any) // file1.cache
        .mockResolvedValueOnce({
          size: 2048,
          mtime: new Date('2023-01-02'),
        } as any); // file2.cache

      const result = await localCache.getStats();

      expect(result).toEqual({
        totalFiles: 2,
        totalSizeMB: 0, // (1024 + 2048) / (1024 * 1024) = 0.0029... rounds to 0
        oldestFile: new Date('2023-01-01'),
        newestFile: new Date('2023-01-02'),
      });
    });

    it('should handle empty cache directory', async () => {
      mockFs.readdir.mockResolvedValue([]);

      const result = await localCache.getStats();

      expect(result).toEqual({
        totalFiles: 0,
        totalSizeMB: 0,
        oldestFile: null,
        newestFile: null,
      });
    });

    it('should handle cache directory that does not exist', async () => {
      mockFs.readdir.mockRejectedValue(new Error('ENOENT'));

      const result = await localCache.getStats();

      expect(result).toEqual({
        totalFiles: 0,
        totalSizeMB: 0,
        oldestFile: null,
        newestFile: null,
      });
    });

    it('should ignore files that cannot be read', async () => {
      mockFs.readdir
        .mockResolvedValueOnce(['ab'] as any) // subdirectories
        .mockResolvedValueOnce(['file1.cache'] as any); // files in ab/

      // Mock stat to fail for the file
      mockFs.stat.mockRejectedValue(new Error('Permission denied'));

      const result = await localCache.getStats();

      expect(result).toEqual({
        totalFiles: 1, // getAllCacheFiles still returns the file, but stat fails
        totalSizeMB: 0, // no size added because stat failed
        oldestFile: null,
        newestFile: null,
      });
    });

    it('should ignore subdirectories that cannot be read', async () => {
      mockFs.readdir
        .mockResolvedValueOnce(['ab', 'cd'] as any) // subdirectories
        .mockRejectedValueOnce(new Error('Permission denied')) // ab fails
        .mockResolvedValueOnce(['file2.cache'] as any); // cd succeeds

      // Mock stat for the one successful file
      mockFs.stat.mockResolvedValue({
        size: 1024 * 1024,
        mtime: new Date(),
      } as any);

      const result = await localCache.getStats();

      expect(result).toEqual({
        totalFiles: 1,
        totalSizeMB: 1,
        oldestFile: expect.any(Date),
        newestFile: expect.any(Date),
      });
    });
  });

  describe('remove', () => {
    it('should remove artifact and metadata successfully', async () => {
      mockFs.unlink
        .mockResolvedValueOnce(undefined) // cache file
        .mockResolvedValueOnce(undefined); // metadata file

      const result = await localCache.remove('test-package');

      expect(result).toBe(true);
      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('ab/abcdef1234567890.cache')
      );
      expect(mockFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('ab/abcdef1234567890.meta')
      );
    });

    it('should return false when cache file removal fails', async () => {
      mockFs.unlink.mockRejectedValue(new Error('ENOENT'));

      const result = await localCache.remove('test-package');

      expect(result).toBe(false);
    });

    it('should succeed even if metadata removal fails', async () => {
      mockFs.unlink
        .mockResolvedValueOnce(undefined) // cache file succeeds
        .mockRejectedValueOnce(new Error('metadata removal failed')); // metadata fails

      const result = await localCache.remove('test-package');

      expect(result).toBe(true);
    });

    it('should log verbose message when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseCache = new LocalCache({ verboseLogging: true });

      mockFs.unlink.mockResolvedValue(undefined);

      await verboseCache.remove('test-package');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Local] Removed test-package from local cache'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getCachePath (private)', () => {
    it('should generate correct cache path', () => {
      const packageId = 'test-package';

      const result = (localCache as any).getCachePath(packageId);

      expect(result).toBe(
        join('/home/testuser/.gitcache/cache', 'ab', 'abcdef1234567890.cache')
      );
    });
  });

  describe('getMetadataPath (private)', () => {
    it('should generate correct metadata path', () => {
      const packageId = 'test-package';

      const result = (localCache as any).getMetadataPath(packageId);

      expect(result).toBe(
        join('/home/testuser/.gitcache/cache', 'ab', 'abcdef1234567890.meta')
      );
    });
  });

  describe('hashPackageId (private)', () => {
    it('should hash package ID correctly', () => {
      const packageId = 'test-package';

      const result = (localCache as any).hashPackageId(packageId);

      expect(result).toBe('abcdef1234567890');
      expect(mockCreateHash).toHaveBeenCalledWith('sha256');
    });
  });

  describe('writeMetadata (private)', () => {
    it('should write metadata with correct structure', async () => {
      const packageId = 'test-package';
      const data = Buffer.from('test data');

      mockFs.writeFile.mockResolvedValue(undefined);

      await (localCache as any).writeMetadata(packageId, data);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.meta'),
        expect.any(String)
      );

      const writeCall1 = mockFs.writeFile.mock.calls[0];
      const metadataStr1 = writeCall1[1] as string;
      const metadata1 = JSON.parse(metadataStr1);

      expect(metadata1).toEqual({
        packageId: 'test-package',
        size: 9,
        sha256: 'abcdef1234567890',
        cachedAt: expect.any(String),
        accessCount: 1,
      });

      const writeCall = mockFs.writeFile.mock.calls[0];
      const metadataStr = writeCall[1] as string;
      const metadata = JSON.parse(metadataStr);

      expect(metadata).toEqual({
        packageId: 'test-package',
        size: 9,
        sha256: 'abcdef1234567890',
        cachedAt: expect.any(String),
        accessCount: 1,
      });
    });

    it('should handle metadata write failure gracefully', async () => {
      const packageId = 'test-package';
      const data = Buffer.from('test data');

      mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

      // Should not throw
      await expect(
        (localCache as any).writeMetadata(packageId, data)
      ).resolves.toBeUndefined();
    });
  });

  describe('updateAccessCount (private)', () => {
    it('should update existing metadata', async () => {
      const packageId = 'test-package';
      const existingMetadata = {
        packageId: 'test-package',
        accessCount: 5,
        cachedAt: '2023-01-01T00:00:00.000Z',
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(existingMetadata));
      mockFs.writeFile.mockResolvedValue(undefined);

      await (localCache as any).updateAccessCount(packageId);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.meta'),
        expect.any(String)
      );

      const writeCall2 = mockFs.writeFile.mock.calls[0];
      const metadataStr2 = writeCall2[1] as string;
      const metadata2 = JSON.parse(metadataStr2);

      expect(metadata2.accessCount).toBe(6);
    });

    it('should update existing metadata from 0', async () => {
      const packageId = 'test-package';
      const existingMetadata = {
        packageId: 'test-package',
        cachedAt: '2023-01-01T00:00:00.000Z',
        // Note: no accessCount property, so it should default to 0
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(existingMetadata));
      mockFs.writeFile.mockResolvedValue(undefined);

      await (localCache as any).updateAccessCount(packageId);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.meta'),
        expect.any(String)
      );

      const writeCall = mockFs.writeFile.mock.calls[0];
      const metadataStr = writeCall[1] as string;
      const metadata = JSON.parse(metadataStr);

      // Should default to 0 + 1 = 1 when accessCount is missing
      expect(metadata.accessCount).toBe(1);
      expect(metadata.lastAccessed).toBeDefined();
    });

    it('should handle missing metadata gracefully', async () => {
      const packageId = 'test-package';

      mockFs.readFile.mockRejectedValue(new Error('ENOENT'));

      // Should not throw
      await expect(
        (localCache as any).updateAccessCount(packageId)
      ).resolves.toBeUndefined();
    });

    it('should handle JSON parsing errors gracefully', async () => {
      const packageId = 'test-package';

      mockFs.readFile.mockResolvedValue('invalid json');

      // Should not throw
      await expect(
        (localCache as any).updateAccessCount(packageId)
      ).resolves.toBeUndefined();
    });
  });

  describe('enforceSize (private)', () => {
    it('should not remove files when under limit', async () => {
      mockFs.readdir.mockResolvedValue([]);

      await (localCache as any).enforceSize();

      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should remove oldest files when over limit', async () => {
      const smallLimitCache = new LocalCache({ maxSizeMB: 1 }); // 1MB limit

      // Setup mocks to ensure getAllCacheFiles works properly for both calls
      let callCount = 0;
      mockFs.readdir.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // First two calls are for getStats() -> getAllCacheFiles()
          if (callCount === 1) return Promise.resolve(['ab'] as any); // cache root dirs
          if (callCount === 2)
            return Promise.resolve(['file1.cache', 'file2.cache'] as any); // files in ab/
        } else {
          // Subsequent calls are for enforceSize() -> getAllCacheFiles()
          if (callCount === 3) return Promise.resolve(['ab'] as any); // cache root dirs
          if (callCount === 4)
            return Promise.resolve(['file1.cache', 'file2.cache'] as any); // files in ab/
        }
        return Promise.resolve([]);
      });

      // Mock stat calls
      let statCallCount = 0;
      mockFs.stat.mockImplementation(() => {
        statCallCount++;
        if (statCallCount <= 2) {
          // For getStats() calls
          return Promise.resolve({
            size: 1024 * 1024,
            mtime:
              statCallCount === 1
                ? new Date('2023-01-01')
                : new Date('2023-01-02'),
          } as any);
        } else {
          // For enforceSize() calls
          return Promise.resolve({
            size: 1024 * 1024,
            mtime:
              statCallCount === 3
                ? new Date('2023-01-01')
                : new Date('2023-01-02'),
          } as any);
        }
      });

      mockFs.unlink.mockResolvedValue(undefined);

      await (smallLimitCache as any).enforceSize();

      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it('should log eviction when verbose logging is enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseCache = new LocalCache({
        maxSizeMB: 1,
        verboseLogging: true,
      });

      // Setup similar mocking as above
      let callCount = 0;
      mockFs.readdir.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          if (callCount === 1) return Promise.resolve(['ab'] as any);
          if (callCount === 2) return Promise.resolve(['file1.cache'] as any);
        } else {
          if (callCount === 3) return Promise.resolve(['ab'] as any);
          if (callCount === 4) return Promise.resolve(['file1.cache'] as any);
        }
        return Promise.resolve([]);
      });

      mockFs.stat.mockResolvedValue({
        size: 2 * 1024 * 1024,
        mtime: new Date(),
      } as any);
      mockFs.unlink.mockResolvedValue(undefined);

      await (verboseCache as any).enforceSize();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[GitCache Local] Cache size')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[GitCache Local] Evicted')
      );

      consoleSpy.mockRestore();
    });

    it('should handle file removal errors gracefully', async () => {
      const smallLimitCache = new LocalCache({ maxSizeMB: 1 });

      mockFs.readdir
        .mockResolvedValueOnce(['ab'] as any)
        .mockResolvedValueOnce(['file1.cache'] as any);

      mockFs.stat.mockResolvedValue({
        size: 2 * 1024 * 1024,
        mtime: new Date(),
      } as any);
      mockFs.unlink.mockRejectedValue(new Error('Permission denied'));

      // Should not throw
      await expect(
        (smallLimitCache as any).enforceSize()
      ).resolves.toBeUndefined();
    });
  });

  describe('getAllCacheFiles (private)', () => {
    it('should return all cache files', async () => {
      mockFs.readdir
        .mockResolvedValueOnce(['ab', 'cd'] as any)
        .mockResolvedValueOnce(['file1.cache', 'file1.meta'] as any)
        .mockResolvedValueOnce(['file2.cache', 'file2.meta'] as any);

      const result = await (localCache as any).getAllCacheFiles();

      expect(result).toEqual([
        join('/home/testuser/.gitcache/cache', 'ab', 'file1.cache'),
        join('/home/testuser/.gitcache/cache', 'cd', 'file2.cache'),
      ]);
    });

    it('should handle missing cache directory', async () => {
      mockFs.readdir.mockRejectedValue(new Error('ENOENT'));

      const result = await (localCache as any).getAllCacheFiles();

      expect(result).toEqual([]);
    });

    it('should ignore subdirectories that cannot be read', async () => {
      mockFs.readdir
        .mockResolvedValueOnce(['ab', 'cd'] as any)
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce(['file2.cache'] as any);

      const result = await (localCache as any).getAllCacheFiles();

      expect(result).toEqual([
        join('/home/testuser/.gitcache/cache', 'cd', 'file2.cache'),
      ]);
    });

    it('should only return .cache files', async () => {
      mockFs.readdir
        .mockResolvedValueOnce(['ab'] as any)
        .mockResolvedValueOnce([
          'file1.cache',
          'file1.meta',
          'other.txt',
        ] as any);

      const result = await (localCache as any).getAllCacheFiles();

      expect(result).toEqual([
        join('/home/testuser/.gitcache/cache', 'ab', 'file1.cache'),
      ]);
    });
  });

  describe('logVerbose (private)', () => {
    it('should log when verbose logging is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const verboseCache = new LocalCache({ verboseLogging: true });

      (verboseCache as any).logVerbose('Test message');

      expect(consoleSpy).toHaveBeenCalledWith('[GitCache Local] Test message');

      consoleSpy.mockRestore();
    });

    it('should not log when verbose logging is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const quietCache = new LocalCache({ verboseLogging: false });

      (quietCache as any).logVerbose('Test message');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle concurrent cache operations', async () => {
      const testData = Buffer.from('test data');

      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      // Simulate concurrent stores
      const promises = [
        localCache.store('package1', testData),
        localCache.store('package2', testData),
        localCache.store('package3', testData),
      ];

      await expect(Promise.all(promises)).resolves.toHaveLength(3);
    });

    it('should handle custom cache directory', () => {
      const customCache = new LocalCache({ cacheDir: '/custom/cache/dir' });

      const cachePath = (customCache as any).getCachePath('test-package');

      expect(cachePath).toMatch(/^\/custom\/cache\/dir/);
    });

    it('should handle large cache statistics calculation', async () => {
      const largeFileSize = 1024 * 1024 * 100; // 100MB

      mockFs.readdir
        .mockResolvedValueOnce(['ab'] as any)
        .mockResolvedValueOnce(['file1.cache'] as any);

      mockFs.stat.mockResolvedValue({
        size: largeFileSize,
        mtime: new Date(),
      } as any);

      const result = await localCache.getStats();

      expect(result.totalSizeMB).toBe(100);
    });

    it('should handle empty hash result', () => {
      const mockHashInstance = {
        update: vi.fn().mockReturnThis(),
        digest: vi.fn().mockReturnValue(''),
      };
      mockCreateHash.mockReturnValue(mockHashInstance as any);

      const result = (localCache as any).hashPackageId('test');

      expect(result).toBe('');
    });
  });

  describe('error scenarios for complete coverage', () => {
    let localCache: LocalCache;

    beforeEach(() => {
      localCache = new LocalCache();
    });

    it('should handle fs errors during cache directory creation', async () => {
      vi.mocked(fs.mkdir).mockRejectedValueOnce(
        new Error('EACCES: permission denied')
      );

      await expect(
        localCache.store('test-package', Buffer.from('test-data'))
      ).rejects.toThrow('EACCES: permission denied');
    });

    it('should handle overall getStats operation failure', async () => {
      // Mock getAllCacheFiles to throw by making the method itself throw
      // This bypasses the internal try-catch in getAllCacheFiles and hits the outer catch
      const originalGetAllCacheFiles = (localCache as any).getAllCacheFiles;
      (localCache as any).getAllCacheFiles = vi
        .fn()
        .mockRejectedValue(new Error('getAllCacheFiles failed'));

      const result = await localCache.getStats();

      // Should return the default error state for getStats failure
      expect(result).toEqual({
        totalFiles: 0,
        totalSizeMB: 0,
        oldestFile: null,
        newestFile: null,
      });

      // Restore original method
      (localCache as any).getAllCacheFiles = originalGetAllCacheFiles;
    });

    it('should handle fs.stat failure during enforceSize file processing', async () => {
      const smallLimitCache = new LocalCache({ maxSizeMB: 1 });

      // Setup getAllCacheFiles to return some files
      vi.mocked(fs.readdir)
        .mockResolvedValueOnce(['ab'] as any) // cache root dirs
        .mockResolvedValueOnce(['file1.cache'] as any); // files in ab/

      // Mock fs.stat to fail (this hits the catch block in enforceSize)
      vi.mocked(fs.stat).mockRejectedValue(new Error('stat failed'));

      // Should not throw despite stat failure
      await expect(
        (smallLimitCache as any).enforceSize()
      ).resolves.toBeUndefined();
    });

    it('should handle fs.unlink failure during file removal in enforceSize', async () => {
      const smallLimitCache = new LocalCache({ maxSizeMB: 1 });

      // Setup mocks to simulate cache over limit
      let callCount = 0;
      vi.mocked(fs.readdir).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // For getStats() calls
          if (callCount === 1) return Promise.resolve(['ab'] as any);
          if (callCount === 2) return Promise.resolve(['file1.cache'] as any);
        } else {
          // For enforceSize() calls
          if (callCount === 3) return Promise.resolve(['ab'] as any);
          if (callCount === 4) return Promise.resolve(['file1.cache'] as any);
        }
        return Promise.resolve([]);
      });

      // Mock stat to return large file size (triggers removal)
      vi.mocked(fs.stat).mockResolvedValue({
        size: 2 * 1024 * 1024, // 2MB (over 1MB limit)
        mtime: new Date(),
      } as any);

      // Mock unlink to fail (this hits the catch block during file removal)
      vi.mocked(fs.unlink).mockRejectedValue(new Error('unlink failed'));

      // Should not throw despite unlink failure (catch continues on error)
      await expect(
        (smallLimitCache as any).enforceSize()
      ).resolves.toBeUndefined();
    });

    it('should handle stat failure during enforceSize and log verbose message', async () => {
      // Create a cache with verbose logging and small limit to trigger enforceSize
      const verboseCache = new LocalCache({
        cacheDir: testCacheDir,
        maxSizeMB: 1, // 1MB limit
        verboseLogging: true,
      });

      // Mock console.log to capture verbose messages
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock readdir to return cache files
      let readdirCallCount = 0;
      vi.mocked(fs.readdir).mockImplementation(() => {
        readdirCallCount++;
        if (readdirCallCount <= 2) {
          // For getStats() calls
          if (readdirCallCount === 1) return Promise.resolve(['ab'] as any);
          if (readdirCallCount === 2)
            return Promise.resolve(['file1.cache', 'file2.cache'] as any);
        } else {
          // For enforceSize() calls
          if (readdirCallCount === 3) return Promise.resolve(['ab'] as any);
          if (readdirCallCount === 4)
            return Promise.resolve(['file1.cache', 'file2.cache'] as any);
        }
        return Promise.resolve([]);
      });

      // Mock stat to fail for one file during enforceSize
      let statCallCount = 0;
      vi.mocked(fs.stat).mockImplementation(() => {
        statCallCount++;
        if (statCallCount <= 2) {
          // For getStats() calls - succeed
          return Promise.resolve({
            size: 1024 * 1024, // 1MB each
            mtime: new Date(),
          } as any);
        } else {
          // For enforceSize() calls - first file fails, second succeeds
          if (statCallCount === 3) {
            // This will trigger the catch block for fs.stat failure
            return Promise.reject(new Error('Permission denied'));
          } else {
            return Promise.resolve({
              size: 1024 * 1024,
              mtime: new Date(),
            } as any);
          }
        }
      });

      // Call enforceSize indirectly through store
      const testData = Buffer.from('test data');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await verboseCache.store('test-package', testData);

      // Verify the verbose log was called for the stat failure
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping file')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'unable to read stats: Error: Permission denied'
        )
      );

      consoleSpy.mockRestore();
    });
  });
});
