import { spawnSync } from 'node:child_process';
import { logRefResolution } from './log.js';

export interface GitCacheOptions {
  force?: boolean;
}

export interface ResolvedRef {
  ref: string;
  sha: string;
  resolvedAt: Date;
}

/**
 * Clone a Git repository as a mirror
 */
export function cloneMirror(repoUrl: string, targetPath: string): void {
  const result = spawnSync('git', ['clone', '--mirror', repoUrl, targetPath], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(
      `git clone --mirror failed with exit code ${result.status}`
    );
  }
}

/**
 * Update mirror repository and prune deleted branches
 */
export function updateAndPruneMirror(targetPath: string): void {
  const result = spawnSync(
    'git',
    ['-C', targetPath, 'remote', 'update', '--prune'],
    {
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `git remote update --prune failed with exit code ${result.status}`
    );
  }
}

/**
 * Repack a Git repository for optimization
 */
export function repackRepository(targetPath: string): void {
  const result = spawnSync('git', ['-C', targetPath, 'repack', '-ad'], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`git repack -ad failed with exit code ${result.status}`);
  }
}

/**
 * Resolve a Git reference (tag/branch) to a commit SHA using git ls-remote
 */
export function resolveRef(repoUrl: string, ref: string): string {
  try {
    const result = spawnSync('git', ['ls-remote', repoUrl, ref], {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    if (result.status !== 0) {
      throw new Error(
        `git ls-remote failed with exit code ${result.status}: ${result.stderr}`
      );
    }

    const output = result.stdout;
    const lines = output.trim().split('\n');
    if (lines.length === 0 || !lines[0]) {
      throw new Error(`Reference '${ref}' not found in repository ${repoUrl}`);
    }

    // git ls-remote output format: "<commit-sha>\t<ref-name>"
    const sha = lines[0].split('\t')[0];
    if (!sha || sha.length !== 40) {
      throw new Error(`Invalid commit SHA received for ref '${ref}': ${sha}`);
    }

    // Log the resolution for future reference
    logRefResolution(repoUrl, ref, sha);

    return sha;
  } catch (error) {
    throw new Error(
      `Failed to resolve ref '${ref}' for ${repoUrl}: ${String(error)}`
    );
  }
}
