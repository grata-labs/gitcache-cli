import { execSync } from 'node:child_process';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cacheRepository, main } from './index.js';

// Mock execSync to avoid actually running git commands in tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock process.env.HOME for consistent tests
const originalEnv = process.env;
const originalArgv = process.argv;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv, HOME: '/home/testuser' };
  process.argv = [...originalArgv];
});

describe('gitcache CLI', () => {
  describe('cacheRepository', () => {
    it('should execute git clone --mirror with correct target path', () => {
      const mockExecSync = vi.mocked(execSync);
      const repo = 'https://github.com/user/repo.git';
      const expectedTarget = '/home/testuser/.gitcache/https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git';

      const result = cacheRepository(repo);

      expect(mockExecSync).toHaveBeenCalledWith(
        `git clone --mirror ${repo} "${expectedTarget}"`,
        { stdio: 'inherit' }
      );
      expect(result).toBe(expectedTarget);
    });

    it('should execute repack when force option is true', () => {
      const mockExecSync = vi.mocked(execSync);
      const repo = 'https://github.com/user/repo.git';
      const expectedTarget = '/home/testuser/.gitcache/https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git';

      cacheRepository(repo, { force: true });

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      expect(mockExecSync).toHaveBeenNthCalledWith(1,
        `git clone --mirror ${repo} "${expectedTarget}"`,
        { stdio: 'inherit' }
      );
      expect(mockExecSync).toHaveBeenNthCalledWith(2,
        `git -C "${expectedTarget}" repack -ad`,
        { stdio: 'inherit' }
      );
    });

    it('should not execute repack when force option is false', () => {
      const mockExecSync = vi.mocked(execSync);
      const repo = 'https://github.com/user/repo.git';

      cacheRepository(repo, { force: false });

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git clone --mirror'),
        { stdio: 'inherit' }
      );
    });

    it('should not execute repack when no options provided', () => {
      const mockExecSync = vi.mocked(execSync);
      const repo = 'https://github.com/user/repo.git';

      cacheRepository(repo);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it('should handle complex repository URLs correctly', () => {
      const mockExecSync = vi.mocked(execSync);
      const repo = 'git@github.com:org/repo-with-dashes.git';
      const expectedTarget = '/home/testuser/.gitcache/git%40github.com%3Aorg%2Frepo-with-dashes.git';

      const result = cacheRepository(repo);

      expect(result).toBe(expectedTarget);
      expect(mockExecSync).toHaveBeenCalledWith(
        `git clone --mirror ${repo} "${expectedTarget}"`,
        { stdio: 'inherit' }
      );
    });
  });

  describe('main', () => {
    it('should handle cache command with valid arguments', async () => {
      const mockExecSync = vi.mocked(execSync);
      process.argv = ['node', 'index.js', 'cache', 'https://github.com/user/repo.git'];

      await main();

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git clone --mirror'),
        { stdio: 'inherit' }
      );
    });

    it('should handle cache command with force flag', async () => {
      const mockExecSync = vi.mocked(execSync);
      process.argv = ['node', 'index.js', 'cache', 'https://github.com/user/repo.git', '--force'];

      await main();

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('git clone --mirror'),
        { stdio: 'inherit' }
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('repack -ad'),
        { stdio: 'inherit' }
      );
    });
  });
});
