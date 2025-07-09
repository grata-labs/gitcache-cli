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
}));

const mockGetTarballCachePath = vi.mocked(getTarballCachePath);

describe('TarballBuilder', () => {
  let builder: TarballBuilder;
  let tempTestDir: string;

  beforeEach(() => {
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
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      let mockWorkingDir = '';

      // Mock execSync to use our temp directory for build
      mockExecSync.mockImplementation(
        (cmd: string, _options?: ExecSyncOptions) => {
          if (typeof cmd === 'string' && cmd.includes('git clone')) {
            // Simulate successful clone by creating the directory
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
          if (typeof cmd === 'string' && cmd.includes('npm pack')) {
            // Create the tarball file in the working directory
            const tarballName = 'test-package-1.0.0.tgz';
            const tarballPath = join(mockWorkingDir, tarballName);
            writeFileSync(tarballPath, 'fake tarball content');
            return `${tarballName}\n`;
          }
          if (typeof cmd === 'string' && cmd.includes('shasum')) {
            return 'abc123hash  filename\n';
          }
          if (typeof cmd === 'string' && cmd.includes('git cat-file')) {
            return '';
          }
          if (typeof cmd === 'string' && cmd.includes('git checkout')) {
            return '';
          }
          if (typeof cmd === 'string' && cmd.includes('npm ci')) {
            return '';
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
      expect(result.gitUrl).toBe(gitUrl);
      expect(result.platform).toBe('darwin-arm64');
      expect(result.packageInfo?.name).toBe('test-package');
    });

    it('should handle git clone failures', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      // Mock git clone to fail
      mockExecSync.mockImplementation(
        (cmd: string, _options?: ExecSyncOptions) => {
          if (typeof cmd === 'string' && cmd.includes('git clone')) {
            throw new Error('Git clone failed');
          }
          return '';
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow('Failed to checkout commit abc123: Git clone failed');
    });

    it('should handle npm install failures', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      // Mock git operations to succeed, npm operations to fail
      mockExecSync.mockImplementation(
        (cmd: string, _options?: ExecSyncOptions) => {
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
            if (cmd.includes('git cat-file') || cmd.includes('git checkout')) {
              return '';
            }
            if (cmd.includes('npm ci') || cmd.includes('npm install')) {
              throw new Error('npm install failed');
            }
          }
          return '';
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow('Both npm ci and npm install failed');
    });

    it('should run prepare script when not skipping build scripts', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';
      const prepareScriptRan = vi.fn();

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
                  JSON.stringify({
                    name: 'test-package',
                    version: '1.0.0',
                    scripts: { prepare: 'echo "prepare ran"' },
                  })
                );
              }
              return '';
            }
            if (cmd.includes('git cat-file') || cmd.includes('git checkout')) {
              return '';
            }
            if (cmd.includes('npm ci')) {
              return '';
            }
            if (cmd.includes('npm run prepare')) {
              prepareScriptRan();
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

      await builder.buildTarball(gitUrl, commitSha, { force: true });

      expect(prepareScriptRan).toHaveBeenCalled();
    });

    it('should skip build scripts when skipBuildScripts is true', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

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
            if (cmd.includes('git cat-file') || cmd.includes('git checkout')) {
              return '';
            }
            if (cmd.includes('npm ci --ignore-scripts')) {
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

      await builder.buildTarball(gitUrl, commitSha, {
        force: true,
        skipBuildScripts: true,
      });

      // Verify --ignore-scripts was used
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('npm ci --ignore-scripts'),
        expect.any(Object)
      );
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
    const { execSync } = await import('node:child_process');
    const mockExecSync = vi.mocked(execSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';

    // Mock execSync to succeed until shasum, then fail
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
        if (typeof cmd === 'string' && cmd.includes('npm pack')) {
          const tarballName = 'test-package-1.0.0.tgz';
          const tarballPath = join(mockWorkingDir, tarballName);
          writeFileSync(tarballPath, 'fake tarball content');
          return `${tarballName}\n`;
        }
        if (typeof cmd === 'string' && cmd.includes('shasum')) {
          throw new Error('shasum command failed');
        }
        if (typeof cmd === 'string' && cmd.includes('git cat-file')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('git checkout')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('npm ci')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('mv')) {
          return '';
        }
        return '';
      }
    );

    await expect(
      builder.buildTarball(gitUrl, commitSha, { force: true })
    ).rejects.toThrow('Failed to calculate integrity: shasum command failed');
  });

  it('should handle package without package.json', async () => {
    const { execSync } = await import('node:child_process');
    const mockExecSync = vi.mocked(execSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';

    // Mock execSync - don't create package.json
    mockExecSync.mockImplementation(
      (cmd: string, _options?: ExecSyncOptions) => {
        if (typeof cmd === 'string' && cmd.includes('git clone')) {
          const match = cmd.match(/"([^"]+)"$/);
          if (match) {
            const targetDir = match[1];
            mockWorkingDir = targetDir;
            mkdirSync(targetDir, { recursive: true });
            // No package.json created
          }
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('npm pack')) {
          const tarballName = 'package.tgz';
          const tarballPath = join(mockWorkingDir, tarballName);
          writeFileSync(tarballPath, 'fake tarball content');
          return `${tarballName}\n`;
        }
        if (typeof cmd === 'string' && cmd.includes('shasum')) {
          return 'abc123hash  filename\n';
        }
        if (typeof cmd === 'string' && cmd.includes('git cat-file')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('git checkout')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('npm ci')) {
          return '';
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
    expect(result.packageInfo).toBeUndefined(); // No package.json means no packageInfo
  });

  it('handles missing tarball file after npm pack', async () => {
    const { execSync } = await import('node:child_process');
    const mockExecSync = vi.mocked(execSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    mockExecSync.mockImplementation(
      (cmd: string, _options?: ExecSyncOptions) => {
        if (typeof cmd === 'string' && cmd.includes('git clone')) {
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
        if (typeof cmd === 'string' && cmd.includes('npm pack')) {
          // Don't create the tarball file - this simulates the error case
          return 'test-package-1.0.0.tgz\n';
        }
        if (typeof cmd === 'string' && cmd.includes('git cat-file')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('git checkout')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('npm ci')) {
          return '';
        }
        return '';
      }
    );

    await expect(
      builder.buildTarball(gitUrl, commitSha, { force: true })
    ).rejects.toThrow('npm pack did not create expected tarball');
  });

  it('handles shasum calculation failure', async () => {
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
        if (typeof cmd === 'string' && cmd.includes('npm pack')) {
          const tarballName = 'test-package-1.0.0.tgz';
          const tarballPath = join(mockWorkingDir, tarballName);
          writeFileSync(tarballPath, 'fake tarball content');
          return `${tarballName}\n`;
        }
        if (typeof cmd === 'string' && cmd.includes('shasum')) {
          throw new Error('shasum calculation failed');
        }
        if (typeof cmd === 'string' && cmd.includes('git cat-file')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('git checkout')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('npm ci')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('mv')) {
          return '';
        }
        return '';
      }
    );

    await expect(
      builder.buildTarball(gitUrl, commitSha, { force: true })
    ).rejects.toThrow(
      'Failed to calculate integrity: shasum calculation failed'
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
    const { execSync } = await import('node:child_process');
    const mockExecSync = vi.mocked(execSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    mockExecSync.mockImplementation(
      (cmd: string, _options?: ExecSyncOptions) => {
        if (typeof cmd === 'string' && cmd.includes('git clone')) {
          const match = cmd.match(/"([^"]+)"$/);
          if (match) {
            const targetDir = match[1];
            mkdirSync(targetDir, { recursive: true });
          }
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('git cat-file')) {
          return ''; // Pretend commit exists
        }
        if (
          typeof cmd === 'string' &&
          cmd.includes('git') &&
          cmd.includes('checkout')
        ) {
          throw new Error('failed to checkout commit');
        }
        // Should not reach any other commands
        return '';
      }
    );

    await expect(
      builder.buildTarball(gitUrl, commitSha, { force: true })
    ).rejects.toThrow(
      'Failed to checkout commit abc123: failed to checkout commit'
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
    const { execSync } = await import('node:child_process');
    const mockExecSync = vi.mocked(execSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';
    let installIgnoreScriptsCalled = false;

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
        if (
          typeof cmd === 'string' &&
          cmd.includes('npm install --ignore-scripts')
        ) {
          installIgnoreScriptsCalled = true;
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
      skipBuildScripts: true,
    });
    expect(result.commitSha).toBe(commitSha);
    expect(installIgnoreScriptsCalled).toBe(true);
  });

  it('handles commit not found requiring fetch --unshallow', async () => {
    const { execSync } = await import('node:child_process');
    const mockExecSync = vi.mocked(execSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';
    let fetchUnshallowCalled = false;

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
        if (typeof cmd === 'string' && cmd.includes('cat-file -e')) {
          // Simulate commit not found in shallow clone
          throw new Error('commit not found');
        }
        if (typeof cmd === 'string' && cmd.includes('fetch --unshallow')) {
          fetchUnshallowCalled = true;
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('git checkout')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('npm ci')) {
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
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      mockExecSync.mockImplementation(
        (cmd: string, _options?: ExecSyncOptions) => {
          if (typeof cmd === 'string' && cmd.includes('git clone')) {
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
          if (
            (typeof cmd === 'string' && cmd.includes('git cat-file')) ||
            cmd.includes('git checkout')
          ) {
            return '';
          }
          if (typeof cmd === 'string' && cmd.includes('npm ci')) {
            // Throw a non-Error object for npm ci
            throw { code: 'ENOTFOUND', errno: -3008 };
          }
          if (typeof cmd === 'string' && cmd.includes('npm install')) {
            // Throw a non-Error object for npm install fallback
            throw 42; // Number instead of Error
          }
          return '';
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow('Both npm ci and npm install failed: Unknown error');
    });

    it('should handle non-Error exceptions in buildPackage', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123';
      const gitUrl = 'https://github.com/test/repo.git';

      mockExecSync.mockImplementation(
        (cmd: string, _options?: ExecSyncOptions) => {
          if (typeof cmd === 'string' && cmd.includes('git clone')) {
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
            // Throw a non-Error object in npm pack
            throw null; // null instead of Error
          }
          return '';
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow('Failed to build package: Unknown error');
    });

    it('should handle non-Error exceptions in calculateIntegrity', async () => {
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
            return `${tarballName}\n`;
          }
          if (typeof cmd === 'string' && cmd.includes('shasum')) {
            // Throw a non-Error object in shasum
            throw ['array', 'error'];
          }
          if (typeof cmd === 'string' && cmd.includes('mv')) {
            return '';
          }
          return '';
        }
      );

      await expect(
        builder.buildTarball(gitUrl, commitSha, { force: true })
      ).rejects.toThrow('Failed to calculate integrity: Unknown error');
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
            // Return empty string to test the fallback to 'package.tgz' (line 251)
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
              // Create package.json without name and version to test fallbacks
              writeFileSync(join(targetDir, 'package.json'), '{}');
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
            const tarballName = 'package.tgz';
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
  });
});
