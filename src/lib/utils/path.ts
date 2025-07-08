import { join } from 'node:path';

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
 * Generate a safe filename from a repository URL
 */
export function getRepoPath(repoUrl: string): string {
  return encodeURIComponent(repoUrl);
}

/**
 * Get the full target path for a cached repository
 */
export function getTargetPath(repoUrl: string): string {
  return join(getCacheDir(), getRepoPath(repoUrl));
}
