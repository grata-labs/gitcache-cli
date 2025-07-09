import { describe, it, expect, vi } from 'vitest';
import {
  cloneMirror,
  updateAndPruneMirror,
  repackRepository,
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
});
