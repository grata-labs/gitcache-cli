import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Install } from '../../commands/install.js';
import * as nodeFs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { scanLockfile, resolveGitReferences } from '../../lockfile/scan.js';
import { TarballBuilder } from '../../lib/tarball-builder.js';

// Mock dependencies
vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('../../lockfile/scan.js');
vi.mock('../../lib/tarball-builder.js');

describe('Install Command Unit Tests - Coverage Focused', () => {
  let installCommand: Install;
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalProcessExit: typeof process.exit;

  beforeEach(() => {
    installCommand = new Install();
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalProcessExit = process.exit;

    console.log = vi.fn();
    console.warn = vi.fn();
    process.exit = vi.fn(() => {
      throw new Error('Process exited');
    }) as never;

    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    process.exit = originalProcessExit;
  });

  describe('mkdirSync error handling', () => {
    it('should warn on mkdirSync non-EEXIST errors', async () => {
      // Mock mkdirSync to throw a permission error
      const mkdirError = new Error('Permission denied');
      (mkdirError as NodeJS.ErrnoException).code = 'EACCES';

      vi.mocked(nodeFs.mkdirSync).mockImplementation(() => {
        throw mkdirError;
      });

      // Mock existsSync to return false (no lockfile)
      vi.mocked(nodeFs.existsSync).mockReturnValue(false);

      // Mock spawnSync to return success
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      // Should warn about cache directory creation failure
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Could not create cache directory')
      );
    });

    it('should not warn for EEXIST errors', async () => {
      // Mock mkdirSync to throw EEXIST error (directory already exists)
      const mkdirError = new Error('File exists');
      (mkdirError as NodeJS.ErrnoException).code = 'EEXIST';

      vi.mocked(nodeFs.mkdirSync).mockImplementation(() => {
        throw mkdirError;
      });

      // Mock existsSync to return false (no lockfile)
      vi.mocked(nodeFs.existsSync).mockReturnValue(false);

      // Mock spawnSync to return success
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      // Should NOT warn about EEXIST errors
      expect(console.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Warning: Could not create cache directory')
      );
    });
  });

  describe('spawnSync result handling', () => {
    it('should handle error with no status - Windows edge case', async () => {
      // Mock existsSync to return false (no lockfile)
      vi.mocked(nodeFs.existsSync).mockReturnValue(false);

      // Mock spawnSync to return error without status (Windows edge case)
      vi.mocked(spawnSync).mockReturnValue({
        status: null, // No status
        error: new Error('Spawn error'), // But there is an error
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await expect(installCommand.exec([])).rejects.toThrow(
        'npm install failed with exit code 1'
      );

      // Should not call process.exit when throwing error
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should handle success with null status (Windows)', async () => {
      // Mock existsSync to return false (no lockfile)
      vi.mocked(nodeFs.existsSync).mockReturnValue(false);

      // Mock spawnSync to return null status but no error (Windows success case)
      vi.mocked(spawnSync).mockReturnValue({
        status: null, // No status
        error: undefined, // No error
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      // Should NOT exit when status is null but no error exists
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should handle undefined status with error', async () => {
      // Mock existsSync to return false (no lockfile)
      vi.mocked(nodeFs.existsSync).mockReturnValue(false);

      // Mock spawnSync to return null status with error
      vi.mocked(spawnSync).mockReturnValue({
        status: null, // Explicitly null instead of undefined
        error: new Error('Spawn error'), // But there is an error
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await expect(installCommand.exec([])).rejects.toThrow(
        'npm install failed with exit code 1'
      );

      // Should not call process.exit when throwing error
      expect(process.exit).not.toHaveBeenCalled();
    });
  });

  describe('prepareGitDependencies edge cases', () => {
    it('should handle no resolvable Git dependencies', async () => {
      // Mock existsSync to return true (lockfile exists)
      vi.mocked(nodeFs.existsSync).mockReturnValue(true);

      // Mock scanLockfile to return dependencies
      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2, // Add required lockfileVersion
        dependencies: [
          {
            name: 'test-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
            resolvedSha: undefined, // Not resolved
          },
        ],
      });

      // Mock resolveGitReferences to return empty resolved deps
      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'test-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: undefined, // Failed to resolve
        },
      ]);

      // Mock spawnSync to return success
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      // Should log that no Git dependencies could be resolved
      expect(console.log).toHaveBeenCalledWith(
        '⚠️  No Git dependencies could be resolved, skipping preparation'
      );
    });

    it('should handle tarball building when none are cached', async () => {
      // Mock existsSync to return true (lockfile exists)
      vi.mocked(nodeFs.existsSync).mockReturnValue(true);

      // Mock scanLockfile to return dependencies
      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2, // Add required lockfileVersion
        dependencies: [
          {
            name: 'test-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
            resolvedSha: 'abc123',
          },
        ],
      });

      // Mock resolveGitReferences to return resolved deps
      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'test-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: 'abc123',
        },
      ]);

      // Mock TarballBuilder
      const mockBuildTarball = vi.fn().mockResolvedValue(undefined);
      vi.mocked(TarballBuilder).mockImplementation(
        () =>
          ({
            buildTarball: mockBuildTarball,
          }) as never
      );

      // Mock isTarballCached to return false (needs building)
      const isTarballCachedSpy = vi.spyOn(
        installCommand as never,
        'isTarballCached'
      );
      isTarballCachedSpy.mockReturnValue(false);

      // Mock spawnSync to return success
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      // Should log about building missing tarballs
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('🚀 Building 1 missing tarballs')
      );

      // Should log success message
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('✅ Built 1/1 new tarballs')
      );

      // Should log final ready message
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          '🚀 1/1 tarballs ready! Running install with optimized cache'
        )
      );
    });

    it('should handle mixed success and failure in tarball building', async () => {
      // Mock existsSync to return true (lockfile exists)
      vi.mocked(nodeFs.existsSync).mockReturnValue(true);

      // Mock scanLockfile to return multiple dependencies
      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2, // Add required lockfileVersion
        dependencies: [
          {
            name: 'success-dep',
            gitUrl: 'https://github.com/test/success.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/success.git',
            resolvedSha: 'abc123',
          },
          {
            name: 'fail-dep',
            gitUrl: 'https://github.com/test/fail.git',
            reference: 'def456',
            preferredUrl: 'git+https://github.com/test/fail.git',
            resolvedSha: 'def456',
          },
        ],
      });

      // Mock resolveGitReferences to return resolved deps
      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'success-dep',
          gitUrl: 'https://github.com/test/success.git',
          reference: 'abc123',
          preferredUrl: 'git+https://github.com/test/success.git',
          resolvedSha: 'abc123',
        },
        {
          name: 'fail-dep',
          gitUrl: 'https://github.com/test/fail.git',
          reference: 'def456',
          preferredUrl: 'git+https://github.com/test/fail.git',
          resolvedSha: 'def456',
        },
      ]);

      // Mock TarballBuilder - success for first, failure for second
      const mockBuildTarball = vi
        .fn()
        .mockResolvedValueOnce(undefined) // First call succeeds
        .mockRejectedValueOnce(new Error('Build failed')); // Second call fails

      vi.mocked(TarballBuilder).mockImplementation(
        () =>
          ({
            buildTarball: mockBuildTarball,
          }) as never
      );

      // Mock isTarballCached to return false (all need building)
      const isTarballCachedSpy = vi.spyOn(
        installCommand as never,
        'isTarballCached'
      );
      isTarballCachedSpy.mockReturnValue(false);

      // Mock spawnSync to return success
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      // Should warn about failed builds
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Failed to build fail-dep')
      );

      // Should still log success for the one that worked
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('✅ Built 1/2 new tarballs')
      );
    });

    it('should handle when all tarballs are already cached', async () => {
      // Mock existsSync to return true (lockfile exists)
      vi.mocked(nodeFs.existsSync).mockReturnValue(true);

      // Mock scanLockfile to return dependencies
      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2, // Add required lockfileVersion
        dependencies: [
          {
            name: 'cached-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
            resolvedSha: 'abc123',
          },
        ],
      });

      // Mock resolveGitReferences to return resolved deps
      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'cached-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: 'abc123',
        },
      ]);

      // Mock isTarballCached to return true (already cached)
      const isTarballCachedSpy = vi.spyOn(
        installCommand as never,
        'isTarballCached'
      );
      isTarballCachedSpy.mockReturnValue(true);

      // Mock spawnSync to return success
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      // Should log that all tarballs are ready
      expect(console.log).toHaveBeenCalledWith(
        '🚀 All tarballs ready! Running install with optimized cache...\n'
      );
    });
  });

  describe('Non-Error exception handling', () => {
    it('should handle non-Error exceptions in tarball building', async () => {
      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockSpawnSync = vi.mocked(spawnSync);

      mockScanLockfile.mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'test-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
            resolvedSha: undefined,
          },
        ],
      });

      mockResolveGitReferences.mockResolvedValueOnce([
        {
          name: 'test-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: 'abc123',
        },
      ]);

      // Mock TarballBuilder to throw a non-Error object
      const mockBuildTarball = vi.fn().mockRejectedValueOnce('string error');
      vi.mocked(TarballBuilder).mockImplementation(
        () =>
          ({
            buildTarball: mockBuildTarball,
          }) as never
      );

      // Mock isTarballCached to return false (needs building)
      const isTarballCachedSpy = vi.spyOn(
        installCommand as never,
        'isTarballCached'
      );
      isTarballCachedSpy.mockReturnValue(false);

      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        error: undefined,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      // Should handle the non-Error exception and show warning
      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Failed to build test-dep: string error'
      );
    });

    it('should handle non-Error exceptions in prepareGitDependencies', async () => {
      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockSpawnSync = vi.mocked(spawnSync);

      // Make scanLockfile throw a non-Error object
      mockScanLockfile.mockImplementationOnce(() => {
        throw 'string error';
      });

      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        error: undefined,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      // Should handle the non-Error exception and show warning
      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Cache preparation failed: string error'
      );
      expect(console.log).toHaveBeenCalledWith(
        '⏭️  Continuing with normal install...\n'
      );
    });
  });

  describe('missing coverage lines', () => {
    it('should handle cache retrieval failure from cache hierarchy', async () => {
      const mockResolvedDeps = [
        {
          name: 'test-package',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: 'abc123def456',
        },
      ];

      // Mock existsSync to return true for lockfile but false for tarball cache
      vi.mocked(nodeFs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('package-lock.json')) {
          return true; // Lockfile exists
        }
        return false; // Tarball cache doesn't exist
      });

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: mockResolvedDeps,
      });
      vi.mocked(resolveGitReferences).mockResolvedValue(mockResolvedDeps);

      // Mock cache hierarchy that throws on get but returns true on has
      const mockCacheHierarchy = {
        has: vi.fn().mockResolvedValue(true),
        get: vi.fn().mockRejectedValue(new Error('Cache retrieval failed')),
        store: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn().mockResolvedValue([]),
      };
      (installCommand as any).cacheHierarchy = mockCacheHierarchy;

      // Mock tarball builder
      const mockBuilder = {
        createTarball: vi.fn().mockResolvedValue(Buffer.from('test-tarball')),
      };
      vi.mocked(TarballBuilder).mockImplementation(() => mockBuilder as any);

      // Mock spawnSync for npm install
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        error: undefined,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      expect(console.log).toHaveBeenCalledWith(
        '⚠️  Cache retrieval failed for test-package, building locally'
      );
    });

    it('should handle cache storage failure after tarball build', async () => {
      const mockResolvedDeps = [
        {
          name: 'test-package',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: 'abc123def456',
        },
      ];

      // Mock existsSync to track calls per path
      const pathCallCounts = new Map<string, number>();
      vi.mocked(nodeFs.existsSync).mockImplementation((path) => {
        const pathStr = path.toString();
        const currentCount = pathCallCounts.get(pathStr) || 0;
        pathCallCounts.set(pathStr, currentCount + 1);

        if (pathStr.includes('package-lock.json')) {
          return true; // Lockfile exists
        }
        if (pathStr.includes('package.tgz')) {
          // Return false for first call (isTarballCached), true for later calls (storage check)
          return currentCount > 0;
        }
        return false; // Other paths don't exist
      });

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: mockResolvedDeps,
      });
      vi.mocked(resolveGitReferences).mockResolvedValue(mockResolvedDeps);

      // Mock cache hierarchy that fails on store
      const mockCacheHierarchy = {
        has: vi.fn().mockResolvedValue(false),
        get: vi.fn(),
        store: vi.fn().mockRejectedValue(new Error('Cache storage failed')),
        getStatus: vi.fn().mockResolvedValue([]),
      };
      (installCommand as any).cacheHierarchy = mockCacheHierarchy;

      // Mock tarball builder
      const mockBuilder = {
        buildTarball: vi.fn().mockResolvedValue(undefined),
        createTarball: vi.fn().mockResolvedValue(Buffer.from('test-tarball')),
      };
      vi.mocked(TarballBuilder).mockImplementation(() => mockBuilder as any);

      // Mock fs.readFile for the tarball
      vi.doMock('node:fs/promises', () => ({
        readFile: vi
          .fn()
          .mockResolvedValue(Buffer.from('test-tarball-content')),
      }));

      // Mock spawnSync for npm install
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        error: undefined,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      expect(console.log).toHaveBeenCalledWith(
        '⚠️  Failed to store test-package in cache: Error: Cache storage failed'
      );
    });

    it('should handle status check failure in showCacheStatus', async () => {
      vi.mocked(nodeFs.existsSync).mockReturnValue(false); // No lockfile

      // Mock cache hierarchy getStatus to throw
      const mockCacheHierarchy = {
        getStatus: vi.fn().mockRejectedValue(new Error('Status check failed')),
      };
      (installCommand as any).cacheHierarchy = mockCacheHierarchy;

      // Mock spawnSync for npm install
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        error: undefined,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      // Should not throw even when status check fails (error is caught and swallowed)
      await expect(installCommand.exec([])).resolves.toBeUndefined();

      // Verify getStatus was called
      expect(mockCacheHierarchy.getStatus).toHaveBeenCalled();
    });

    it('should handle registry unavailable status gracefully', async () => {
      vi.mocked(nodeFs.existsSync).mockReturnValue(false); // No lockfile

      // Mock cache hierarchy with unavailable registry
      const mockCacheHierarchy = {
        getStatus: vi.fn().mockResolvedValue([
          { strategy: 'Local', available: true },
          { strategy: 'Registry', available: false },
        ]),
      };
      (installCommand as any).cacheHierarchy = mockCacheHierarchy;

      // Mock spawnSync for npm install
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        error: undefined,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      await installCommand.exec([]);

      // Should handle unavailable registry gracefully without throwing
      expect(installCommand).toBeDefined();
    });
  });

  describe('Cache error coverage for exact lines', () => {
    it('should handle cache hierarchy retrieval errors during lockfile processing', async () => {
      // Mock existsSync to return true for lockfile but false for tarball paths
      // This forces the dependency to be treated as "missing" and go through cache hierarchy
      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        if (pathStr.includes('package-lock.json')) {
          return true; // Lockfile exists
        }
        if (pathStr.includes('package.tgz')) {
          return false; // Tarball does NOT exist - this is key for missing tarball
        }
        return false;
      });

      // Mock successful npm install
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('npm install success'),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from('npm install success'), Buffer.from('')],
        pid: 12345,
        error: undefined,
      });

      // Mock scanLockfile to return Git dependency
      vi.mocked(scanLockfile).mockReturnValue({
        dependencies: [
          {
            name: 'test-git-package',
            gitUrl: 'git+https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
        lockfileVersion: 2,
        hasGitDependencies: true,
      });

      // Mock resolveGitReferences
      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'test-git-package',
          gitUrl: 'git+https://github.com/test/repo.git',
          reference: 'abc123',
          resolvedSha: 'abcdef123456',
          preferredUrl: 'git+https://github.com/test/repo.git',
        },
      ]);

      // Mock cache hierarchy where has() returns true but get() throws error
      const mockHas = vi.fn().mockResolvedValue(true);
      const mockGet = vi
        .fn()
        .mockRejectedValue(new Error('Cache retrieval network error'));
      const mockStore = vi.fn().mockResolvedValue(undefined);
      const mockGetStatus = vi.fn().mockResolvedValue([]);

      const mockCacheHierarchy = {
        has: mockHas,
        get: mockGet,
        store: mockStore,
        getStatus: mockGetStatus,
      };

      // Mock TarballBuilder - IMPORTANT: getCachedTarball must return null to create missing tarballs
      const mockBuildTarball = vi.fn().mockResolvedValue({
        name: 'test-git-package',
        version: '1.0.0',
        tarballPath: '/path/to/package.tgz',
        integrity: 'sha512-abc123',
      });

      // Return null to ensure tarball is treated as missing, forcing cache hierarchy code path
      const mockGetCachedTarball = vi.fn().mockReturnValue(null);

      vi.mocked(TarballBuilder).mockImplementation(
        () =>
          ({
            buildTarball: mockBuildTarball,
            getCachedTarball: mockGetCachedTarball,
            buildBatch: vi.fn(),
            parseGitUrl: vi.fn(),
            checkoutCommit: vi.fn(),
            buildPackage: vi.fn(),
            calculateIntegrity: vi.fn(),
            addToRegistry: vi.fn(),
          }) as any
      );

      // Spy on console.log to capture the exact error message for cache retrieval failure
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      const installCommand = new Install();
      // Manually inject the cache hierarchy
      (installCommand as any).cacheHierarchy = mockCacheHierarchy;

      await installCommand.exec([]);

      // Verify that the cache retrieval error path was hit
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '⚠️  Cache retrieval failed for test-git-package, building locally'
      );

      // Verify cache hierarchy interactions - should be called with packageId format: gitUrl#commitSha
      expect(mockHas).toHaveBeenCalledWith(
        'https://github.com/test/repo.git#abcdef123456'
      );
      expect(mockGet).toHaveBeenCalledWith(
        'https://github.com/test/repo.git#abcdef123456'
      );
      expect(mockBuildTarball).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should successfully retrieve tarball data from cache hierarchy', async () => {
      // Mock existsSync to return true for lockfile but false for tarball paths
      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        if (pathStr.includes('package-lock.json')) {
          return true; // Lockfile exists
        }
        if (pathStr.includes('package.tgz')) {
          return false; // Tarball does NOT exist locally - force cache hierarchy path
        }
        return false;
      });

      // Mock successful npm install
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('npm install success'),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from('npm install success'), Buffer.from('')],
        pid: 12345,
        error: undefined,
      });

      // Mock scanLockfile to return Git dependency
      vi.mocked(scanLockfile).mockReturnValue({
        dependencies: [
          {
            name: 'cached-package',
            gitUrl: 'git+https://github.com/test/cached-repo.git',
            reference: 'def789',
            preferredUrl: 'git+https://github.com/test/cached-repo.git',
          },
        ],
        lockfileVersion: 2,
        hasGitDependencies: true,
      });

      // Mock resolveGitReferences
      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'cached-package',
          gitUrl: 'git+https://github.com/test/cached-repo.git',
          reference: 'def789',
          resolvedSha: 'def789123456',
          preferredUrl: 'git+https://github.com/test/cached-repo.git',
        },
      ]);

      // Mock cache hierarchy where has() returns true AND get() succeeds
      const mockTarballData = Buffer.from('cached-tarball-content');
      const mockHas = vi.fn().mockResolvedValue(true);
      const mockGet = vi.fn().mockResolvedValue(mockTarballData); // Success case
      const mockStore = vi.fn().mockResolvedValue(undefined);
      const mockGetStatus = vi.fn().mockResolvedValue([]);

      const mockCacheHierarchy = {
        has: mockHas,
        get: mockGet,
        store: mockStore,
        getStatus: mockGetStatus,
      };

      // Mock TarballBuilder - should NOT be called since we get from cache
      const mockBuildTarball = vi.fn();
      const mockGetCachedTarball = vi.fn().mockReturnValue(null);

      vi.mocked(TarballBuilder).mockImplementation(
        () =>
          ({
            buildTarball: mockBuildTarball,
            getCachedTarball: mockGetCachedTarball,
            buildBatch: vi.fn(),
            parseGitUrl: vi.fn(),
            checkoutCommit: vi.fn(),
            buildPackage: vi.fn(),
            calculateIntegrity: vi.fn(),
            addToRegistry: vi.fn(),
          }) as any
      );

      // Mock fs.writeFile for saving the retrieved tarball
      const mockWriteFile = vi.fn().mockResolvedValue(undefined);
      vi.doMock('node:fs/promises', () => ({
        writeFile: mockWriteFile,
      }));

      // Spy on console.log to capture the success message
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      const installCommand = new Install();
      // Manually inject the cache hierarchy
      (installCommand as any).cacheHierarchy = mockCacheHierarchy;

      await installCommand.exec([]);

      // Verify that the cache retrieval SUCCESS path was hit
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '📥 Retrieved cached-package from cache'
      );

      // Verify cache hierarchy interactions
      expect(mockHas).toHaveBeenCalledWith(
        'https://github.com/test/cached-repo.git#def789123456'
      );
      expect(mockGet).toHaveBeenCalledWith(
        'https://github.com/test/cached-repo.git#def789123456'
      );

      // Build should NOT be called since we got from cache
      expect(mockBuildTarball).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should handle status check errors in showCacheStatus', async () => {
      // Mock existsSync to return false (no lockfile, simpler path)
      vi.mocked(nodeFs.existsSync).mockReturnValue(false);

      // Mock successful npm install
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: Buffer.from('npm install success'),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from('npm install success'), Buffer.from('')],
        pid: 12345,
        error: undefined,
      });

      // Mock cache hierarchy with available and authenticated registry status
      const mockCacheHierarchy = {
        has: vi.fn(),
        get: vi.fn(),
        store: vi.fn(),
        getStatus: vi.fn().mockResolvedValue([
          { strategy: 'Local', available: true },
          { strategy: 'Registry', available: true, authenticated: true },
        ]),
      };

      const installCommand = new Install();
      // Manually inject the cache hierarchy to trigger status check
      (installCommand as any).cacheHierarchy = mockCacheHierarchy;

      // Spy on console methods to capture the authenticated status message
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      await installCommand.exec([]);

      // Verify status check was called
      expect(mockCacheHierarchy.getStatus).toHaveBeenCalled();

      // Verify the authenticated status message is shown
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🔗 Connected to GitCache registry for transparent caching'
      );

      consoleLogSpy.mockRestore();
    });
  });
});
