import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { Cache } from '../../commands/cache.js';

vi.mock('../../lib/utils/git.js', () => ({
  cloneMirror: vi.fn(),
  repackRepository: vi.fn(),
}));

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv, HOME: '/home/testuser' };
});

describe('Cache command', () => {
  it('should execute git clone --mirror with correct target path', async () => {
    const { cloneMirror } = await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);

    const cache = new Cache();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = join(
      '/home/testuser',
      '.gitcache',
      'https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git'
    );

    const result = cache.exec([repo]);

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(result).toBe(expectedTarget);
  });

  it('should execute repack when force option is true', async () => {
    const { cloneMirror, repackRepository } = await import(
      '../../lib/utils/git.js'
    );
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);

    const cache = new Cache();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = join(
      '/home/testuser',
      '.gitcache',
      'https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git'
    );

    cache.exec([repo], { force: true });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockRepackRepository).toHaveBeenCalledWith(expectedTarget);
  });

  it('should not execute repack when force option is false', async () => {
    const { cloneMirror, repackRepository } = await import(
      '../../lib/utils/git.js'
    );
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);

    const cache = new Cache();
    const repo = 'https://github.com/user/repo.git';

    cache.exec([repo], { force: false });

    expect(mockCloneMirror).toHaveBeenCalledTimes(1);
    expect(mockRepackRepository).not.toHaveBeenCalled();
  });

  it('should not execute repack when no options provided', async () => {
    const { cloneMirror, repackRepository } = await import(
      '../../lib/utils/git.js'
    );
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);

    const cache = new Cache();
    const repo = 'https://github.com/user/repo.git';

    cache.exec([repo]);

    expect(mockCloneMirror).toHaveBeenCalledTimes(1);
    expect(mockRepackRepository).not.toHaveBeenCalled();
  });

  it('should handle complex repository URLs correctly', async () => {
    const { cloneMirror } = await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);

    const cache = new Cache();
    const repo = 'git@github.com:org/repo-with-dashes.git';
    const expectedTarget = join(
      '/home/testuser',
      '.gitcache',
      'git%40github.com%3Aorg%2Frepo-with-dashes.git'
    );

    const result = cache.exec([repo]);

    expect(result).toBe(expectedTarget);
    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
  });

  it('should throw error when no repository URL provided', () => {
    const cache = new Cache();

    expect(() => cache.exec([])).toThrow('Repository URL is required');
  });
});
