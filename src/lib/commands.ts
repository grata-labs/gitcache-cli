import { Add } from '../commands/add.js';
import { Analyze } from '../commands/analyze.js';
import { Auth } from '../commands/auth.js';
import { Config } from '../commands/config.js';
import { Install } from '../commands/install.js';
import { Prepare } from '../commands/prepare.js';
import { Prune } from '../commands/prune.js';
import { Scan } from '../commands/scan.js';
import { Setup } from '../commands/setup.js';
import { Status } from '../commands/status.js';
import { Tokens } from '../commands/tokens.js';
import type { CommandConfig } from './types.js';

/**
 * Command registry - all available commands and their aliases
 */
export const commands: Record<string, CommandConfig> = {
  add: {
    command: Add,
    description: Add.description,
    aliases: ['cache'],
  },
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
  setup: {
    command: Setup,
    description: Setup.description,
  },
  status: {
    command: Status,
    description: Status.description,
  },
  scan: {
    command: Scan,
    description: Scan.description,
  },
  prepare: {
    command: Prepare,
    description: Prepare.description,
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
