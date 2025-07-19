import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getCacheDir } from './utils/path.js';

export interface PruneOptions {
  maxSize?: string; // '5GB', '1TB', etc.
  dryRun?: boolean;
}

export interface CacheEntry {
  path: string;
  size: number;
  accessTime: Date;
  commitSha: string;
  platform: string;
}

export interface PruneResult {
  totalSize: number;
  entriesScanned: number;
  entriesDeleted: number;
  spaceSaved: number;
  maxSizeBytes: number;
  wasWithinLimit: boolean;
}

/**
 * Parse size string (e.g., '5GB', '1TB', '100MB') to bytes
 */
export function parseSizeToBytes(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(GB|TB|MB|KB|B)?$/i);
  if (!match) {
    throw new Error(
      `Invalid size format: ${sizeStr}. Use format like '5GB', '1TB', '100MB'`
    );
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toLowerCase();

  const multipliers = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
    tb: 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit as keyof typeof multipliers]);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const threshold = 1024;

  let size = bytes;
  let unitIndex = 0;

  while (size >= threshold && unitIndex < units.length - 1) {
    size /= threshold;
    unitIndex++;
  }

  return `${size.toFixed(size < 10 && unitIndex > 0 && size % 1 !== 0 ? 1 : 0)} ${units[unitIndex]}`;
}

/**
 * Calculate total cache size and return cache entries sorted by access time (LRU)
 * Falls back to modification time on Windows if access time is unreliable
 */
export function getCacheEntries(): CacheEntry[] {
  const cacheDir = getCacheDir();
  const tarballsDir = join(cacheDir, 'tarballs');

  if (!existsSync(tarballsDir)) {
    return [];
  }

  const entries: CacheEntry[] = [];
  const isWindows = process.platform === 'win32';

  try {
    const dirEntries = readdirSync(tarballsDir);

    for (const entry of dirEntries) {
      const entryPath = join(tarballsDir, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        // Check if this directory contains a tarball
        const tarballPath = join(entryPath, 'package.tgz');
        if (existsSync(tarballPath)) {
          const tarballStat = statSync(tarballPath);

          // Parse the directory name to extract commit SHA and platform
          // Format: {sha}-{platform}
          const parts = entry.split('-');
          if (parts.length >= 2) {
            const commitSha = parts[0];
            const platform = parts.slice(1).join('-'); // Handle platforms like 'darwin-arm64'

            // Validate that commitSha looks like a commit hash (at least 6 chars, alphanumeric)
            if (commitSha.length >= 6 && /^[a-f0-9]+$/i.test(commitSha)) {
              // Use access time for LRU, but fall back to modification time on Windows
              // if access time updates are disabled (common on newer Windows for performance)
              let lruTime = tarballStat.atime;

              // On Windows, if access time equals creation time, access time updates might be disabled
              // Fall back to modification time which is more reliable
              if (
                isWindows &&
                Math.abs(
                  tarballStat.atime.getTime() - tarballStat.birthtime.getTime()
                ) < 1000
              ) {
                lruTime = tarballStat.mtime;
              }

              entries.push({
                path: entryPath,
                size: tarballStat.size,
                accessTime: lruTime, // LRU time (access time or modification time fallback)
                commitSha,
                platform,
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not read cache directory: ${String(error)}`);
  }

  // Sort by LRU time (oldest first for eviction)
  return entries.sort(
    (a, b) => a.accessTime.getTime() - b.accessTime.getTime()
  );
}

/**
 * Calculate current cache size in bytes
 */
export function calculateCacheSize(): number {
  const entries = getCacheEntries();
  return entries.reduce((total, entry) => total + entry.size, 0);
}

/**
 * Prune cache to specified size limit using LRU eviction policy
 */
export function pruneCacheToSize(
  maxSize: string,
  options: PruneOptions = {}
): PruneResult {
  const maxSizeBytes = parseSizeToBytes(maxSize);
  const entries = getCacheEntries();
  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);

  const result: PruneResult = {
    totalSize,
    entriesScanned: entries.length,
    entriesDeleted: 0,
    spaceSaved: 0,
    maxSizeBytes,
    wasWithinLimit: totalSize <= maxSizeBytes,
  };

  // If already within limit, no need to prune
  if (totalSize <= maxSizeBytes) {
    return result;
  }

  let currentSize = totalSize;
  const entriesToDelete: CacheEntry[] = [];

  // Delete oldest entries until we're under the size limit
  for (const entry of entries) {
    if (currentSize <= maxSizeBytes) {
      break;
    }

    entriesToDelete.push(entry);
    currentSize -= entry.size;
  }

  // Actually delete entries unless it's a dry run
  if (!options.dryRun) {
    for (const entry of entriesToDelete) {
      try {
        rmSync(entry.path, { recursive: true, force: true });
        result.entriesDeleted++;
        result.spaceSaved += entry.size;
        /* c8 ignore start */
      } catch (error) {
        // Coverage bypass: Error handling for filesystem deletion failures
        // Reason: Testing filesystem permission errors requires complex OS-level mocking
        // that would make tests brittle and platform-dependent. This error path handles
        // rare edge cases like permission denied, disk full, or corrupted filesystem.
        console.warn(
          `Warning: Failed to delete cache entry ${entry.path}: ${String(error)}`
        );
      }
      /* c8 ignore stop */
    }
  } else {
    // For dry run, just count what would be deleted
    result.entriesDeleted = entriesToDelete.length;
    result.spaceSaved = entriesToDelete.reduce(
      (sum, entry) => sum + entry.size,
      0
    );
  }

  return result;
}
