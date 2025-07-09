import { Add } from '../commands/add.js';
import { Install } from '../commands/install.js';
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
};
