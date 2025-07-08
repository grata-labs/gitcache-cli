#!/usr/bin/env node
/**
 * GitCache CLI - Universal Git-dependency cache & proxy
 *
 * Provides commands for caching Git repositories locally and syncing
 * with team-shared GitCache proxies.
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { Cache } from './commands/cache.js';

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
export function cacheRepository(
  repo: string,
  opts: { force?: boolean } = {}
): string {
  const cache = new Cache();
  return cache.exec([repo], opts) as string;
}

/**
 * Main CLI function - separated for testability
 */
export function main() {
  const program = new Command()
    .name('gitcache')
    .description('Universal Git-dependency cache & proxy CLI')
    .version(version);

  // Register cache command
  program
    .command('cache <repo>')
    .description(Cache.description)
    .option('-f, --force', 'overwrite existing mirror')
    .action((repo: string, opts: { force?: boolean }) => {
      const cache = new Cache();
      cache.exec([repo], opts);
    });

  return program.parseAsync(process.argv).catch((err) => {
    /* c8 ignore start */
    console.error(err);
    process.exit(1);
    /* c8 ignore stop */
  });
}

// Only run CLI if this file is executed directly
/* c8 ignore start */
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/gitcache')
) {
  main();
}
/* c8 ignore stop */
