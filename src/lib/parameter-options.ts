/**
 * CLI parameter configuration definitions
 */

/**
 * Parameter configuration for CLI options
 */
export interface ParameterConfig {
  flags: string;
  description: string;
}

/**
 * Map of parameter names to their CLI option configuration
 */
export const PARAMETER_OPTIONS: Record<string, ParameterConfig> = {
  lockfile: {
    flags: '-l, --lockfile <path>',
    description: 'path to lockfile (default: package-lock.json)',
  },
  json: {
    flags: '--json',
    description: 'output in JSON format',
  },
  force: {
    flags: '-f, --force',
    description: 'overwrite existing mirror/tarballs',
  },
  verbose: {
    flags: '-v, --verbose',
    description: 'verbose output',
  },
  'max-size': {
    flags: '--max-size <size>',
    description: 'maximum cache size (default: 5GB)',
  },
  'dry-run': {
    flags: '--dry-run',
    description: 'preview what would be deleted without actually deleting',
  },
  'set-default': {
    flags: '--set-default',
    description: 'save the specified max-size as the new default',
  },
  get: {
    flags: '--get <key>',
    description: 'get configuration value',
  },
  set: {
    flags: '--set <key=value>',
    description: 'set configuration value',
  },
  list: {
    flags: '--list',
    description: 'list all configuration values',
  },
  ref: {
    flags: '-r, --ref <reference>',
    description: 'resolve git reference (tag/branch) to commit SHA',
  },
  build: {
    flags: '-b, --build',
    description: 'build and cache npm tarball',
  },
  org: {
    flags: '--org <organization>',
    description: 'organization name for registry access',
  },
  ci: {
    flags: '--ci',
    description: 'configure for CI environment',
  },
  token: {
    flags: '--token <token>',
    description: 'CI token for authentication',
  },
};

/**
 * Add parameters to a command based on the parameter configuration
 */
import { Command } from 'commander';

export function addParametersToCommand(cmd: Command, params: string[]): void {
  params.forEach((param) => {
    const config = PARAMETER_OPTIONS[param];
    if (config) {
      cmd.option(config.flags, config.description);
    } else {
      console.warn(`Unknown parameter: ${param}`);
    }
  });
}
