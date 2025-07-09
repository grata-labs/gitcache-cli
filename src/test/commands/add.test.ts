import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Add } from '../../commands/add.js';
import { getTargetPath } from '../../lib/utils/path.js';

vi.mock('../../lib/utils/git.js', () => ({
  cloneMirror: vi.fn(),
  updateAndPruneMirror: vi.fn(),
  repackRepository: vi.fn(),
  resolveRef: vi.fn(),
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

  it('should execute update and repack when force option is true', async () => {
    const { cloneMirror, updateAndPruneMirror, repackRepository } =
      await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockUpdateAndPruneMirror = vi.mocked(updateAndPruneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    add.exec([repo], { force: true });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockUpdateAndPruneMirror).toHaveBeenCalledWith(expectedTarget);
    expect(mockRepackRepository).toHaveBeenCalledWith(expectedTarget);
  });

  it('should not execute update and repack when force option is false', async () => {
    const { cloneMirror, updateAndPruneMirror, repackRepository } =
      await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockUpdateAndPruneMirror = vi.mocked(updateAndPruneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';

    add.exec([repo], { force: false });

    expect(mockCloneMirror).toHaveBeenCalledTimes(1);
    expect(mockUpdateAndPruneMirror).not.toHaveBeenCalled();
    expect(mockRepackRepository).not.toHaveBeenCalled();
  });

  it('should not execute update and repack when no options provided', async () => {
    const { cloneMirror, updateAndPruneMirror, repackRepository } =
      await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockUpdateAndPruneMirror = vi.mocked(updateAndPruneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';

    add.exec([repo]);

    expect(mockCloneMirror).toHaveBeenCalledTimes(1);
    expect(mockUpdateAndPruneMirror).not.toHaveBeenCalled();
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

  it('should resolve reference when ref option is provided', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockSha = 'a1b2c3d4e5f6789012345678901234567890abcd';
    mockResolveRef.mockReturnValue(mockSha);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const ref = 'v1.0.0';
    const expectedTarget = getTargetPath(repo);

    const result = add.exec([repo], { ref });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, ref);
    expect(consoleSpy).toHaveBeenCalledWith(`Resolved ${ref} → ${mockSha}`);
    expect(result).toBe(expectedTarget);

    consoleSpy.mockRestore();
  });

  it('should handle ref resolution errors gracefully', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockResolveRef.mockImplementation(() => {
      throw new Error('Reference not found');
    });

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const ref = 'nonexistent-branch';
    const expectedTarget = getTargetPath(repo);

    const result = add.exec([repo], { ref });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, ref);
    expect(consoleSpy).toHaveBeenCalledWith(
      `Warning: Failed to resolve ref 'nonexistent-branch': Reference not found`
    );
    expect(result).toBe(expectedTarget);

    consoleSpy.mockRestore();
  });

  it('should work with both force and ref options together', async () => {
    const { cloneMirror, updateAndPruneMirror, repackRepository, resolveRef } =
      await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockUpdateAndPruneMirror = vi.mocked(updateAndPruneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);
    const mockResolveRef = vi.mocked(resolveRef);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockSha = 'b2c3d4e5f6789012345678901234567890abcdef';
    mockResolveRef.mockReturnValue(mockSha);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const ref = 'main';
    const expectedTarget = getTargetPath(repo);

    const result = add.exec([repo], { force: true, ref });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, ref);
    expect(mockUpdateAndPruneMirror).toHaveBeenCalledWith(expectedTarget);
    expect(mockRepackRepository).toHaveBeenCalledWith(expectedTarget);
    expect(consoleSpy).toHaveBeenCalledWith(`Resolved ${ref} → ${mockSha}`);
    expect(result).toBe(expectedTarget);

    consoleSpy.mockRestore();
  });

  it('should handle non-Error exceptions during ref resolution', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock resolveRef to throw a non-Error object
    mockResolveRef.mockImplementation(() => {
      throw 'string error'; // Non-Error object
    });

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const ref = 'test-ref';
    const expectedTarget = getTargetPath(repo);

    const result = add.exec([repo], { ref });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, ref);
    expect(warnSpy).toHaveBeenCalledWith(
      "Warning: Failed to resolve ref 'test-ref': Unknown error"
    );
    expect(result).toBe(expectedTarget);

    warnSpy.mockRestore();
  });
});
