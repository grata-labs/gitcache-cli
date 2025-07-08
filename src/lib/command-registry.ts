import { Command } from 'commander';
import type { CommandConfig } from './types.js';

/**
 * Check if verbose help is requested
 */
function isVerboseHelp(): boolean {
  return process.argv.includes('--verbose');
}

/**
 * Register a main command with commander
 */
function registerCommand(
  program: Command,
  name: string,
  config: CommandConfig
): void {
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
 * Add alias help text to the program
 */
function addAliasHelpText(
  program: Command,
  commands: Record<string, CommandConfig>
): void {
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
    program.addHelpText(
      'after',
      '\nUse --verbose to see available command aliases.'
    );
  }
}

/**
 * Register all commands and aliases with the commander program
 */
export function registerCommands(
  program: Command,
  commands: Record<string, CommandConfig>
): void {
  // Register all main commands
  Object.entries(commands).forEach(([name, config]) => {
    registerCommand(program, name, config);
  });

  registerAliases(program, commands);
  addAliasHelpText(program, commands);
}
