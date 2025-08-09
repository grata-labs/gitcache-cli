import { beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../index.js';
import { npmInstall } from '../lib/api.js';

// Mock the Install command
vi.mock('../commands/install.js', () => ({
  Install: vi.fn().mockImplementation(() => ({
    exec: vi.fn(),
  })),
}));

// Mock commander to avoid actual CLI execution
vi.mock('commander', () => ({
  Command: vi.fn().mockImplementation(() => ({
    name: vi.fn().mockReturnThis(),
    description: vi.fn().mockReturnThis(),
    version: vi.fn().mockReturnThis(),
    command: vi.fn().mockReturnThis(),
    option: vi.fn().mockReturnThis(),
    action: vi.fn().mockReturnThis(),
    parseAsync: vi.fn().mockResolvedValue(undefined),
  })),
}));

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv, HOME: '/home/testuser' };
});

describe('gitcache CLI', () => {
  describe('npmInstall', () => {
    it('should delegate to Install command', async () => {
      const { Install } = await import('../commands/install.js');
      const MockInstall = vi.mocked(Install);
      const mockExec = vi.fn();
      MockInstall.mockImplementation(
        () => ({ exec: mockExec }) as unknown as InstanceType<typeof Install>
      );

      const args = ['--save-dev', 'typescript'];
      npmInstall(args);

      expect(MockInstall).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith(args);
    });

    it('should handle empty arguments', async () => {
      const { Install } = await import('../commands/install.js');
      const MockInstall = vi.mocked(Install);
      const mockExec = vi.fn();
      MockInstall.mockImplementation(
        () => ({ exec: mockExec }) as unknown as InstanceType<typeof Install>
      );

      npmInstall();

      expect(MockInstall).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith([]);
    });
  });

  describe('main', () => {
    it('should set up commander program correctly with install command', async () => {
      const { Command } = await import('commander');
      const { Install } = await import('../commands/install.js');
      const MockCommand = vi.mocked(Command);
      const MockInstall = vi.mocked(Install);

      let actionCallbacks: Array<
        (repo: string, opts: { force?: boolean }) => void
      > = [];

      const mockProgram = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        command: vi.fn().mockReturnThis(),
        action: vi.fn().mockImplementation((callback) => {
          actionCallbacks.push(callback);
          return mockProgram;
        }),
        addHelpText: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockResolvedValue(undefined),
      };
      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      const mockInstallExec = vi.fn();
      MockInstall.mockImplementation(
        () =>
          ({ exec: mockInstallExec }) as unknown as InstanceType<typeof Install>
      );

      await main();

      expect(mockProgram.name).toHaveBeenCalledWith('gitcache');
      expect(mockProgram.description).toHaveBeenCalledWith(
        'Universal Git-dependency cache & proxy CLI'
      );
      expect(mockProgram.version).toHaveBeenCalled();
      expect(mockProgram.option).toHaveBeenCalledWith(
        '--verbose',
        'show verbose help including aliases'
      );

      // Verify commands are registered (the exact pattern depends on argumentSpec)
      const commandCalls = mockProgram.command.mock.calls;
      expect(commandCalls.length).toBeGreaterThan(7); // At least 7 main commands plus aliases

      // Should add help text about verbose mode (not showing aliases by default)
      expect(mockProgram.addHelpText).toHaveBeenCalledWith(
        'after',
        '\nUse --verbose to see available command aliases.'
      );
      expect(mockProgram.parseAsync).toHaveBeenCalledWith(process.argv);
    });

    it('should handle parseAsync errors', async () => {
      const { Command } = await import('commander');
      const MockCommand = vi.mocked(Command);
      const mockProgram = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        command: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
        addHelpText: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockRejectedValue(new Error('Test error')),
      };
      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const processExitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation(() => {
          throw new Error('process.exit called');
        });

      await expect(main()).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Test error');
      expect(processExitSpy).toHaveBeenCalledWith(1);

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it('should show aliases when --verbose is used', async () => {
      // Mock process.argv to include --verbose
      const originalArgv = process.argv;
      process.argv = ['node', 'gitcache', '--verbose', '--help'];

      const { Command } = await import('commander');
      const MockCommand = vi.mocked(Command);

      const mockProgram = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        command: vi.fn().mockReturnThis(),
        action: vi.fn().mockReturnThis(),
        addHelpText: vi.fn().mockReturnThis(),
        parseAsync: vi.fn().mockResolvedValue(undefined),
      };
      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      await main();

      // Verify aliases are shown in verbose mode
      expect(mockProgram.addHelpText).toHaveBeenCalledWith(
        'after',
        '\nAliases:\n  i -> install\n  login -> auth\n\nUse --verbose to see aliases in help output.'
      );

      // Restore original argv
      process.argv = originalArgv;
    });
  });
});
