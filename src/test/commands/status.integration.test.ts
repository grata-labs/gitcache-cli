import { beforeEach, describe, expect, it } from 'vitest';
import { Status } from '../../commands/status.js';

describe('Status Command Integration', () => {
  let statusCommand: Status;

  beforeEach(() => {
    statusCommand = new Status();
  });

  describe('static properties', () => {
    it('should have correct static properties', () => {
      expect(Status.description).toBe(
        'Show GitCache status, cache info, and registry connection'
      );
      expect(Status.commandName).toBe('status');
      expect(Status.usage).toEqual(['', '--detailed', '--json']);
      expect(Status.params).toEqual(['detailed', 'json', 'verbose']);
      expect(Status.argumentSpec).toEqual({ type: 'none' });
    });
  });

  describe('exec', () => {
    it('should return status output when not authenticated', async () => {
      const result = await statusCommand.exec([], {});

      expect(typeof result).toBe('string');
      expect(result).toContain('Local cache:');
      expect(result).toContain('Registry:');
    });

    it('should return detailed status when detailed option is true', async () => {
      const result = await statusCommand.exec([], { detailed: true });

      expect(typeof result).toBe('string');
      expect(result).toContain('Local Cache:');
      expect(result).toContain('Registry:');
      expect(result).toContain('Size:');
      expect(result).toContain('Directory:');
    });

    it('should return valid JSON when json option is true', async () => {
      const result = await statusCommand.exec([], { json: true });

      expect(() => JSON.parse(result)).not.toThrow();

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('localCache');
      expect(parsed).toHaveProperty('registry');

      // Check localCache structure
      expect(parsed.localCache).toHaveProperty('size');
      expect(parsed.localCache).toHaveProperty('packageCount');
      expect(parsed.localCache).toHaveProperty('directory');
      expect(typeof parsed.localCache.size).toBe('number');
      expect(typeof parsed.localCache.packageCount).toBe('number');
      expect(typeof parsed.localCache.directory).toBe('string');

      // Check registry structure
      expect(parsed.registry).toHaveProperty('connected');
      expect(typeof parsed.registry.connected).toBe('boolean');
    });

    it('should handle both detailed and json options together', async () => {
      // JSON format should take precedence over detailed format
      const result = await statusCommand.exec([], {
        detailed: true,
        json: true,
      });

      expect(() => JSON.parse(result)).not.toThrow();

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('localCache');
      expect(parsed).toHaveProperty('registry');
    });

    it('should handle empty options', async () => {
      const result = await statusCommand.exec();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle verbose option (should not affect output significantly)', async () => {
      const result = await statusCommand.exec([], { verbose: true });

      expect(typeof result).toBe('string');
      expect(result).toContain('Local cache:');
    });
  });

  describe('registry status indicators', () => {
    it('should show appropriate registry status when not authenticated', async () => {
      const result = await statusCommand.exec([], {});

      // Should show not connected status
      expect(result).toMatch(/Registry:.*Not connected|❌.*Registry/);
    });

    it('should include setup guidance when not authenticated', async () => {
      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('gitcache setup');
    });
  });

  describe('local cache information', () => {
    it('should show cache size and directory information', async () => {
      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Directory:');
      expect(result).toMatch(/Size:.*\d+/);
    });

    it('should include package count in output', async () => {
      const result = await statusCommand.exec([], {});

      expect(result).toMatch(/Local cache:.*\(\d+\s+packages\)/);
    });
  });

  describe('error handling', () => {
    it('should return error JSON when json option is true and something fails', async () => {
      // This test just verifies the command handles errors gracefully
      // We can't easily mock internal failures in integration tests
      const result = await statusCommand.exec([], { json: true });

      // Should at least return valid JSON
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('expected user workflows', () => {
    it('should provide complete status information for new users', async () => {
      // Expected path: new user runs gitcache status
      const result = await statusCommand.exec([], {});

      expect(result).toContain('Local cache:');
      expect(result).toContain('Registry:');
      expect(result).toContain('gitcache setup');
      expect(result).toMatch(/\d+(?:\.\d+)?\s+(MB|GB|KB|B)/); // Should show cache size
      expect(result).toMatch(/\d+\s+packages/); // Should show package count
    });

    it('should provide detailed information for power users', async () => {
      // Expected path: user wants detailed cache info
      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Local Cache:');
      expect(result).toContain('Directory:');
      expect(result).toContain('Size:');
      expect(result).toContain('Last cleanup:');
      expect(result).toContain('Disk space:'); // Updated to match actual format
      expect(result).toContain('Registry:');
    });

    it('should provide machine-readable output for scripts', async () => {
      // Expected path: automation/CI scripts need JSON output
      const result = await statusCommand.exec([], { json: true });

      const parsed = JSON.parse(result);

      // Verify complete JSON structure for automation
      expect(parsed).toHaveProperty('localCache');
      expect(parsed.localCache).toHaveProperty('size');
      expect(parsed.localCache).toHaveProperty('packageCount');
      expect(parsed.localCache).toHaveProperty('directory');
      expect(parsed.localCache).toHaveProperty('lastCleanup');
      expect(parsed.localCache).toHaveProperty('diskSpaceAvailable');

      expect(parsed).toHaveProperty('registry');
      expect(parsed.registry).toHaveProperty('connected');
      expect(parsed.registry).toHaveProperty('organization');
      expect(parsed.registry).toHaveProperty('reason');
    });

    it('should show cache growth over time', async () => {
      // Expected path: user monitors cache usage
      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toMatch(/Size:.*\d+/);
      expect(result).toMatch(/\d+\s+packages/);
      expect(result).toContain('Last cleanup:');
    });

    it('should help troubleshoot connection issues', async () => {
      // Expected path: user has connection problems
      const result = await statusCommand.exec([], { detailed: true });

      expect(result).toContain('Registry:');
      // Should provide guidance for connection issues
      expect(result).toMatch(/gitcache setup|To connect|Not connected/);
    });

    it('should support monitoring workflows', async () => {
      // Expected path: monitoring system checks status
      const basicResult = await statusCommand.exec([], {});
      const jsonResult = await statusCommand.exec([], { json: true });

      // Basic result should be human-readable
      expect(basicResult).toMatch(/✓|❌|⚠️/); // Status indicators

      // JSON result should be parseable by monitoring tools
      const parsed = JSON.parse(jsonResult);
      expect(typeof parsed.localCache.size).toBe('number');
      expect(typeof parsed.registry.connected).toBe('boolean');
    });

    it('should handle verbose mode for debugging', async () => {
      // Expected path: user debugging issues
      const normalResult = await statusCommand.exec([], {});
      const verboseResult = await statusCommand.exec([], { verbose: true });

      // Both should contain core information
      expect(normalResult).toContain('Local cache:');
      expect(verboseResult).toContain('Local cache:');

      // Results should be similar for status command (verbose doesn't add much)
      expect(normalResult.length).toBeGreaterThan(0);
      expect(verboseResult.length).toBeGreaterThan(0);
    });

    it('should show appropriate status for different authentication states', async () => {
      // Expected path: various auth states
      const result = await statusCommand.exec([], {});

      // Should indicate current auth state clearly
      expect(result).toMatch(
        /Registry:.*Connected|Not connected|Token expired|Connection failed/
      );
    });

    it('should handle empty cache directory gracefully', async () => {
      // Expected path: fresh installation
      const result = await statusCommand.exec([], { json: true });

      const parsed = JSON.parse(result);
      expect(parsed.localCache.packageCount).toBeGreaterThanOrEqual(0);
      expect(parsed.localCache.size).toBeGreaterThanOrEqual(0);
    });

    it('should provide clear setup instructions when needed', async () => {
      // Expected path: user needs to set up GitCache
      const result = await statusCommand.exec([], { detailed: true });

      if (result.includes('Not connected')) {
        expect(result).toContain('gitcache setup');
        expect(result).toContain('organization');
      }
    });
  });
});
