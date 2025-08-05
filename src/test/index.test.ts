import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addRepository, cacheRepository, main } from '../index.js';
import { npmInstall } from '../lib/api.js';
import { getTargetPath } from '../lib/utils/path.js';

// Calculate expected hash for test repo
const testRepo = 'https://github.com/user/repo.git';
const expectedPath = getTargetPath(testRepo);

// Mock the Add command
vi.mock('../commands/add.js', () => ({
  Add: vi.fn().mockImplementation(() => ({
    exec: vi.fn().mockReturnValue(expectedPath),
  })),
}));

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
  describe('addRepository', () => {
    it('should delegate to Add command and return target path', async () => {
      const { Add } = await import('../commands/add.js');
      const MockAdd = vi.mocked(Add);
      const mockExec = vi.fn().mockResolvedValue(expectedPath);
      MockAdd.mockImplementation(
        () => ({ exec: mockExec }) as unknown as InstanceType<typeof Add>
      );

      const repo = 'https://github.com/user/repo.git';
      const result = await addRepository(repo);

      expect(MockAdd).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith([repo], {});
      expect(result).toBe(expectedPath);
    });

    it('should pass force option to Add command', async () => {
      const { Add } = await import('../commands/add.js');
      const MockAdd = vi.mocked(Add);
      const mockExec = vi.fn().mockReturnValue(expectedPath);
      MockAdd.mockImplementation(
        () => ({ exec: mockExec }) as unknown as InstanceType<typeof Add>
      );

      const repo = 'https://github.com/user/repo.git';
      addRepository(repo, { force: true });

      expect(mockExec).toHaveBeenCalledWith([repo], { force: true });
    });
  });

  describe('cacheRepository (deprecated alias)', () => {
    it('should work as an alias for addRepository', async () => {
      const { Add } = await import('../commands/add.js');
      const MockAdd = vi.mocked(Add);
      const mockExec = vi.fn().mockResolvedValue(expectedPath);
      MockAdd.mockImplementation(
        () => ({ exec: mockExec }) as unknown as InstanceType<typeof Add>
      );

      const repo = 'https://github.com/user/repo.git';
      const result = await cacheRepository(repo, { force: true });

      expect(MockAdd).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith([repo], { force: true });
      expect(result).toBe(expectedPath);
    });
  });

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
    it('should set up commander program correctly with add and install commands', async () => {
      const { Command } = await import('commander');
      const { Add } = await import('../commands/add.js');
      const { Install } = await import('../commands/install.js');
      const MockCommand = vi.mocked(Command);
      const MockAdd = vi.mocked(Add);
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

      const mockAddExec = vi.fn();
      const mockInstallExec = vi.fn();
      MockAdd.mockImplementation(
        () => ({ exec: mockAddExec }) as unknown as InstanceType<typeof Add>
      );
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

    it('should register cache as an alias for add command', async () => {
      const { Command } = await import('commander');
      const { Add } = await import('../commands/add.js');
      const { Install } = await import('../commands/install.js');
      const MockCommand = vi.mocked(Command);
      const MockAdd = vi.mocked(Add);
      const MockInstall = vi.mocked(Install);

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

      const mockAddExec = vi.fn();
      const mockInstallExec = vi.fn();
      MockAdd.mockImplementation(
        () => ({ exec: mockAddExec }) as unknown as InstanceType<typeof Add>
      );
      MockInstall.mockImplementation(
        () =>
          ({ exec: mockInstallExec }) as unknown as InstanceType<typeof Install>
      );

      await main();

      // Verify that commands and aliases are registered
      const commandCalls = mockProgram.command.mock.calls;
      expect(commandCalls.length).toBeGreaterThan(7); // At least 7 main commands plus aliases

      // Check that hidden commands (aliases) are registered
      const hiddenCalls = commandCalls.filter(
        (call) => call[1]?.hidden === true
      );
      expect(hiddenCalls.length).toBeGreaterThan(0); // Should have at least some aliases

      // Verify verbose help hint is added (not showing aliases by default)
      expect(mockProgram.addHelpText).toHaveBeenCalledWith(
        'after',
        '\nUse --verbose to see available command aliases.'
      );
    });

    it('should show aliases section when --verbose is used', async () => {
      // Mock process.argv to include --verbose
      const originalArgv = process.argv;
      process.argv = ['node', 'gitcache', '--verbose', '--help'];

      const { Command } = await import('commander');
      const { Add } = await import('../commands/add.js');
      const MockCommand = vi.mocked(Command);
      const MockAdd = vi.mocked(Add);

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

      const mockExec = vi.fn();
      MockAdd.mockImplementation(
        () => ({ exec: mockExec }) as unknown as InstanceType<typeof Add>
      );

      await main();

      // Verify aliases are shown in verbose mode
      expect(mockProgram.addHelpText).toHaveBeenCalledWith(
        'after',
        '\nAliases:\n  cache -> add\n  i -> install\n\nUse --verbose to see aliases in help output.'
      );

      // Restore original argv
      process.argv = originalArgv;
    });
  });
});
