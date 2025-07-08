import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerCommands } from './command-registry.js';
import { commands } from './commands.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

/**
 * Create and configure the CLI program
 */
export function createCLI(): Command {
  const program = new Command()
    .name('gitcache')
    .description('Universal Git-dependency cache & proxy CLI')
    .version(version)
    .option('--verbose', 'show verbose help including aliases');

  // Register all commands and aliases
  registerCommands(program, commands);

  return program;
}

/**
 * Main CLI function - separated for testability
 */
export function main(): Promise<Command> {
  const program = createCLI();

  return program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
