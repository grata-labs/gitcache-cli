import { describe, it, expect } from 'vitest';
import { BaseCommand } from '../base-cmd.js';

class TestCommand extends BaseCommand {
  static description = 'Test command for testing BaseCommand';
  static commandName = 'test';
  static usage = ['[options]', 'arg1 arg2'];

  exec(): string {
    return 'test result';
  }
}

class TestCommandWithError extends BaseCommand {
  static description = 'Test command that throws usage error';
  static commandName = 'test-error';
  static usage = ['<required>'];

  exec(): void {
    throw this.usageError('Something went wrong');
  }
}

describe('BaseCommand', () => {
  describe('describeUsage', () => {
    it('should return formatted usage string', () => {
      const usage = TestCommand.describeUsage;

      expect(usage).toContain('Test command for testing BaseCommand');
      expect(usage).toContain('Usage:');
      expect(usage).toContain('gitcache test [options]');
      expect(usage).toContain('gitcache test arg1 arg2');
    });
  });

  describe('usageError', () => {
    it('should create error with usage information', () => {
      const command = new TestCommandWithError();

      expect(() => command.exec()).toThrow(/Something went wrong/);
      expect(() => command.exec()).toThrow(/Usage:/);
      expect(() => command.exec()).toThrow(/gitcache test-error/);
    });

    it('should create error with just usage when no message provided', () => {
      const command = new TestCommand();
      const error = command.usageError();

      expect(error.message).toContain('Test command for testing BaseCommand');
      expect(error.message).toContain('Usage:');
      expect(error.message).not.toContain('undefined');
    });
  });
});
