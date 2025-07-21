import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Prune } from '../../commands/prune.js';

describe('Prune Integration Tests', () => {
  let tempTestDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let prune: Prune;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempTestDir = join(
      tmpdir(),
      `gitcache-prune-integration-test-${Date.now()}`
    );
    mkdirSync(tempTestDir, { recursive: true });

    // Mock HOME environment variable to use our temp directory
    originalEnv = { ...process.env };
    process.env.HOME = tempTestDir;

    prune = new Prune();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up test directory
    if (existsSync(tempTestDir)) {
      rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  it('should handle empty cache directory gracefully', async () => {
    const result = await prune.exec([], {});
    expect(result).toBe('');
  });

  it('should prune cache entries when they exceed size limit', async () => {
    // Create cache directory structure
    const gitcacheDir = join(tempTestDir, '.gitcache');
    const tarballsDir = join(gitcacheDir, 'tarballs');
    mkdirSync(tarballsDir, { recursive: true });

    // Create test cache entries with valid commit hashes
    const entries = [
      {
        sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        platform: 'darwin-arm64',
        content: 'x'.repeat(800),
      },
      {
        sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        platform: 'linux-x64',
        content: 'x'.repeat(300),
      },
    ];

    // Create files with guaranteed different timestamps
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      const entryDir = join(tarballsDir, `${entry.sha}-${entry.platform}`);
      mkdirSync(entryDir, { recursive: true });
      const tarballFile = join(entryDir, 'package.tgz');
      writeFileSync(tarballFile, entry.content);

      // Set different access times to test LRU behavior
      // First entry (index 0) is older, second entry is newer
      const now = Date.now();
      const accessTime = new Date(now - (1 - index) * 60000); // 1 minute apart
      try {
        require('fs').utimesSync(tarballFile, accessTime, accessTime);
      } catch {
        // If utimes fails, use file creation order as fallback
        // Sleep to ensure different modification times
        if (index < entries.length - 1) {
          // Use a promise-based sleep to ensure timing
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    // Prune with 1KB limit (total size is ~1100 bytes, should delete oldest)
    await prune.exec([], { 'max-size': '1KB' });

    // Oldest entry should be deleted
    expect(
      existsSync(
        join(
          tarballsDir,
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-darwin-arm64'
        )
      )
    ).toBe(false);
    // Newer entry should remain
    expect(
      existsSync(
        join(tarballsDir, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-linux-x64')
      )
    ).toBe(true);
  });

  it('should not delete anything in dry run mode', async () => {
    // Create cache directory structure
    const gitcacheDir = join(tempTestDir, '.gitcache');
    const tarballsDir = join(gitcacheDir, 'tarballs');
    mkdirSync(tarballsDir, { recursive: true });

    // Create test cache entry that exceeds limit
    const entryDir = join(
      tarballsDir,
      'cccccccccccccccccccccccccccccccccccccccc-darwin-arm64'
    );
    mkdirSync(entryDir, { recursive: true });
    writeFileSync(join(entryDir, 'package.tgz'), 'x'.repeat(2000));

    // Dry run with 1KB limit
    await prune.exec([], { 'max-size': '1KB', 'dry-run': true });

    // Entry should still exist
    expect(existsSync(entryDir)).toBe(true);
  });

  it('should handle directories without valid tarball structure', async () => {
    // Create cache directory structure
    const gitcacheDir = join(tempTestDir, '.gitcache');
    const tarballsDir = join(gitcacheDir, 'tarballs');
    mkdirSync(tarballsDir, { recursive: true });

    // Create directory without package.tgz
    const emptyDir = join(
      tarballsDir,
      'dddddddddddddddddddddddddddddddddddddddd-darwin-arm64'
    );
    mkdirSync(emptyDir, { recursive: true });

    // Create directory with invalid name format
    const invalidDir = join(tarballsDir, 'invalid-name');
    mkdirSync(invalidDir, { recursive: true });
    writeFileSync(join(invalidDir, 'package.tgz'), 'content');

    // Should complete without errors
    const result = await prune.exec([], {});
    expect(result).toBe('');
  });

  it('should handle platforms with multiple dashes in name', async () => {
    // Create cache directory structure
    const gitcacheDir = join(tempTestDir, '.gitcache');
    const tarballsDir = join(gitcacheDir, 'tarballs');
    mkdirSync(tarballsDir, { recursive: true });

    // Create entry with complex platform name
    const entryDir = join(
      tarballsDir,
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee-darwin-arm64-v8a'
    );
    mkdirSync(entryDir, { recursive: true });
    writeFileSync(join(entryDir, 'package.tgz'), 'x'.repeat(2000));

    // Prune with 1KB limit
    await prune.exec([], { 'max-size': '1KB' });

    // Entry should be deleted
    expect(existsSync(entryDir)).toBe(false);
  });

  it('should work with verbose output showing cache entries', async () => {
    // Create cache directory structure
    const gitcacheDir = join(tempTestDir, '.gitcache');
    const tarballsDir = join(gitcacheDir, 'tarballs');
    mkdirSync(tarballsDir, { recursive: true });

    // Create cache entry
    const entryDir = join(
      tarballsDir,
      'ffffffffffffffffffffffffffffffffffffffff-darwin-arm64'
    );
    mkdirSync(entryDir, { recursive: true });
    writeFileSync(join(entryDir, 'package.tgz'), 'x'.repeat(100));

    // Run with verbose output
    const result = await prune.exec([], { verbose: true });
    expect(result).toBe('');
  });

  it('should handle Windows access time behavior gracefully', async () => {
    // Create cache directory structure
    const gitcacheDir = join(tempTestDir, '.gitcache');
    const tarballsDir = join(gitcacheDir, 'tarballs');
    mkdirSync(tarballsDir, { recursive: true });

    // Create test cache entries to simulate Windows behavior
    const entries = [
      {
        sha: '1111111111111111111111111111111111111111',
        platform: 'win32-x64',
        content: 'x'.repeat(600),
      },
      {
        sha: '2222222222222222222222222222222222222222',
        platform: 'win32-x64',
        content: 'x'.repeat(500),
      },
    ];

    const now = Date.now();
    entries.forEach((entry, index) => {
      const entryDir = join(tarballsDir, `${entry.sha}-${entry.platform}`);
      mkdirSync(entryDir, { recursive: true });
      writeFileSync(join(entryDir, 'package.tgz'), entry.content);

      // Simulate Windows scenario where access time might equal creation time
      // by setting modification time to be different to test fallback behavior
      try {
        const modTime = new Date(now - (2 - index) * 60000); // Different mod times
        require('fs').utimesSync(entryDir, modTime, modTime); // Set both atime and mtime to same value
      } catch {
        // Ignore if file system doesn't support time setting
      }
    });

    // Prune with 1KB limit - should still work correctly even with Windows time behavior
    await prune.exec([], { 'max-size': '1KB' });

    // At least one entry should be deleted (total is >1KB)
    const remainingEntries = [
      existsSync(
        join(tarballsDir, '1111111111111111111111111111111111111111-win32-x64')
      ),
      existsSync(
        join(tarballsDir, '2222222222222222222222222222222222222222-win32-x64')
      ),
    ].filter(Boolean);

    expect(remainingEntries.length).toBeLessThan(2); // At least one should be deleted
  });
});
