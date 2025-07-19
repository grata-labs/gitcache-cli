import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Config } from '../../commands/config.js';

// Mock the dependencies
vi.mock('../../lib/config.js');
vi.mock('../../lib/prune.js');

// Mock implementations
const mockLoadConfig = vi.fn();
const mockGetDefaultMaxCacheSize = vi.fn();
const mockSetDefaultMaxCacheSize = vi.fn();
const mockParseSizeToBytes = vi.fn();

// Setup mocks
vi.mocked(import('../../lib/config.js')).then((module) => {
  module.loadConfig = mockLoadConfig;
  module.getDefaultMaxCacheSize = mockGetDefaultMaxCacheSize;
  module.setDefaultMaxCacheSize = mockSetDefaultMaxCacheSize;
});

vi.mocked(import('../../lib/prune.js')).then((module) => {
  module.parseSizeToBytes = mockParseSizeToBytes;
});

describe('Config Command', () => {
  let configCommand: Config;

  beforeEach(async () => {
    configCommand = new Config();

    // Set up default mock implementations
    const { loadConfig, getDefaultMaxCacheSize, setDefaultMaxCacheSize } =
      await import('../../lib/config.js');
    const { parseSizeToBytes } = await import('../../lib/prune.js');

    vi.mocked(loadConfig).mockReturnValue({ maxCacheSize: '5GB' });
    vi.mocked(getDefaultMaxCacheSize).mockReturnValue('5GB');
    vi.mocked(setDefaultMaxCacheSize).mockImplementation(() => {});
    vi.mocked(parseSizeToBytes).mockReturnValue(5 * 1024 * 1024 * 1024);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Static properties', () => {
    it('should have correct static properties', () => {
      expect(Config.description).toBe('Manage gitcache configuration');
      expect(Config.commandName).toBe('config');
      expect(Config.usage).toEqual([
        '--list',
        '--get max-cache-size',
        '--set max-cache-size=10GB',
      ]);
      expect(Config.params).toEqual(['get', 'set', 'list']);
    });
  });

  describe('exec method', () => {
    it('should list config by default when no options provided', async () => {
      const result = await configCommand.exec([]);

      expect(result).toContain('📋 GitCache Configuration:');
      expect(result).toContain('max-cache-size: 5GB');
      expect(result).toContain('💡 Use --set to change values:');
      expect(result).toContain('gitcache config --set max-cache-size=10GB');
    });

    it('should list config when --list option is provided', async () => {
      const result = await configCommand.exec([], { list: true });

      expect(result).toContain('📋 GitCache Configuration:');
      expect(result).toContain('max-cache-size: 5GB');
    });

    it('should get specific config value when --get option is provided', async () => {
      const result = await configCommand.exec([], { get: 'max-cache-size' });

      expect(result).toBe('max-cache-size: 5GB');
    });

    it('should set config value when --set option is provided', async () => {
      const { setDefaultMaxCacheSize } = await import('../../lib/config.js');
      const result = await configCommand.exec([], {
        set: 'max-cache-size=10GB',
      });

      expect(vi.mocked(setDefaultMaxCacheSize)).toHaveBeenCalledWith('10GB');
      expect(result).toBe('✅ Set max-cache-size to: 10GB');
    });
  });

  describe('getConfigValue method', () => {
    it('should return max-cache-size value with exact key', async () => {
      const result = await configCommand.exec([], { get: 'max-cache-size' });
      expect(result).toBe('max-cache-size: 5GB');
    });

    it('should return max-cache-size value with normalized key (no dashes)', async () => {
      const result = await configCommand.exec([], { get: 'maxcachesize' });
      expect(result).toBe('max-cache-size: 5GB');
    });

    it('should return max-cache-size value with case insensitive key', async () => {
      const result = await configCommand.exec([], { get: 'MAX-CACHE-SIZE' });
      expect(result).toBe('max-cache-size: 5GB');
    });

    it('should throw error for unknown config key', async () => {
      await expect(
        configCommand.exec([], { get: 'unknown-key' })
      ).rejects.toThrow(
        'Unknown config key: unknown-key. Available: max-cache-size'
      );
    });
  });

  describe('setConfigValue method', () => {
    it('should set max-cache-size with exact key name', async () => {
      const { setDefaultMaxCacheSize } = await import('../../lib/config.js');
      const result = await configCommand.exec([], {
        set: 'max-cache-size=20GB',
      });

      expect(vi.mocked(setDefaultMaxCacheSize)).toHaveBeenCalledWith('20GB');
      expect(result).toBe('✅ Set max-cache-size to: 20GB');
    });

    it('should set max-cache-size with normalized key (no dashes)', async () => {
      const { setDefaultMaxCacheSize } = await import('../../lib/config.js');
      const result = await configCommand.exec([], { set: 'maxcachesize=15GB' });

      expect(vi.mocked(setDefaultMaxCacheSize)).toHaveBeenCalledWith('15GB');
      expect(result).toBe('✅ Set max-cache-size to: 15GB');
    });

    it('should set max-cache-size with case insensitive key', async () => {
      const { setDefaultMaxCacheSize } = await import('../../lib/config.js');
      const result = await configCommand.exec([], {
        set: 'MAX-CACHE-SIZE=8GB',
      });

      expect(vi.mocked(setDefaultMaxCacheSize)).toHaveBeenCalledWith('8GB');
      expect(result).toBe('✅ Set max-cache-size to: 8GB');
    });

    it('should handle whitespace around key and value', async () => {
      const { setDefaultMaxCacheSize } = await import('../../lib/config.js');
      const result = await configCommand.exec([], {
        set: ' max-cache-size = 12GB ',
      });

      expect(vi.mocked(setDefaultMaxCacheSize)).toHaveBeenCalledWith('12GB');
      expect(result).toBe('✅ Set max-cache-size to: 12GB');
    });

    it('should validate size format before setting', async () => {
      const { parseSizeToBytes } = await import('../../lib/prune.js');
      vi.mocked(parseSizeToBytes).mockImplementation((size) => {
        if (size === 'invalid-size') {
          throw new Error('Invalid size format');
        }
        return 1024;
      });

      await expect(
        configCommand.exec([], { set: 'max-cache-size=invalid-size' })
      ).rejects.toThrow(
        "Invalid size format: invalid-size. Use format like '5GB', '1TB', '100MB'"
      );
    });

    it('should throw error for invalid assignment format (missing equals)', async () => {
      await expect(
        configCommand.exec([], { set: 'max-cache-size' })
      ).rejects.toThrow('Invalid format. Use: --set key=value');
    });

    it('should throw error for invalid assignment format (missing value)', async () => {
      await expect(
        configCommand.exec([], { set: 'max-cache-size=' })
      ).rejects.toThrow('Invalid format. Use: --set key=value');
    });

    it('should throw error for invalid assignment format (missing key)', async () => {
      await expect(configCommand.exec([], { set: '=10GB' })).rejects.toThrow(
        'Invalid format. Use: --set key=value'
      );
    });

    it('should throw error for unknown config key', async () => {
      await expect(
        configCommand.exec([], { set: 'unknown-key=value' })
      ).rejects.toThrow(
        'Unknown config key: unknown-key. Available: max-cache-size'
      );
    });
  });

  describe('listConfig method', () => {
    it('should format configuration output correctly', async () => {
      const { loadConfig } = await import('../../lib/config.js');
      vi.mocked(loadConfig).mockReturnValue({ maxCacheSize: '25GB' });

      const result = await configCommand.exec([], { list: true });

      expect(result).toContain('📋 GitCache Configuration:');
      expect(result).toContain('max-cache-size: 25GB');
      expect(result).toContain('💡 Use --set to change values:');
      expect(result).toContain('gitcache config --set max-cache-size=10GB');
    });
  });
});
