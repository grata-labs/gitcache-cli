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
    const target = `${process.env.HOME}/.gitcache/${encodeURIComponent(repo)}`;

    execSync(`git clone --mirror ${repo} "${target}"`, { stdio: 'inherit' });

    if (opts.force) {
      execSync(`git -C "${target}" repack -ad`, { stdio: 'inherit' });
    }
  });

program.parseAsync(process.argv).catch(err => {
  console.error(err);
  process.exit(1);
});
