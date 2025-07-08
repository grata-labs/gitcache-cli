#!/usr/bin/env node
/**
 * GitCache CLI - Universal Git-dependency cache & proxy
 * 
 * Provides commands for caching Git repositories locally and syncing
 * with team-shared GitCache proxies.
 */

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

/**
 * Cache a Git repository to the local cache directory.
 * 
 * @param repo - The Git repository URL to cache
 * @param opts - Cache options
 * @param opts.force - Whether to repack the repository after caching
 * @returns The target directory path where the repo was cached
 */
export function cacheRepository(repo: string, opts: { force?: boolean } = {}): string {
  const target = `${process.env.HOME}/.gitcache/${encodeURIComponent(repo)}`;

  execSync(`git clone --mirror ${repo} "${target}"`, { stdio: 'inherit' });

  if (opts.force) {
    execSync(`git -C "${target}" repack -ad`, { stdio: 'inherit' });
  }

  return target;
}

/**
 * Main CLI function - separated for testability
 */
export function main() {
  const program = new Command()
    .name('gitcache')
    .description('Universal Git-dependency cache & proxy CLI')
    .version(version);

  /**
   * Main command handler for caching Git repositories.
   * 
   * Creates a mirror of the specified repository in ~/.gitcache/ using
   * git clone --mirror. The target directory is based on the URL-encoded
   * repository URL to avoid conflicts.
   * 
   * @param repo - The Git repository URL to cache
   * @param opts - Command options
   * @param opts.force - Whether to repack the repository after caching
   */
  program
    .command('cache <repo>')
    .description('Mirror a repository into your local cache')
    .option('-f, --force', 'overwrite existing mirror')
    .action((repo: string, opts: { force?: boolean }) => {
      cacheRepository(repo, opts);
    });

  return program.parseAsync(process.argv).catch(err => {
    /* c8 ignore start */
    console.error(err);
    process.exit(1);
    /* c8 ignore stop */
  });
}

// Only run CLI if this file is executed directly
/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
/* c8 ignore stop */
