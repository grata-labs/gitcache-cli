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
  // Handle install command differently (accepts variable arguments)
  if (name === 'install') {
    program
      .command(`${name} [args...]`)
      .description(config.description)
      /* c8 ignore start - CLI action callback is thin wrapper, tested via integration tests */
      .action((args: string[] = []) => {
        const instance = new config.command();
        instance.exec(args);
      });
    /* c8 ignore end */
  } else if (name === 'scan' || name === 'prepare') {
    // Handle scan and prepare commands (no repo argument required)
    const cmd = program.command(name).description(config.description);

    // Add options based on the command's static params
    if (config.command.params) {
      config.command.params.forEach((param: string) => {
        if (param === 'lockfile') {
          cmd.option(
            '-l, --lockfile <path>',
            'path to lockfile (default: package-lock.json)'
          );
        } else if (param === 'json') {
          cmd.option('--json', 'output in JSON format');
        } else if (param === 'force') {
          cmd.option('-f, --force', 'overwrite existing tarballs');
        } else if (param === 'verbose') {
          cmd.option('-v, --verbose', 'verbose output');
        }
      });
    }

    cmd
      /* c8 ignore start - CLI action callback is thin wrapper, tested via integration tests */
      .action(async (opts: Record<string, unknown>) => {
        const instance = new config.command();
        const result = instance.exec([], opts);

        // Handle both sync and async commands
        const finalResult = result instanceof Promise ? await result : result;

        if (finalResult !== undefined && finalResult !== null) {
          console.log(finalResult);
        }
      });
    /* c8 ignore end */
  } else {
    // Default command pattern for add/cache commands
    const cmd = program
      .command(`${name} <repo>`)
      .description(config.description);

    // Add options based on the command's static params
    if (config.command.params) {
      config.command.params.forEach((param: string) => {
        if (param === 'force') {
          cmd.option('-f, --force', 'overwrite existing mirror');
        } else if (param === 'ref') {
          cmd.option(
            '-r, --ref <reference>',
            'resolve git reference (tag/branch) to commit SHA'
          );
        } else if (param === 'build') {
          cmd.option('-b, --build', 'build and cache npm tarball');
        }
      });
    }

    cmd
      /* c8 ignore start - CLI action callback is thin wrapper, tested via integration tests */
      .action(async (repo: string, opts: Record<string, unknown>) => {
        const instance = new config.command();
        const result = instance.exec([repo], opts);

        // Handle both sync and async commands
        const finalResult = result instanceof Promise ? await result : result;

        if (finalResult !== undefined && finalResult !== null) {
          console.log(finalResult);
        }
      });
    /* c8 ignore end */
  }
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
        // Handle install aliases differently (accepts variable arguments)
        if (mainCommand === 'install') {
          program
            .command(`${alias} [args...]`, { hidden: true })
            .description(`Alias for '${mainCommand}' command`)
            /* c8 ignore start - CLI action callback is thin wrapper, tested via integration tests */
            .action((args: string[] = []) => {
              const instance = new config.command();
              instance.exec(args);
            })
            /* c8 ignore end */
            .addHelpText(
              'after',
              `\nNote: This is an alias for 'gitcache ${mainCommand}'. Use 'gitcache ${mainCommand} --help' for full documentation.`
            );
        } else {
          // Default alias pattern for add/cache commands
          const aliasCmd = program
            .command(`${alias} <repo>`, { hidden: true })
            .description(`Alias for '${mainCommand}' command`);

          // Add options based on the command's static params
          if (config.command.params) {
            config.command.params.forEach((param: string) => {
              if (param === 'force') {
                aliasCmd.option('-f, --force', 'overwrite existing mirror');
              } else if (param === 'ref') {
                aliasCmd.option(
                  '-r, --ref <reference>',
                  'resolve git reference (tag/branch) to commit SHA'
                );
              } else if (param === 'build') {
                aliasCmd.option('-b, --build', 'build and cache npm tarball');
              }
            });
          }

          aliasCmd
            /* c8 ignore start - CLI action callback is thin wrapper, tested via integration tests */
            .action(async (repo: string, opts: Record<string, unknown>) => {
              const instance = new config.command();
              const result = instance.exec([repo], opts);

              // Handle both sync and async commands
              const finalResult =
                result instanceof Promise ? await result : result;

              if (finalResult !== undefined && finalResult !== null) {
                console.log(finalResult);
              }
            })
            /* c8 ignore end */
            .addHelpText(
              'after',
              `\nNote: This is an alias for 'gitcache ${mainCommand}'. Use 'gitcache ${mainCommand} --help' for full documentation.`
            );
        }
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
