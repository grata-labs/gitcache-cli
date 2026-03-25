import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the dependencies at the top level before imports
vi.mock('../../lockfile/scan.js', () => ({
  scanLockfile: vi.fn(),
  resolveGitReferences: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { Scan } from '../../commands/scan.js';

describe('Scan Command Unit Tests', () => {
  let scan: Scan;

  beforeEach(() => {
    scan = new Scan();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Error handling branches', () => {
    it('should handle non-Error exceptions in scan execution', async () => {
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
        scan.exec([], { lockfile: 'test-lock.json' })
      ).rejects.toThrow('Failed to scan lockfile: Non-error string exception');
    });

    it('should handle null exceptions in scan execution', async () => {
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
        scan.exec([], { lockfile: 'test-lock.json' })
      ).rejects.toThrow('Failed to scan lockfile: null');
    });

    it('should handle numeric exceptions in scan execution', async () => {
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
        scan.exec([], { lockfile: 'test-lock.json' })
      ).rejects.toThrow('Failed to scan lockfile: 123');
    });

    it('should handle object exceptions in scan execution', async () => {
      const { scanLockfile } = await import('../../lockfile/scan.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockExistsSync = vi.mocked(existsSync);

      // Mock file exists check to pass
      mockExistsSync.mockReturnValue(true);

      // Mock scanLockfile to throw an object
      mockScanLockfile.mockImplementation(() => {
        throw { message: 'Custom error object' };
      });

      await expect(
        scan.exec([], { lockfile: 'test-lock.json' })
      ).rejects.toThrow('Failed to scan lockfile: [object Object]');
    });
  });

  describe('npm v7+ bug detection in formatted output', () => {
    it('should not report SSH→HTTPS bug when URLs differ but lack ssh/https pattern', async () => {
      const { scanLockfile, resolveGitReferences } =
        await import('../../lockfile/scan.js');
      const { existsSync } = await import('node:fs');

      const mockScanLockfile = vi.mocked(scanLockfile);
      const mockResolveGitReferences = vi.mocked(resolveGitReferences);
      const mockExistsSync = vi.mocked(existsSync);

      mockExistsSync.mockReturnValue(true);

      const dependencies = [
        {
          name: 'diff-url-dep',
          gitUrl: 'git+https://github.com/test/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/test/repo.git',
          resolvedSha: 'abc123',
          packageJsonUrl: 'git+https://github.com/test/repo.git#v1.0.0',
          lockfileUrl: 'git+https://github.com/test/repo.git#abc123',
        },
      ];

      mockScanLockfile.mockReturnValue({
        lockfileVersion: 2,
        hasGitDependencies: true,
        dependencies: dependencies,
      });
      mockResolveGitReferences.mockResolvedValue(dependencies);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await scan.exec([], { lockfile: 'test-lock.json' });

      // Should NOT detect npm v7+ SSH→HTTPS bug
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('SSH→HTTPS conversion')
      );

      consoleSpy.mockRestore();
    });
  });
});
