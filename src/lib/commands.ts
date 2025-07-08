import { Add } from '../commands/add.js';
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
};
