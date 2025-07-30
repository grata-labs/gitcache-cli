import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Install } from '../../commands/install.js';

// Mock dependencies
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('../../lib/prune.js');
vi.mock('../../lib/config.js');
vi.mock('../../lockfile/scan.js');
vi.mock('../../lib/tarball-builder.js');

const { spawnSync } = await import('node:child_process');
const { existsSync, mkdirSync } = await import('node:fs');
const { calculateCacheSize, formatBytes, parseSizeToBytes } = await import(
  '../../lib/prune.js'
);
const { getDefaultMaxCacheSize } = await import('../../lib/config.js');

const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockCalculateCacheSize = vi.mocked(calculateCacheSize);
const mockFormatBytes = vi.mocked(formatBytes);
const mockParseSizeToBytes = vi.mocked(parseSizeToBytes);
const mockGetDefaultMaxCacheSize = vi.mocked(getDefaultMaxCacheSize);

describe('Install Cache Size Reporting', () => {
  let install: Install;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    install = new Install();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Setup default mocks for successful install
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      pid: 1234,
      output: [null, Buffer.from(''), Buffer.from('')],
      signal: null,
    });

    mockExistsSync.mockReturnValue(false); // No lockfile by default
    mockMkdirSync.mockReturnValue(undefined);
    mockCalculateCacheSize.mockReturnValue(1024 * 1024); // 1MB
    mockFormatBytes.mockReturnValue('1.0 MB');

    // Mock config system
    mockGetDefaultMaxCacheSize.mockReturnValue('5GB');
    mockParseSizeToBytes.mockReturnValue(5 * 1024 * 1024 * 1024); // 5GB
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should show cache size after successful install', async () => {
    await install.exec(['--save-dev', 'some-package']);

    expect(mockCalculateCacheSize).toHaveBeenCalled();
    expect(mockFormatBytes).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith('📊 Cache size: 1.0 MB');
  });

  it('should show prune advice when cache is large', async () => {
    // Mock large cache (4.1GB - just over 80% of 5GB default)
    const largeSize = 4.1 * 1024 * 1024 * 1024;
    mockCalculateCacheSize.mockReturnValue(largeSize);
    mockFormatBytes.mockReturnValue('4.1 GB');

    // Mock the config system to return 5GB limit
    mockGetDefaultMaxCacheSize.mockReturnValue('5GB');
    mockParseSizeToBytes.mockReturnValue(5 * 1024 * 1024 * 1024); // 5GB

    await install.exec([]);

    expect(consoleSpy).toHaveBeenCalledWith('📊 Cache size: 4.1 GB');
    expect(consoleSpy).toHaveBeenCalledWith(
      '💡 Your cache is getting large (4.1 GB)'
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '   Consider running: gitcache prune'
    );
  });

  it('should show custom limit advice when cache exceeds default', async () => {
    // Mock very large cache (6GB - exceeds 5GB default)
    const veryLargeSize = 6 * 1024 * 1024 * 1024;
    mockCalculateCacheSize.mockReturnValue(veryLargeSize);
    mockFormatBytes.mockReturnValue('6.0 GB');

    // Mock the config system to return 5GB limit
    mockGetDefaultMaxCacheSize.mockReturnValue('5GB');
    mockParseSizeToBytes.mockReturnValue(5 * 1024 * 1024 * 1024); // 5GB

    await install.exec([]);

    expect(consoleSpy).toHaveBeenCalledWith('📊 Cache size: 6.0 GB');
    expect(consoleSpy).toHaveBeenCalledWith(
      '💡 Your cache is getting large (6.0 GB)'
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '   Consider running: gitcache prune'
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '   Or set a custom limit: gitcache prune --max-size 10GB --set-default'
    );
  });

  it('should show basic prune info for medium cache size', async () => {
    // Mock medium cache (3GB - 60% of 5GB default)
    const mediumSize = 3 * 1024 * 1024 * 1024;
    mockCalculateCacheSize.mockReturnValue(mediumSize);
    mockFormatBytes.mockReturnValue('3.0 GB');

    // Mock the config system to return 5GB limit
    mockGetDefaultMaxCacheSize.mockReturnValue('5GB');
    mockParseSizeToBytes.mockReturnValue(5 * 1024 * 1024 * 1024); // 5GB

    await install.exec([]);

    expect(consoleSpy).toHaveBeenCalledWith('📊 Cache size: 3.0 GB');
    expect(consoleSpy).toHaveBeenCalledWith(
      "💡 Run 'gitcache prune' to manage cache size when needed"
    );
  });

  it('should not show prune advice for small cache', async () => {
    // Mock small cache (1GB - 20% of 5GB default)
    const smallSize = 1 * 1024 * 1024 * 1024;
    mockCalculateCacheSize.mockReturnValue(smallSize);
    mockFormatBytes.mockReturnValue('1.0 GB');

    await install.exec([]);

    expect(consoleSpy).toHaveBeenCalledWith('📊 Cache size: 1.0 GB');
    // Check that prune advice is not shown (but allow cache setup messages)
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Consider running: gitcache prune')
    );
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Run 'gitcache prune' to manage cache size")
    );
  });

  it('should not fail install if cache size calculation fails', async () => {
    mockCalculateCacheSize.mockImplementation(() => {
      throw new Error('Cache calculation failed');
    });

    await install.exec([]);

    // Should not throw and should not show cache size
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('📊 Cache size')
    );
  });

  it('should not show cache info when install fails', async () => {
    // Mock failed install
    mockSpawnSync.mockReturnValue({
      status: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      pid: 1234,
      output: [null, Buffer.from(''), Buffer.from('')],
      signal: null,
    });

    // Mock process.exit to prevent actual exit in test
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await install.exec(['some-package']);
    } catch {
      // Expected to throw due to mocked process.exit
    }

    expect(mockCalculateCacheSize).not.toHaveBeenCalled();
    expect(mockExit).not.toHaveBeenCalled();

    mockExit.mockRestore();
  });
});
