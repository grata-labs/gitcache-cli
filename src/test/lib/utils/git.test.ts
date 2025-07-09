import { describe, it, expect, vi } from 'vitest';
import {
  cloneMirror,
  updateAndPruneMirror,
  repackRepository,
  resolveRef,
} from '../../../lib/utils/git.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('git utilities', () => {
  describe('cloneMirror', () => {
    it('should execute git clone --mirror command', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const repo = 'https://github.com/user/repo.git';
      const target = '/path/to/target';

      cloneMirror(repo, target);

      expect(mockExecSync).toHaveBeenCalledWith(
        `git clone --mirror ${repo} "${target}"`,
        { stdio: 'inherit' }
      );
    });
  });

  describe('updateAndPruneMirror', () => {
    it('should execute git remote update --prune command', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const target = '/path/to/target';

      updateAndPruneMirror(target);

      expect(mockExecSync).toHaveBeenCalledWith(
        `git -C "${target}" remote update --prune`,
        { stdio: 'inherit' }
      );
    });
  });

  describe('repackRepository', () => {
    it('should execute git repack command', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const target = '/path/to/target';

      repackRepository(target);

      expect(mockExecSync).toHaveBeenCalledWith(
        `git -C "${target}" repack -ad`,
        { stdio: 'inherit' }
      );
    });
  });

  describe('resolveRef', () => {
    it('should resolve a branch reference to commit SHA', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const mockSha = 'a1b2c3d4e5f6789012345678901234567890abcd';
      mockExecSync.mockReturnValue(`${mockSha}\trefs/heads/main\n`);

      const repo = 'https://github.com/user/repo.git';
      const ref = 'main';

      const result = resolveRef(repo, ref);

      expect(mockExecSync).toHaveBeenCalledWith(
        `git ls-remote ${repo} ${ref}`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      expect(result).toBe(mockSha);
    });

    it('should resolve a tag reference to commit SHA', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const mockSha = 'b2c3d4e5f6789012345678901234567890abcdef';
      mockExecSync.mockReturnValue(`${mockSha}\trefs/tags/v1.0.0\n`);

      const repo = 'https://github.com/user/repo.git';
      const ref = 'v1.0.0';

      const result = resolveRef(repo, ref);

      expect(mockExecSync).toHaveBeenCalledWith(
        `git ls-remote ${repo} ${ref}`,
        { encoding: 'utf8', stdio: 'pipe' }
      );
      expect(result).toBe(mockSha);
    });

    it('should throw error when reference is not found', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockReturnValue('');

      const repo = 'https://github.com/user/repo.git';
      const ref = 'nonexistent-branch';

      expect(() => resolveRef(repo, ref)).toThrow(
        `Reference 'nonexistent-branch' not found in repository ${repo}`
      );
    });

    it('should throw error when invalid SHA is returned', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockReturnValue('invalid-sha\trefs/heads/main\n');

      const repo = 'https://github.com/user/repo.git';
      const ref = 'main';

      expect(() => resolveRef(repo, ref)).toThrow(
        `Invalid commit SHA received for ref 'main': invalid-sha`
      );
    });

    it('should handle git command errors', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation(() => {
        throw new Error('git command failed');
      });

      const repo = 'https://github.com/user/repo.git';
      const ref = 'main';

      expect(() => resolveRef(repo, ref)).toThrow(
        `Failed to resolve ref 'main' for ${repo}: git command failed`
      );
    });

    it('should handle non-Error exceptions', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation(() => {
        throw 'string error';
      });

      const repo = 'https://github.com/user/repo.git';
      const ref = 'main';

      expect(() => resolveRef(repo, ref)).toThrow(
        `Failed to resolve ref 'main' for ${repo}: Unknown error`
      );
    });
  });
});
