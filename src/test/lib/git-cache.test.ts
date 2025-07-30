import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { GitCache, DEFAULT_GIT_OPTIONS } from '../../lib/git-cache.js';

// Mock the execSync function
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('GitCache', () => {
  let gitCache: GitCache;
  let mockExecSync: any;

  beforeEach(() => {
    gitCache = new GitCache();
    mockExecSync = execSync as any;
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const cache = new GitCache();
      expect(cache).toBeInstanceOf(GitCache);
    });

    it('should merge custom options with defaults', () => {
      const cache = new GitCache({ timeout: 60000, verboseLogging: true });
      expect(cache).toBeInstanceOf(GitCache);
    });

    it('should use partial options correctly', () => {
      const cache = new GitCache({ timeout: 45000 });
      expect(cache).toBeInstanceOf(GitCache);
    });
  });

  describe('has', () => {
    it('should always return true (git cache is a fallback)', async () => {
      const result = await gitCache.has('test-package');
      expect(result).toBe(true);
    });

    it('should return true for any package ID', async () => {
      const result = await gitCache.has(
        'https://github.com/user/repo.git#abc123'
      );
      expect(result).toBe(true);
    });
  });

  describe('get', () => {
    it('should successfully fetch a git package', async () => {
      const packageId = 'https://github.com/user/repo.git#abc123';
      const mockArchiveData = 'mock tar archive data';

      // Mock all the commands that will be called
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('mkdir')) return '';
        if (command.includes('git clone')) return '';
        if (command.includes('git cat-file')) return '';
        if (command.includes('git checkout')) return '';
        if (command.includes('git archive')) return mockArchiveData;
        if (command.includes('rm -rf')) return '';
        return '';
      });

      const result = await gitCache.get(packageId);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe(mockArchiveData);
    });

    it('should handle shallow clone with available commit', async () => {
      const packageId = 'https://github.com/user/repo.git#abc123';
      const mockArchiveData = 'mock tar archive data';

      // Mock commands - commit is available in shallow clone
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('mkdir')) return '';
        if (command.includes('git clone')) return '';
        if (command.includes('git cat-file')) return ''; // Success means commit exists
        if (command.includes('git checkout')) return '';
        if (command.includes('git archive')) return mockArchiveData;
        if (command.includes('rm -rf')) return '';
        return '';
      });

      const result = await gitCache.get(packageId);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should fetch specific commit when not available in shallow clone', async () => {
      const packageId = 'https://github.com/user/repo.git#abc123';
      const mockArchiveData = 'mock tar archive data';

      let catFileCallCount = 0;
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('mkdir')) return '';
        if (command.includes('git clone')) return '';
        if (command.includes('git cat-file')) {
          catFileCallCount++;
          if (catFileCallCount === 1) {
            // First call fails - commit not available
            const error = new Error('object not found');
            throw error;
          }
          return ''; // Second call succeeds after fetch
        }
        if (command.includes('git fetch')) return '';
        if (command.includes('git checkout')) return '';
        if (command.includes('git archive')) return mockArchiveData;
        if (command.includes('rm -rf')) return '';
        return '';
      });

      const result = await gitCache.get(packageId);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should throw error for invalid package ID format', async () => {
      const invalidPackageId = 'invalid-format';

      await expect(gitCache.get(invalidPackageId)).rejects.toThrow(
        'Git fetch failed for invalid-format: Error: Invalid package ID format: invalid-format'
      );
    });

    it('should throw error when git clone fails', async () => {
      const packageId = 'https://github.com/user/repo.git#abc123';

      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('mkdir')) return '';
        if (command.includes('git clone')) {
          const error = new Error('Repository not found');
          (error as any).stderr = 'fatal: repository not found';
          throw error;
        }
        if (command.includes('rm -rf')) return '';
        return '';
      });

      await expect(gitCache.get(packageId)).rejects.toThrow(
        'Git fetch failed for https://github.com/user/repo.git#abc123'
      );
    });

    it('should handle git command with stderr', async () => {
      const packageId = 'https://github.com/user/repo.git#abc123';

      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('mkdir')) {
          const error = new Error('Command failed');
          (error as any).stderr = 'Permission denied';
          throw error;
        }
        return '';
      });

      await expect(gitCache.get(packageId)).rejects.toThrow(
        'Git fetch failed for https://github.com/user/repo.git#abc123'
      );
    });
  });

  describe('store', () => {
    it('should resolve without doing anything (read-only cache)', async () => {
      const packageId = 'test-package';
      const data = Buffer.from('test data');

      await expect(gitCache.store(packageId, data)).resolves.toBeUndefined();
    });

    it('should log verbose message when enabled', async () => {
      const verboseCache = new GitCache({ verboseLogging: true });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await verboseCache.store('test-package', Buffer.from('data'));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Git] Store operation not supported for git cache (test-package)'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('parsePackageId', () => {
    it('should parse valid package ID correctly', () => {
      const packageId = 'https://github.com/user/repo.git#abc123';

      // Access private method through any
      const result = (gitCache as any).parsePackageId(packageId);

      expect(result).toEqual({
        repoUrl: 'https://github.com/user/repo.git',
        commitHash: 'abc123',
        packageId,
      });
    });

    it('should handle package ID with whitespace', () => {
      const packageId = ' https://github.com/user/repo.git # abc123 ';

      const result = (gitCache as any).parsePackageId(packageId);

      expect(result.repoUrl).toBe('https://github.com/user/repo.git');
      expect(result.commitHash).toBe('abc123');
    });

    it('should throw error for invalid format', () => {
      const invalidId = 'invalid-format';

      expect(() => {
        (gitCache as any).parsePackageId(invalidId);
      }).toThrow('Invalid package ID format: invalid-format');
    });

    it('should throw error for missing commit hash', () => {
      const invalidId = 'https://github.com/user/repo.git';

      expect(() => {
        (gitCache as any).parsePackageId(invalidId);
      }).toThrow('Invalid package ID format: https://github.com/user/repo.git');
    });
  });

  describe('execGit', () => {
    it('should execute git commands successfully', () => {
      const command = '--version';
      const expectedOutput = 'git version 2.39.0';

      mockExecSync.mockReturnValueOnce(expectedOutput);

      const result = (gitCache as any).execGit(command);

      expect(result).toBe(expectedOutput);
      expect(mockExecSync).toHaveBeenCalledWith(
        'git --version',
        expect.objectContaining({
          timeout: DEFAULT_GIT_OPTIONS.timeout,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      );
    });

    it('should execute git commands with working directory', () => {
      const command = 'status';
      const cwd = '/test/directory';

      mockExecSync.mockReturnValueOnce('On branch main');

      (gitCache as any).execGit(command, cwd);

      expect(mockExecSync).toHaveBeenCalledWith(
        'git status',
        expect.objectContaining({ cwd })
      );
    });

    it('should handle git command errors with stderr', () => {
      const command = 'invalid-command';
      const error = new Error('Command failed');
      (error as any).stderr = 'git: invalid-command is not a git command';

      mockExecSync.mockImplementationOnce(() => {
        throw error;
      });

      expect(() => {
        (gitCache as any).execGit(command);
      }).toThrow(
        'Git command failed: git invalid-command\ngit: invalid-command is not a git command'
      );
    });

    it('should handle git command errors without stderr', () => {
      const command = 'status';
      const error = new Error('Not a git repository');

      mockExecSync.mockImplementationOnce(() => {
        throw error;
      });

      expect(() => {
        (gitCache as any).execGit(command);
      }).toThrow('Git command failed: git status\nNot a git repository');
    });

    it('should handle git command errors without stderr or message', () => {
      const command = 'status';
      // Create an error object without stderr or message properties
      const errorWithoutProperties = { code: 'UNKNOWN', signal: null };

      mockExecSync.mockImplementationOnce(() => {
        throw errorWithoutProperties;
      });

      expect(() => {
        (gitCache as any).execGit(command);
      }).toThrow('Git command failed: git status\nUnknown git error');
    });
  });

  describe('isShallowCommitAvailable', () => {
    it('should return true when commit is available', () => {
      mockExecSync.mockReturnValueOnce('');

      const result = (gitCache as any).isShallowCommitAvailable(
        '/test/repo',
        'abc123'
      );

      expect(result).toBe(true);
      expect(mockExecSync).toHaveBeenCalledWith(
        'git cat-file -e abc123',
        expect.objectContaining({ cwd: '/test/repo' })
      );
    });

    it('should return false when commit is not available', () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('object not found');
      });

      const result = (gitCache as any).isShallowCommitAvailable(
        '/test/repo',
        'abc123'
      );

      expect(result).toBe(false);
    });
  });

  describe('createTempDir', () => {
    it('should create temporary directory successfully', () => {
      mockExecSync.mockReturnValueOnce('');

      const result = (gitCache as any).createTempDir();

      expect(typeof result).toBe('string');
      expect(result).toMatch(/\/gitcache-\d+-[a-z0-9]+$/);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringMatching(/mkdir -p ".*\/gitcache-\d+-[a-z0-9]+"/)
      );
    });

    it('should throw error when mkdir fails', () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      expect(() => {
        (gitCache as any).createTempDir();
      }).toThrow('Failed to create temp directory: Error: Permission denied');
    });

    it('should use TMPDIR environment variable', () => {
      const originalTmpdir = process.env.TMPDIR;
      process.env.TMPDIR = '/custom/tmp';

      mockExecSync.mockReturnValueOnce('');

      const result = (gitCache as any).createTempDir();

      expect(result).toMatch(/^\/custom\/tmp\/gitcache-/);

      process.env.TMPDIR = originalTmpdir;
    });
  });

  describe('cleanupTempDir', () => {
    it('should remove temporary directory successfully', () => {
      mockExecSync.mockReturnValueOnce('');

      (gitCache as any).cleanupTempDir('/test/temp/dir');

      expect(mockExecSync).toHaveBeenCalledWith('rm -rf "/test/temp/dir"');
    });

    it('should handle cleanup failure gracefully', () => {
      const verboseCache = new GitCache({ verboseLogging: true });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockExecSync.mockImplementationOnce(() => {
        throw new Error('Directory busy');
      });

      (verboseCache as any).cleanupTempDir('/test/temp/dir');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GitCache Git] Failed to cleanup temp directory /test/temp/dir: Error: Directory busy'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getGitStatus', () => {
    it('should return git status when available', async () => {
      const mockVersion = 'git version 2.39.0';
      mockExecSync.mockReturnValueOnce(mockVersion);

      const result = await gitCache.getGitStatus();

      expect(result).toEqual({
        available: true,
        version: mockVersion,
      });
    });

    it('should return error status when git is not available', async () => {
      const error = new Error(
        'Git command failed: git --version\ngit: command not found'
      );
      mockExecSync.mockImplementationOnce(() => {
        throw error;
      });

      const result = await gitCache.getGitStatus();

      expect(result.available).toBe(false);
      expect(result.version).toBe(null);
      expect(result.error).toContain('git: command not found');
    });
  });

  describe('validatePackageId (static)', () => {
    it('should validate correct package IDs', () => {
      const validIds = [
        'https://github.com/user/repo.git#abc1234',
        'git@github.com:user/repo.git#1234567',
        'https://gitlab.com/user/repo.git#abcdef1234567890',
        'https://bitbucket.org/user/repo.git#a1b2c3d',
      ];

      validIds.forEach((id) => {
        expect(GitCache.validatePackageId(id)).toBe(true);
      });
    });

    it('should reject invalid package IDs', () => {
      const invalidIds = [
        'invalid-format',
        'https://github.com/user/repo.git', // no commit hash
        'github.com/user/repo#abc123', // no protocol
        'https://github.com/user/repo.git#', // empty commit hash
        'https://github.com/user/repo.git#xyz', // invalid commit hash
        'https://github.com/user/repo.git#123', // too short commit hash
      ];

      invalidIds.forEach((id) => {
        expect(GitCache.validatePackageId(id)).toBe(false);
      });
    });

    it('should handle exceptions gracefully', () => {
      expect(GitCache.validatePackageId(null as any)).toBe(false);
      expect(GitCache.validatePackageId(undefined as any)).toBe(false);
    });
  });

  describe('createPackageId (static)', () => {
    it('should create package ID from repo URL and commit', () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const commitHash = 'abc123';

      const result = GitCache.createPackageId(repoUrl, commitHash);

      expect(result).toBe('https://github.com/user/repo.git#abc123');
    });

    it('should handle different URL formats', () => {
      const testCases = [
        {
          repoUrl: 'git@github.com:user/repo.git',
          commitHash: '1234567',
          expected: 'git@github.com:user/repo.git#1234567',
        },
        {
          repoUrl: 'https://gitlab.com/user/repo.git',
          commitHash: 'abcdef123',
          expected: 'https://gitlab.com/user/repo.git#abcdef123',
        },
      ];

      testCases.forEach(({ repoUrl, commitHash, expected }) => {
        expect(GitCache.createPackageId(repoUrl, commitHash)).toBe(expected);
      });
    });
  });

  describe('logVerbose', () => {
    it('should log when verbose logging is enabled', () => {
      const verboseCache = new GitCache({ verboseLogging: true });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      (verboseCache as any).logVerbose('Test message');

      expect(consoleSpy).toHaveBeenCalledWith('[GitCache Git] Test message');

      consoleSpy.mockRestore();
    });

    it('should not log when verbose logging is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      (gitCache as any).logVerbose('Test message');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle complex git repository workflow', async () => {
      const packageId =
        'https://github.com/complex/repo.git#feature-branch-abc123';
      const mockArchiveData = 'complex tar data';

      // Mock a complex workflow where fetch is needed
      let catFileCallCount = 0;
      mockExecSync.mockImplementation((command: string) => {
        if (command.includes('mkdir')) return '';
        if (command.includes('git clone')) return '';
        if (command.includes('git cat-file')) {
          catFileCallCount++;
          if (catFileCallCount === 1) {
            // First call fails
            throw new Error('object not found');
          }
          return ''; // Success after fetch
        }
        if (command.includes('git fetch')) return '';
        if (command.includes('git checkout')) return '';
        if (command.includes('git archive')) return mockArchiveData;
        if (command.includes('rm -rf')) return '';
        return '';
      });

      const result = await gitCache.get(packageId);
      expect(result.toString()).toBe(mockArchiveData);
    });

    it('should handle temporary directory creation with custom TMPDIR', () => {
      const originalTmpdir = process.env.TMPDIR;
      process.env.TMPDIR = '/var/tmp';

      mockExecSync.mockReturnValueOnce('');

      const result = (gitCache as any).createTempDir();

      expect(result).toMatch(/^\/var\/tmp\/gitcache-/);

      process.env.TMPDIR = originalTmpdir;
    });

    it('should handle temporary directory creation without custom TMPDIR', () => {
      const originalTmpdir = process.env.TMPDIR;
      process.env.TMPDIR = '';

      mockExecSync.mockReturnValueOnce('');

      const result = (gitCache as any).createTempDir();

      expect(result).toMatch(/^\/tmp\/gitcache-/);

      process.env.TMPDIR = originalTmpdir;
    });

    it('should handle git operations with timeout', () => {
      const timeoutCache = new GitCache({ timeout: 5000 });

      mockExecSync.mockReturnValueOnce('git version 2.39.0');

      (timeoutCache as any).execGit('--version');

      expect(mockExecSync).toHaveBeenCalledWith(
        'git --version',
        expect.objectContaining({ timeout: 5000 })
      );
    });
  });
});
