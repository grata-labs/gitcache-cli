/**
 * Common types for the GitCache CLI
 */

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
