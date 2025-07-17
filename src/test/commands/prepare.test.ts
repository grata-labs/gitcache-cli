import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prepare } from '../../commands/prepare.js';
import type { TarballBuilder } from '../../lib/tarball-builder.js';

// Mock the dependencies
vi.mock('../../lockfile/scan.js', () => ({
  scanLockfile: vi.fn(),
  resolveGitReferences: vi.fn(),
}));

vi.mock('../../lib/utils/git.js', () => ({
  resolveRef: vi.fn(),
}));

vi.mock('../../lib/tarball-builder.js', () => ({
  createTarballBuilder: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('Prepare Command Unit Tests', () => {
  let prepare: Prepare;

  beforeEach(() => {
    prepare = new Prepare();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error handling branches', () => {
    it('should handle non-Error exceptions in prepare execution', async () => {
      const { scanLockfile } = await import('../../lockfile/scan.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockExistsSync = vi.mocked(existsSync);

      // Mock file exists check to pass
      mockExistsSync.mockReturnValue(true);

      // Mock scanLockfile to throw a non-Error value
      mockScanLockfile.mockImplementation(() => {
        throw 'Non-error string exception';
      });

      await expect(
        prepare.exec([], { lockfile: 'test-lock.json' })
      ).rejects.toThrow('Failed to prepare cache: Non-error string exception');
    });

    it('should handle null exceptions in prepare execution', async () => {
      const { scanLockfile } = await import('../../lockfile/scan.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockExistsSync = vi.mocked(existsSync);

      // Mock file exists check to pass
      mockExistsSync.mockReturnValue(true);

      // Mock scanLockfile to throw null
      mockScanLockfile.mockImplementation(() => {
        throw null;
      });

      await expect(
        prepare.exec([], { lockfile: 'test-lock.json' })
      ).rejects.toThrow('Failed to prepare cache: null');
    });

    it('should handle numeric exceptions in prepare execution', async () => {
      const { scanLockfile } = await import('../../lockfile/scan.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockExistsSync = vi.mocked(existsSync);

      // Mock file exists check to pass
      mockExistsSync.mockReturnValue(true);

      // Mock scanLockfile to throw a number
      mockScanLockfile.mockImplementation(() => {
        throw 123;
      });

      await expect(
        prepare.exec([], { lockfile: 'test-lock.json' })
      ).rejects.toThrow('Failed to prepare cache: 123');
    });
  });

  describe('Grammar branches', () => {
    it('should use singular form when dependencies.length === 1', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { createTarballBuilder } = await import(
        '../../lib/tarball-builder.js'
      );
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockCreateTarballBuilder = vi.mocked(createTarballBuilder);
      const mockExistsSync = vi.mocked(existsSync);

      // Mock file exists check to pass
      mockExistsSync.mockReturnValue(true);

      // Mock single dependency
      mockScanLockfile.mockReturnValue({
        dependencies: [
          {
            name: 'test-package',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'main',
            preferredUrl: 'https://github.com/test/repo.git',
          },
        ],
        lockfileVersion: 2,
        hasGitDependencies: true,
      });

      mockResolveGitReferences.mockResolvedValue([
        {
          name: 'test-package',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'main',
          preferredUrl: 'https://github.com/test/repo.git',
          resolvedSha: 'abc123',
        },
      ]);

      const mockBuildTarball = vi.fn().mockResolvedValue({
        name: 'test-package',
        tarballPath: '/path/to/tarball.tgz',
        commitSha: 'abc123',
      });

      mockCreateTarballBuilder.mockReturnValue({
        buildTarball: mockBuildTarball,
      } as unknown as TarballBuilder);

      // Capture console output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await prepare.exec([], { verbose: true, lockfile: 'test-lock.json' });

      // Verify singular form is used
      expect(consoleSpy).toHaveBeenCalledWith('Found 1 Git dependency:');

      consoleSpy.mockRestore();
    });

    it('should handle non-Error exceptions in tarball building', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { createTarballBuilder } = await import(
        '../../lib/tarball-builder.js'
      );
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockCreateTarballBuilder = vi.mocked(createTarballBuilder);
      const mockExistsSync = vi.mocked(existsSync);

      // Mock file exists check to pass
      mockExistsSync.mockReturnValue(true);

      // Mock single dependency
      mockScanLockfile.mockReturnValue({
        dependencies: [
          {
            name: 'test-package',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'main',
            preferredUrl: 'https://github.com/test/repo.git',
          },
        ],
        lockfileVersion: 2,
        hasGitDependencies: true,
      });

      mockResolveGitReferences.mockResolvedValue([
        {
          name: 'test-package',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'main',
          preferredUrl: 'https://github.com/test/repo.git',
          resolvedSha: 'abc123',
        },
      ]);

      // Mock buildTarball to throw a non-Error value
      const mockBuildTarball = vi.fn().mockImplementation(() => {
        throw 'Non-error tarball exception';
      });

      mockCreateTarballBuilder.mockReturnValue({
        buildTarball: mockBuildTarball,
      } as unknown as TarballBuilder);

      // Capture console output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await prepare.exec([], { verbose: true, lockfile: 'test-lock.json' });

      // Verify non-Error exception is handled correctly
      expect(consoleSpy).toHaveBeenCalledWith(
        '  ✗ Failed: Non-error tarball exception'
      );

      consoleSpy.mockRestore();
    });

    it('should handle null exceptions in tarball building', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { createTarballBuilder } = await import(
        '../../lib/tarball-builder.js'
      );
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockCreateTarballBuilder = vi.mocked(createTarballBuilder);
      const mockExistsSync = vi.mocked(existsSync);

      // Mock file exists check to pass
      mockExistsSync.mockReturnValue(true);

      // Mock single dependency
      mockScanLockfile.mockReturnValue({
        dependencies: [
          {
            name: 'test-package',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'main',
            preferredUrl: 'https://github.com/test/repo.git',
          },
        ],
        lockfileVersion: 2,
        hasGitDependencies: true,
      });

      mockResolveGitReferences.mockResolvedValue([
        {
          name: 'test-package',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'main',
          preferredUrl: 'https://github.com/test/repo.git',
          resolvedSha: 'abc123',
        },
      ]);

      // Mock buildTarball to throw null
      const mockBuildTarball = vi.fn().mockImplementation(() => {
        throw null;
      });

      mockCreateTarballBuilder.mockReturnValue({
        buildTarball: mockBuildTarball,
      } as unknown as TarballBuilder);

      // Capture console output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await prepare.exec([], { verbose: true, lockfile: 'test-lock.json' });

      // Verify null exception is handled correctly
      expect(consoleSpy).toHaveBeenCalledWith('  ✗ Failed: null');

      consoleSpy.mockRestore();
    });

    it('should use plural form when dependencies.length > 1', async () => {
      const { scanLockfile, resolveGitReferences } = await import(
        '../../lockfile/scan.js'
      );
      const { createTarballBuilder } = await import(
        '../../lib/tarball-builder.js'
      );
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockCreateTarballBuilder = vi.mocked(createTarballBuilder);
      const mockExistsSync = vi.mocked(existsSync);

      // Mock file exists check to pass
      mockExistsSync.mockReturnValue(true);

      // Mock multiple dependencies to test plural form
      mockScanLockfile.mockReturnValue({
        dependencies: [
          {
            name: 'test-package-1',
            gitUrl: 'https://github.com/test/repo1.git',
            reference: 'main',
            preferredUrl: 'https://github.com/test/repo1.git',
          },
          {
            name: 'test-package-2',
            gitUrl: 'https://github.com/test/repo2.git',
            reference: 'main',
            preferredUrl: 'https://github.com/test/repo2.git',
          },
        ],
        lockfileVersion: 2,
        hasGitDependencies: true,
      });

      mockResolveGitReferences.mockResolvedValue([
        {
          name: 'test-package-1',
          gitUrl: 'https://github.com/test/repo1.git',
          reference: 'main',
          preferredUrl: 'https://github.com/test/repo1.git',
          resolvedSha: 'abc123',
        },
        {
          name: 'test-package-2',
          gitUrl: 'https://github.com/test/repo2.git',
          reference: 'main',
          preferredUrl: 'https://github.com/test/repo2.git',
          resolvedSha: 'def456',
        },
      ]);

      const mockBuildTarball = vi.fn().mockResolvedValue({
        name: 'test-package',
        tarballPath: '/path/to/tarball.tgz',
        commitSha: 'abc123',
      });

      mockCreateTarballBuilder.mockReturnValue({
        buildTarball: mockBuildTarball,
      } as unknown as TarballBuilder);

      // Capture console output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await prepare.exec([], { verbose: true, lockfile: 'test-lock.json' });

      // Verify plural form is used
      expect(consoleSpy).toHaveBeenCalledWith('Found 2 Git dependencies:');

      consoleSpy.mockRestore();
    });
  });
});
