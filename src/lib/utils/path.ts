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
 * Normalize a repository URL for consistent cache keying
 * - Respects user's protocol choice (SSH vs HTTPS)
 * - Canonicalizes to <host>/<owner>/<repo> format
 * - Removes trailing slashes and .git extensions
 * - Handles GitHub shortcuts (github:user/repo → https by default)
 */
export function normalizeRepoUrl(repoUrl: string): string {
  let url = repoUrl.trim().toLowerCase();

  // Handle GitHub shortcut - default to HTTPS (sane default)
  if (url.startsWith('github:')) {
    url = url.replace('github:', 'https://github.com/');
  }

  // Normalize SSH format variations while preserving SSH protocol
  if (url.includes('@') || url.startsWith('git+ssh:')) {
    // git@github.com:user/repo.git → ssh://git@github.com/user/repo
    url = url.replace(/^git@([^:]+):/, 'ssh://git@$1/');
    // git+ssh://... → ssh://...
    url = url.replace(/^git\+ssh:/, 'ssh:');
  }

  // Normalize HTTPS format variations while preserving HTTPS protocol
  if (url.startsWith('git+https:')) {
    // git+https://... → https://...
    url = url.replace(/^git\+https:/, 'https:');
  }

  // Remove trailing slashes first (to avoid .git/ edge case)
  url = url.replace(/\/+$/, '');

  // Remove trailing .git (after slashes)
  url = url.replace(/\.git$/, '');

  return url;
}

/**
 * Generate a safe filename from a normalized repository URL using SHA-256 hash
 * Uses canonical <host>/<owner>/<repo> format so SSH vs HTTPS don't duplicate cache entries
 */
export function getRepoPath(repoUrl: string): string {
  const normalized = normalizeRepoUrl(repoUrl);
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Get the full target path for a cached repository
 */
export function getTargetPath(repoUrl: string): string {
  return join(getCacheDir(), getRepoPath(repoUrl));
}
