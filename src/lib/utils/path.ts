import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Get the cache directory path
 */
export function getCacheDir(): string {
  const homeDir = process.env.HOME;
  if (!homeDir) {
    throw new Error('HOME environment variable is not set');
  }
  return join(homeDir, '.gitcache');
}

/**
 * Generate a safe filename from a repository URL using SHA-256 hash
 */
export function getRepoPath(repoUrl: string): string {
  return createHash('sha256').update(repoUrl).digest('hex');
}

/**
 * Get the full target path for a cached repository
 */
export function getTargetPath(repoUrl: string): string {
  return join(getCacheDir(), getRepoPath(repoUrl));
}
