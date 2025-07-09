import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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
    it('should generate SHA-256 hash for repository URLs', () => {
      const repo = 'https://github.com/user/repo.git';
      const expectedHash = createHash('sha256').update(repo).digest('hex');
      expect(getRepoPath(repo)).toBe(expectedHash);
    });

    it('should handle SSH URLs with special characters', () => {
      const repo = 'git@github.com:user/repo.git';
      const expectedHash = createHash('sha256').update(repo).digest('hex');
      expect(getRepoPath(repo)).toBe(expectedHash);
    });

    it('should generate different hashes for different URLs', () => {
      const repo1 = 'https://github.com/user/repo1.git';
      const repo2 = 'https://github.com/user/repo2.git';
      expect(getRepoPath(repo1)).not.toBe(getRepoPath(repo2));
    });

    it('should generate consistent hashes for same URL', () => {
      const repo = 'https://github.com/user/repo.git';
      expect(getRepoPath(repo)).toBe(getRepoPath(repo));
    });

    it('should handle very long URLs without path length issues', () => {
      const longRepo = 'https://github.com/very-long-organization-name/very-long-repository-name-with-many-words-and-dashes.git';
      const hash = getRepoPath(longRepo);
      expect(hash).toHaveLength(64); // SHA-256 hex digest is always 64 characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/); // Should be valid hex
    });

    it('should handle URLs with special characters safely', () => {
      const specialRepo = 'https://github.com/user/repo with spaces & symbols!@#$%^&*().git';
      const hash = getRepoPath(specialRepo);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('getTargetPath', () => {
    it('should combine cache directory with SHA-256 hash', () => {
      process.env.HOME = '/home/testuser';
      const repo = 'https://github.com/user/repo.git';
      const expectedHash = createHash('sha256').update(repo).digest('hex');
      const expected = join('/home/testuser', '.gitcache', expectedHash);

      expect(getTargetPath(repo)).toBe(expected);
    });
  });
});
