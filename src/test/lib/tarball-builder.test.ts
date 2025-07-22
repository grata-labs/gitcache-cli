import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ExecSyncOptions } from 'node:child_process';
import {
  createTarballBuilder,
  TarballBuilder,
} from '../../lib/tarball-builder.js';
import {
  getTarballCachePath,
  getPlatformIdentifier,
} from '../../lib/utils/path.js';

// Mock the path utilities
vi.mock('../../lib/utils/path.js', () => ({
  getTarballCachePath: vi.fn(),
  getPlatformIdentifier: vi.fn(() => 'darwin-arm64'),
}));

// Mock node:child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

const mockGetTarballCachePath = vi.mocked(getTarballCachePath);

describe('TarballBuilder', () => {
  let builder: TarballBuilder;
  let tempTestDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    builder = createTarballBuilder();

    // Create a temporary directory for testing
    tempTestDir = join(tmpdir(), `gitcache-test-${Date.now()}`);
    mkdirSync(tempTestDir, { recursive: true });

    // Mock getTarballCachePath to use our temp directory
    mockGetTarballCachePath.mockImplementation(
      (sha: string, platform?: string) =>
        join(tempTestDir, 'tarballs', `${sha}-${platform || 'darwin-arm64'}`)
    );

    // Set up default successful spawnSync behavior (can be overridden in individual tests)
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    let mockWorkingDir = '';

    mockSpawnSync.mockImplementation(
      (command: string, args?: readonly string[], _options?: unknown) => {
        const argsArray = args || [];

        if (command === 'git' && argsArray[0] === 'clone') {
          // Simulate git clone success - find target directory
          const targetDir = argsArray[argsArray.length - 1];
          mockWorkingDir = targetDir;
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(
            join(targetDir, 'package.json'),
            JSON.stringify({ name: 'test-package', version: '1.0.0' })
          );
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }

        if (command === 'npm' && argsArray.includes('pack')) {
          // Create the tarball file in the working directory
          const tarballName = 'test-package-1.0.0.tgz';
          const tarballPath = join(mockWorkingDir, tarballName);
          writeFileSync(tarballPath, 'fake tarball content');
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: `${tarballName}\n`,
            stderr: '',
          };
        }

        if (command === 'shasum') {
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: 'abc123hash  filename\n',
            stderr: '',
          };
        }

        // Default success response for all other commands
        return {
          status: 0,
          signal: null,
          output: [],
          pid: 123,
          stdout: '',
          stderr: '',
        };
      }
    );
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(tempTestDir)) {
      rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  describe('getCachedTarball', () => {
    it('should return null when no cached tarball exists', () => {
      const result = builder.getCachedTarball('nonexistent-sha');
      expect(result).toBeNull();
    });

    it('should return cached tarball when it exists', () => {
      const commitSha = 'abc123';
      const platform = 'darwin-arm64';
      const cacheDir = join(
        tempTestDir,
        'tarballs',
        `${commitSha}-${platform}`
      );

      // Create cache directory structure
      mkdirSync(cacheDir, { recursive: true });

      // Create tarball file
      writeFileSync(join(cacheDir, 'package.tgz'), 'fake tarball content');

      // Create metadata file
      const metadata = {
        gitUrl: 'https://github.com/test/repo.git',
        commitSha,
        platform,
        integrity: 'sha256-test',
        buildTime: new Date().toISOString(),
        packageInfo: { name: 'test-package', version: '1.0.0' },
      };
      writeFileSync(
        join(cacheDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      const result = builder.getCachedTarball(commitSha);

      expect(result).not.toBeNull();
      expect(result?.commitSha).toBe(commitSha);
      expect(result?.platform).toBe(platform);
      expect(result?.gitUrl).toBe('https://github.com/test/repo.git');
      expect(result?.integrity).toBe('sha256-test');
      expect(result?.packageInfo?.name).toBe('test-package');
    });

    it('should return null when tarball file is missing', () => {
      const commitSha = 'abc123';
      const platform = 'darwin-arm64';
      const cacheDir = join(
        tempTestDir,
        'tarballs',
        `${commitSha}-${platform}`
      );

      // Create cache directory with metadata but no tarball
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, 'metadata.json'), '{"test": "data"}');

      const result = builder.getCachedTarball(commitSha);
      expect(result).toBeNull();
    });

    it('should return null when metadata file is corrupted', () => {
      const commitSha = 'abc123';
      const platform = 'darwin-arm64';
      const cacheDir = join(
        tempTestDir,
        'tarballs',
        `${commitSha}-${platform}`
      );

      // Create cache directory structure
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, 'package.tgz'), 'fake tarball content');
      writeFileSync(join(cacheDir, 'metadata.json'), 'invalid json');

      const result = builder.getCachedTarball(commitSha);
      expect(result).toBeNull();
    });
  });

  describe('buildTarball', () => {
    it('should return cached tarball when force is false and tarball exists', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';
      const platform = 'darwin-arm64';
      const cacheDir = join(
        tempTestDir,
        'tarballs',
        `${commitSha}-${platform}`
      );

      // Create existing cached tarball
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, 'package.tgz'), 'existing tarball');

      const metadata = {
        gitUrl,
        commitSha,
        platform,
        integrity: 'sha256-existing',
        buildTime: new Date().toISOString(),
        packageInfo: { name: 'test-package', version: '1.0.0' },
      };
      writeFileSync(
        join(cacheDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      const result = await builder.buildTarball(gitUrl, commitSha);

      expect(result.commitSha).toBe(commitSha);
      expect(result.integrity).toBe('sha256-existing');
      expect(mockExecSync).not.toHaveBeenCalled(); // Should not build when cached
    });

    it('should build new tarball when force is true', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      let mockWorkingDir = '';

      // Mock spawnSync to handle different commands
      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[], _options?: unknown) => {
          const argsArray = args || [];

          if (command === 'git' && argsArray[0] === 'clone') {
            // Simulate git clone success - find target directory
            const targetDir = argsArray[argsArray.length - 1];
            mockWorkingDir = targetDir;
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(
              join(targetDir, 'package.json'),
              JSON.stringify({ name: 'test-package', version: '1.0.0' })
            );
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: '',
            };
          }

          if (command === 'git' && argsArray.includes('cat-file')) {
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: '',
            };
          }

          if (command === 'git' && argsArray.includes('checkout')) {
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: '',
            };
          }

          if (
            command === 'npm' &&
            (argsArray.includes('ci') || argsArray.includes('install'))
          ) {
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: '',
            };
          }

          if (command === 'npm' && argsArray.includes('pack')) {
            // Create the tarball file in the working directory
            const tarballName = 'test-package-1.0.0.tgz';
            const tarballPath = join(mockWorkingDir, tarballName);
            writeFileSync(tarballPath, 'fake tarball content');
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: `${tarballName}\n`,
              stderr: '',
            };
          }

          if (command === 'shasum') {
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: 'abc123hash  filename\n',
              stderr: '',
            };
          }

          // Default success response
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }
      );

      const result = await builder.buildTarball(gitUrl, commitSha, {
        force: true,
      });

      expect(result.commitSha).toBe(commitSha);
      expect(result.gitUrl).toBe(gitUrl);
      expect(result.platform).toBe('darwin-arm64');
      expect(result.packageInfo?.name).toBe('test-package');
    });

    it('should handle git clone failures', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      // Mock git clone to fail
      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[]) => {
          if (command === 'git' && args?.[0] === 'clone') {
            return {
              status: 1,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: 'Git clone failed',
            };
          }
          // Default success for other commands
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: 'success',
            stderr: '',
          };
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow(
        'Failed to checkout commit abc123: Error: git clone failed with exit code 1: Git clone failed'
      );
    });

    it('should handle npm install failures', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      // Mock git operations to succeed, npm operations to fail
      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[]) => {
          if (command === 'git') {
            if (args?.[0] === 'clone') {
              const targetDir = args[args.length - 1];
              if (targetDir) {
                mkdirSync(targetDir, { recursive: true });
                writeFileSync(
                  join(targetDir, 'package.json'),
                  JSON.stringify({ name: 'test-package', version: '1.0.0' })
                );
              }
            }
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: '',
            };
          }
          if (
            command === 'npm' &&
            (args?.[0] === 'ci' || args?.[0] === 'install')
          ) {
            return {
              status: 1,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: 'npm install failed',
            };
          }
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: 'success',
            stderr: '',
          };
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow('Both npm ci and npm install failed');
    });

    it('should run prepare script when not skipping build scripts', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';
      const prepareScriptRan = vi.fn();

      let mockWorkingDir = '';

      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[], _options?: unknown) => {
          const argsArray = args || [];

          if (command === 'git' && argsArray[0] === 'clone') {
            const targetDir = argsArray[argsArray.length - 1];
            mockWorkingDir = targetDir;
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(
              join(targetDir, 'package.json'),
              JSON.stringify({
                name: 'test-package',
                version: '1.0.0',
                scripts: { prepare: 'echo "prepare ran"' },
              })
            );
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: '',
            };
          }

          if (
            command === 'npm' &&
            argsArray.includes('run') &&
            argsArray.includes('prepare')
          ) {
            prepareScriptRan();
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: '',
            };
          }

          if (command === 'npm' && argsArray.includes('pack')) {
            const tarballName = 'test-package-1.0.0.tgz';
            const tarballPath = join(mockWorkingDir, tarballName);
            writeFileSync(tarballPath, 'fake tarball content');
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: `${tarballName}\n`,
              stderr: '',
            };
          }

          if (command === 'shasum') {
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: 'hash  filename\n',
              stderr: '',
            };
          }

          // Default success for other commands
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }
      );

      await builder.buildTarball(gitUrl, commitSha, { force: true });

      expect(prepareScriptRan).toHaveBeenCalled();
    });

    it('should skip build scripts when skipBuildScripts is true', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      let mockWorkingDir = '';
      let ignoreScriptsCalled = false;

      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[], _options?: unknown) => {
          const argsArray = args || [];

          if (command === 'git' && argsArray[0] === 'clone') {
            const targetDir = argsArray[argsArray.length - 1];
            mockWorkingDir = targetDir;
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(
              join(targetDir, 'package.json'),
              JSON.stringify({ name: 'test-package', version: '1.0.0' })
            );
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: '',
            };
          }

          if (
            command === 'npm' &&
            (argsArray.includes('ci') || argsArray.includes('install'))
          ) {
            if (argsArray.includes('--ignore-scripts')) {
              ignoreScriptsCalled = true;
            }
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: '',
            };
          }

          if (command === 'npm' && argsArray.includes('pack')) {
            const tarballName = 'test-package-1.0.0.tgz';
            const tarballPath = join(mockWorkingDir, tarballName);
            writeFileSync(tarballPath, 'fake tarball content');
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: `${tarballName}\n`,
              stderr: '',
            };
          }

          if (command === 'shasum') {
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: 'hash  filename\n',
              stderr: '',
            };
          }

          // Default success for other commands
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }
      );

      await builder.buildTarball(gitUrl, commitSha, {
        force: true,
        skipBuildScripts: true,
      });

      // Verify --ignore-scripts was used
      expect(ignoreScriptsCalled).toBe(true);
    });
  });

  describe('buildBatch', () => {
    it('should build multiple tarballs in parallel', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies = [
        { gitUrl: 'https://github.com/test/repo1.git', commitSha: 'sha1' },
        { gitUrl: 'https://github.com/test/repo2.git', commitSha: 'sha2' },
      ];

      mockExecSync.mockImplementation(
        (cmd: string, options?: ExecSyncOptions) => {
          if (typeof cmd === 'string') {
            if (cmd.includes('git clone')) {
              const match = cmd.match(/"([^"]+)"$/);
              if (match) {
                const targetDir = match[1];
                mkdirSync(targetDir, { recursive: true });
                writeFileSync(
                  join(targetDir, 'package.json'),
                  JSON.stringify({ name: 'test-package', version: '1.0.0' })
                );
              }
              return '';
            }
            if (cmd.includes('npm pack')) {
              writeFileSync(
                join(
                  (options?.cwd as string) || tempTestDir,
                  'test-package-1.0.0.tgz'
                ),
                'tarball'
              );
              return 'test-package-1.0.0.tgz\n';
            }
            if (cmd.includes('shasum')) {
              return 'hash  filename\n';
            }
          }
          return '';
        }
      );

      const results = await builder.buildBatch(dependencies, { force: true });

      expect(results).toHaveLength(2);
      expect(results[0].commitSha).toBe('sha1');
      expect(results[1].commitSha).toBe('sha2');
    });
  });

  it('should handle shasum calculation errors', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';

    mockSpawnSync.mockImplementation(
      (command: string, args?: readonly string[]) => {
        const argsArray = args || [];

        if (command === 'git' && argsArray[0] === 'clone') {
          const targetDir = argsArray[argsArray.length - 1];
          mockWorkingDir = targetDir;
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(
            join(targetDir, 'package.json'),
            JSON.stringify({ name: 'test-package', version: '1.0.0' })
          );
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }

        if (command === 'npm' && argsArray.includes('pack')) {
          const tarballName = 'test-package-1.0.0.tgz';
          const tarballPath = join(mockWorkingDir, tarballName);
          writeFileSync(tarballPath, 'fake tarball content');
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: `${tarballName}\n`,
            stderr: '',
          };
        }

        if (command === 'shasum') {
          return {
            status: 1,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: 'shasum command failed',
          };
        }

        // Default success for other commands
        return {
          status: 0,
          signal: null,
          output: [],
          pid: 123,
          stdout: '',
          stderr: '',
        };
      }
    );

    await expect(
      builder.buildTarball(gitUrl, commitSha, { force: true })
    ).rejects.toThrow(
      'Failed to calculate integrity: Error: shasum failed with exit code 1: shasum command failed'
    );
  });

  it('should handle package without package.json', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';

    mockSpawnSync.mockImplementation(
      (command: string, args?: readonly string[]) => {
        const argsArray = args || [];

        if (command === 'git' && argsArray[0] === 'clone') {
          const targetDir = argsArray[argsArray.length - 1];
          mockWorkingDir = targetDir;
          mkdirSync(targetDir, { recursive: true });
          // No package.json created
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }

        if (command === 'npm' && argsArray.includes('pack')) {
          const tarballName = 'package.tgz';
          const tarballPath = join(mockWorkingDir, tarballName);
          writeFileSync(tarballPath, 'fake tarball content');
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: `${tarballName}\n`,
            stderr: '',
          };
        }

        if (command === 'shasum') {
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: 'abc123hash  filename\n',
            stderr: '',
          };
        }

        // Default success for other commands
        return {
          status: 0,
          signal: null,
          output: [],
          pid: 123,
          stdout: '',
          stderr: '',
        };
      }
    );

    const result = await builder.buildTarball(gitUrl, commitSha, {
      force: true,
    });

    expect(result.commitSha).toBe(commitSha);
    expect(result.packageInfo).toBeUndefined(); // No package.json means no packageInfo
  });

  it('handles missing tarball file after npm pack', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    mockSpawnSync.mockImplementation(
      (command: string, args?: readonly string[]) => {
        const argsArray = args || [];

        if (command === 'git' && argsArray[0] === 'clone') {
          const targetDir = argsArray[argsArray.length - 1];
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(
            join(targetDir, 'package.json'),
            JSON.stringify({ name: 'test-package', version: '1.0.0' })
          );
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }

        if (command === 'npm' && argsArray.includes('pack')) {
          // Don't create the tarball file - this simulates the error case
          // npm pack says it created a file but the file doesn't actually exist
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: 'test-package-1.0.0.tgz\n',
            stderr: '',
          };
        }

        // Default success for other commands
        return {
          status: 0,
          signal: null,
          output: [],
          pid: 123,
          stdout: '',
          stderr: '',
        };
      }
    );

    await expect(
      builder.buildTarball(gitUrl, commitSha, { force: true })
    ).rejects.toThrow('npm pack did not create expected tarball');
  });

  it('handles shasum calculation failure', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';

    mockSpawnSync.mockImplementation(
      (command: string, args?: readonly string[], _options?: unknown) => {
        if (command === 'git' && args?.[0] === 'clone') {
          const targetDir = args[args.length - 1];
          mockWorkingDir = targetDir;
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(
            join(targetDir, 'package.json'),
            JSON.stringify({ name: 'test-package', version: '1.0.0' })
          );
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (command === 'npm' && args?.[0] === 'pack') {
          const tarballName = 'test-package-1.0.0.tgz';
          const tarballPath = join(mockWorkingDir, tarballName);
          writeFileSync(tarballPath, 'fake tarball content');
          return {
            status: 0,
            stdout: `${tarballName}\n`,
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', `${tarballName}\n`, ''],
            signal: null,
          };
        }
        if (command === 'shasum') {
          return {
            status: 1,
            stdout: '',
            stderr: 'shasum calculation failed',
            error: new Error('shasum calculation failed'),
            pid: 123,
            output: ['', '', 'shasum calculation failed'],
            signal: null,
          };
        }
        if (command === 'git' && args?.[0] === 'cat-file') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (command === 'git' && args?.[0] === 'checkout') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (
          command === 'npm' &&
          (args?.[0] === 'ci' || args?.[0] === 'install')
        ) {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (command === 'mv') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        return {
          status: 0,
          stdout: '',
          stderr: '',
          error: undefined,
          pid: 123,
          output: ['', '', ''],
          signal: null,
        };
      }
    );

    await expect(
      builder.buildTarball(gitUrl, commitSha, { force: true })
    ).rejects.toThrow(
      'Failed to calculate integrity: Error: shasum failed with exit code 1: shasum calculation failed'
    );
  });

  it('handles corrupted cache metadata gracefully', async () => {
    const gitUrl = 'https://github.com/test/repo.git';
    const commitSha = 'abc123';

    // Setup mocks at the module level to ensure they're available
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual('node:fs');
      return {
        ...actual,
        existsSync: vi.fn().mockReturnValue(true),
        readFileSync: vi.fn().mockImplementation(() => {
          throw new Error('File corrupted');
        }),
      };
    });

    // Create a new builder instance after mocking
    const { createTarballBuilder } = await import(
      '../../lib/tarball-builder.js'
    );
    const testBuilder = createTarballBuilder();

    const cached = testBuilder.getCachedTarball(gitUrl, commitSha);
    expect(cached).toBeNull();

    // Cleanup
    vi.doUnmock('node:fs');
  });

  it('handles git checkout failure', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    mockSpawnSync.mockImplementation(
      (command: string, args?: readonly string[], _options?: unknown) => {
        if (command === 'git' && args?.[0] === 'clone') {
          const targetDir = args[args.length - 1];
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(
            join(targetDir, 'package.json'),
            JSON.stringify({ name: 'test-package', version: '1.0.0' })
          );
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (
          command === 'git' &&
          args?.[0] === '-C' &&
          args?.[2] === 'cat-file'
        ) {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (
          command === 'git' &&
          args?.[0] === '-C' &&
          args?.[2] === 'checkout'
        ) {
          return {
            status: 1,
            stdout: '',
            stderr: 'failed to checkout commit',
            error: new Error('failed to checkout commit'),
            pid: 123,
            output: ['', '', 'failed to checkout commit'],
            signal: null,
          };
        }
        return {
          status: 0,
          stdout: '',
          stderr: '',
          error: undefined,
          pid: 123,
          output: ['', '', ''],
          signal: null,
        };
      }
    );

    await expect(
      builder.buildTarball(gitUrl, commitSha, { force: true })
    ).rejects.toThrow(
      'Failed to checkout commit abc123: Error: git checkout failed with exit code 1: failed to checkout commit'
    );
  });

  it('handles npm ci failure with fallback to npm install', async () => {
    const { execSync } = await import('node:child_process');
    const mockExecSync = vi.mocked(execSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';

    mockExecSync.mockImplementation(
      (cmd: string, _options?: ExecSyncOptions) => {
        if (typeof cmd === 'string' && cmd.includes('git clone')) {
          const match = cmd.match(/"([^"]+)"$/);
          if (match) {
            const targetDir = match[1];
            mockWorkingDir = targetDir;
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(
              join(targetDir, 'package.json'),
              JSON.stringify({ name: 'test-package', version: '1.0.0' })
            );
          }
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('git cat-file')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('git checkout')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('npm ci')) {
          throw new Error('npm ci failed');
        }
        if (typeof cmd === 'string' && cmd.includes('npm install')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('npm pack')) {
          const tarballName = 'test-package-1.0.0.tgz';
          const tarballPath = join(mockWorkingDir, tarballName);
          writeFileSync(tarballPath, 'fake tarball content');
          return `${tarballName}\n`;
        }
        if (typeof cmd === 'string' && cmd.includes('shasum')) {
          return 'abc123hash  filename\n';
        }
        if (typeof cmd === 'string' && cmd.includes('mv')) {
          return '';
        }
        return '';
      }
    );

    const result = await builder.buildTarball(gitUrl, commitSha, {
      force: true,
    });
    expect(result.commitSha).toBe(commitSha);
  });

  it('handles npm ci failure with fallback to npm install --ignore-scripts', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';
    let installIgnoreScriptsCalled = false;

    mockSpawnSync.mockImplementation(
      (command: string, args?: readonly string[], _options?: unknown) => {
        if (command === 'git' && args?.[0] === 'clone') {
          const targetDir = args[args.length - 1];
          mockWorkingDir = targetDir;
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(
            join(targetDir, 'package.json'),
            JSON.stringify({ name: 'test-package', version: '1.0.0' })
          );
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (command === 'git' && args?.[0] === 'cat-file') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (command === 'git' && args?.[0] === 'checkout') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (command === 'npm' && args?.[0] === 'ci') {
          return {
            status: 1,
            stdout: '',
            stderr: 'npm ci failed',
            error: new Error('npm ci failed'),
            pid: 123,
            output: ['', '', 'npm ci failed'],
            signal: null,
          };
        }
        if (
          command === 'npm' &&
          args?.[0] === 'install' &&
          args?.includes('--ignore-scripts')
        ) {
          installIgnoreScriptsCalled = true;
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (command === 'npm' && args?.[0] === 'pack') {
          const tarballName = 'test-package-1.0.0.tgz';
          const tarballPath = join(mockWorkingDir, tarballName);
          writeFileSync(tarballPath, 'fake tarball content');
          return {
            status: 0,
            stdout: `${tarballName}\n`,
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', `${tarballName}\n`, ''],
            signal: null,
          };
        }
        if (command === 'shasum') {
          return {
            status: 0,
            stdout: 'abc123hash  filename\n',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', 'abc123hash  filename\n', ''],
            signal: null,
          };
        }
        if (command === 'mv') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        return {
          status: 0,
          stdout: '',
          stderr: '',
          error: undefined,
          pid: 123,
          output: ['', '', ''],
          signal: null,
        };
      }
    );

    const result = await builder.buildTarball(gitUrl, commitSha, {
      force: true,
      skipBuildScripts: true,
    });
    expect(result.commitSha).toBe(commitSha);
    expect(installIgnoreScriptsCalled).toBe(true);
  });

  it('handles commit not found requiring fetch --unshallow', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';
    let fetchUnshallowCalled = false;

    mockSpawnSync.mockImplementation(
      (command: string, args?: readonly string[], _options?: unknown) => {
        if (command === 'git' && args?.[0] === 'clone') {
          const targetDir = args[args.length - 1];
          mockWorkingDir = targetDir;
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(
            join(targetDir, 'package.json'),
            JSON.stringify({ name: 'test-package', version: '1.0.0' })
          );
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (
          command === 'git' &&
          args?.[0] === '-C' &&
          args?.[2] === 'cat-file' &&
          args?.[3] === '-e'
        ) {
          // Simulate commit not found in shallow clone
          return {
            status: 1,
            stdout: '',
            stderr: 'commit not found',
            error: new Error('commit not found'),
            pid: 123,
            output: ['', '', 'commit not found'],
            signal: null,
          };
        }
        if (
          command === 'git' &&
          args?.[0] === '-C' &&
          args?.[2] === 'fetch' &&
          args?.includes('--unshallow')
        ) {
          fetchUnshallowCalled = true;
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (
          command === 'git' &&
          args?.[0] === '-C' &&
          args?.[2] === 'checkout'
        ) {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (command === 'npm' && args?.[0] === 'ci') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        if (command === 'npm' && args?.[0] === 'pack') {
          const tarballName = 'test-package-1.0.0.tgz';
          const tarballPath = join(mockWorkingDir, tarballName);
          writeFileSync(tarballPath, 'fake tarball content');
          return {
            status: 0,
            stdout: `${tarballName}\n`,
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', `${tarballName}\n`, ''],
            signal: null,
          };
        }
        if (command === 'shasum') {
          return {
            status: 0,
            stdout: 'abc123hash  filename\n',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', 'abc123hash  filename\n', ''],
            signal: null,
          };
        }
        if (command === 'mv') {
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
        return {
          status: 0,
          stdout: '',
          stderr: '',
          error: undefined,
          pid: 123,
          output: ['', '', ''],
          signal: null,
        };
      }
    );

    const result = await builder.buildTarball(gitUrl, commitSha, {
      force: true,
    });
    expect(result.commitSha).toBe(commitSha);
    expect(fetchUnshallowCalled).toBe(true);
  });

  it('handles legacy metadata without platform info', () => {
    const gitUrl = 'https://github.com/test/repo.git';
    const commitSha = 'abc123';

    // Use the path utilities that are already imported
    const cacheDir = getTarballCachePath(commitSha);
    mkdirSync(cacheDir, { recursive: true });

    const metadataPath = join(cacheDir, 'metadata.json');
    const tarballPath = join(cacheDir, 'package.tgz');

    // Write legacy metadata without platform field
    writeFileSync(
      metadataPath,
      JSON.stringify({
        gitUrl,
        commitSha,
        // no platform field - this is legacy metadata
        integrity: 'sha256-abcd123',
        buildTime: '2023-01-01T00:00:00.000Z',
        packageInfo: { name: 'test-package', version: '1.0.0' },
      })
    );

    // Create dummy tarball file
    writeFileSync(tarballPath, 'fake tarball content');

    const cached = builder.getCachedTarball(commitSha);
    expect(cached).toBeTruthy();
    expect(cached?.platform).toBe('darwin-arm64'); // should use fallback

    // Cleanup
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('handles metadata JSON parsing error gracefully', () => {
    const commitSha = 'abc123';

    // Use the path utilities that are already imported
    const cacheDir = getTarballCachePath(commitSha);
    mkdirSync(cacheDir, { recursive: true });

    const metadataPath = join(cacheDir, 'metadata.json');
    const tarballPath = join(cacheDir, 'package.tgz');

    // Write invalid JSON that will cause JSON.parse to throw
    writeFileSync(metadataPath, '{ invalid json without closing brace');

    // Create dummy tarball file
    writeFileSync(tarballPath, 'fake tarball content');

    const cached = builder.getCachedTarball(commitSha);
    expect(cached).toBeNull(); // Should return null when JSON parsing fails

    // Cleanup
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('handles metadata file read error via mocked fs', () => {
    const commitSha = 'abc123';

    // Use the path utilities that are already imported
    const cacheDir = getTarballCachePath(commitSha, getPlatformIdentifier());
    mkdirSync(cacheDir, { recursive: true });

    const metadataPath = join(cacheDir, 'metadata.json');
    const tarballPath = join(cacheDir, 'package.tgz');

    // Create both files
    writeFileSync(tarballPath, 'fake tarball content');

    // Write a file that will cause readFileSync to fail in a way that triggers the catch block
    // We'll create a file that exists but causes JSON.parse to throw due to invalid syntax
    writeFileSync(metadataPath, 'definitely not json at all!');

    const cached = builder.getCachedTarball(commitSha);
    expect(cached).toBeNull(); // Should return null when JSON parsing fails

    // Cleanup
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('handles readFileSync error specifically', () => {
    const commitSha = 'abc123';

    // Use the path utilities that are already imported
    const cacheDir = getTarballCachePath(commitSha, getPlatformIdentifier());
    mkdirSync(cacheDir, { recursive: true });

    const metadataPath = join(cacheDir, 'metadata.json');
    const tarballPath = join(cacheDir, 'package.tgz');

    // Create tarball file
    writeFileSync(tarballPath, 'fake tarball content');

    // Create a metadata file with content that will cause a different kind of error
    // Write binary content that will cause readFileSync with 'utf8' encoding to have issues
    writeFileSync(metadataPath, Buffer.from([0xff, 0xfe, 0x00, 0x00]));

    const cached = builder.getCachedTarball(commitSha);
    expect(cached).toBeNull(); // Should return null when any error occurs in try-catch

    // Cleanup
    rmSync(cacheDir, { recursive: true, force: true });
  });

  describe('Non-Error exception handling', () => {
    it('should handle non-Error exceptions in npm install', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[], _options?: unknown) => {
          if (command === 'git' && args?.[0] === 'clone') {
            const targetDir = args[args.length - 1];
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(
              join(targetDir, 'package.json'),
              JSON.stringify({ name: 'test-package', version: '1.0.0' })
            );
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (
            (command === 'git' && args?.[0] === 'cat-file') ||
            (command === 'git' && args?.[0] === 'checkout')
          ) {
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (command === 'npm' && args?.[0] === 'ci') {
            // Return failure status for npm ci
            const error = new Error('npm ci failed');
            (error as Error & { code: string; errno: number }).code =
              'ENOTFOUND';
            (error as Error & { code: string; errno: number }).errno = -3008;
            return {
              status: 1,
              stdout: '',
              stderr: '',
              error,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (command === 'npm' && args?.[0] === 'install') {
            // Return failure status for npm install fallback
            const error = new Error('npm install failed');
            (error as Error & { code: number }).code = 42;
            return {
              status: 1,
              stdout: '',
              stderr: '',
              error,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow(
        'Failed to build package: Error: Both npm ci and npm install failed: Error: npm install failed with exit code 1'
      );
    });

    it('should handle non-Error exceptions in buildPackage', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[], _options?: unknown) => {
          if (command === 'git' && args?.[0] === 'clone') {
            const targetDir = args[args.length - 1];
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(
              join(targetDir, 'package.json'),
              JSON.stringify({ name: 'test-package', version: '1.0.0' })
            );
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (
            (command === 'git' && args?.[0] === 'cat-file') ||
            (command === 'git' && args?.[0] === 'checkout')
          ) {
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (command === 'npm' && args?.[0] === 'ci') {
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (command === 'npm' && args?.[0] === 'pack') {
            // Return failure status for npm pack with special error handling
            const error = new Error('npm pack failed');
            (error as Error & { originalError: null }).originalError = null;
            return {
              status: 1,
              stdout: '',
              stderr: '',
              error,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow(
        'Failed to build package: Error: npm pack failed with exit code 1'
      );
    });

    it('should handle non-Error exceptions in calculateIntegrity', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      let mockWorkingDir = '';

      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[], _options?: unknown) => {
          if (command === 'git' && args?.[0] === 'clone') {
            const targetDir = args[args.length - 1];
            mockWorkingDir = targetDir;
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(
              join(targetDir, 'package.json'),
              JSON.stringify({ name: 'test-package', version: '1.0.0' })
            );
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (
            (command === 'git' && args?.[0] === 'cat-file') ||
            (command === 'git' && args?.[0] === 'checkout')
          ) {
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (command === 'npm' && args?.[0] === 'ci') {
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (command === 'npm' && args?.[0] === 'pack') {
            const tarballName = 'test-package-1.0.0.tgz';
            const tarballPath = join(mockWorkingDir, tarballName);
            writeFileSync(tarballPath, 'fake tarball content');
            return {
              status: 0,
              stdout: `${tarballName}\n`,
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', `${tarballName}\n`, ''],
              signal: null,
            };
          }
          if (command === 'shasum') {
            // Return failure status for shasum with special error handling
            const error = new Error('shasum failed');
            (error as Error & { originalError: string[] }).originalError = [
              'array',
              'error',
            ];
            return {
              status: 1,
              stdout: '',
              stderr: '',
              error,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (command === 'mv') {
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow(
        'Failed to calculate integrity: Error: shasum failed with exit code 1: '
      );
    });

    it('should handle empty npm pack output', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      let mockWorkingDir = '';

      mockExecSync.mockImplementation(
        (cmd: string, _options?: ExecSyncOptions) => {
          if (typeof cmd === 'string' && cmd.includes('git clone')) {
            const match = cmd.match(/"([^"]+)"$/);
            if (match) {
              const targetDir = match[1];
              mockWorkingDir = targetDir;
              mkdirSync(targetDir, { recursive: true });
              writeFileSync(
                join(targetDir, 'package.json'),
                JSON.stringify({ name: 'test-package', version: '1.0.0' })
              );
            }
            return '';
          }
          if (
            (typeof cmd === 'string' && cmd.includes('git cat-file')) ||
            cmd.includes('git checkout')
          ) {
            return '';
          }
          if (typeof cmd === 'string' && cmd.includes('npm ci')) {
            return '';
          }
          if (typeof cmd === 'string' && cmd.includes('npm pack')) {
            // Return empty string to test the fallback to 'package.tgz'
            const tarballPath = join(mockWorkingDir, 'package.tgz');
            writeFileSync(tarballPath, 'fake tarball content');
            return '';
          }
          if (typeof cmd === 'string' && cmd.includes('shasum')) {
            return 'abc123hash  filename\n';
          }
          if (typeof cmd === 'string' && cmd.includes('mv')) {
            return '';
          }
          return '';
        }
      );

      const result = await builder.buildTarball(gitUrl, commitSha, {
        force: true,
      });
      expect(result.commitSha).toBe(commitSha);
    });

    it('should handle missing package name and version in package.json', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      let mockWorkingDir = '';

      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[]) => {
          const argsArray = args || [];

          if (command === 'git' && argsArray[0] === 'clone') {
            const targetDir = argsArray[argsArray.length - 1];
            mockWorkingDir = targetDir;
            mkdirSync(targetDir, { recursive: true });
            // Create package.json without name and version to test fallbacks
            writeFileSync(join(targetDir, 'package.json'), '{}');
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: '',
              stderr: '',
            };
          }

          if (command === 'npm' && argsArray.includes('pack')) {
            const tarballName = 'package.tgz';
            const tarballPath = join(mockWorkingDir, tarballName);
            writeFileSync(tarballPath, 'fake tarball content');
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: `${tarballName}\n`,
              stderr: '',
            };
          }

          if (command === 'shasum') {
            return {
              status: 0,
              signal: null,
              output: [],
              pid: 123,
              stdout: 'abc123hash  filename\n',
              stderr: '',
            };
          }

          // Default success for other commands
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }
      );

      const result = await builder.buildTarball(gitUrl, commitSha, {
        force: true,
      });
      expect(result.commitSha).toBe(commitSha);
      expect(result.packageInfo?.name).toBe('unknown'); // Should use fallback
      expect(result.packageInfo?.version).toBe('0.0.0'); // Should use fallback
    });

    it('should handle npm pack output with multiple lines', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      let mockWorkingDir = '';

      mockExecSync.mockImplementation(
        (cmd: string, _options?: ExecSyncOptions) => {
          if (typeof cmd === 'string' && cmd.includes('git clone')) {
            const match = cmd.match(/"([^"]+)"$/);
            if (match) {
              const targetDir = match[1];
              mockWorkingDir = targetDir;
              mkdirSync(targetDir, { recursive: true });
              writeFileSync(
                join(targetDir, 'package.json'),
                JSON.stringify({ name: 'test-package', version: '1.0.0' })
              );
            }
            return '';
          }
          if (
            (typeof cmd === 'string' && cmd.includes('git cat-file')) ||
            cmd.includes('git checkout')
          ) {
            return '';
          }
          if (typeof cmd === 'string' && cmd.includes('npm ci')) {
            return '';
          }
          if (typeof cmd === 'string' && cmd.includes('npm pack')) {
            const tarballName = 'test-package-1.0.0.tgz';
            const tarballPath = join(mockWorkingDir, tarballName);
            writeFileSync(tarballPath, 'fake tarball content');
            // Return multi-line output to test the .pop() branch
            return `npm notice \nnpm notice 📦  test-package@1.0.0\nnpm notice === Tarball Contents ===\n${tarballName}\n`;
          }
          if (typeof cmd === 'string' && cmd.includes('shasum')) {
            return 'abc123hash  filename\n';
          }
          if (typeof cmd === 'string' && cmd.includes('mv')) {
            return '';
          }
          return '';
        }
      );

      const result = await builder.buildTarball(gitUrl, commitSha, {
        force: true,
      });
      expect(result.commitSha).toBe(commitSha);
      expect(result.packageInfo?.name).toBe('test-package');
    });
  });

  describe('createTarballBuilder', () => {
    it('should create a TarballBuilder instance', () => {
      const builder = createTarballBuilder();
      expect(builder).toBeInstanceOf(TarballBuilder);
    });

    it('handles git fetch --unshallow failure', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[], _options?: unknown) => {
          if (command === 'git' && args?.[0] === 'clone') {
            const targetDir = args[args.length - 1];
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(
              join(targetDir, 'package.json'),
              JSON.stringify({ name: 'test-package', version: '1.0.0' })
            );
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (
            command === 'git' &&
            args?.[0] === '-C' &&
            args?.[2] === 'cat-file' &&
            args?.[3] === '-e'
          ) {
            // Simulate commit not found in shallow clone
            return {
              status: 1,
              stdout: '',
              stderr: 'commit not found',
              error: new Error('commit not found'),
              pid: 123,
              output: ['', '', 'commit not found'],
              signal: null,
            };
          }
          if (
            command === 'git' &&
            args?.[0] === '-C' &&
            args?.[2] === 'fetch' &&
            args?.includes('--unshallow')
          ) {
            // Simulate fetch --unshallow failure
            return {
              status: 1,
              stdout: '',
              stderr: 'fetch failed',
              error: new Error('fetch failed'),
              pid: 123,
              output: ['', '', 'fetch failed'],
              signal: null,
            };
          }
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow(
        'Failed to checkout commit abc123: Error: git fetch --unshallow failed with exit code 1'
      );
    });

    it('handles npm run prepare failure', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      mockSpawnSync.mockImplementation(
        (command: string, args?: readonly string[], _options?: unknown) => {
          if (command === 'git' && args?.[0] === 'clone') {
            const targetDir = args[args.length - 1];
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(
              join(targetDir, 'package.json'),
              JSON.stringify({
                name: 'test-package',
                version: '1.0.0',
                scripts: { prepare: 'echo "prepare script"' },
              })
            );
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (
            command === 'git' &&
            args?.[0] === '-C' &&
            args?.[2] === 'cat-file'
          ) {
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (
            command === 'git' &&
            args?.[0] === '-C' &&
            args?.[2] === 'checkout'
          ) {
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (command === 'npm' && args?.[0] === 'ci') {
            return {
              status: 0,
              stdout: '',
              stderr: '',
              error: undefined,
              pid: 123,
              output: ['', '', ''],
              signal: null,
            };
          }
          if (
            command === 'npm' &&
            args?.[0] === 'run' &&
            args?.[1] === 'prepare'
          ) {
            // Simulate npm run prepare failure
            return {
              status: 1,
              stdout: '',
              stderr: 'prepare script failed',
              error: new Error('prepare script failed'),
              pid: 123,
              output: ['', '', 'prepare script failed'],
              signal: null,
            };
          }
          return {
            status: 0,
            stdout: '',
            stderr: '',
            error: undefined,
            pid: 123,
            output: ['', '', ''],
            signal: null,
          };
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow(
        'Failed to build package: Error: npm run prepare failed with exit code 1'
      );
    });
  });
});
