#!/usr/bin/env node
/**
 * GitCache CLI - Universal Git-dependency cache & proxy
 *
 * Provides commands for caching Git repositories locally and syncing
 * with team-shared GitCache proxies.
 */

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { Add } from './commands/add.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

/**
 * Command alias configuration
 */
type CommandConfig = {
  command: new () => {
    exec: (args: string[], opts?: Record<string, unknown>) => unknown;
  };
  description: string;
  aliases?: string[];
};

const commands: Record<string, CommandConfig> = {
  add: {
    command: Add,
    description: Add.description,
    aliases: ['cache'],
  },
};

/**
 * Register a command and its aliases with commander
 */
function registerCommand(
  program: Command,
  name: string,
  config: CommandConfig
): void {
  // Register the main command
  program
    .command(`${name} <repo>`)
    .description(config.description)
    .option('-f, --force', 'overwrite existing mirror')
    .action((repo: string, opts: { force?: boolean }) => {
      const instance = new config.command();
      instance.exec([repo], opts);
    });
}

/**
 * Register aliases as hidden commands (they won't show in main help)
 */
function registerAliases(
  program: Command,
  commands: Record<string, CommandConfig>
): void {
  Object.entries(commands).forEach(([mainCommand, config]) => {
    if (config.aliases) {
      config.aliases.forEach((alias) => {
        program
          .command(`${alias} <repo>`, { hidden: true })
          .description(`Alias for '${mainCommand}' command`)
          .option('-f, --force', 'overwrite existing mirror')
          .action((repo: string, opts: { force?: boolean }) => {
            const instance = new config.command();
            instance.exec([repo], opts);
          })
          .addHelpText(
            'after',
            `\nNote: This is an alias for 'gitcache ${mainCommand}'. Use 'gitcache ${mainCommand} --help' for full documentation.`
          );
      });
    }
  });
}

/**
 * Check if verbose help is requested
 */
function isVerboseHelp(): boolean {
  return process.argv.includes('--verbose');
}

/**
 * Add a Git repository to the local cache directory.
 *
 * @param repo - The Git repository URL to add
 * @param opts - Add options
 * @param opts.force - Whether to repack the repository after adding
 * @returns The target directory path where the repo was cached
 */
export function addRepository(
  repo: string,
  opts: { force?: boolean } = {}
): string {
  const add = new Add();
  return add.exec([repo], opts) as string;
}

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
  return addRepository(repo, opts);
}

/**
 * Main CLI function - separated for testability
 */
export function main() {
  const program = new Command()
    .name('gitcache')
    .description('Universal Git-dependency cache & proxy CLI')
    .version(version)
    .option('--verbose', 'show verbose help including aliases');

  // Register all main commands
  Object.entries(commands).forEach(([name, config]) => {
    registerCommand(program, name, config);
  });

  // Register aliases (hidden from main help)
  registerAliases(program, commands);

  // Add custom help text for aliases only if verbose mode is requested
  if (isVerboseHelp()) {
    const aliasInfo = Object.entries(commands)
      .filter(([, config]) => config.aliases && config.aliases.length > 0)
      .map(([name, config]) => `  ${config.aliases!.join(', ')} -> ${name}`)
      .join('\n');

    if (aliasInfo) {
      program.addHelpText(
        'after',
        `\nAliases:\n${aliasInfo}\n\nUse --verbose to see aliases in help output.`
      );
    }
  } else {
    // Add hint about verbose mode for aliases
    program.addHelpText(
      'after',
      '\nUse --verbose to see available command aliases.'
    );
  }

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
