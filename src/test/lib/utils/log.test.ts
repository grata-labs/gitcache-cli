import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  logRefResolution,
  getRefHistory,
  getLastResolvedSha,
  type LogEntry,
} from '../../../lib/utils/log.js';

// Create test home directory path
const testHomeDir = join(tmpdir(), 'gitcache-test-' + Date.now());

// Mock the home directory to use a temp directory for tests
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => testHomeDir,
  };
});

// Mock fs for error testing
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn(actual.writeFileSync),
  };
});

describe('log utilities', () => {
  const testLogPath = join(testHomeDir, '.gitcache', 'activity.log');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testHomeDir)) {
      rmSync(testHomeDir, { recursive: true, force: true });
    }
  });

  describe('logRefResolution', () => {
    it('should create log directory and file if they do not exist', () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const ref = 'main';
      const sha = 'a1b2c3d4e5f6789012345678901234567890abcd';

      logRefResolution(repoUrl, ref, sha);

      expect(existsSync(testLogPath)).toBe(true);
    });

    it('should append log entry to existing file', () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const ref1 = 'main';
      const sha1 = 'a1b2c3d4e5f6789012345678901234567890abcd';
      const ref2 = 'v1.0.0';
      const sha2 = 'b2c3d4e5f6789012345678901234567890abcdef';

      logRefResolution(repoUrl, ref1, sha1);
      logRefResolution(repoUrl, ref2, sha2);

      const content = readFileSync(testLogPath, 'utf8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(2);

      const entry1: LogEntry = JSON.parse(lines[0]);
      expect(entry1.repoUrl).toBe(repoUrl);
      expect(entry1.ref).toBe(ref1);
      expect(entry1.sha).toBe(sha1);
      expect(entry1.action).toBe('ref-resolved');
      expect(entry1.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );

      const entry2: LogEntry = JSON.parse(lines[1]);
      expect(entry2.ref).toBe(ref2);
      expect(entry2.sha).toBe(sha2);
    });

    it('should handle write errors gracefully', () => {
      // Create a scenario where write will fail by making directory read-only
      const fs = require('node:fs');
      const path = require('node:path');

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const readOnlyDir = path.join(testHomeDir, '.gitcache-readonly');
      fs.mkdirSync(readOnlyDir, { recursive: true });

      // Try to change permissions to read-only (this might not work on all systems)
      try {
        fs.chmodSync(readOnlyDir, 0o444);
      } catch {
        // If chmod fails, skip this test - it's OS dependent
        consoleSpy.mockRestore();
        return;
      }

      // Temporarily override getLogPath to use read-only directory
      const originalHomedir = require('node:os').homedir;
      vi.mocked(require('node:os')).homedir = () =>
        readOnlyDir.replace('/.gitcache-readonly', '');

      const repoUrl = 'https://github.com/user/repo.git';
      const ref = 'main';
      const sha = 'a1b2c3d4e5f6789012345678901234567890abcd';

      // Attempt to log - should handle error gracefully
      expect(() => logRefResolution(repoUrl, ref, sha)).not.toThrow();

      // Restore
      require('node:os').homedir = originalHomedir;
      try {
        fs.chmodSync(readOnlyDir, 0o755);
        fs.rmSync(readOnlyDir, { recursive: true, force: true });
      } catch {
        // Cleanup might fail, that's ok
      }

      consoleSpy.mockRestore();
    });

    it('should handle JSON parsing errors in readLogEntries', () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const ref = 'main';
      const sha = 'a1b2c3d4e5f6789012345678901234567890abcd';

      // First, create a log entry normally
      logRefResolution(repoUrl, ref, sha);

      // Then, corrupt the log file with invalid JSON
      const { writeFileSync } = require('node:fs');
      writeFileSync(testLogPath, 'invalid-json-content\n', { flag: 'a' });

      // getRefHistory should handle the JSON parsing error gracefully
      const history = getRefHistory(repoUrl);
      expect(Array.isArray(history)).toBe(true);
      // The function should return an empty array when JSON parsing fails
    });
  });

  describe('getRefHistory', () => {
    it('should return empty array when no log file exists', () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const history = getRefHistory(repoUrl);
      expect(history).toEqual([]);
    });

    it('should return filtered history for specific repository', () => {
      const repo1 = 'https://github.com/user/repo1.git';
      const repo2 = 'https://github.com/user/repo2.git';
      const ref = 'main';
      const sha1 = 'a1b2c3d4e5f6789012345678901234567890abcd';
      const sha2 = 'b2c3d4e5f6789012345678901234567890abcdef';

      logRefResolution(repo1, ref, sha1);
      logRefResolution(repo2, ref, sha2);

      const history1 = getRefHistory(repo1);
      const history2 = getRefHistory(repo2);

      expect(history1).toHaveLength(1);
      expect(history1[0].repoUrl).toBe(repo1);
      expect(history1[0].sha).toBe(sha1);

      expect(history2).toHaveLength(1);
      expect(history2[0].repoUrl).toBe(repo2);
      expect(history2[0].sha).toBe(sha2);
    });
  });

  describe('getLastResolvedSha', () => {
    it('should return null when no matching entries exist', () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const ref = 'main';

      const sha = getLastResolvedSha(repoUrl, ref);
      expect(sha).toBeNull();
    });

    it('should return most recent SHA for repository and ref', async () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const ref = 'main';
      const sha1 = 'a1b2c3d4e5f6789012345678901234567890abcd';
      const sha2 = 'b2c3d4e5f6789012345678901234567890abcdef';

      // Log two different SHAs for the same ref (simulating branch movement)
      logRefResolution(repoUrl, ref, sha1);

      // Wait a tiny bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 2));

      logRefResolution(repoUrl, ref, sha2);

      const lastSha = getLastResolvedSha(repoUrl, ref);
      expect(lastSha).toBe(sha2); // Should return the most recent
    });

    it('should return correct SHA for specific ref when multiple refs exist', () => {
      const repoUrl = 'https://github.com/user/repo.git';
      const mainRef = 'main';
      const tagRef = 'v1.0.0';
      const mainSha = 'a1b2c3d4e5f6789012345678901234567890abcd';
      const tagSha = 'b2c3d4e5f6789012345678901234567890abcdef';

      logRefResolution(repoUrl, mainRef, mainSha);
      logRefResolution(repoUrl, tagRef, tagSha);

      expect(getLastResolvedSha(repoUrl, mainRef)).toBe(mainSha);
      expect(getLastResolvedSha(repoUrl, tagRef)).toBe(tagSha);
    });
  });

  describe('logRefResolution error handling', () => {
    it('should handle write errors gracefully', () => {
      const originalWriteFileSync = vi.mocked(writeFileSync);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock writeFileSync to throw an error
      originalWriteFileSync.mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      const repoUrl = 'https://github.com/user/repo.git';
      const ref = 'main';
      const sha = 'a1b2c3d4e5f6789012345678901234567890abcd';

      // This should not throw, but should warn
      expect(() => {
        logRefResolution(repoUrl, ref, sha);
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        'Warning: Failed to write to log: Error: Permission denied'
      );

      warnSpy.mockRestore();
    });

    it('should handle non-Error write exceptions gracefully', () => {
      const originalWriteFileSync = vi.mocked(writeFileSync);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock writeFileSync to throw a non-Error object
      originalWriteFileSync.mockImplementationOnce(() => {
        throw 'string error';
      });

      const repoUrl = 'https://github.com/user/repo.git';
      const ref = 'main';
      const sha = 'a1b2c3d4e5f6789012345678901234567890abcd';

      // This should not throw, but should warn
      expect(() => {
        logRefResolution(repoUrl, ref, sha);
      }).not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        'Warning: Failed to write to log: string error'
      );

      warnSpy.mockRestore();
    });
  });
});
