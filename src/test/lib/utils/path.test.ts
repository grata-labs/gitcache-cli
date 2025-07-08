import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import {
  getCacheDir,
  getRepoPath,
  getTargetPath,
} from '../../../lib/utils/path.js';

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

describe('path utilities', () => {
  describe('getCacheDir', () => {
    it('should return .gitcache directory in HOME', () => {
      process.env.HOME = '/home/testuser';
      const result = getCacheDir();
      const expected = join('/home/testuser', '.gitcache');
      expect(result).toBe(expected);
    });

    it('should throw error when HOME is not set', () => {
      delete process.env.HOME;
      expect(() => getCacheDir()).toThrow(
        'HOME environment variable is not set'
      );
    });
  });

  describe('getRepoPath', () => {
    it('should URL encode repository URLs', () => {
      expect(getRepoPath('https://github.com/user/repo.git')).toBe(
        'https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git'
      );
    });

    it('should handle SSH URLs with special characters', () => {
      expect(getRepoPath('git@github.com:user/repo.git')).toBe(
        'git%40github.com%3Auser%2Frepo.git'
      );
    });
  });

  describe('getTargetPath', () => {
    it('should combine cache directory with encoded repo path', () => {
      process.env.HOME = '/home/testuser';
      const repo = 'https://github.com/user/repo.git';
      const expected = join(
        '/home/testuser',
        '.gitcache',
        'https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git'
      );

      expect(getTargetPath(repo)).toBe(expected);
    });
  });
});
