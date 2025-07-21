import { SpawnSyncReturns } from 'node:child_process';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Install } from '../../commands/install.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// Mock the lockfile scanner
vi.mock('../../lockfile/scan.js', () => ({
  scanLockfile: vi.fn(),
  resolveGitReferences: vi.fn(),
}));

// Mock the tarball builder
vi.mock('../../lib/tarball-builder.js', () => ({
  TarballBuilder: vi.fn().mockImplementation(() => ({
    buildTarball: vi.fn().mockResolvedValue({}),
    getCachedTarball: vi.fn(),
    buildBatch: vi.fn(),
  })),
  createTarballBuilder: vi.fn().mockImplementation(() => ({
    buildTarball: vi.fn().mockResolvedValue({}),
    getCachedTarball: vi.fn(),
    buildBatch: vi.fn(),
  })),
}));

// Mock fs functions
vi.mock('node:fs', async () => {
  const actual = await vi.importActual('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv, HOME: '/home/testuser' };
});

// Helper to get the expected cache path in a cross-platform way
function getExpectedCachePath(): string {
  return join('/home/testuser', '.gitcache');
}

describe('Install command', () => {
  it('should execute npm install with gitcache as npm cache when no lockfile exists', async () => {
    const { spawnSync } = await import('node:child_process');
    const { existsSync } = await import('node:fs');
    const mockSpawnSync = vi.mocked(spawnSync);
    const mockExistsSync = vi.mocked(existsSync);

    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);
    mockExistsSync.mockReturnValue(false); // No lockfile exists

    const install = new Install();
    await install.exec();

    expect(mockSpawnSync).toHaveBeenCalledWith('npm', ['install'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_cache: getExpectedCachePath(),
        NPM_CONFIG_CACHE: getExpectedCachePath(),
      },
      cwd: process.cwd(),
      shell: process.platform === 'win32',
    });
  });

  it('should pass through npm install arguments', async () => {
    const { spawnSync } = await import('node:child_process');
    const { existsSync } = await import('node:fs');
    const mockSpawnSync = vi.mocked(spawnSync);
    const mockExistsSync = vi.mocked(existsSync);

    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);
    mockExistsSync.mockReturnValue(false); // No lockfile exists

    const install = new Install();
    const args = ['--save-dev', 'typescript', '@types/node'];
    await install.exec(args);

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'npm',
      ['install', '--save-dev', 'typescript', '@types/node'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_cache: getExpectedCachePath(),
          NPM_CONFIG_CACHE: getExpectedCachePath(),
        },
        cwd: process.cwd(),
        shell: process.platform === 'win32',
      }
    );
  });

  it('should handle npm install with production flag', async () => {
    const { spawnSync } = await import('node:child_process');
    const { existsSync } = await import('node:fs');
    const mockSpawnSync = vi.mocked(spawnSync);
    const mockExistsSync = vi.mocked(existsSync);

    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);
    mockExistsSync.mockReturnValue(false); // No lockfile exists

    const install = new Install();
    const args = ['--production'];
    await install.exec(args);

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'npm',
      ['install', '--production'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_cache: getExpectedCachePath(),
          NPM_CONFIG_CACHE: getExpectedCachePath(),
        },
        cwd: process.cwd(),
        shell: process.platform === 'win32',
      }
    );
  });

  it('should handle npm install with specific package and version', async () => {
    const { spawnSync } = await import('node:child_process');
    const { existsSync } = await import('node:fs');
    const mockSpawnSync = vi.mocked(spawnSync);
    const mockExistsSync = vi.mocked(existsSync);

    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);
    mockExistsSync.mockReturnValue(false); // No lockfile exists

    const install = new Install();
    const args = ['lodash@4.17.21', '--save'];
    await install.exec(args);

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'npm',
      ['install', 'lodash@4.17.21', '--save'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_cache: getExpectedCachePath(),
          NPM_CONFIG_CACHE: getExpectedCachePath(),
        },
        cwd: process.cwd(),
        shell: process.platform === 'win32',
      }
    );
  });

  it('should re-throw execSync errors', async () => {
    const { spawnSync } = await import('node:child_process');
    const { existsSync } = await import('node:fs');
    const mockSpawnSync = vi.mocked(spawnSync);
    const mockExistsSync = vi.mocked(existsSync);
    const testError = new Error('npm install failed');

    mockExistsSync.mockReturnValue(false); // No lockfile exists
    mockSpawnSync.mockImplementationOnce(() => {
      throw testError;
    });

    const install = new Install();

    await expect(install.exec()).rejects.toThrow('npm install failed');
  });

  it('should call process.exit with non-zero status when npm install fails', async () => {
    const { spawnSync } = await import('node:child_process');
    const { existsSync } = await import('node:fs');
    const mockSpawnSync = vi.mocked(spawnSync);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock process.exit to capture the exit code
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called'); // Prevent actual exit
    });

    mockExistsSync.mockReturnValue(false); // No lockfile exists
    // Mock spawnSync to return a non-zero status
    mockSpawnSync.mockReturnValue({ status: 1 } as SpawnSyncReturns<Buffer>);

    const install = new Install();

    // Should throw error when npm returns status 1
    await expect(install.exec()).rejects.toThrow(
      'npm install failed with exit code 1'
    );
    expect(mockExit).not.toHaveBeenCalled();

    // Restore the original process.exit
    mockExit.mockRestore();
  });

  it('should use current working directory', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const install = new Install();
    await install.exec();

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'npm',
      ['install'],
      expect.objectContaining({
        cwd: process.cwd(),
      })
    );
  });

  it('should handle empty arguments array', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const install = new Install();
    await install.exec([]);

    expect(mockSpawnSync).toHaveBeenCalledWith('npm', ['install'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        npm_config_cache: getExpectedCachePath(),
        NPM_CONFIG_CACHE: getExpectedCachePath(),
      },
      cwd: process.cwd(),
    });
  });

  it('should handle Windows case where status is null (successful)', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    // Mock Windows behavior: status is null but no error (success)
    mockSpawnSync.mockReturnValue({
      status: null,
      error: undefined,
      pid: 0,
      output: [],
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      signal: null,
    } as SpawnSyncReturns<Buffer>);

    const install = new Install();

    // Should not call process.exit when status is null but no error
    await expect(install.exec()).resolves.not.toThrow();
    expect(mockSpawnSync).toHaveBeenCalledWith('npm', ['install'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        npm_config_cache: getExpectedCachePath(),
        NPM_CONFIG_CACHE: getExpectedCachePath(),
      },
      cwd: process.cwd(),
    });
  });

  it('should handle Windows case where status is null but there is an error', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    // Mock process.exit to capture the exit code
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called'); // Prevent actual exit
    });

    // Mock Windows behavior: status is null but there's an error
    mockSpawnSync.mockReturnValue({
      status: null,
      error: new Error('Command failed'),
      pid: 0,
      output: [],
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      signal: null,
    } as SpawnSyncReturns<Buffer>);

    const install = new Install();

    // Should throw error when status is null but there's an error
    await expect(install.exec()).rejects.toThrow(
      'npm install failed with exit code 1'
    );
    expect(mockExit).not.toHaveBeenCalled();

    // Restore the original process.exit
    mockExit.mockRestore();
  });

  it('should scan lockfile and prepare Git dependencies when lockfile exists', async () => {
    const { spawnSync } = await import('node:child_process');
    const { existsSync } = await import('node:fs');
    const { scanLockfile, resolveGitReferences } = await import(
      '../../lockfile/scan.js'
    );
    const { TarballBuilder } = await import('../../lib/tarball-builder.js');

    const mockSpawnSync = vi.mocked(spawnSync);
    const mockExistsSync = vi.mocked(existsSync);
    const mockScanLockfile = vi.mocked(scanLockfile);
    const mockResolveGitReferences = vi.mocked(resolveGitReferences);
    const mockTarballBuilder = vi.mocked(TarballBuilder);

    // Mock console.log to capture output
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Setup mocks
    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);
    mockExistsSync.mockReturnValue(true); // Lockfile exists

    // Mock lockfile scan results
    mockScanLockfile.mockReturnValue({
      dependencies: [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ],
      lockfileVersion: 2,
      hasGitDependencies: true,
    });

    // Mock resolved dependencies
    mockResolveGitReferences.mockResolvedValue([
      {
        name: 'test-pkg',
        gitUrl: 'git+https://github.com/user/repo.git',
        reference: 'main',
        preferredUrl: 'git+https://github.com/user/repo.git',
        resolvedSha: 'abc123def456789012345678901234567890abcd',
      },
    ]);

    // Mock tarball builder
    const mockBuildTarball = vi.fn().mockResolvedValue({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockTarballBuilder as any).mockImplementation(() => ({
      buildTarball: mockBuildTarball,
    }));

    const install = new Install();
    await install.exec();

    // Verify lockfile scanning was called
    expect(mockScanLockfile).toHaveBeenCalledWith(
      expect.stringContaining('package-lock.json')
    );
    expect(mockResolveGitReferences).toHaveBeenCalled();

    // Verify console output
    expect(consoleSpy).toHaveBeenCalledWith(
      '🔍 Scanning lockfile for Git dependencies...'
    );
    expect(consoleSpy).toHaveBeenCalledWith('📦 Found 1 Git dependencies');

    // Verify npm install was still called
    expect(mockSpawnSync).toHaveBeenCalledWith('npm', ['install'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        npm_config_cache: getExpectedCachePath(),
        NPM_CONFIG_CACHE: getExpectedCachePath(),
      },
      cwd: process.cwd(),
    });

    consoleSpy.mockRestore();
  });

  it('should handle lockfile scanning errors gracefully', async () => {
    const { spawnSync } = await import('node:child_process');
    const { existsSync } = await import('node:fs');
    const { scanLockfile } = await import('../../lockfile/scan.js');

    const mockSpawnSync = vi.mocked(spawnSync);
    const mockExistsSync = vi.mocked(existsSync);
    const mockScanLockfile = vi.mocked(scanLockfile);

    // Mock console methods
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Setup mocks
    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);
    mockExistsSync.mockReturnValue(true); // Lockfile exists
    mockScanLockfile.mockImplementation(() => {
      throw new Error('Failed to parse lockfile');
    });

    const install = new Install();
    await install.exec();

    // Verify error handling
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cache preparation failed')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Continuing with normal install')
    );

    // Verify npm install was still called despite lockfile error
    expect(mockSpawnSync).toHaveBeenCalledWith('npm', ['install'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        npm_config_cache: getExpectedCachePath(),
        NPM_CONFIG_CACHE: getExpectedCachePath(),
      },
      cwd: process.cwd(),
    });

    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('should handle Windows case where status is undefined (successful)', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    // Mock Windows behavior: status is undefined but no error (success)
    mockSpawnSync.mockReturnValue({
      status: null,
      error: undefined,
      pid: 0,
      output: [null, Buffer.from(''), Buffer.from('')],
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      signal: null,
    } satisfies SpawnSyncReturns<Buffer>);

    const install = new Install();

    // Should not call process.exit when status is undefined but no error
    expect(() => install.exec()).not.toThrow();
  });
});
