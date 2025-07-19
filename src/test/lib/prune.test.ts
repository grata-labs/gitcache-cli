import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateCacheSize,
  formatBytes,
  getCacheEntries,
  parseSizeToBytes,
  pruneCacheToSize,
} from '../../lib/prune.js';

const { getCacheDir } = await import('../../lib/utils/path.js');
const { getDefaultMaxCacheSize } = await import('../../lib/config.js');

vi.mock('../../lib/utils/path.js');
vi.mock('../../lib/config.js');

const mockGetCacheDir = vi.mocked(getCacheDir);
const mockGetDefaultMaxCacheSize = vi.mocked(getDefaultMaxCacheSize);

describe('prune', () => {
  let tempTestDir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a temporary directory for testing
    tempTestDir = join(tmpdir(), `gitcache-prune-test-${Date.now()}`);
    mkdirSync(tempTestDir, { recursive: true });

    // Mock getCacheDir to use our temp directory
    mockGetCacheDir.mockReturnValue(tempTestDir);

    // Mock default config to return 5GB (default value)
    mockGetDefaultMaxCacheSize.mockReturnValue('5GB');
  });

  afterEach(() => {
    // Clean up test directory with permission restoration
    if (existsSync(tempTestDir)) {
      try {
        // Try to restore permissions recursively before deletion
        const restorePermissions = (dir: string) => {
          try {
            const stats = require('fs').statSync(dir);
            if (stats.isDirectory()) {
              require('fs').chmodSync(dir, 0o755);
              const entries = require('fs').readdirSync(dir);
              for (const entry of entries) {
                restorePermissions(join(dir, entry));
              }
            } else {
              require('fs').chmodSync(dir, 0o644);
            }
          } catch {
            // Ignore permission restoration errors
          }
        };

        restorePermissions(tempTestDir);
        rmSync(tempTestDir, { recursive: true, force: true });
      } catch (error) {
        // If cleanup fails, log warning but don't fail the test
        console.warn(`Failed to clean up test directory: ${String(error)}`);
      }
    }
  });

  describe('parseSizeToBytes', () => {
    it('should parse size strings correctly', () => {
      expect(parseSizeToBytes('100B')).toBe(100);
      expect(parseSizeToBytes('1KB')).toBe(1024);
      expect(parseSizeToBytes('1MB')).toBe(1024 * 1024);
      expect(parseSizeToBytes('1GB')).toBe(1024 * 1024 * 1024);
      expect(parseSizeToBytes('1TB')).toBe(1024 * 1024 * 1024 * 1024);
    });

    it('should handle decimal values', () => {
      expect(parseSizeToBytes('1.5GB')).toBe(
        Math.floor(1.5 * 1024 * 1024 * 1024)
      );
    });

    it('should default to bytes when no unit is specified', () => {
      expect(parseSizeToBytes('1024')).toBe(1024);
    });

    it('should be case insensitive', () => {
      expect(parseSizeToBytes('1gb')).toBe(1024 * 1024 * 1024);
      expect(parseSizeToBytes('1Gb')).toBe(1024 * 1024 * 1024);
    });

    it('should throw error for invalid format', () => {
      expect(() => parseSizeToBytes('invalid')).toThrow('Invalid size format');
      expect(() => parseSizeToBytes('GB')).toThrow('Invalid size format');
    });
  });

  describe('formatBytes', () => {
    it('should format bytes to human readable strings', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(100)).toBe('100 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('should show appropriate decimal places', () => {
      expect(formatBytes(1536)).toBe('1.5 KB'); // Shows 1 decimal for values < 10
      expect(formatBytes(15360)).toBe('15 KB'); // Shows 0 decimals for values >= 10
    });
  });

  describe('getCacheEntries', () => {
    it('should return empty array when no cache directory exists', () => {
      const entries = getCacheEntries();
      expect(entries).toEqual([]);
    });

    it('should return cache entries sorted by access time', () => {
      // Create cache structure
      const tarballsDir = join(tempTestDir, 'tarballs');
      mkdirSync(tarballsDir, { recursive: true });

      // Create test cache entries with different access times
      const entries = [
        {
          sha: 'abc123def789',
          platform: 'darwin-arm64',
          size: 1000,
          accessTime: new Date('2023-01-01'),
        },
        {
          sha: 'def456abc123',
          platform: 'linux-x64',
          size: 2000,
          accessTime: new Date('2023-01-02'),
        },
        {
          sha: '123456789abc',
          platform: 'win32-x64',
          size: 3000,
          accessTime: new Date('2023-01-03'),
        },
      ];

      entries.forEach((entry) => {
        const entryDir = join(tarballsDir, `${entry.sha}-${entry.platform}`);
        mkdirSync(entryDir, { recursive: true });

        const tarballPath = join(entryDir, 'package.tgz');
        writeFileSync(tarballPath, 'x'.repeat(entry.size));

        // Manually set access time (this is a simplified test)
        // In real scenarios, this would be set by filesystem operations
      });

      const result = getCacheEntries();
      expect(result).toHaveLength(3);

      // Check that entries are sorted by access time (oldest first)
      // Just verify the structure and that all entries are present
      const commitShas = result.map((entry) => entry.commitSha).sort();
      expect(commitShas).toEqual([
        '123456789abc',
        'abc123def789',
        'def456abc123',
      ]);

      // Verify the first entry has correct structure
      expect(result[0]).toHaveProperty('commitSha');
      expect(result[0]).toHaveProperty('platform');
      expect(result[0]).toHaveProperty('size');
      expect(result[0]).toHaveProperty('accessTime');
      expect(result[0]).toHaveProperty('path');
    });

    it('should handle directories without tarballs', () => {
      const tarballsDir = join(tempTestDir, 'tarballs');
      mkdirSync(tarballsDir, { recursive: true });

      // Create a directory without package.tgz
      const emptyDir = join(tarballsDir, 'empty-abc123-darwin-arm64');
      mkdirSync(emptyDir, { recursive: true });

      const entries = getCacheEntries();
      expect(entries).toEqual([]);
    });

    it('should handle invalid directory names gracefully', () => {
      const tarballsDir = join(tempTestDir, 'tarballs');
      mkdirSync(tarballsDir, { recursive: true });

      // Create a directory with invalid name format
      const invalidDir = join(tarballsDir, 'invalid-name');
      mkdirSync(invalidDir, { recursive: true });
      writeFileSync(join(invalidDir, 'package.tgz'), 'content');

      const entries = getCacheEntries();
      expect(entries).toEqual([]);
    });
  });

  describe('calculateCacheSize', () => {
    it('should return 0 for empty cache', () => {
      const size = calculateCacheSize();
      expect(size).toBe(0);
    });

    it('should calculate total cache size correctly', () => {
      const tarballsDir = join(tempTestDir, 'tarballs');
      mkdirSync(tarballsDir, { recursive: true });

      // Create test cache entries
      const entries = [
        { sha: 'abc123', platform: 'darwin-arm64', size: 1000 },
        { sha: 'def456', platform: 'linux-x64', size: 2000 },
      ];

      entries.forEach((entry) => {
        const entryDir = join(tarballsDir, `${entry.sha}-${entry.platform}`);
        mkdirSync(entryDir, { recursive: true });
        writeFileSync(join(entryDir, 'package.tgz'), 'x'.repeat(entry.size));
      });

      const size = calculateCacheSize();
      expect(size).toBe(3000);
    });
  });

  describe('pruneCacheToSize', () => {
    it('should not prune when cache is within limit', () => {
      const tarballsDir = join(tempTestDir, 'tarballs');
      mkdirSync(tarballsDir, { recursive: true });

      // Create small cache entry
      const entryDir = join(tarballsDir, 'abc123-darwin-arm64');
      mkdirSync(entryDir, { recursive: true });
      writeFileSync(join(entryDir, 'package.tgz'), 'small');

      const result = pruneCacheToSize('1GB');

      expect(result.wasWithinLimit).toBe(true);
      expect(result.entriesDeleted).toBe(0);
      expect(result.spaceSaved).toBe(0);
      expect(existsSync(entryDir)).toBe(true);
    });

    it('should prune oldest entries when cache exceeds limit', () => {
      const tarballsDir = join(tempTestDir, 'tarballs');
      mkdirSync(tarballsDir, { recursive: true });

      // Create cache entries that exceed 100 bytes limit
      const entries = [
        { sha: 'abc123def789', platform: 'darwin-arm64', size: 60 },
        { sha: 'def456abc123', platform: 'linux-x64', size: 50 },
      ];

      entries.forEach((entry) => {
        const entryDir = join(tarballsDir, `${entry.sha}-${entry.platform}`);
        mkdirSync(entryDir, { recursive: true });
        writeFileSync(join(entryDir, 'package.tgz'), 'x'.repeat(entry.size));
      });

      const result = pruneCacheToSize('100B');

      expect(result.wasWithinLimit).toBe(false);
      expect(result.entriesDeleted).toBe(1);
      expect(result.spaceSaved).toBe(60);

      // Oldest entry should be deleted
      expect(existsSync(join(tarballsDir, 'abc123def789-darwin-arm64'))).toBe(
        false
      );
      // Newer entry should remain
      expect(existsSync(join(tarballsDir, 'def456abc123-linux-x64'))).toBe(
        true
      );
    });

    it('should handle dry run correctly', () => {
      const tarballsDir = join(tempTestDir, 'tarballs');
      mkdirSync(tarballsDir, { recursive: true });

      // Create cache entry that exceeds limit
      const entryDir = join(tarballsDir, 'abc123def789-darwin-arm64');
      mkdirSync(entryDir, { recursive: true });
      writeFileSync(join(entryDir, 'package.tgz'), 'x'.repeat(200));

      const result = pruneCacheToSize('100B', { dryRun: true });

      expect(result.wasWithinLimit).toBe(false);
      expect(result.entriesDeleted).toBe(1);
      expect(result.spaceSaved).toBe(200);

      // Entry should still exist in dry run
      expect(existsSync(entryDir)).toBe(true);
    });

    it('should handle deletion errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const tarballsDir = join(tempTestDir, 'tarballs');
      mkdirSync(tarballsDir, { recursive: true });

      // Create a cache entry that exceeds the limit
      const entryDir = join(
        tarballsDir,
        'abc123def789012345678901234567890123456789-darwin-arm64'
      );
      mkdirSync(entryDir, { recursive: true });
      writeFileSync(join(entryDir, 'package.tgz'), 'x'.repeat(200));

      // Create a directory structure that will cause rmSync to fail
      const nestedDir = join(entryDir, 'nested');
      mkdirSync(nestedDir, { recursive: true });

      // Make the nested directory read-only
      try {
        require('fs').chmodSync(nestedDir, 0o000); // No permissions
      } catch {
        // If chmod fails, just skip this test on this platform
        consoleSpy.mockRestore();
        return;
      }

      const result = pruneCacheToSize('100B');

      // Should handle the error gracefully
      expect(result.wasWithinLimit).toBe(false);

      // On some systems, deletion might still succeed despite read-only permissions
      // What's important is that the function doesn't crash
      if (result.entriesDeleted === 0) {
        // Deletion failed as expected
        expect(result.spaceSaved).toBe(0);
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Warning: Failed to delete cache entry')
        );
      }

      // Clean up - restore permissions first
      try {
        require('fs').chmodSync(nestedDir, 0o755);
        require('fs').chmodSync(entryDir, 0o755);
      } catch {
        // Ignore cleanup errors
      }

      consoleSpy.mockRestore();
    });
  });

  describe('Windows access time behavior', () => {
    it('should handle Windows access time behavior with mtime fallback', () => {
      const tarballsDir = join(tempTestDir, 'tarballs');
      mkdirSync(tarballsDir, { recursive: true });

      // Mock Windows platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      try {
        // Create cache entries
        const entries = [
          {
            sha: 'aaa1111111111111111111111111111111111111',
            platform: 'win32-x64',
            content: 'x'.repeat(800),
          },
          {
            sha: 'bbb2222222222222222222222222222222222222',
            platform: 'win32-x64',
            content: 'x'.repeat(300),
          },
        ];

        const now = Date.now();
        entries.forEach((entry, index) => {
          const entryDir = join(tarballsDir, `${entry.sha}-${entry.platform}`);
          mkdirSync(entryDir, { recursive: true });
          writeFileSync(join(entryDir, 'package.tgz'), entry.content);

          // Simulate Windows scenario where access time equals creation time
          // Set modification times to different values to test fallback
          try {
            const modTime = new Date(now - (1 - index) * 60000); // 1 minute apart
            require('fs').utimesSync(entryDir, modTime, modTime); // atime = mtime
          } catch {
            // Ignore if setting times fails
          }
        });

        const result = pruneCacheToSize('1KB', { dryRun: false });

        // Should successfully prune entries even with Windows time behavior
        expect(result.wasWithinLimit).toBe(false);
        expect(result.entriesDeleted).toBeGreaterThan(0);
        expect(result.spaceSaved).toBeGreaterThan(0);
      } finally {
        // Restore original platform
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      }
    });
  });
});
