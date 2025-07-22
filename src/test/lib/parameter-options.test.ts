import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { addParametersToCommand } from '../../lib/parameter-options.js';

describe('parameter-options', () => {
  describe('addParametersToCommand function (lines 78-79)', () => {
    it('should warn about unknown parameter keys', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const mockCommand = new Command();

      // Test with an unknown parameter that doesn't exist in PARAMETER_OPTIONS
      addParametersToCommand(mockCommand, ['unknownParam']);

      // Verify console.warn was called for the unknown parameter
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Unknown parameter: unknownParam'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should add known parameters without warnings', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const mockCommand = new Command();

      // Test with known parameters
      addParametersToCommand(mockCommand, ['verbose', 'force']);

      // Verify no warnings were called for known parameters
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should handle mixed known and unknown parameters', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const mockCommand = new Command();

      // Test with mix of known and unknown parameters
      addParametersToCommand(mockCommand, [
        'verbose',
        'unknownParam1',
        'force',
        'unknownParam2',
      ]);

      // Verify warnings were called only for unknown parameters
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Unknown parameter: unknownParam1'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Unknown parameter: unknownParam2'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle empty parameter array', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      const mockCommand = new Command();

      // Test with empty array
      addParametersToCommand(mockCommand, []);

      // Verify no warnings were called
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });
});
