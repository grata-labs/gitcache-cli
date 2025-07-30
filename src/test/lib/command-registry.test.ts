import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerCommands } from '../../lib/command-registry.js';
import type {
  CommandConfig,
  CommandArguments,
  CommandClass,
} from '../../lib/types.js';

// Mock the parameter-options module
vi.mock('../../lib/parameter-options.js', () => ({
  addParametersToCommand: vi.fn(),
}));

describe('command-registry', () => {
  let mockProgram: Command;

  beforeEach(() => {
    mockProgram = new Command();
    vi.clearAllMocks();
  });

  describe('createCommandPattern function', () => {
    it('should create command pattern for required argument type', () => {
      const mockCommandClass: CommandClass = class MockCommand {
        static argumentSpec: CommandArguments = {
          type: 'required',
          name: 'repo',
        };
      } as unknown as CommandClass;

      const commands: Record<string, CommandConfig> = {
        test: {
          description: 'Test command',
          command: mockCommandClass,
        },
      };

      registerCommands(mockProgram, commands);

      const command = mockProgram.commands.find((cmd) => cmd.name() === 'test');
      expect(command).toBeDefined();
      expect(command?.usage()).toContain('<repo>');
    });

    it('should create command pattern for variadic argument type', () => {
      const mockCommandClass: CommandClass = class MockCommand {
        static argumentSpec: CommandArguments = {
          type: 'variadic',
          name: 'args',
        };
      } as unknown as CommandClass;

      const commands: Record<string, CommandConfig> = {
        test: {
          description: 'Test command',
          command: mockCommandClass,
        },
      };

      registerCommands(mockProgram, commands);

      const command = mockProgram.commands.find((cmd) => cmd.name() === 'test');
      expect(command).toBeDefined();
      expect(command?.usage()).toContain('[args...]');
    });

    it('should create command pattern for none argument type', () => {
      const mockCommandClass: CommandClass = class MockCommand {
        static argumentSpec: CommandArguments = { type: 'none' };
      } as unknown as CommandClass;

      const commands: Record<string, CommandConfig> = {
        test: {
          description: 'Test command',
          command: mockCommandClass,
        },
      };

      registerCommands(mockProgram, commands);

      const command = mockProgram.commands.find((cmd) => cmd.name() === 'test');
      expect(command).toBeDefined();
      expect(command?.usage()).not.toContain('<');
      // Commander automatically adds [options] so we check it doesn't contain argument patterns
      expect(command?.usage()).not.toContain('<repo>');
      expect(command?.usage()).not.toContain('[args...]');
    });

    it('should default to no arguments when argumentSpec is undefined', () => {
      const mockCommandClass: CommandClass = class MockCommand {
        // No argumentSpec property
      } as unknown as CommandClass;

      const commands: Record<string, CommandConfig> = {
        test: {
          description: 'Test command',
          command: mockCommandClass,
        },
      };

      registerCommands(mockProgram, commands);

      const command = mockProgram.commands.find((cmd) => cmd.name() === 'test');
      expect(command).toBeDefined();
    });

    it('should handle unknown argument types by defaulting to no arguments', () => {
      const mockCommandClass: CommandClass = class MockCommand {
        static argumentSpec = {
          type: 'unknown',
        } as unknown as CommandArguments;
      } as unknown as CommandClass;

      const commands: Record<string, CommandConfig> = {
        test: {
          description: 'Test command',
          command: mockCommandClass,
        },
      };

      registerCommands(mockProgram, commands);

      const command = mockProgram.commands.find((cmd) => cmd.name() === 'test');
      expect(command).toBeDefined();
    });
  });

  describe('registerCommand function', () => {
    it('should register command with correct pattern and description', () => {
      const mockCommandClass: CommandClass = class MockCommand {
        static argumentSpec: CommandArguments = {
          type: 'required',
          name: 'repo',
        };
      } as unknown as CommandClass;

      const commands: Record<string, CommandConfig> = {
        add: {
          description: 'Add repository command',
          command: mockCommandClass,
        },
      };

      registerCommands(mockProgram, commands);

      const command = mockProgram.commands.find((cmd) => cmd.name() === 'add');
      expect(command).toBeDefined();
      expect(command?.description()).toBe('Add repository command');
      expect(command?.usage()).toContain('<repo>');
    });

    it('should register multiple commands correctly', () => {
      const mockCommandClass1: CommandClass = class MockCommand1 {
        static argumentSpec: CommandArguments = { type: 'none' };
      } as unknown as CommandClass;

      const mockCommandClass2: CommandClass = class MockCommand2 {
        static argumentSpec: CommandArguments = {
          type: 'required',
          name: 'arg',
        };
      } as unknown as CommandClass;

      const commands: Record<string, CommandConfig> = {
        cmd1: {
          description: 'Command 1',
          command: mockCommandClass1,
        },
        cmd2: {
          description: 'Command 2',
          command: mockCommandClass2,
        },
      };

      registerCommands(mockProgram, commands);

      expect(mockProgram.commands).toHaveLength(2);
      expect(
        mockProgram.commands.find((cmd) => cmd.name() === 'cmd1')
      ).toBeDefined();
      expect(
        mockProgram.commands.find((cmd) => cmd.name() === 'cmd2')
      ).toBeDefined();
    });
  });

  describe('alias registration', () => {
    it('should register aliases with correct patterns', () => {
      const mockCommandClass: CommandClass = class MockCommand {
        static argumentSpec: CommandArguments = {
          type: 'required',
          name: 'repo',
        };
      } as unknown as CommandClass;

      const commands: Record<string, CommandConfig> = {
        add: {
          description: 'Add repository command',
          aliases: ['cache'],
          command: mockCommandClass,
        },
      };

      registerCommands(mockProgram, commands);

      const mainCommand = mockProgram.commands.find(
        (cmd) => cmd.name() === 'add'
      );
      const aliasCommand = mockProgram.commands.find(
        (cmd) => cmd.name() === 'cache'
      );

      expect(mainCommand).toBeDefined();
      expect(aliasCommand).toBeDefined();
      expect(aliasCommand?.description()).toBe("Alias for 'add' command");
    });

    it('should register multiple aliases', () => {
      const mockCommandClass: CommandClass = class MockCommand {
        static argumentSpec: CommandArguments = { type: 'none' };
      } as unknown as CommandClass;

      const commands: Record<string, CommandConfig> = {
        analyze: {
          description: 'Analyze command',
          aliases: ['a', 'analyse'],
          command: mockCommandClass,
        },
      };

      registerCommands(mockProgram, commands);

      const aliasA = mockProgram.commands.find((cmd) => cmd.name() === 'a');
      const aliasAnalyse = mockProgram.commands.find(
        (cmd) => cmd.name() === 'analyse'
      );

      expect(aliasA).toBeDefined();
      expect(aliasAnalyse).toBeDefined();
      expect(aliasA?.description()).toBe("Alias for 'analyze' command");
      expect(aliasAnalyse?.description()).toBe("Alias for 'analyze' command");
    });
  });
});
