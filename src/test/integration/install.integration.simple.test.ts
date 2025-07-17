import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Install } from '../../commands/install.js';

describe('GitCache Install Command Integration - Simple Tests', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'gitcache-install-test-')
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should handle npm install with actual package installation', async () => {
    // Create a simple package.json with a real, small package
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'balanced-match': '^1.0.0',
      },
    };

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    const cmd = new Install();
    const originalCwd = process.cwd();

    try {
      process.chdir(tempDir);
      await cmd.exec([]);

      // Verify that npm install actually worked
      const nodeModulesExists = await fs
        .access(path.join(tempDir, 'node_modules'))
        .then(() => true)
        .catch(() => false);
      expect(nodeModulesExists).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should use gitcache directory for npm cache', async () => {
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'balanced-match': '^1.0.0',
      },
    };

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    const cmd = new Install();
    const originalCwd = process.cwd();

    try {
      process.chdir(tempDir);
      await cmd.exec([]);

      // Check if .gitcache directory was created (it might be created in parent dirs)
      const gitcacheExists = await fs
        .access(path.join(tempDir, '.gitcache'))
        .then(() => true)
        .catch(async () => {
          // Also check in the global cache location
          const homeCacheExists = await fs
            .access(path.join(os.homedir(), '.gitcache'))
            .then(() => true)
            .catch(() => false);
          return homeCacheExists;
        });
      expect(gitcacheExists).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should propagate npm install errors correctly', async () => {
    // Create package.json with non-existent dependency to force npm error
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'this-package-definitely-does-not-exist-12345': '^1.0.0',
      },
    };

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    const cmd = new Install();
    const originalCwd = process.cwd();

    try {
      process.chdir(tempDir);

      // Should throw an error due to the non-existent package
      await expect(cmd.exec([])).rejects.toThrow();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should handle lockfile with no git dependencies', async () => {
    // Create package.json with only NPM dependencies
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        'balanced-match': '^1.0.0',
      },
    };

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create package-lock.json with NO Git dependencies - should trigger early return
    const packageLock = {
      name: 'test-project',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            'balanced-match': '^1.0.0',
          },
        },
        'node_modules/balanced-match': {
          version: '1.0.2',
          resolved:
            'https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz',
          integrity:
            'sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==',
        },
      },
      dependencies: {
        'balanced-match': {
          version: '1.0.2',
          resolved:
            'https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz',
          integrity:
            'sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==',
        },
      },
    };

    await fs.writeFile(
      path.join(tempDir, 'package-lock.json'),
      JSON.stringify(packageLock, null, 2)
    );

    const cmd = new Install();
    const originalCwd = process.cwd();

    try {
      process.chdir(tempDir);
      // This should skip git dependency preparation and just run npm install
      // hitting the early return in prepareGitDependencies at lines 102-103
      await cmd.exec([]);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
