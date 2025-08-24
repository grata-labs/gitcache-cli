import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, existsSync as actualExistsSync } from 'node:fs';

// Mock the dependencies at the top level before imports
vi.mock('../../lockfile/scan.js', () => ({
  scanLockfile: vi.fn(),
  resolveGitReferences: vi.fn(),
}));

vi.mock('../../lib/tarball-builder.js', () => ({
  createTarballBuilder: vi.fn(),
}));

vi.mock('../../lib/utils/path.js', () => ({
  getCacheDir: vi.fn(),
  getPlatformIdentifier: vi.fn(),
  getTarballCachePath: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

import { Analyze } from '../../commands/analyze.js';

describe('Analyze Command Unit Tests', () => {
  let analyze: Analyze;
  let tempTestDir: string;
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;

  beforeEach(() => {
    analyze = new Analyze();
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    console.log = vi.fn();
    console.warn = vi.fn();

    // Create a temporary directory for testing
    tempTestDir = join(tmpdir(), `gitcache-analyze-test-${Date.now()}`);
    mkdirSync(tempTestDir, { recursive: true });

    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;

    // Clean up test directory
    if (actualExistsSync(tempTestDir)) {
      rmSync(tempTestDir, { recursive: true, force: true });
    }

    vi.restoreAllMocks();
  });

  describe('Error handling branches', () => {
    it('should handle lockfile not found', async () => {
      const { existsSync } = await import('node:fs');
      const mockExistsSync = vi.mocked(existsSync);

      mockExistsSync.mockReturnValue(false);

      await expect(
        analyze.exec([], { lockfile: 'nonexistent.json' })
      ).rejects.toThrow('Lockfile not found: nonexistent.json');
    });

    it('should handle null exceptions in analysis', async () => {
      const { scanLockfile } = await import('../../lockfile/scan.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockExistsSync = vi.mocked(existsSync);

      mockExistsSync.mockReturnValue(true);

      // Mock scanLockfile to throw null
      mockScanLockfile.mockImplementation(() => {
        throw null;
      });

      await expect(
        analyze.exec([], { lockfile: 'test-lock.json' })
      ).rejects.toThrow('Failed to analyze lockfile: null');
    });
  });

  describe('No Git dependencies scenario', () => {
    it('should handle lockfile with no Git dependencies - formatted output', async () => {
      const { scanLockfile } = await import('../../lockfile/scan.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockExistsSync = vi.mocked(existsSync);

      mockExistsSync.mockReturnValue(true);
      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: false,
        dependencies: [],
      });

      await analyze.exec([], { lockfile: 'test-lock.json' });

      expect(console.log).toHaveBeenCalledWith(
        'No Git dependencies found in lockfile.'
      );
      expect(console.log).toHaveBeenCalledWith(
        'Consider using Git dependencies to benefit from GitCache optimization.'
      );
    });

    it('should handle lockfile with no Git dependencies - JSON output', async () => {
      const { scanLockfile } = await import('../../lockfile/scan.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockExistsSync = vi.mocked(existsSync);

      mockExistsSync.mockReturnValue(true);
      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: false,
        dependencies: [],
      });

      await analyze.exec([], { lockfile: 'test-lock.json', json: true });

      const consoleLogCalls = vi.mocked(console.log).mock.calls;
      const jsonOutput = consoleLogCalls.find((call) => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.lockfile === 'test-lock.json';
        } catch {
          return false;
        }
      });

      expect(jsonOutput).toBeDefined();
      if (jsonOutput) {
        const parsed = JSON.parse(jsonOutput[0]);
        expect(parsed.gitDependencies.total).toBe(0);
        expect(parsed.message).toBe('No Git dependencies found');
      }
    });
  });

  describe('Cache analysis functionality', () => {
    it('should analyze cache status with mixed dependencies', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { getCacheDir, getPlatformIdentifier, getTarballCachePath } =
        await import('../../lib/utils/path.js');
      const { existsSync, readdirSync, statSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockGetPlatformIdentifier = vi.mocked(getPlatformIdentifier);
      const mockGetTarballCachePath = vi.mocked(getTarballCachePath);
      const mockExistsSync = vi.mocked(existsSync);
      const mockReaddirSync = vi.mocked(readdirSync);
      const mockStatSync = vi.mocked(statSync);

      // Mock dependencies
      const dependencies = [
        {
          name: 'cached-dep',
          gitUrl: 'git+https://github.com/test/cached.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/cached.git',
          resolvedSha: 'abc123',
        },
        {
          name: 'uncached-dep',
          gitUrl: 'git+https://github.com/test/uncached.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/uncached.git',
          resolvedSha: 'def456',
        },
        {
          name: 'failed-dep',
          gitUrl: 'git+https://github.com/test/failed.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/failed.git',
          resolvedSha: undefined, // Failed to resolve
        },
      ];

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      // Mock platform and tarball paths
      mockGetPlatformIdentifier.mockReturnValue('darwin-arm64');
      mockGetTarballCachePath
        .mockReturnValueOnce('/fake/cache/tarballs/abc123-darwin-arm64') // cached-dep
        .mockReturnValueOnce('/fake/cache/tarballs/def456-darwin-arm64'); // uncached-dep

      // Mock file system checks - first dep is cached, second is not
      mockExistsSync
        .mockReturnValueOnce(true) // lockfile exists
        .mockReturnValueOnce(true) // cached-dep tarball exists
        .mockReturnValueOnce(false); // uncached-dep tarball doesn't exist

      // Mock cache directory
      mockGetCacheDir.mockReturnValue('/fake/cache');
      mockReaddirSync.mockReturnValue([
        'tarball1-dir',
        'tarball2-dir',
      ] as never);
      mockStatSync
        .mockReturnValueOnce({ isDirectory: () => true } as never)
        .mockReturnValueOnce({ size: 1024 } as never) // tarball size
        .mockReturnValueOnce({ isDirectory: () => true } as never)
        .mockReturnValueOnce({ size: 2048 } as never); // tarball size

      await analyze.exec([], { lockfile: 'test-lock.json', verbose: true });

      // Verify analysis output
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Lockfile Analysis')
      );
      expect(console.log).toHaveBeenCalledWith(
        '├─ Git Dependencies:',
        '3 found'
      );
      expect(console.log).toHaveBeenCalledWith(
        '├─ Cache Status:',
        '33% ready (1/3 cached)'
      );
    });

    it('should detect npm v7+ bug in dependencies', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { getCacheDir, getPlatformIdentifier, getTarballCachePath } =
        await import('../../lib/utils/path.js');
      const { existsSync, readdirSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockGetPlatformIdentifier = vi.mocked(getPlatformIdentifier);
      const mockGetTarballCachePath = vi.mocked(getTarballCachePath);
      const mockExistsSync = vi.mocked(existsSync);
      const mockReaddirSync = vi.mocked(readdirSync);

      // Mock dependency with npm v7+ bug
      const dependencies = [
        {
          name: 'buggy-dep',
          gitUrl: 'git+ssh://git@github.com/test/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: 'abc123',
          packageJsonUrl: 'git+ssh://git@github.com/test/repo.git', // SSH in package.json
          lockfileUrl: 'git+https://github.com/test/repo.git', // HTTPS in lockfile
        },
      ];

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      // Mock platform and tarball paths
      mockGetPlatformIdentifier.mockReturnValue('darwin-arm64');
      mockGetTarballCachePath.mockReturnValue(
        '/fake/cache/tarballs/abc123-darwin-arm64'
      );

      // Mock file system checks
      mockExistsSync
        .mockReturnValueOnce(true) // lockfile exists
        .mockReturnValueOnce(false); // tarball doesn't exist

      mockGetCacheDir.mockReturnValue('/fake/cache');
      mockReaddirSync.mockReturnValue([]);

      await analyze.exec([], { lockfile: 'test-lock.json' });

      expect(console.log).toHaveBeenCalledWith(
        '├─ npm v7+ Issues:',
        '1 detected'
      );
    });

    it('should handle cache directory read errors gracefully', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { getCacheDir, getPlatformIdentifier, getTarballCachePath } =
        await import('../../lib/utils/path.js');
      const { existsSync, readdirSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockGetPlatformIdentifier = vi.mocked(getPlatformIdentifier);
      const mockGetTarballCachePath = vi.mocked(getTarballCachePath);
      const mockExistsSync = vi.mocked(existsSync);
      const mockReaddirSync = vi.mocked(readdirSync);

      const dependencies = [
        {
          name: 'test-dep',
          gitUrl: 'git+https://github.com/test/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: 'abc123',
        },
      ];

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      // Mock platform and tarball paths
      mockGetPlatformIdentifier.mockReturnValue('darwin-arm64');
      mockGetTarballCachePath.mockReturnValue(
        '/fake/cache/tarballs/abc123-darwin-arm64'
      );

      // Mock file system checks
      mockExistsSync
        .mockReturnValueOnce(true) // lockfile exists
        .mockReturnValueOnce(false) // tarball doesn't exist
        .mockReturnValueOnce(true); // tarballs directory exists (for calculateCacheSize)

      const mockCacheDir = '/fake/cache';
      mockGetCacheDir.mockReturnValue(mockCacheDir);

      // Mock readdirSync to throw an error when called with any path containing 'tarballs'
      // This handles cross-platform path separator differences
      mockReaddirSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('tarballs')) {
          throw new Error('Permission denied');
        }
        return [];
      });

      await analyze.exec([], { lockfile: 'test-lock.json' });

      expect(console.warn).toHaveBeenCalledWith(
        'Warning: Could not read cache directory: Error: Permission denied'
      );
    });

    it('should report cache size when cache entries exist', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { getCacheDir, getPlatformIdentifier, getTarballCachePath } =
        await import('../../lib/utils/path.js');
      const { existsSync, readdirSync, statSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockGetPlatformIdentifier = vi.mocked(getPlatformIdentifier);
      const mockGetTarballCachePath = vi.mocked(getTarballCachePath);
      const mockExistsSync = vi.mocked(existsSync);
      const mockReaddirSync = vi.mocked(readdirSync);
      const mockStatSync = vi.mocked(statSync);

      // Mock dependencies - all cached
      const dependencies = [
        {
          name: 'cached-dep1',
          gitUrl: 'git+https://github.com/test/repo1.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/repo1.git',
          resolvedSha: 'abc123',
        },
        {
          name: 'cached-dep2',
          gitUrl: 'git+https://github.com/test/repo2.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/repo2.git',
          resolvedSha: 'def456',
        },
      ];

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      // Mock platform and tarball paths
      mockGetPlatformIdentifier.mockReturnValue('darwin-arm64');
      mockGetTarballCachePath
        .mockReturnValueOnce('/fake/cache/tarballs/abc123-darwin-arm64') // cached-dep1
        .mockReturnValueOnce('/fake/cache/tarballs/def456-darwin-arm64'); // cached-dep2

      // Mock file system checks - both deps are cached
      mockExistsSync
        .mockReturnValueOnce(true) // lockfile exists
        .mockReturnValueOnce(true) // cached-dep1 tarball exists
        .mockReturnValueOnce(true) // cached-dep2 tarball exists
        .mockReturnValueOnce(true) // tarballs directory exists
        .mockReturnValueOnce(true) // abc123-darwin-arm64/package.tgz exists
        .mockReturnValueOnce(true); // def456-darwin-arm64/package.tgz exists

      // Mock cache directory with actual cached tarballs
      mockGetCacheDir.mockReturnValue('/fake/cache');
      mockReaddirSync.mockReturnValue([
        'abc123-darwin-arm64',
        'def456-darwin-arm64',
        'other-file.txt', // non-directory file should be ignored
      ] as never);

      // Mock statSync for cache size calculation
      mockStatSync
        .mockReturnValueOnce({ isDirectory: () => true } as never) // abc123-darwin-arm64 is directory
        .mockReturnValueOnce({ size: 1024 } as never) // package.tgz size for abc123
        .mockReturnValueOnce({ isDirectory: () => true } as never) // def456-darwin-arm64 is directory
        .mockReturnValueOnce({ size: 2048 } as never) // package.tgz size for def456
        .mockReturnValueOnce({ isDirectory: () => false } as never); // other-file.txt is not directory

      await analyze.exec([], { lockfile: 'test-lock.json' });

      // Verify analysis output shows 100% cache
      expect(console.log).toHaveBeenCalledWith(
        '├─ Git Dependencies:',
        '2 found'
      );
      expect(console.log).toHaveBeenCalledWith(
        '├─ Cache Status:',
        '100% ready (2/2 cached)'
      );
      expect(console.log).toHaveBeenCalledWith(
        '├─ Disk Usage:',
        '0MB cached tarballs (2 files)'
      );
    });
  });

  describe('Performance estimation', () => {
    it('should provide correct cache percentage for different cache ratios', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { getCacheDir, getPlatformIdentifier, getTarballCachePath } =
        await import('../../lib/utils/path.js');
      const { existsSync, readdirSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockGetPlatformIdentifier = vi.mocked(getPlatformIdentifier);
      const mockGetTarballCachePath = vi.mocked(getTarballCachePath);
      const mockExistsSync = vi.mocked(existsSync);
      const mockReaddirSync = vi.mocked(readdirSync);

      // Test fully cached scenario
      const dependencies = [
        {
          name: 'dep1',
          gitUrl: 'git+https://github.com/test/repo1.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/repo1.git',
          resolvedSha: 'abc123',
        },
        {
          name: 'dep2',
          gitUrl: 'git+https://github.com/test/repo2.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/repo2.git',
          resolvedSha: 'def456',
        },
      ];

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      // Mock platform and tarball paths
      mockGetPlatformIdentifier.mockReturnValue('darwin-arm64');
      mockGetTarballCachePath
        .mockReturnValueOnce('/fake/cache/tarballs/abc123-darwin-arm64')
        .mockReturnValueOnce('/fake/cache/tarballs/def456-darwin-arm64');

      // Mock file system checks - both deps are cached
      mockExistsSync
        .mockReturnValueOnce(true) // lockfile exists
        .mockReturnValueOnce(true) // dep1 tarball exists
        .mockReturnValueOnce(true); // dep2 tarball exists

      mockGetCacheDir.mockReturnValue('/fake/cache');
      mockReaddirSync.mockReturnValue([]);

      await analyze.exec([], { lockfile: 'test-lock.json' });

      expect(console.log).toHaveBeenCalledWith(
        '└─ Performance:',
        'All dependencies cached\n'
      );
    });

    it('should calculate correct percentages for partial cache scenarios', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { getCacheDir, getPlatformIdentifier, getTarballCachePath } =
        await import('../../lib/utils/path.js');
      const { existsSync, readdirSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockGetPlatformIdentifier = vi.mocked(getPlatformIdentifier);
      const mockGetTarballCachePath = vi.mocked(getTarballCachePath);
      const mockExistsSync = vi.mocked(existsSync);
      const mockReaddirSync = vi.mocked(readdirSync);

      // Test 50% cached scenario (2 out of 4 deps cached)
      const dependencies = [
        {
          name: 'cached1',
          gitUrl: 'git+https://github.com/test/cached1.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/cached1.git',
          resolvedSha: 'abc123',
        },
        {
          name: 'cached2',
          gitUrl: 'git+https://github.com/test/cached2.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/cached2.git',
          resolvedSha: 'def456',
        },
        {
          name: 'uncached1',
          gitUrl: 'git+https://github.com/test/uncached1.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/uncached1.git',
          resolvedSha: 'ghi789',
        },
        {
          name: 'uncached2',
          gitUrl: 'git+https://github.com/test/uncached2.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/uncached2.git',
          resolvedSha: 'jkl012',
        },
      ];

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      // Mock platform and tarball paths
      mockGetPlatformIdentifier.mockReturnValue('darwin-arm64');
      mockGetTarballCachePath
        .mockReturnValueOnce('/fake/cache/tarballs/abc123-darwin-arm64') // cached1
        .mockReturnValueOnce('/fake/cache/tarballs/def456-darwin-arm64') // cached2
        .mockReturnValueOnce('/fake/cache/tarballs/ghi789-darwin-arm64') // uncached1
        .mockReturnValueOnce('/fake/cache/tarballs/jkl012-darwin-arm64'); // uncached2

      // Mock file system checks - 2 cached, 2 uncached
      mockExistsSync
        .mockReturnValueOnce(true) // lockfile exists
        .mockReturnValueOnce(true) // cached1 tarball exists
        .mockReturnValueOnce(true) // cached2 tarball exists
        .mockReturnValueOnce(false) // uncached1 tarball doesn't exist
        .mockReturnValueOnce(false); // uncached2 tarball doesn't exist

      mockGetCacheDir.mockReturnValue('/fake/cache');
      mockReaddirSync.mockReturnValue([]);

      await analyze.exec([], { lockfile: 'test-lock.json' });

      expect(console.log).toHaveBeenCalledWith(
        '└─ Performance:',
        '50% of dependencies cached\n'
      );
    });

    it('should handle dependencies without resolved SHA', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { createTarballBuilder } = await import(
        '../../lib/tarball-builder.js'
      );
      const { getCacheDir } = await import('../../lib/utils/path.js');
      const { existsSync, readdirSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockCreateTarballBuilder = vi.mocked(createTarballBuilder);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockExistsSync = vi.mocked(existsSync);
      const mockReaddirSync = vi.mocked(readdirSync);

      const dependencies = [
        {
          name: 'failed-resolve',
          gitUrl: 'git+https://github.com/test/failed.git',
          reference: 'nonexistent-branch',
          preferredUrl: 'git+https://github.com/test/failed.git',
          resolvedSha: undefined, // Resolution failed
        },
      ];

      mockExistsSync.mockReturnValue(true);
      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      mockCreateTarballBuilder.mockReturnValue({
        getCachedTarball: vi.fn().mockReturnValue(null),
      } as never);

      mockGetCacheDir.mockReturnValue('/fake/cache');
      mockReaddirSync.mockReturnValue([]);

      await analyze.exec([], { lockfile: 'test-lock.json' });

      // Should show 0% cache rate and handle failed resolution
      expect(console.log).toHaveBeenCalledWith(
        '├─ Cache Status:',
        '0% ready (0/1 cached)'
      );
    });
  });

  describe('JSON output format', () => {
    it('should provide complete JSON analysis', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { getCacheDir, getPlatformIdentifier, getTarballCachePath } =
        await import('../../lib/utils/path.js');
      const { existsSync, readdirSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockGetPlatformIdentifier = vi.mocked(getPlatformIdentifier);
      const mockGetTarballCachePath = vi.mocked(getTarballCachePath);
      const mockExistsSync = vi.mocked(existsSync);
      const mockReaddirSync = vi.mocked(readdirSync);

      const dependencies = [
        {
          name: 'test-dep',
          gitUrl: 'git+https://github.com/test/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: 'abc123',
        },
      ];

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      // Mock platform and tarball paths
      mockGetPlatformIdentifier.mockReturnValue('darwin-arm64');
      mockGetTarballCachePath.mockReturnValue(
        '/fake/cache/tarballs/abc123-darwin-arm64'
      );

      // Mock file system checks
      mockExistsSync
        .mockReturnValueOnce(true) // lockfile exists
        .mockReturnValueOnce(false); // tarball doesn't exist

      mockGetCacheDir.mockReturnValue('/fake/cache');
      mockReaddirSync.mockReturnValue([]);

      await analyze.exec([], { lockfile: 'test-lock.json', json: true });

      const consoleLogCalls = vi.mocked(console.log).mock.calls;
      const jsonOutput = consoleLogCalls.find((call) => {
        try {
          const parsed = JSON.parse(call[0]);
          return parsed.lockfile === 'test-lock.json';
        } catch {
          return false;
        }
      });

      expect(jsonOutput).toBeDefined();
      if (jsonOutput) {
        const parsed = JSON.parse(jsonOutput[0]);
        expect(parsed).toHaveProperty('lockfile');
        expect(parsed).toHaveProperty('gitDependencies');
        expect(parsed).toHaveProperty('cacheStatus');
        expect(parsed).toHaveProperty('performance');
        expect(parsed).toHaveProperty('issues');
        expect(parsed).toHaveProperty('recommendations');
        expect(parsed).toHaveProperty('dependencies');
      }
    });
  });

  describe('Verbose output and dependency details', () => {
    it('should show detailed dependency information in verbose mode', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { getCacheDir, getPlatformIdentifier, getTarballCachePath } =
        await import('../../lib/utils/path.js');
      const { existsSync, readdirSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockGetPlatformIdentifier = vi.mocked(getPlatformIdentifier);
      const mockGetTarballCachePath = vi.mocked(getTarballCachePath);
      const mockExistsSync = vi.mocked(existsSync);
      const mockReaddirSync = vi.mocked(readdirSync);

      const dependencies = [
        {
          name: 'verbose-dep',
          gitUrl: 'git+https://github.com/test/verbose.git',
          reference: 'v1.0.0',
          preferredUrl: 'git+https://github.com/test/verbose.git',
          resolvedSha: 'abc123def456',
          packageJsonUrl: 'git+ssh://git@github.com/test/verbose.git',
          lockfileUrl: 'git+https://github.com/test/verbose.git',
        },
      ];

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      // Mock platform and tarball paths
      mockGetPlatformIdentifier.mockReturnValue('darwin-arm64');
      mockGetTarballCachePath.mockReturnValue(
        '/fake/cache/tarballs/abc123def456-darwin-arm64'
      );

      // Mock file system checks - tarball exists (cached)
      mockExistsSync
        .mockReturnValueOnce(true) // lockfile exists
        .mockReturnValueOnce(true); // tarball exists (cached)

      mockGetCacheDir.mockReturnValue('/fake/cache');
      mockReaddirSync.mockReturnValue([]);

      await analyze.exec([], { lockfile: 'test-lock.json', verbose: true });

      // Should show dependency details
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Dependencies:')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('verbose-dep')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('URL: git+https://github.com/test/verbose.git')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('SHA: abc123de')
      );
    });

    it('should show issues for dependencies with problems', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { createTarballBuilder } = await import(
        '../../lib/tarball-builder.js'
      );
      const { getCacheDir } = await import('../../lib/utils/path.js');
      const { existsSync, readdirSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockCreateTarballBuilder = vi.mocked(createTarballBuilder);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockExistsSync = vi.mocked(existsSync);
      const mockReaddirSync = vi.mocked(readdirSync);

      const dependencies = [
        {
          name: 'problematic-dep',
          gitUrl: 'git+ssh://git@github.com/test/problematic.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/problematic.git',
          resolvedSha: undefined, // Failed to resolve
          packageJsonUrl: 'git+ssh://git@github.com/test/problematic.git',
          lockfileUrl: 'git+https://github.com/test/problematic.git',
        },
      ];

      mockExistsSync.mockReturnValue(true);
      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      mockCreateTarballBuilder.mockReturnValue({
        getCachedTarball: vi.fn().mockReturnValue(null),
      } as never);

      mockGetCacheDir.mockReturnValue('/fake/cache');
      mockReaddirSync.mockReturnValue([]);

      await analyze.exec([], { lockfile: 'test-lock.json', verbose: true });

      // Should show issue warning
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⚠'));
    });
  });

  describe('Lockfile path resolution', () => {
    it('should use provided lockfile path', async () => {
      const { existsSync } = await import('node:fs');
      const mockExistsSync = vi.mocked(existsSync);

      mockExistsSync.mockReturnValue(false);

      await expect(
        analyze.exec([], { lockfile: '/custom/path/package-lock.json' })
      ).rejects.toThrow('Lockfile not found: /custom/path/package-lock.json');
    });

    it('should auto-detect common lockfile names', async () => {
      const { existsSync } = await import('node:fs');
      const mockExistsSync = vi.mocked(existsSync);

      // Mock no lockfile found - should default to package-lock.json
      mockExistsSync.mockReturnValue(false);

      await expect(
        analyze.exec([], {}) // No lockfile specified
      ).rejects.toThrow('package-lock.json');
    });

    it('should handle cache directory that does not exist', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { getCacheDir, getPlatformIdentifier, getTarballCachePath } =
        await import('../../lib/utils/path.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockGetCacheDir = vi.mocked(getCacheDir);
      const mockGetPlatformIdentifier = vi.mocked(getPlatformIdentifier);
      const mockGetTarballCachePath = vi.mocked(getTarballCachePath);
      const mockExistsSync = vi.mocked(existsSync);

      const dependencies = [
        {
          name: 'test-dep',
          gitUrl: 'git+https://github.com/test/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: 'abc123',
        },
      ];

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      // Mock platform and tarball paths
      mockGetPlatformIdentifier.mockReturnValue('darwin-arm64');
      mockGetTarballCachePath.mockReturnValue(
        '/fake/cache/tarballs/abc123-darwin-arm64'
      );

      // Mock lockfile exists but cache directory doesn't
      mockExistsSync
        .mockReturnValueOnce(true) // lockfile exists
        .mockReturnValueOnce(false) // tarball doesn't exist
        .mockReturnValueOnce(false); // cache tarballs dir doesn't exist for calculateCacheSize

      mockGetCacheDir.mockReturnValue('/fake/cache');

      await analyze.exec([], { lockfile: 'test-lock.json' });

      // Should handle missing cache gracefully and NOT show disk usage when size is 0
      expect(console.log).toHaveBeenCalledWith(
        '├─ Cache Status:',
        '0% ready (0/1 cached)'
      );
      // Disk usage should NOT be shown when totalSize is 0
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('├─ Disk Usage:')
      );
    });

    it('should handle edge case with no Git dependencies (zero total coverage)', async () => {
      const { scanLockfile } = await import('../../lockfile/scan.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockExistsSync = vi.mocked(existsSync);

      mockExistsSync.mockReturnValue(true);
      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: false,
        dependencies: [],
      });

      await analyze.exec([], { lockfile: 'test-lock.json' });

      // Should show no dependencies message
      expect(console.log).toHaveBeenCalledWith(
        'No Git dependencies found in lockfile.'
      );
    });

    it('should use package-lock.json as fallback when no other lockfiles found (lines 406-407)', async () => {
      const { scanLockfile } = await import('../../lockfile/scan.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockExistsSync = vi.mocked(existsSync);

      // Mock existsSync to return false for pnpm-lock.yaml and yarn.lock
      mockExistsSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (
          pathStr.includes('pnpm-lock.yaml') ||
          pathStr.includes('yarn.lock')
        ) {
          return false; // These don't exist
        }
        // Return true for package-lock.json checks during analysis
        return pathStr.includes('package-lock.json');
      });

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: false,
        dependencies: [],
      });

      await analyze.exec([], {}); // No lockfile specified, should auto-detect

      // Should fall back to package-lock.json when other lockfiles don't exist
      expect(mockScanLockfile).toHaveBeenCalledWith(
        expect.stringMatching(/package-lock\.json$/)
      );
    });
  });
});
