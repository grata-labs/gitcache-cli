import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  getCacheDir,
  getRepoPath,
  getTargetPath,
  normalizeRepoUrl,
  getPlatformIdentifier,
  getTarballCachePath,
  getTarballFilePath,
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

    it('should return .gitcache directory in USERPROFILE on Windows', () => {
      const originalHome = process.env.HOME;
      delete process.env.HOME;
      process.env.USERPROFILE = 'C:\\Users\\testuser';

      const result = getCacheDir();
      const expected = join('C:\\Users\\testuser', '.gitcache');
      expect(result).toBe(expected);

      // Restore original value
      if (originalHome !== undefined) process.env.HOME = originalHome;
      delete process.env.USERPROFILE;
    });

    it('should throw error when HOME is not set', () => {
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;

      delete process.env.HOME;
      delete process.env.USERPROFILE;

      expect(() => getCacheDir()).toThrow(
        'HOME or USERPROFILE environment variable is not set'
      );

      // Restore original values
      if (originalHome !== undefined) process.env.HOME = originalHome;
      if (originalUserProfile !== undefined)
        process.env.USERPROFILE = originalUserProfile;
    });
  });

  describe('normalizeRepoUrl', () => {
    it('should respect protocol choice while normalizing format variations', () => {
      // HTTPS variations should normalize to same HTTPS URL
      expect(normalizeRepoUrl('https://github.com/User/Repo.git/')).toBe(
        'https://github.com/user/repo'
      );
      expect(normalizeRepoUrl('git+https://github.com/User/Repo.git')).toBe(
        'https://github.com/user/repo'
      );
      expect(normalizeRepoUrl('https://github.com/user/repo/')).toBe(
        'https://github.com/user/repo'
      );

      // SSH variations should normalize to same SSH URL
      expect(normalizeRepoUrl('git@github.com:User/Repo.git')).toBe(
        'ssh://git@github.com/user/repo'
      );
      expect(normalizeRepoUrl('git+ssh://git@github.com/User/Repo.git')).toBe(
        'ssh://git@github.com/user/repo'
      );
    });

    it('should default GitHub shortcuts to HTTPS', () => {
      expect(normalizeRepoUrl('github:User/Repo')).toBe(
        'https://github.com/user/repo'
      );
    });

    it('should handle GitLab URLs while preserving protocol', () => {
      expect(normalizeRepoUrl('git@gitlab.com:User/Repo.git')).toBe(
        'ssh://git@gitlab.com/user/repo'
      );
      expect(normalizeRepoUrl('https://gitlab.com/User/Repo.git')).toBe(
        'https://gitlab.com/user/repo'
      );
    });

    it('should not break on non-github URLs', () => {
      expect(normalizeRepoUrl('https://bitbucket.org/user/repo.git')).toBe(
        'https://bitbucket.org/user/repo'
      );
      expect(normalizeRepoUrl('git@bitbucket.org:user/repo.git')).toBe(
        'ssh://git@bitbucket.org/user/repo'
      );
    });
  });

  describe('getRepoPath', () => {
    it('should generate SHA-256 hash for normalized repository URLs', () => {
      const repo = 'https://github.com/user/repo.git';
      const normalized = normalizeRepoUrl(repo);
      const expectedHash = createHash('sha256')
        .update(normalized)
        .digest('hex');
      expect(getRepoPath(repo)).toBe(expectedHash);
    });

    it('should generate different hashes for same repo with different protocols', () => {
      // SSH and HTTPS should generate different cache keys (respecting user choice)
      const httpsUrl = 'https://github.com/user/repo.git';
      const sshUrl = 'git@github.com:user/repo.git';
      expect(getRepoPath(httpsUrl)).not.toBe(getRepoPath(sshUrl));
    });

    it('should generate the same hash for equivalent URLs within same protocol', () => {
      // HTTPS variations should generate same hash
      const httpsUrls = [
        'https://github.com/user/repo.git',
        'https://github.com/user/repo/',
        'git+https://github.com/user/repo.git',
        'https://github.com/user/repo',
      ];
      const httpsHashes = httpsUrls.map(getRepoPath);
      httpsHashes.forEach((h) => expect(h).toBe(httpsHashes[0]));

      // SSH variations should generate same hash
      const sshUrls = [
        'git@github.com:user/repo.git',
        'git+ssh://git@github.com/user/repo.git',
      ];
      const sshHashes = sshUrls.map(getRepoPath);
      sshHashes.forEach((h) => expect(h).toBe(sshHashes[0]));
    });

    it('should generate different hashes for different repos', () => {
      const repo1 = 'https://github.com/user/repo1.git';
      const repo2 = 'https://github.com/user/repo2.git';
      expect(getRepoPath(repo1)).not.toBe(getRepoPath(repo2));
    });

    it('should handle very long URLs without path length issues', () => {
      const longRepo =
        'https://github.com/very-long-organization-name/very-long-repository-name-with-many-words-and-dashes.git';
      const hash = getRepoPath(longRepo);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle URLs with special characters safely', () => {
      const specialRepo =
        'https://github.com/user/repo with spaces & symbols!@#$%^&*().git';
      const hash = getRepoPath(specialRepo);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('getTargetPath', () => {
    it('should combine cache directory with SHA-256 hash', () => {
      process.env.HOME = '/home/testuser';
      const repo = 'https://github.com/user/repo.git';
      const normalized = normalizeRepoUrl(repo);
      const expectedHash = createHash('sha256')
        .update(normalized)
        .digest('hex');
      const expected = join('/home/testuser', '.gitcache', expectedHash);
      expect(getTargetPath(repo)).toBe(expected);
    });
  });

  describe('getPlatformIdentifier', () => {
    it('should return os-arch format', () => {
      const platform = getPlatformIdentifier();
      expect(platform).toMatch(/^[a-z]+.*-[a-z0-9]+$/); // like darwin-arm64, linux-x64
      expect(platform.includes('-')).toBe(true);
    });
  });

  describe('getTarballCachePath', () => {
    it('should generate cache directory path with platform', () => {
      process.env.HOME = '/home/testuser';
      const commitSha = 'abc123def456';
      const platform = 'linux-x64';

      const result = getTarballCachePath(commitSha, platform);
      const expected = join(
        '/home/testuser',
        '.gitcache',
        'tarballs',
        `${commitSha}-${platform}`
      );

      expect(result).toBe(expected);
    });

    it('should use current platform when platform not specified', () => {
      process.env.HOME = '/home/testuser';
      const commitSha = 'abc123def456';

      const result = getTarballCachePath(commitSha);
      const currentPlatform = getPlatformIdentifier();
      const expected = join(
        '/home/testuser',
        '.gitcache',
        'tarballs',
        `${commitSha}-${currentPlatform}`
      );

      expect(result).toBe(expected);
    });
  });

  describe('getTarballFilePath', () => {
    it('should generate tarball file path with platform', () => {
      process.env.HOME = '/home/testuser';
      const commitSha = 'abc123def456';
      const platform = 'darwin-arm64';

      const result = getTarballFilePath(commitSha, platform);
      const expected = join(
        '/home/testuser',
        '.gitcache',
        'tarballs',
        `${commitSha}-${platform}.tgz`
      );

      expect(result).toBe(expected);
    });

    it('should use current platform when platform not specified', () => {
      process.env.HOME = '/home/testuser';
      const commitSha = 'abc123def456';

      const result = getTarballFilePath(commitSha);
      const currentPlatform = getPlatformIdentifier();
      const expected = join(
        '/home/testuser',
        '.gitcache',
        'tarballs',
        `${commitSha}-${currentPlatform}.tgz`
      );

      expect(result).toBe(expected);
    });
  });
});
