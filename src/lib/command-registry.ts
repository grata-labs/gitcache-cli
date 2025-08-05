import { Command } from 'commander';
import type { CommandConfig, CommandArguments } from './types.js';
import { addParametersToCommand } from './parameter-options.js';

/**
 * Check if verbose help is requested
 */
function isVerboseHelp(): boolean {
  return process.argv.includes('--verbose');
}

/**
 * Create a command pattern string based on argument specification
 */
function createCommandPattern(
  name: string,
  argumentSpec?: CommandArguments
): string {
  if (!argumentSpec || argumentSpec.type === 'none') {
    return name;
  }

  if (argumentSpec.type === 'required') {
    return `${name} <${argumentSpec.name}>`;
  }

  if (argumentSpec.type === 'variadic') {
    return `${name} [${argumentSpec.name}...]`;
  }

  return name;
}

/**
 * Register a main command with commander
 */
function registerCommand(
  program: Command,
  name: string,
  config: CommandConfig
): void {
  const argumentSpec = config.command.argumentSpec;
  const pattern = createCommandPattern(name, argumentSpec);

  const cmd = program.command(pattern).description(config.description);

  // Add options based on the command's static params
  if (config.command.params) {
    addParametersToCommand(cmd, config.command.params);
  }

  cmd
    /* c8 ignore start - CLI action callback is thin wrapper, tested via integration tests */
    .action(async (...args: unknown[]) => {
      try {
        // Parse arguments based on command type
        let commandArgs: string[] = [];
        let opts: Record<string, unknown> = {};

        if (!argumentSpec || argumentSpec.type === 'none') {
          // No positional arguments - last argument is options
          opts = (args[0] as Record<string, unknown>) || {};
        } else if (argumentSpec.type === 'required') {
          // Single required argument - first is the argument, second is options
          const [requiredArg, options] = args;
          commandArgs = [requiredArg as string];
          opts = (options as Record<string, unknown>) || {};
        } else if (argumentSpec.type === 'variadic') {
          // Variadic arguments - first is array of args, second is options
          const [variadicArgs, options] = args;
          commandArgs = (variadicArgs as string[]) || [];
          opts = (options as Record<string, unknown>) || {};
        }

        const instance = new config.command();
        const result = instance.exec(commandArgs, opts);

        // Handle both sync and async commands
        const finalResult = result instanceof Promise ? await result : result;

        if (finalResult !== undefined && finalResult !== null) {
          console.log(finalResult);
        }
      } catch (error) {
        // Handle errors gracefully - show clean error message for user errors
        if (error instanceof Error) {
          console.error(error.message);
        } else {
          console.error('An unexpected error occurred:', String(error));
        }
        process.exit(1);
      }
    });
  /* c8 ignore end */
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
        const argumentSpec = config.command.argumentSpec;
        const pattern = createCommandPattern(alias, argumentSpec);

        const aliasCmd = program
          .command(pattern, { hidden: true })
          .description(`Alias for '${mainCommand}' command`);

        // Add options based on the command's static params
        if (config.command.params) {
          addParametersToCommand(aliasCmd, config.command.params);
        }

        aliasCmd
          /* c8 ignore start - CLI action callback is thin wrapper, tested via integration tests */
          .action(async (...args: unknown[]) => {
            try {
              // Parse arguments based on command type (same logic as main commands)
              let commandArgs: string[] = [];
              let opts: Record<string, unknown> = {};

              if (!argumentSpec || argumentSpec.type === 'none') {
                opts = (args[0] as Record<string, unknown>) || {};
              } else if (argumentSpec.type === 'required') {
                const [requiredArg, options] = args;
                commandArgs = [requiredArg as string];
                opts = (options as Record<string, unknown>) || {};
              } else if (argumentSpec.type === 'variadic') {
                const [variadicArgs, options] = args;
                commandArgs = (variadicArgs as string[]) || [];
                opts = (options as Record<string, unknown>) || {};
              }

              const instance = new config.command();
              const result = instance.exec(commandArgs, opts);

              // Handle both sync and async commands
              const finalResult =
                result instanceof Promise ? await result : result;

              if (finalResult !== undefined && finalResult !== null) {
                console.log(finalResult);
              }
            } catch (error) {
              // Handle errors gracefully - show clean error message for user errors
              if (error instanceof Error) {
                console.error(error.message);
              } else {
                console.error('An unexpected error occurred:', String(error));
              }
              process.exit(1);
            }
          })
          /* c8 ignore end */
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
