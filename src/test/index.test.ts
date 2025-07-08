import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cacheRepository, main } from '../index.js';

// Mock the Cache command
vi.mock('../commands/cache.js', () => ({
  Cache: vi.fn().mockImplementation(() => ({
    exec: vi
      .fn()
      .mockReturnValue(
        '/home/testuser/.gitcache/https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git'
      ),
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
  describe('cacheRepository', () => {
    it('should delegate to Cache command and return target path', async () => {
      const { Cache } = await import('../commands/cache.js');
      const MockCache = vi.mocked(Cache);
      const mockExec = vi
        .fn()
        .mockReturnValue(
          '/home/testuser/.gitcache/https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git'
        );
      MockCache.mockImplementation(
        () => ({ exec: mockExec }) as unknown as InstanceType<typeof Cache>
      );

      const repo = 'https://github.com/user/repo.git';
      const result = cacheRepository(repo);

      expect(MockCache).toHaveBeenCalled();
      expect(mockExec).toHaveBeenCalledWith([repo], {});
      expect(result).toBe(
        '/home/testuser/.gitcache/https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git'
      );
    });

    it('should pass force option to Cache command', async () => {
      const { Cache } = await import('../commands/cache.js');
      const MockCache = vi.mocked(Cache);
      const mockExec = vi
        .fn()
        .mockReturnValue(
          '/home/testuser/.gitcache/https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git'
        );
      MockCache.mockImplementation(
        () => ({ exec: mockExec }) as unknown as InstanceType<typeof Cache>
      );

      const repo = 'https://github.com/user/repo.git';
      cacheRepository(repo, { force: true });

      expect(mockExec).toHaveBeenCalledWith([repo], { force: true });
    });
  });

  describe('main', () => {
    it('should set up commander program correctly', async () => {
      const { Command } = await import('commander');
      const { Cache } = await import('../commands/cache.js');
      const MockCommand = vi.mocked(Command);
      const MockCache = vi.mocked(Cache);

      let actionCallback:
        | ((repo: string, opts: { force?: boolean }) => void)
        | undefined;

      const mockProgram = {
        name: vi.fn().mockReturnThis(),
        description: vi.fn().mockReturnThis(),
        version: vi.fn().mockReturnThis(),
        command: vi.fn().mockReturnThis(),
        option: vi.fn().mockReturnThis(),
        action: vi.fn().mockImplementation((callback) => {
          actionCallback = callback;
          return mockProgram;
        }),
        parseAsync: vi.fn().mockResolvedValue(undefined),
      };
      MockCommand.mockImplementation(
        () => mockProgram as unknown as InstanceType<typeof Command>
      );

      const mockExec = vi.fn();
      MockCache.mockImplementation(
        () => ({ exec: mockExec }) as unknown as InstanceType<typeof Cache>
      );

      await main();

      expect(mockProgram.name).toHaveBeenCalledWith('gitcache');
      expect(mockProgram.description).toHaveBeenCalledWith(
        'Universal Git-dependency cache & proxy CLI'
      );
      expect(mockProgram.version).toHaveBeenCalled();
      expect(mockProgram.command).toHaveBeenCalledWith('cache <repo>');
      expect(mockProgram.parseAsync).toHaveBeenCalledWith(process.argv);

      // Test the action callback
      expect(actionCallback).toBeDefined();
      if (actionCallback) {
        actionCallback('https://github.com/test/repo.git', { force: true });
        expect(MockCache).toHaveBeenCalled();
        expect(mockExec).toHaveBeenCalledWith(
          ['https://github.com/test/repo.git'],
          { force: true }
        );
      }
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

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });
  });
});
