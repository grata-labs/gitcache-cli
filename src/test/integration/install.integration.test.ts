import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
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

  it('should execute npm install with gitcache environment', async () => {
    const cliPath = path.resolve(__dirname, '../../index.ts');

    // Run the install command with --version to avoid actual package installation
    const result = execSync(`tsx ${cliPath} install --version`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // npm --version should return the npm version
    expect(result.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should pass through npm arguments correctly', async () => {
    const cliPath = path.resolve(__dirname, '../../index.ts');

    // Test that help is passed through to npm
    const result = execSync(`tsx ${cliPath} install --help`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // Should show npm install help (contains "Usage:" from npm)
    expect(result).toContain('Usage:');
  });

  it('should set npm_config_cache environment variable to gitcache directory', async () => {
    const expectedCacheDir = getCacheDir();
    let capturedEnv: NodeJS.ProcessEnv | undefined;

    // Mock spawnSync to capture the environment
    const mockSpawnSync = vi.fn(
      (
        command: string,
        args: string[],
        options?: { env?: NodeJS.ProcessEnv }
      ) => {
        capturedEnv = options?.env;
        return { status: 0 };
      }
    );

    // Mock the module
    vi.doMock('child_process', () => ({
      spawnSync: mockSpawnSync,
    }));

    // Import and run the install command with the mock in place
    const { Install } = await import('../../commands/install.js');
    const cmd = new Install();
    cmd.exec(['--version']);

    // Verify the environment was set correctly
    expect(capturedEnv).toBeDefined();
    expect(capturedEnv!.npm_config_cache).toBe(expectedCacheDir);
    expect(capturedEnv!.NPM_CONFIG_CACHE).toBe(expectedCacheDir);

    // Restore the original spawnSync
    vi.doUnmock('child_process');
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

    const cliPath = path.resolve(__dirname, '../../index.ts');

    // Run gitcache install
    execSync(`tsx ${cliPath} install`, {
      stdio: 'pipe',
      cwd: tempDir,
    });

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

    const cliPath = path.resolve(__dirname, '../../index.ts');

    // Run gitcache install
    execSync(`tsx ${cliPath} install`, {
      stdio: 'pipe',
      cwd: tempDir,
    });

    // Check that gitcache directory exists
    const gitcacheDirExists = await fs
      .access(expectedCacheDir)
      .then(() => true)
      .catch(() => false);

    expect(gitcacheDirExists).toBe(true);

    // Check that npm cache contains files (npm creates various cache subdirectories)
    const cacheContents = await fs.readdir(expectedCacheDir);
    expect(cacheContents.length).toBeGreaterThan(0);
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

    const cliPath = path.resolve(__dirname, '../../index.ts');

    // Should throw an error when npm install fails
    expect(() => {
      execSync(`tsx ${cliPath} install`, {
        stdio: 'pipe',
        cwd: tempDir,
      });
    }).toThrow();
  });
});
