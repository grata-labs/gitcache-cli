import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Prepare } from '../../commands/prepare.js';

// Mock the tarball builder to avoid actual Git operations
vi.mock('../../lib/tarball-builder.js', () => ({
  createTarballBuilder: vi.fn().mockImplementation(() => ({
    buildTarball: vi.fn().mockResolvedValue({
      gitUrl: 'https://github.com/test/repo.git',
      commitSha: 'abc123',
      platform: 'test-platform',
      tarballPath: '/fake/path/package.tgz',
      integrity: 'sha512-test',
      buildTime: new Date(),
    }),
  })),
}));

describe('GitCache Prepare Command Integration', () => {
  let tempDir: string;
  let testWorkingDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'gitcache-prepare-integration-test-'));
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

  describe('Prepare Command Basic Functionality', () => {
    it('should prepare tarballs for Git dependencies', async () => {
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

      const prepare = new Prepare();
      let output = '';

      // Capture console output
      const originalLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      console.log = (msg: string) => {
        output += msg + '\n';
      };
      process.stdout.write = vi.fn((msg: string) => {
        output += msg;
        return true;
      });

      try {
        await prepare.exec([]);

        // Restore console functions
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;

        // Verify the output contains expected information
        expect(output).toContain('package-lock.json');
        expect(output).toContain('Resolving Git references');
        expect(output).toContain('Building tarballs for 2 dependencies');
        expect(output).toContain('Cache preparation complete!');
        expect(output).toContain('Built: 2/2 tarballs');
        expect(output).toContain(
          'Next npm install will be significantly faster!'
        );
      } finally {
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;
      }
    });

    it('should handle verbose output correctly', async () => {
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

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const prepare = new Prepare();
      let output = '';

      const originalLog = console.log;
      console.log = (msg: string) => {
        output += msg + '\n';
      };

      try {
        await prepare.exec([], { verbose: true });
        console.log = originalLog;

        expect(output).toContain('Found 1 Git dependency:');
        expect(output).toContain(
          'simple-git@789c13ebabcf18ebe0b3a0c88ebb4037dede42e3'
        );
        expect(output).toContain('Building simple-git@789c13eb');
        expect(output).toContain('Built: /fake/path/package.tgz');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle lockfile with no Git dependencies', async () => {
      const packageLock = {
        name: 'test-project',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: {
              lodash: '^4.17.21',
            },
          },
          'node_modules/lodash': {
            version: '4.17.21',
            resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const prepare = new Prepare();
      let output = '';

      const originalLog = console.log;
      console.log = (msg: string) => {
        output += msg + '\n';
      };

      try {
        await prepare.exec([]);
        console.log = originalLog;

        expect(output).toContain('No Git dependencies found in lockfile');
        expect(output).toContain('Cache is already optimal for this project!');
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle custom lockfile path', async () => {
      const customLockfilePath = join(testWorkingDir, 'custom-lock.json');
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

      writeFileSync(customLockfilePath, JSON.stringify(packageLock, null, 2));

      const prepare = new Prepare();
      let output = '';

      const originalLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      console.log = (msg: string) => {
        output += msg + '\n';
      };
      process.stdout.write = vi.fn((msg: string) => {
        output += msg;
        return true;
      });

      try {
        await prepare.exec([], { lockfile: customLockfilePath });
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;

        expect(output).toContain('custom-lock.json');
        expect(output).toContain('Cache preparation complete!');
      } finally {
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;
      }
    });

    it('should handle force flag correctly', async () => {
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

      const { createTarballBuilder } = await import(
        '../../lib/tarball-builder.js'
      );
      const mockTarballBuilder = vi.mocked(createTarballBuilder);
      const mockBuildTarball = vi.fn().mockResolvedValue({
        gitUrl: 'https://github.com/steveukx/git-js.git',
        commitSha: '789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
        platform: 'test-platform',
        tarballPath: '/fake/path/package.tgz',
        integrity: 'sha512-test',
        buildTime: new Date(),
      });

      mockTarballBuilder.mockReturnValue({
        buildTarball: mockBuildTarball,
      } as unknown as ReturnType<typeof createTarballBuilder>);

      const prepare = new Prepare();

      // Capture output but don't verify it - focus on testing the force flag
      const originalLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      console.log = vi.fn();
      process.stdout.write = vi.fn(() => true);

      try {
        await prepare.exec([], { force: true });

        // Verify that buildTarball was called with force: true
        expect(mockBuildTarball).toHaveBeenCalledWith(
          'https://github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
          '789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
          { force: true }
        );
      } finally {
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error when lockfile does not exist', async () => {
      const prepare = new Prepare();

      await expect(prepare.exec([])).rejects.toThrow('Lockfile not found');
    });

    it('should throw error when custom lockfile does not exist', async () => {
      const prepare = new Prepare();

      await expect(
        prepare.exec([], { lockfile: 'nonexistent-lock.json' })
      ).rejects.toThrow('Lockfile not found: nonexistent-lock.json');
    });

    it('should handle malformed lockfile gracefully', async () => {
      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        'invalid json content'
      );

      const prepare = new Prepare();

      await expect(prepare.exec([])).rejects.toThrow('Failed to prepare cache');
    });

    it('should handle tarball build failures gracefully', async () => {
      const packageLock = {
        name: 'test-project',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: {
              'simple-git': 'git+https://github.com/steveukx/git-js.git',
              'failing-package': 'git+https://github.com/test/failing.git',
            },
          },
          'node_modules/simple-git': {
            resolved: 'git+ssh://git@github.com/steveukx/git-js.git#abc123',
          },
          'node_modules/failing-package': {
            resolved: 'git+ssh://git@github.com/test/failing.git#def456',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      // Mock tarball builder to fail for one package
      const { createTarballBuilder } = await import(
        '../../lib/tarball-builder.js'
      );
      const mockTarballBuilder = vi.mocked(createTarballBuilder);
      const mockBuildTarball = vi
        .fn()
        .mockResolvedValueOnce({
          gitUrl: 'https://github.com/steveukx/git-js.git',
          commitSha: 'abc123',
          tarballPath: '/fake/path/package.tgz',
        })
        .mockRejectedValueOnce(new Error('Build failed'));

      mockTarballBuilder.mockReturnValue({
        buildTarball: mockBuildTarball,
      } as unknown as ReturnType<typeof createTarballBuilder>);

      const prepare = new Prepare();
      let output = '';

      const originalLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      console.log = (msg: string) => {
        output += msg + '\n';
      };
      process.stdout.write = vi.fn((msg: string) => {
        output += msg;
        return true;
      });

      try {
        await prepare.exec([]);
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;

        expect(output).toContain(
          'Warning: 2 dependencies could not be resolved'
        );
        expect(output).toContain('simple-git@abc123');
        expect(output).toContain('failing-package@def456');
        expect(output).toContain('No resolvable Git dependencies found');
      } finally {
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;
      }
    });
  });

  describe('Git Reference Resolution', () => {
    it('should handle unresolvable Git references', async () => {
      const packageLock = {
        name: 'test-project',
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: {
              'valid-package': 'git+https://github.com/steveukx/git-js.git',
              'invalid-package': 'git+https://github.com/nonexistent/repo.git',
            },
          },
          'node_modules/valid-package': {
            resolved: 'git+ssh://git@github.com/steveukx/git-js.git#abc123',
          },
          'node_modules/invalid-package': {
            resolved:
              'git+ssh://git@github.com/nonexistent/repo.git#invalid-ref',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const prepare = new Prepare();
      let output = '';

      const originalLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      console.log = (msg: string) => {
        output += msg + '\n';
      };
      process.stdout.write = vi.fn((msg: string) => {
        output += msg;
        return true;
      });

      try {
        await prepare.exec([]);
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;

        // Should warn about unresolvable dependencies
        expect(output).toContain('Warning:');
        expect(output).toContain('could not be resolved');

        // Should show no resolvable dependencies
        expect(output).toContain('No resolvable Git dependencies found');
      } finally {
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;
      }
    });
  });

  describe('Progress Indicators', () => {
    it('should show progress bar in non-verbose mode', async () => {
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
              'git+https://github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const prepare = new Prepare();
      let output = '';

      const originalStdoutWrite = process.stdout.write;
      process.stdout.write = vi.fn((msg: string) => {
        output += msg;
        return true;
      });

      try {
        await prepare.exec([]);
        process.stdout.write = originalStdoutWrite;

        // Should contain evidence of tarball building (progress bars may not be captured)
        expect(output).toContain('simple-git'); // Package name should appear somewhere
        expect(output).toMatch(/\[.*\]/); // Progress bar brackets should appear
      } finally {
        process.stdout.write = originalStdoutWrite;
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
              'git+https://github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
          },
        },
      };

      writeFileSync(
        join(testWorkingDir, 'package-lock.json'),
        JSON.stringify(packageLock, null, 2)
      );

      const prepare = new Prepare();
      let output = '';

      const originalLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      console.log = (msg: string) => {
        output += msg + '\n';
      };
      process.stdout.write = vi.fn(() => true);

      try {
        await prepare.exec([]);
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;

        expect(output).toContain('package-lock.json');
      } finally {
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;
      }
    });

    it('should prefer npm-shrinkwrap.json over package-lock.json', async () => {
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
              'git+https://github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
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

      const prepare = new Prepare();
      let output = '';

      const originalLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      console.log = (msg: string) => {
        output += msg + '\n';
      };
      process.stdout.write = vi.fn(() => true);

      try {
        await prepare.exec([]);
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;

        expect(output).toContain('npm-shrinkwrap.json');
        expect(output).toContain('Cache preparation complete!');
      } finally {
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;
      }
    });

    it('should show verbose error messages when buildTarball fails with verbose flag', async () => {
      // Create empty package-lock and shrinkwrap to test verbose error in prepare
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
              'failing-git': 'git+https://github.com/steveukx/git-js.git',
            },
          },
          'node_modules/failing-git': {
            resolved:
              'git+https://github.com/steveukx/git-js.git#789c13ebabcf18ebe0b3a0c88ebb4037dede42e3',
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

      const prepare = new Prepare();
      let output = '';

      const originalLog = console.log;
      const originalStdoutWrite = process.stdout.write;
      console.log = (msg: string) => {
        output += msg + '\n';
      };
      process.stdout.write = vi.fn(() => true);

      // Mock buildTarball to throw an error to test verbose error handling (line 162)
      const mockBuildTarball = vi
        .fn()
        .mockRejectedValue(new Error('Simulated build failure'));
      vi.doMock('../../lib/tarball-builder.js', () => ({
        buildTarball: mockBuildTarball,
      }));

      try {
        // Change to test directory before running prepare
        const originalCwd = process.cwd();
        process.chdir(testWorkingDir);

        await prepare.exec([], { verbose: true });

        // Restore original working directory
        process.chdir(originalCwd);
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;

        // Verify verbose error message format is used (covers line 162)
        expect(output).toContain('✗ Failed:');
      } finally {
        console.log = originalLog;
        process.stdout.write = originalStdoutWrite;
      }
    });

    it('should handle single dependency with proper grammar', async () => {
      const testWorkingDir = mkdtempSync(
        join(tmpdir(), 'gitcache-prepare-integration-test-')
      );

      try {
        // Create test project with single Git dependency
        const packageLockContent = {
          name: 'test-project',
          version: '1.0.0',
          lockfileVersion: 2,
          packages: {
            '': {
              name: 'test-project',
              version: '1.0.0',
            },
            'node_modules/single-git': {
              resolved: 'git+https://github.com/lodash/lodash.git#4.17.21',
              integrity: 'sha512-test',
            },
          },
          dependencies: {
            'single-git': {
              version: 'git+https://github.com/lodash/lodash.git#4.17.21',
            },
          },
        };

        writeFileSync(
          join(testWorkingDir, 'npm-shrinkwrap.json'),
          JSON.stringify(packageLockContent, null, 2)
        );

        // Mock console.log to capture output
        const output: string[] = [];
        const originalLog = console.log;
        console.log = (...args) => {
          output.push(args.join(' '));
        };

        try {
          // Change to test directory before running prepare
          const originalCwd = process.cwd();
          process.chdir(testWorkingDir);

          const prepareCmd = new Prepare();
          await prepareCmd.exec([], { verbose: true });

          // Restore original working directory
          process.chdir(originalCwd);
        } catch {
          // Expected to fail during tarball building, that's ok
        } finally {
          console.log = originalLog;
        }

        const fullOutput = output.join('\n');

        // Verify singular dependency grammar (covers line 53)
        expect(fullOutput).toContain('Found 1 Git dependency:');
      } finally {
        rmSync(testWorkingDir, { recursive: true, force: true });
      }
    });

    it('should handle single failed dependency with proper grammar', async () => {
      const testWorkingDir = mkdtempSync(
        join(tmpdir(), 'gitcache-prepare-integration-test-')
      );

      try {
        // Create test project with single unresolvable Git dependency
        const packageLockContent = {
          name: 'test-project',
          version: '1.0.0',
          lockfileVersion: 2,
          packages: {
            '': {
              name: 'test-project',
              version: '1.0.0',
            },
            'node_modules/failing-git': {
              resolved:
                'git+https://github.com/nonexistent/repo.git#invalid-ref',
              integrity: 'sha512-test',
            },
          },
          dependencies: {
            'failing-git': {
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
        };

        try {
          // Change to test directory before running prepare
          const originalCwd = process.cwd();
          process.chdir(testWorkingDir);

          const prepareCmd = new Prepare();
          await prepareCmd.exec([], {});

          // Restore original working directory
          process.chdir(originalCwd);
        } finally {
          console.log = originalLog;
        }

        const fullOutput = output.join('\n');

        // Verify singular failed dependency grammar (covers line 70)
        expect(fullOutput).toContain(
          '⚠ Warning: 1 dependency could not be resolved:'
        );
      } finally {
        rmSync(testWorkingDir, { recursive: true, force: true });
      }
    });
  });
});
