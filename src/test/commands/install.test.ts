import { SpawnSyncReturns } from 'node:child_process';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Install } from '../../commands/install.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

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
  it('should execute npm install with gitcache as npm cache', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const install = new Install();
    install.exec();

    expect(mockSpawnSync).toHaveBeenCalledWith('npm', ['install'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_cache: getExpectedCachePath(),
        NPM_CONFIG_CACHE: getExpectedCachePath(),
      },
      cwd: process.cwd(),
    });
  });

  it('should pass through npm install arguments', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const install = new Install();
    const args = ['--save-dev', 'typescript', '@types/node'];
    install.exec(args);

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
      }
    );
  });

  it('should handle npm install with production flag', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const install = new Install();
    const args = ['--production'];
    install.exec(args);

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
      }
    );
  });

  it('should handle npm install with specific package and version', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const install = new Install();
    const args = ['lodash@4.17.21', '--save'];
    install.exec(args);

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
      }
    );
  });

  it('should re-throw execSync errors', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);
    const testError = new Error('npm install failed');
    mockSpawnSync.mockImplementationOnce(() => {
      throw testError;
    });

    const install = new Install();

    expect(() => install.exec()).toThrow('npm install failed');
  });

  it('should call process.exit with non-zero status when npm install fails', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    // Mock process.exit to capture the exit code
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called'); // Prevent actual exit
    });

    // Mock spawnSync to return a non-zero status
    mockSpawnSync.mockReturnValue({ status: 1 } as SpawnSyncReturns<Buffer>);

    const install = new Install();

    // Should call process.exit(1) when npm returns status 1
    expect(() => install.exec()).toThrow('process.exit called');
    expect(mockExit).toHaveBeenCalledWith(1);

    // Restore the original process.exit
    mockExit.mockRestore();
  });

  it('should use current working directory', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);
    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const install = new Install();
    install.exec();

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
    install.exec([]);

    expect(mockSpawnSync).toHaveBeenCalledWith('npm', ['install'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_cache: getExpectedCachePath(),
        NPM_CONFIG_CACHE: getExpectedCachePath(),
      },
      cwd: process.cwd(),
    });
  });
});
