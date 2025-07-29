import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Scan } from '../../commands/scan.js';

describe('GitCache Scan Command Integration', () => {
  let tempDir: string;
  let testWorkingDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'gitcache-scan-integration-test-'));
    testWorkingDir = join(tempDir, 'test-project');
    mkdirSync(testWorkingDir);

    // Change to test directory
    process.chdir(testWorkingDir);
  });

  afterEach(() => {
    // Clean up
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Scan Command Basic Functionality', () => {
    it('should scan lockfile with Git dependencies and show formatted output', async () => {
      // Create a test package-lock.json with Git dependencies
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
              'simple-git': 'git+https://github.com/steveukx/git-js.git',
              lodash: 'git+https://github.com/lodash/lodash.git#4.17.21',
            },
          },
          'node_modules/simple-git': {
            version: '3.19.1',
            resolved:
              'git+ssh://git@github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
            integrity: 'sha512-abc123',
          },
          'node_modules/lodash': {
            version: '4.17.21',
            resolved:
              'git+ssh://git@github.com/lodash/lodash.git#8a26eb42adb303f4adc7ef56e300f14c5992aa68',
            integrity: 'sha512-def456',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const scan = new Scan();
      let output = '';

      // Capture console output
      const originalLog = console.log;
      console.log = (msg: string) => {
        output += msg + '\n';
      };

      try {
        await scan.exec([]);

        // Restore console.log
        console.log = originalLog;

        // Verify the output contains expected information
        expect(output).toContain('package-lock.json (v3)');
        expect(output).toContain('Found 2 Git dependencies');
        expect(output).toContain('simple-git');
        expect(output).toContain('lodash');
        expect(output).toContain('git+https://github.com/steveukx/git-js.git');
        expect(output).toContain('git+https://github.com/lodash/lodash.git');
        expect(output).toContain('Summary:');
        expect(output).toContain('Total: 2');
      } finally {
        console.log = originalLog;
      }
    });

    it('should output JSON format when --json flag is used', async () => {
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
              'simple-git': 'git+https://github.com/steveukx/git-js.git',
            },
          },
          'node_modules/simple-git': {
            version: '3.19.1',
            resolved:
              'git+ssh://git@github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
            integrity: 'sha512-abc123',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const scan = new Scan();
      let output = '';

      const originalLog = console.log;
      console.log = (msg: string) => {
        output += msg + '\n';
      };

      try {
        await scan.exec([], { json: true });
        console.log = originalLog;

        // Parse the JSON output
        const jsonOutput = JSON.parse(output.trim());

        expect(jsonOutput).toHaveProperty('lockfile');
        expect(jsonOutput).toHaveProperty('lockfileVersion', 3);
        expect(jsonOutput).toHaveProperty('gitDependencies');
        expect(jsonOutput).toHaveProperty('hasGitDependencies', true);
        expect(jsonOutput).toHaveProperty('summary');

        expect(jsonOutput.gitDependencies).toHaveLength(1);
        expect(jsonOutput.gitDependencies[0]).toHaveProperty(
          'name',
          'simple-git'
        );
        expect(jsonOutput.gitDependencies[0]).toHaveProperty('gitUrl');
        expect(jsonOutput.gitDependencies[0]).toHaveProperty('resolvedSha');

        expect(jsonOutput.summary).toHaveProperty('total', 1);
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle lockfile with no Git dependencies', async () => {
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
              lodash: '^4.17.21',
            },
          },
          'node_modules/lodash': {
            version: '4.17.21',
            resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
            integrity:
              'sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZVGedAJv8XZ1tvj5FvSg==',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const scan = new Scan();
      let output = '';

      const originalLog = console.log;
      console.log = (msg: string) => {
        output += msg + '\n';
      };

      try {
        await scan.exec([]);
        console.log = originalLog;

        expect(output).toContain('No Git dependencies found in lockfile');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle custom lockfile path', async () => {
      const customLockfilePath = join(testWorkingDir, 'custom-lock.json');
      const packageLock = {
        name: 'test-project',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: {
              'simple-git': 'git+https://github.com/steveukx/git-js.git',
            },
          },
          'node_modules/simple-git': {
            resolved:
              'git+ssh://git@github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
          },
        },
      };

      writeFileSync(customLockfilePath, JSON.stringify(packageLock, null, 2));

      const scan = new Scan();
      let output = '';

      const originalLog = console.log;
      console.log = (msg: string) => {
        output += msg + '\n';
      };

      try {
        await scan.exec([], { lockfile: customLockfilePath });
        console.log = originalLog;

        expect(output).toContain('custom-lock.json');
        expect(output).toContain('simple-git');
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error when lockfile does not exist', async () => {
      const scan = new Scan();

      await expect(scan.exec([])).rejects.toThrow('Lockfile not found');
    });

    it('should throw error when custom lockfile does not exist', async () => {
      const scan = new Scan();

      await expect(
        scan.exec([], { lockfile: 'nonexistent-lock.json' })
      ).rejects.toThrow('Lockfile not found: nonexistent-lock.json');
    });

    it('should handle malformed lockfile gracefully', async () => {
      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        'invalid json content'
      );

      const scan = new Scan();

      await expect(scan.exec([])).rejects.toThrow('Failed to scan lockfile');
    });
  });

  describe('NPM v7+ Bug Detection', () => {
    it('should detect SSH to HTTPS URL conversion bug', async () => {
      // Create package.json with SSH URL
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          'test-package': 'git+ssh://git@github.com/steveukx/git-js.git',
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Create package-lock.json with HTTPS URL (simulating npm v7+ bug)
      const packageLock = {
        name: 'test-project',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: {
              'test-package': 'git+ssh://git@github.com/steveukx/git-js.git',
            },
          },
          'node_modules/test-package': {
            resolved:
              'git+https://github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const scan = new Scan();
      let output = '';

      const originalLog = console.log;
      console.log = (msg: string) => {
        output += msg + '\n';
      };

      try {
        await scan.exec([]);
        console.log = originalLog;

        expect(output).toContain(
          'npm v7+ bug detected: SSH→HTTPS conversion applied'
        );
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('Lockfile Discovery', () => {
    it('should automatically find package-lock.json', async () => {
      const packageLock = {
        name: 'test-project',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: {
              'simple-git': 'git+https://github.com/steveukx/git-js.git',
            },
          },
          'node_modules/simple-git': {
            resolved:
              'git+ssh://git@github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const scan = new Scan();
      let output = '';

      const originalLog = console.log;
      console.log = (msg: string) => {
        output += msg + '\n';
      };

      try {
        await scan.exec([]);
        console.log = originalLog;

        expect(output).toContain('package-lock.json');
      } finally {
        console.log = originalLog;
      }
    });

    it('should prefer npm-shrinkwrap.json over package-lock.json when both exist', async () => {
      const packageLock = {
        name: 'package-lock',
        lockfileVersion: 3,
        packages: {},
      };

      const shrinkwrap = {
        name: 'shrinkwrap',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: {
              'simple-git': 'git+https://github.com/steveukx/git-js.git',
            },
          },
          'node_modules/simple-git': {
            resolved:
              'git+ssh://git@github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );
      writeFileSync(
        join(testWorkingDir, 'npm-shrinkwrap.json'),
        JSON.stringify(shrinkwrap, null, 2)
      );

      const scan = new Scan();
      let output = '';

      const originalLog = console.log;
      console.log = (msg: string) => {
        output += msg + '\n';
      };

      try {
        // Change to test directory before running scan
        const originalCwd = process.cwd();
        process.chdir(testWorkingDir);

        await scan.exec([]);

        // Restore original working directory
        process.chdir(originalCwd);
        console.log = originalLog;

        expect(output).toContain('npm-shrinkwrap.json');
        expect(output).toContain('simple-git');
      } finally {
        console.log = originalLog;
      }
    });

    it('should output JSON format when no Git dependencies found', async () => {
      const packageLock = {
        name: 'test-project',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: {
              'regular-package': '^1.0.0',
            },
          },
          'node_modules/regular-package': {
            version: '1.0.0',
            resolved:
              'https://registry.npmjs.org/regular-package/-/regular-package-1.0.0.tgz',
            integrity: 'sha512-abc123...',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const scan = new Scan();
      let output = '';

      const originalLog = console.log;
      console.log = (msg: string) => {
        output += msg + '\n';
      };

      try {
        // Change to test directory before running scan
        const originalCwd = process.cwd();
        process.chdir(testWorkingDir);

        await scan.exec([], { json: true });

        // Restore original working directory
        process.chdir(originalCwd);
        console.log = originalLog;

        // Verify JSON output with no dependencies message (covers lines 39-51)
        expect(output).toContain('"message": "No Git dependencies found"');
        expect(output).toContain('"hasGitDependencies": false');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle unresolvable dependencies and show failed resolution summary', async () => {
      const testWorkingDir = mkdtempSync(
        join(tmpdir(), 'gitcache-scan-integration-test-')
      );

      try {
        // Create test project with unresolvable Git dependencies
        const packageLockContent = {
          name: 'test-project',
          version: '1.0.0',
          lockfileVersion: 2,
          requires: true,
          packages: {
            '': {
              name: 'test-project',
              version: '1.0.0',
            },
            'node_modules/valid-package': {
              resolved: 'git+https://github.com/lodash/lodash.git#4.17.20',
              integrity: 'sha512-test',
            },
            'node_modules/invalid-package': {
              resolved:
                'git+https://github.com/nonexistent/repo.git#invalid-ref',
              integrity: 'sha512-test2',
            },
          },
          dependencies: {
            'valid-package': {
              version: 'git+https://github.com/lodash/lodash.git#4.17.20',
            },
            'invalid-package': {
              version:
                'git+https://github.com/nonexistent/repo.git#invalid-ref',
            },
          },
        };

        writeFileSync(
          join(testWorkingDir, 'package-lock.json'),
          JSON.stringify(packageLockContent, null, 2)
        );

        // Mock console.log to capture output
        const output: string[] = [];
        const originalLog = console.log;
        console.log = (...args) => {
          output.push(args.join(' '));
          originalLog(...args);
        };

        try {
          // Change to test directory before running scan
          const originalCwd = process.cwd();
          process.chdir(testWorkingDir);

          // Run scan command in regular (non-JSON) mode
          const scanCmd = new Scan();
          await scanCmd.exec([], {});

          // Restore original working directory
          process.chdir(originalCwd);
        } finally {
          console.log = originalLog;
        }

        const fullOutput = output.join('\n');

        // Verify resolution failed message is shown (covers line 145)
        expect(fullOutput).toContain('(resolution failed)');

        // Verify failed resolution summary is shown (covers lines 180-184)
        expect(fullOutput).toContain('Failed:');
        expect(fullOutput).toContain(
          'Note: Failed resolutions may indicate network issues or invalid references.'
        );
      } finally {
        rmSync(testWorkingDir, { recursive: true, force: true });
      }
    }, 10000); // 10 second timeout
  });
});
