import { execSync } from 'node:child_process';

export interface GitCacheOptions {
  force?: boolean;
}

/**
 * Clone a Git repository as a mirror
 */
export function cloneMirror(repoUrl: string, targetPath: string): void {
  execSync(`git clone --mirror ${repoUrl} "${targetPath}"`, {
    stdio: 'inherit',
  });
}

/**
 * Update mirror repository and prune deleted branches
 */
export function updateAndPruneMirror(targetPath: string): void {
  execSync(`git -C "${targetPath}" remote update --prune`, {
    stdio: 'inherit',
  });
}

/**
 * Repack a Git repository for optimization
 */
export function repackRepository(targetPath: string): void {
  execSync(`git -C "${targetPath}" repack -ad`, { stdio: 'inherit' });
}
