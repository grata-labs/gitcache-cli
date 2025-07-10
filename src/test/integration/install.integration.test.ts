import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { getCacheDir } from '../../lib/utils/path.js';

describe('GitCache Install Command Integration', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gitcache-install-test-')
    );
    originalCwd = process.cwd();

    // Create a minimal package.json in the temp directory
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-package',
          version: '1.0.0',
          dependencies: {},
        },
        null,
        2
      )
    );

    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should handle npm install with actual package installation', async () => {
    // Create a package.json with a very small, fast-installing dependency
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-package',
          version: '1.0.0',
          dependencies: {
            // Use a very small package for testing
            ms: '^2.1.3',
          },
        },
        null,
        2
      )
    );

    const { Install } = await import('../../commands/install.js');
    const cmd = new Install();

    // Change to the temp directory for the install
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      // Run the install command
      cmd.exec([]);

      // Verify node_modules was created
      const nodeModulesExists = await fs
        .access(path.join(tempDir, 'node_modules'))
        .then(() => true)
        .catch(() => false);

      expect(nodeModulesExists).toBe(true);

      // Verify the package was installed
      const msPackageExists = await fs
        .access(path.join(tempDir, 'node_modules', 'ms'))
        .then(() => true)
        .catch(() => false);

      expect(msPackageExists).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should use gitcache directory for npm cache', async () => {
    const expectedCacheDir = getCacheDir();

    // Create a package.json with a dependency
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-package',
          version: '1.0.0',
          dependencies: {
            ms: '^2.1.3',
          },
        },
        null,
        2
      )
    );

    const { Install } = await import('../../commands/install.js');
    const cmd = new Install();

    // Change to the temp directory for the install
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      // Run the install command
      cmd.exec([]);

      // Check that gitcache directory exists
      const gitcacheDirExists = await fs
        .access(expectedCacheDir)
        .then(() => true)
        .catch(() => false);

      expect(gitcacheDirExists).toBe(true);

      // Check that npm cache contains files (npm creates various cache subdirectories)
      const cacheContents = await fs.readdir(expectedCacheDir);
      expect(cacheContents.length).toBeGreaterThan(0);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should propagate npm install errors correctly', async () => {
    // Create a package.json with an invalid dependency
    const invalidPackageJson = JSON.stringify(
      {
        name: 'test-package',
        version: '1.0.0',
        dependencies: {
          'this-package-definitely-does-not-exist-12345': '^1.0.0',
        },
      },
      null,
      2
    );

    await fs.writeFile(path.join(tempDir, 'package.json'), invalidPackageJson);

    const { Install } = await import('../../commands/install.js');
    const cmd = new Install();

    // Change to the temp directory for the install
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    // Mock process.exit to capture exit calls instead of actually exiting
    const originalExit = process.exit;
    let exitCalled = false;
    let exitCode: number | undefined;

    process.exit = vi.fn((code?: number) => {
      exitCalled = true;
      exitCode = code;
      throw new Error(`Process exit called with code ${code}`);
    }) as any;

    try {
      // Should call process.exit when npm install fails
      expect(() => {
        cmd.exec([]);
      }).toThrow();

      // Verify that process.exit was called with a non-zero code
      expect(exitCalled).toBe(true);
      expect(exitCode).toBeGreaterThan(0);
    } finally {
      process.exit = originalExit;
      process.chdir(originalCwd);
    }
  });
});
