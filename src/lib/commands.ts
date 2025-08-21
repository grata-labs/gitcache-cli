import { Analyze } from '../commands/analyze.js';
import { Auth } from '../commands/auth.js';
import { Config } from '../commands/config.js';
import { Install } from '../commands/install.js';
import { Prune } from '../commands/prune.js';
import { Scan } from '../commands/scan.js';
import { Status } from '../commands/status.js';
import { Tokens } from '../commands/tokens.js';
import type { CommandConfig } from './types.js';

/**
 * Command registry - all available commands and their aliases
 */
export const commands: Record<string, CommandConfig> = {
  install: {
    command: Install,
    description: Install.description,
    aliases: ['i'],
  },
  auth: {
    command: Auth,
    description: Auth.description,
    aliases: ['login'],
  },
  tokens: {
    command: Tokens,
    description: Tokens.description,
  },
  status: {
    command: Status,
    description: Status.description,
  },
  scan: {
    command: Scan,
    description: Scan.description,
  },
  analyze: {
    command: Analyze,
    description: Analyze.description,
  },
  prune: {
    command: Prune,
    description: Prune.description,
  },
  config: {
    command: Config,
    description: Config.description,
  },
};
