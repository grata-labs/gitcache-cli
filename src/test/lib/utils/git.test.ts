import { describe, it, expect, vi } from 'vitest';
import {
  cloneMirror,
  updateAndPruneMirror,
  repackRepository,
  resolveRef,
} from '../../../lib/utils/git.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

describe('git utilities', () => {
  describe('cloneMirror', () => {
    it('should execute git clone --mirror command', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 0,
        signal: null,
        output: [],
        pid: 123,
        stdout: '',
        stderr: '',
      });

      const repo = 'https://github.com/user/repo.git';
      const target = '/path/to/target';

      cloneMirror(repo, target);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['clone', '--mirror', repo, target],
        { stdio: 'inherit' }
      );
    });

    it('should handle git clone --mirror failure', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 1,
        signal: null,
        output: [],
        pid: 123,
        stdout: '',
        stderr: 'clone failed',
      });

      const repo = 'https://github.com/user/repo.git';
      const target = '/path/to/target';

      expect(() => cloneMirror(repo, target)).toThrow(
        'git clone --mirror failed with exit code 1'
      );
    });
  });

  describe('updateAndPruneMirror', () => {
    it('should execute git remote update --prune command', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 0,
        signal: null,
        output: [],
        pid: 123,
        stdout: '',
        stderr: '',
      });

      const target = '/path/to/target';

      updateAndPruneMirror(target);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['-C', target, 'remote', 'update', '--prune'],
        { stdio: 'inherit' }
      );
    });
  });

  describe('repackRepository', () => {
    it('should execute git repack command', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 0,
        signal: null,
        output: [],
        pid: 123,
        stdout: '',
        stderr: '',
      });

      const target = '/path/to/target';

      repackRepository(target);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['-C', target, 'repack', '-ad'],
        { stdio: 'inherit' }
      );
    });
  });

  describe('resolveRef', () => {
    it('should resolve a branch reference to commit SHA', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const mockSha = 'a1b2c3d4e5f6789012345678901234567890abcd';
      mockSpawnSync.mockReturnValue({
        status: 0,
        signal: null,
        output: [],
        pid: 123,
        stdout: `${mockSha}\trefs/heads/main\n`,
        stderr: '',
      });

      const repo = 'https://github.com/user/repo.git';
      const ref = 'main';

      const result = resolveRef(repo, ref);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['ls-remote', repo, ref],
        { encoding: 'utf8', stdio: 'pipe' }
      );
      expect(result).toBe(mockSha);
    });

    it('should resolve a tag reference to commit SHA', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      const mockSha = 'b2c3d4e5f6789012345678901234567890abcdef';
      mockSpawnSync.mockReturnValue({
        status: 0,
        signal: null,
        output: [],
        pid: 123,
        stdout: `${mockSha}\trefs/tags/v1.0.0\n`,
        stderr: '',
      });

      const repo = 'https://github.com/user/repo.git';
      const ref = 'v1.0.0';

      const result = resolveRef(repo, ref);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'git',
        ['ls-remote', repo, ref],
        { encoding: 'utf8', stdio: 'pipe' }
      );
      expect(result).toBe(mockSha);
    });

    it('should throw error when reference is not found', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      mockSpawnSync.mockReturnValue({
        status: 0,
        signal: null,
        output: [],
        pid: 123,
        stdout: '',
        stderr: '',
      });

      const repo = 'https://github.com/user/repo.git';
      const ref = 'nonexistent-branch';

      expect(() => resolveRef(repo, ref)).toThrow(
        `Reference 'nonexistent-branch' not found in repository ${repo}`
      );
    });

    it('should throw error when invalid SHA is returned', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      mockSpawnSync.mockReturnValue({
        status: 0,
        signal: null,
        output: [],
        pid: 123,
        stdout: 'invalid-sha\trefs/heads/main\n',
        stderr: '',
      });

      const repo = 'https://github.com/user/repo.git';
      const ref = 'main';

      expect(() => resolveRef(repo, ref)).toThrow(
        `Invalid commit SHA received for ref 'main': invalid-sha`
      );
    });

    it('should handle git command errors', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      mockSpawnSync.mockReturnValue({
        status: 1,
        signal: null,
        output: [],
        pid: 123,
        stdout: '',
        stderr: 'git command failed',
      });

      const repo = 'https://github.com/user/repo.git';
      const ref = 'main';

      expect(() => resolveRef(repo, ref)).toThrow(
        `Failed to resolve ref 'main' for ${repo}: Error: git ls-remote failed with exit code 1: git command failed`
      );
    });

    it('should handle non-Error exceptions', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);

      mockSpawnSync.mockImplementation(() => {
        throw 'string error';
      });

      const repo = 'https://github.com/user/repo.git';
      const ref = 'main';

      expect(() => resolveRef(repo, ref)).toThrow(
        `Failed to resolve ref 'main' for ${repo}: string error`
      );
    });
  });

  describe('updateAndPruneMirror error handling', () => {
    it('should handle git remote update --prune failure', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 1,
        signal: null,
        output: [],
        pid: 123,
        stdout: '',
        stderr: 'remote update failed',
      });

      const targetPath = '/path/to/target';

      expect(() => updateAndPruneMirror(targetPath)).toThrow(
        'git remote update --prune failed with exit code 1'
      );
    });
  });

  describe('repackRepository error handling', () => {
    it('should handle git repack -ad failure', async () => {
      const { spawnSync } = await import('node:child_process');
      const mockSpawnSync = vi.mocked(spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 1,
        signal: null,
        output: [],
        pid: 123,
        stdout: '',
        stderr: 'repack failed',
      });

      const targetPath = '/path/to/target';

      expect(() => repackRepository(targetPath)).toThrow(
        'git repack -ad failed with exit code 1'
      );
    });
  });
});
