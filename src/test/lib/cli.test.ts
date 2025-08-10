import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCLI, main } from '../../lib/cli.js';

// Mock commander
vi.mock('commander', () => ({
  Command: vi.fn().mockImplementation(() => ({
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    parseAsync: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock the command registry and commands
vi.mock('../../lib/command-registry.js', () => ({
  registerCommands: vi.fn(),
}));

vi.mock('../../lib/commands.js', () => ({
  commands: [],
}));

// Mock package.json
vi.mock('../../../package.json', () => ({
  version: '1.6.0',
}));

describe('CLI', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('createCLI', () => {
    it('should create and configure the CLI program', async () => {
      const { Command } = await import('commander');
      const { registerCommands } = await import(
        '../../lib/command-registry.js'
      );
      const { commands } = await import('../../lib/commands.js');

      const MockCommand = vi.mocked(Command);
      const mockRegisterCommands = vi.mocked(registerCommands);

      const mockProgram = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
      };
      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      const program = createCLI();

      expect(MockCommand).toHaveBeenCalled();
      expect(mockProgram.name).toHaveBeenCalledWith('gitcache');
      expect(mockProgram.description).toHaveBeenCalledWith(
        'Universal Git-dependency cache & proxy CLI'
      );
      expect(mockProgram.option).toHaveBeenCalledWith(
        '--verbose',
        'show verbose help including aliases'
      );
      expect(mockRegisterCommands).toHaveBeenCalledWith(program, commands);
    });
  });

  describe('main', () => {
    it('should handle Error instances by showing only the message', async () => {
      const { Command } = await import('commander');
      const MockCommand = vi.mocked(Command);

      const testError = new Error('Command failed');
      const mockProgram = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue(testError),
      };
      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      await expect(main()).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Command failed');
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('An unexpected error occurred:')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error values by converting to string with prefix', async () => {
      const { Command } = await import('commander');
      const MockCommand = vi.mocked(Command);

      const nonErrorValue = 'string error';
      const mockProgram = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue(nonErrorValue),
      };
      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      await expect(main()).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'An unexpected error occurred:',
        'string error'
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle null/undefined errors', async () => {
      const { Command } = await import('commander');
      const MockCommand = vi.mocked(Command);

      const mockProgram = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue(null),
      };
      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      await expect(main()).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'An unexpected error occurred:',
        'null'
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle object errors', async () => {
      const { Command } = await import('commander');
      const MockCommand = vi.mocked(Command);

      const objectError = { code: 'ERR_CUSTOM', details: 'Something failed' };
      const mockProgram = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue(objectError),
      };
      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      await expect(main()).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'An unexpected error occurred:',
        '[object Object]'
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle number errors', async () => {
      const { Command } = await import('commander');
      const MockCommand = vi.mocked(Command);

      const numberError = 404;
      const mockProgram = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue(numberError),
      };
      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      await expect(main()).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'An unexpected error occurred:',
        '404'
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should succeed when no errors occur', async () => {
      const { Command } = await import('commander');
      const MockCommand = vi.mocked(Command);

      const mockProgram: any = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        parseAsync: vi.fn(),
      };
      mockProgram.parseAsync.mockResolvedValue(mockProgram);

      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      const result = await main();

      expect(result).toBe(mockProgram);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });
});
