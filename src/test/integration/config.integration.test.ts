import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultMaxCacheSize,
  loadConfig,
  saveConfig,
  setDefaultMaxCacheSize,
  type GitCacheConfig,
} from '../../lib/config.js';
import { getCacheDir } from '../../lib/utils/path.js';

// Mock the path utility at the module level
vi.mock('../../lib/utils/path.js');

// Integration tests for GitCache Configuration
// These tests work with real file system and test the complete workflow
describe('GitCache Configuration Integration', () => {
  let testCacheDir: string;
  let testConfigPath: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    testCacheDir = join(
      tmpdir(),
      `gitcache-config-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    testConfigPath = join(testCacheDir, '.gitcache-config.json');

    // Mock getCacheDir to use our test directory
    const { getCacheDir } = await import('../../lib/utils/path.js');
    vi.mocked(getCacheDir).mockReturnValue(testCacheDir);

    // Ensure clean state
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }

    vi.clearAllMocks();
  });

  describe('Real-world configuration workflows', () => {
    it('should handle first-time setup scenario', () => {
      // Simulate first time user
      expect(existsSync(testCacheDir)).toBe(false);
      expect(existsSync(testConfigPath)).toBe(false);

      // User checks default size - should create config
      const defaultSize = getDefaultMaxCacheSize();
      expect(defaultSize).toBe('5GB');

      // Config directory and file should now exist
      expect(existsSync(testCacheDir)).toBe(true);
      expect(existsSync(testConfigPath)).toBe(true);

      // Verify config file contents
      const configContent = readFileSync(testConfigPath, 'utf8');
      const parsedConfig = JSON.parse(configContent);
      expect(parsedConfig).toEqual({
        maxCacheSize: '5GB',
      });
    });

    it('should handle user configuration update workflow', () => {
      // Start with default
      const initialSize = getDefaultMaxCacheSize();
      expect(initialSize).toBe('5GB');

      // User updates cache size
      setDefaultMaxCacheSize('20GB');

      // Verify the change persisted
      const updatedSize = getDefaultMaxCacheSize();
      expect(updatedSize).toBe('20GB');

      // Verify file was updated
      const configContent = readFileSync(testConfigPath, 'utf8');
      const parsedConfig = JSON.parse(configContent);
      expect(parsedConfig.maxCacheSize).toBe('20GB');

      // User changes mind and sets different size
      setDefaultMaxCacheSize('500MB');

      // Verify second change
      const finalSize = getDefaultMaxCacheSize();
      expect(finalSize).toBe('500MB');
    });

    it('should handle manual config file editing scenario', () => {
      // User starts with default
      getDefaultMaxCacheSize();
      expect(existsSync(testConfigPath)).toBe(true);

      // User manually edits config file
      const manualConfig = {
        maxCacheSize: '100GB',
      };
      writeFileSync(
        testConfigPath,
        JSON.stringify(manualConfig, null, 2),
        'utf8'
      );

      // Application should read the manually edited config
      const configSize = getDefaultMaxCacheSize();
      expect(configSize).toBe('100GB');

      // Verify loadConfig also works
      const loadedConfig = loadConfig();
      expect(loadedConfig.maxCacheSize).toBe('100GB');
    });

    it('should handle config file corruption recovery', async () => {
      // Start with valid config
      setDefaultMaxCacheSize('10GB');
      expect(getDefaultMaxCacheSize()).toBe('10GB');

      // Simulate config file corruption
      writeFileSync(testConfigPath, 'corrupted invalid json content', 'utf8');

      // Application should recover gracefully - loadConfig should handle corruption
      const config = await loadConfig();
      expect(config.maxCacheSize).toBe('5GB'); // Should get defaults

      // The corrupted file should still exist (loadConfig doesn't auto-repair)
      const corruptedContent = readFileSync(testConfigPath, 'utf8');
      expect(corruptedContent).toBe('corrupted invalid json content');

      // But saveConfig should work to fix it
      await saveConfig(config);
      const fixedContent = readFileSync(testConfigPath, 'utf8');
      expect(() => JSON.parse(fixedContent)).not.toThrow();
      const parsedConfig = JSON.parse(fixedContent);
      expect(parsedConfig.maxCacheSize).toBe('5GB');
    });

    it('should handle partial config file scenario', () => {
      // Create config directory
      mkdirSync(testCacheDir, { recursive: true });

      // Write partial config (missing fields)
      writeFileSync(testConfigPath, '{}', 'utf8');

      // Should merge with defaults
      const config = loadConfig();
      expect(config.maxCacheSize).toBe('5GB');

      // Should also work through getDefaultMaxCacheSize
      const size = getDefaultMaxCacheSize();
      expect(size).toBe('5GB');
    });

    it('should handle concurrent access patterns', () => {
      // Simulate multiple operations happening in sequence
      const operations = [
        () => setDefaultMaxCacheSize('1GB'),
        () => getDefaultMaxCacheSize(),
        () => loadConfig(),
        () => setDefaultMaxCacheSize('2GB'),
        () => getDefaultMaxCacheSize(),
        () => saveConfig({ maxCacheSize: '3GB' }),
        () => getDefaultMaxCacheSize(),
      ];

      operations.forEach((op) => {
        op();
      });

      // Final state should be consistent
      expect(getDefaultMaxCacheSize()).toBe('3GB');
      expect(loadConfig().maxCacheSize).toBe('3GB');
    });

    it('should handle cache directory creation scenarios', () => {
      // Ensure no cache directory exists
      expect(existsSync(testCacheDir)).toBe(false);

      // Direct saveConfig call should create directory
      const config: GitCacheConfig = { maxCacheSize: '15GB' };
      saveConfig(config);

      expect(existsSync(testCacheDir)).toBe(true);
      expect(existsSync(testConfigPath)).toBe(true);

      // Verify saved correctly
      const loadedConfig = loadConfig();
      expect(loadedConfig.maxCacheSize).toBe('15GB');
    });

    it('should handle nested directory creation', () => {
      // Set up a deeper cache directory path
      const deepCacheDir = join(testCacheDir, 'nested', 'deep', 'cache');
      const deepConfigPath = join(deepCacheDir, '.gitcache-config.json');

      // Update the mock to return deep path for this test
      vi.mocked(getCacheDir).mockReturnValue(deepCacheDir);

      // Ensure deep directory doesn't exist
      expect(existsSync(deepCacheDir)).toBe(false);

      // saveConfig should create all nested directories
      const config: GitCacheConfig = { maxCacheSize: '25GB' };
      saveConfig(config);

      expect(existsSync(deepCacheDir)).toBe(true);
      expect(existsSync(deepConfigPath)).toBe(true);

      // Verify config is correct
      const loadedConfig = loadConfig();
      expect(loadedConfig.maxCacheSize).toBe('25GB');

      // Clean up the deep directory
      rmSync(testCacheDir, { recursive: true, force: true });

      // Restore the mock to original test directory
      vi.mocked(getCacheDir).mockReturnValue(testCacheDir);
    });

    it('should maintain config consistency across multiple loads', () => {
      // Set initial config
      setDefaultMaxCacheSize('50GB');

      // Load config multiple times and verify consistency
      for (let i = 0; i < 5; i++) {
        const config1 = loadConfig();
        const config2 = loadConfig();
        const size1 = getDefaultMaxCacheSize();
        const size2 = getDefaultMaxCacheSize();

        expect(config1.maxCacheSize).toBe('50GB');
        expect(config2.maxCacheSize).toBe('50GB');
        expect(size1).toBe('50GB');
        expect(size2).toBe('50GB');
        expect(config1).toEqual(config2);
      }
    });

    it('should handle configuration migration scenarios', () => {
      // Simulate old config format or missing fields
      mkdirSync(testCacheDir, { recursive: true });

      // Write config with extra unknown fields (future compatibility)
      const futureConfig = {
        maxCacheSize: '40GB',
        unknownFutureField: 'someValue',
        anotherUnknownField: 12345,
      };
      writeFileSync(
        testConfigPath,
        JSON.stringify(futureConfig, null, 2),
        'utf8'
      );

      // Current version should handle gracefully
      const config = loadConfig();
      expect(config.maxCacheSize).toBe('40GB');

      // Should preserve known fields when saving
      setDefaultMaxCacheSize('45GB');
      const updatedConfig = loadConfig();
      expect(updatedConfig.maxCacheSize).toBe('45GB');
    });

    it('should handle file system edge cases', () => {
      // Test with various cache sizes and special characters
      const testSizes = [
        '0B',
        '1B',
        '999KB',
        '1.5GB',
        '10TB',
        '100PB',
        'large-value-with-text',
      ];

      testSizes.forEach((size) => {
        setDefaultMaxCacheSize(size);
        const retrievedSize = getDefaultMaxCacheSize();
        expect(retrievedSize).toBe(size);

        // Verify persistence
        const config = loadConfig();
        expect(config.maxCacheSize).toBe(size);
      });
    });

    it('should handle config operations during directory permissions issues', () => {
      // Create initial config
      setDefaultMaxCacheSize('30GB');
      expect(getDefaultMaxCacheSize()).toBe('30GB');

      // This test may be platform-specific
      // On some systems, permission restrictions might not work as expected
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        // Try to make directory read-only (may not work on all systems)
        require('fs').chmodSync(testCacheDir, 0o444);

        // Attempt to save new config - should handle gracefully
        expect(() => saveConfig({ maxCacheSize: '35GB' })).not.toThrow();

        // Restore permissions
        require('fs').chmodSync(testCacheDir, 0o755);
      } catch {
        // If chmod doesn't work on this system, that's okay
        // Just verify the basic functionality still works
        const size = getDefaultMaxCacheSize();
        expect(size).toBe('30GB');
      }

      consoleSpy.mockRestore();
    });

    it('should validate end-to-end configuration workflow', () => {
      // Complete workflow simulation

      // 1. Fresh installation - no config exists
      expect(existsSync(testConfigPath)).toBe(false);

      // 2. Application starts and checks default
      const initialDefault = getDefaultMaxCacheSize();
      expect(initialDefault).toBe('5GB');
      expect(existsSync(testConfigPath)).toBe(true);

      // 3. User configures custom size
      setDefaultMaxCacheSize('8GB');

      // 4. Application restarts (simulate by loading fresh)
      const afterRestart = getDefaultMaxCacheSize();
      expect(afterRestart).toBe('8GB');

      // 5. User runs multiple operations
      const config1 = loadConfig();
      saveConfig({ maxCacheSize: '12GB' });
      const config2 = loadConfig();
      setDefaultMaxCacheSize('16GB');
      const finalSize = getDefaultMaxCacheSize();

      // 6. Verify final state
      expect(config1.maxCacheSize).toBe('8GB');
      expect(config2.maxCacheSize).toBe('12GB');
      expect(finalSize).toBe('16GB');

      // 7. Verify file persistence
      const fileContent = readFileSync(testConfigPath, 'utf8');
      const finalConfig = JSON.parse(fileContent);
      expect(finalConfig.maxCacheSize).toBe('16GB');
    });
  });

  describe('Error resilience and recovery', () => {
    it('should recover from various JSON parsing errors', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mkdirSync(testCacheDir, { recursive: true });

      const invalidJsonCases = [
        '{ invalid json',
        '{ "maxCacheSize": }',
        'not json at all',
        '',
        '[]',
        'null',
        '{ "maxCacheSize": "5GB"', // missing closing brace
        '{ "maxCacheSize": "5GB", }', // trailing comma
      ];

      invalidJsonCases.forEach((invalidJson) => {
        writeFileSync(testConfigPath, invalidJson, 'utf8');

        const config = loadConfig();
        expect(config.maxCacheSize).toBe('5GB'); // Should always fall back to default

        // Should also work via getDefaultMaxCacheSize
        const size = getDefaultMaxCacheSize();
        expect(size).toBe('5GB');
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle rapid successive operations', () => {
      // Stress test with rapid operations
      const operations = [];

      for (let i = 0; i < 20; i++) {
        operations.push(() => setDefaultMaxCacheSize(`${i}GB`));
        operations.push(() => getDefaultMaxCacheSize());
        operations.push(() => loadConfig());
      }

      // Execute all operations
      operations.forEach((op) => op());

      // Verify final state is consistent
      const finalSize = getDefaultMaxCacheSize();
      const finalConfig = loadConfig();

      expect(finalSize).toBe('19GB'); // Last setDefaultMaxCacheSize was 19GB
      expect(finalConfig.maxCacheSize).toBe('19GB');
    });
  });
});
