import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Add } from '../../commands/add.js';
import { getTargetPath } from '../../lib/utils/path.js';

vi.mock('../../lib/utils/git.js', () => ({
  cloneMirror: vi.fn(),
  repackRepository: vi.fn(),
}));

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv, HOME: '/home/testuser' };
});

describe('Add command', () => {
  it('should execute git clone --mirror with correct target path', async () => {
    const { cloneMirror } = await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    const result = add.exec([repo]);

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(result).toBe(expectedTarget);
  });

  it('should execute repack when force option is true', async () => {
    const { cloneMirror, repackRepository } = await import(
      '../../lib/utils/git.js'
    );
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    add.exec([repo], { force: true });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockRepackRepository).toHaveBeenCalledWith(expectedTarget);
  });

  it('should not execute repack when force option is false', async () => {
    const { cloneMirror, repackRepository } = await import(
      '../../lib/utils/git.js'
    );
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';

    add.exec([repo], { force: false });

    expect(mockCloneMirror).toHaveBeenCalledTimes(1);
    expect(mockRepackRepository).not.toHaveBeenCalled();
  });

  it('should not execute repack when no options provided', async () => {
    const { cloneMirror, repackRepository } = await import(
      '../../lib/utils/git.js'
    );
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';

    add.exec([repo]);

    expect(mockCloneMirror).toHaveBeenCalledTimes(1);
    expect(mockRepackRepository).not.toHaveBeenCalled();
  });

  it('should handle complex repository URLs correctly', async () => {
    const { cloneMirror } = await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);

    const add = new Add();
    const repo = 'git@github.com:org/repo-with-dashes.git';
    const expectedTarget = getTargetPath(repo);

    const result = add.exec([repo]);

    expect(result).toBe(expectedTarget);
    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
  });

  it('should throw error when no repository URL provided', () => {
    const add = new Add();

    expect(() => add.exec([])).toThrow('Repository URL is required');
  });
});
