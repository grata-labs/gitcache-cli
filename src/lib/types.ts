/**
 * Common types for the GitCache CLI
 */

/**
 * Command argument type - defines how the command accepts arguments
 */
export type CommandArguments =
  | { type: 'required'; name: string } // <repo>
  | { type: 'variadic'; name: string } // [args...]
  | { type: 'none' }; // no arguments

/**
 * Command class interface
 */
export interface CommandClass {
  new (): {
    exec: (args: string[], opts?: Record<string, unknown>) => unknown;
  };
  description: string;
  commandName: string;
  params?: string[];
  argumentSpec?: CommandArguments;
}

/**
 * Command configuration for registration
 */
export interface CommandConfig {
  command: CommandClass;
  description: string;
  aliases?: string[];
}

/**
 * Git cache options
 */
export interface GitCacheOptions {
  force?: boolean;
}
