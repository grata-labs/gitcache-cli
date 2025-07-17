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

      await expect(installCommand.exec([])).rejects.toThrow('Process exited');

      // Should exit with code 1 when there's an error but no status
      expect(process.exit).toHaveBeenCalledWith(1);
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

      await expect(installCommand.exec([])).rejects.toThrow('Process exited');

      // Should exit with code 1 when status is undefined but there's an error
      expect(process.exit).toHaveBeenCalledWith(1);
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
        '⚠️  Failed to build test-dep: Unknown error'
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
        '⚠️  Cache preparation failed: Unknown error'
      );
      expect(console.log).toHaveBeenCalledWith(
        '⏭️  Continuing with normal install...\n'
      );
    });
  });
});
