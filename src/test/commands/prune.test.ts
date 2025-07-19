import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prune } from '../../commands/prune.js';

// Mock the prune library
vi.mock('../../lib/prune.js');
// Mock the config library
vi.mock('../../lib/config.js');

const { pruneCacheToSize, calculateCacheSize, getCacheEntries, formatBytes } =
  await import('../../lib/prune.js');

const { getDefaultMaxCacheSize, setDefaultMaxCacheSize } = await import(
  '../../lib/config.js'
);

const mockPruneCacheToSize = vi.mocked(pruneCacheToSize);
const mockCalculateCacheSize = vi.mocked(calculateCacheSize);
const mockGetCacheEntries = vi.mocked(getCacheEntries);
const mockFormatBytes = vi.mocked(formatBytes);
const mockGetDefaultMaxCacheSize = vi.mocked(getDefaultMaxCacheSize);
const mockSetDefaultMaxCacheSize = vi.mocked(setDefaultMaxCacheSize);

describe('Prune Command', () => {
  let prune: Prune;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    prune = new Prune();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Setup default mocks
    mockFormatBytes.mockImplementation((bytes: number) => `${bytes} B`);
    mockCalculateCacheSize.mockReturnValue(1000);
    mockGetCacheEntries.mockReturnValue([]);
    mockGetDefaultMaxCacheSize.mockReturnValue('5GB');
    mockSetDefaultMaxCacheSize.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should have correct static properties', () => {
    expect(Prune.description).toBe(
      'Prune old cache entries to free disk space using LRU (Least Recently Used) strategy'
    );
    expect(Prune.commandName).toBe('prune');
    expect(Prune.usage).toEqual([
      '--max-size 5GB',
      '--max-size 1TB --dry-run',
      '--max-size 10GB --set-default',
      '--dry-run',
    ]);
    expect(Prune.params).toEqual([
      'max-size',
      'dry-run',
      'set-default',
      'verbose',
    ]);
  });

  it('should use default 5GB max size when not specified', async () => {
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 1000,
      entriesScanned: 1,
      entriesDeleted: 0,
      spaceSaved: 0,
      maxSizeBytes: 5 * 1024 * 1024 * 1024,
      wasWithinLimit: true,
    });

    await prune.exec([], {});

    expect(mockPruneCacheToSize).toHaveBeenCalledWith('5GB', { dryRun: false });
  });

  it('should use custom max size when specified', async () => {
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 1000,
      entriesScanned: 1,
      entriesDeleted: 0,
      spaceSaved: 0,
      maxSizeBytes: 1024 * 1024 * 1024,
      wasWithinLimit: true,
    });

    await prune.exec([], { 'max-size': '1GB' });

    expect(mockPruneCacheToSize).toHaveBeenCalledWith('1GB', { dryRun: false });
  });

  it('should enable dry run when specified', async () => {
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 1000,
      entriesScanned: 1,
      entriesDeleted: 0,
      spaceSaved: 0,
      maxSizeBytes: 5 * 1024 * 1024 * 1024,
      wasWithinLimit: true,
    });

    await prune.exec([], { 'dry-run': true });

    expect(mockPruneCacheToSize).toHaveBeenCalledWith('5GB', { dryRun: true });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Simulating cache prune')
    );
  });

  it('should display cache within limit message', async () => {
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 1000,
      entriesScanned: 1,
      entriesDeleted: 0,
      spaceSaved: 0,
      maxSizeBytes: 5 * 1024 * 1024 * 1024,
      wasWithinLimit: true,
    });

    await prune.exec([], {});

    expect(consoleSpy).toHaveBeenCalledWith(
      '✅ Cache is already within size limit - no pruning needed'
    );
  });

  it('should display pruning results when entries are deleted', async () => {
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 2000,
      entriesScanned: 2,
      entriesDeleted: 1,
      spaceSaved: 1000,
      maxSizeBytes: 1024,
      wasWithinLimit: false,
    });

    await prune.exec([], {});

    // Check that the final success message is called
    expect(consoleSpy).toHaveBeenCalledWith(
      '\n✅ Cache pruning completed successfully'
    );
    // Check for other key messages
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Entries deleted: 1')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Space freed: 1000 B')
    );
  });

  it('should display dry run message when in dry run mode', async () => {
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 2000,
      entriesScanned: 2,
      entriesDeleted: 1,
      spaceSaved: 1000,
      maxSizeBytes: 1024,
      wasWithinLimit: false,
    });

    await prune.exec([], { 'dry-run': true });

    // Check that the dry run message is called
    expect(consoleSpy).toHaveBeenCalledWith(
      '\n💡 Use without --dry-run to actually delete these entries'
    );
    // Check for other key messages
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Entries to delete: 1')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Space to free: 1000 B')
    );
  });

  it('should display verbose cache entry details when verbose is enabled', async () => {
    const mockEntries = [
      {
        path: '/cache/abc123-darwin-arm64',
        size: 1000,
        accessTime: new Date('2023-01-01'),
        commitSha: 'abc123def456',
        platform: 'darwin-arm64',
      },
      {
        path: '/cache/def456-linux-x64',
        size: 2000,
        accessTime: new Date('2023-01-02'),
        commitSha: 'def456ghi789',
        platform: 'linux-x64',
      },
    ];

    mockGetCacheEntries.mockReturnValue(mockEntries);
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 3000,
      entriesScanned: 2,
      entriesDeleted: 0,
      spaceSaved: 0,
      maxSizeBytes: 5 * 1024 * 1024 * 1024,
      wasWithinLimit: true,
    });

    await prune.exec([], { verbose: true });

    // Check that the verbose entries header is called
    expect(consoleSpy).toHaveBeenCalledWith(
      '\n📋 Cache entries (oldest first):'
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('1. abc123de (darwin-arm64) - 1000 B')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('2. def456gh (linux-x64) - 2000 B')
    );
  });

  it('should not show verbose entries when cache is empty', async () => {
    mockGetCacheEntries.mockReturnValue([]);
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 0,
      entriesScanned: 0,
      entriesDeleted: 0,
      spaceSaved: 0,
      maxSizeBytes: 5 * 1024 * 1024 * 1024,
      wasWithinLimit: true,
    });

    await prune.exec([], { verbose: true });

    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Cache entries (oldest first)')
    );
  });

  it('should display current cache status', async () => {
    mockCalculateCacheSize.mockReturnValue(5000);
    mockGetCacheEntries.mockReturnValue([
      {
        path: '/cache/test',
        size: 1000,
        accessTime: new Date(),
        commitSha: 'test',
        platform: 'test',
      },
    ]);
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 5000,
      entriesScanned: 1,
      entriesDeleted: 0,
      spaceSaved: 0,
      maxSizeBytes: 5 * 1024 * 1024 * 1024,
      wasWithinLimit: true,
    });

    await prune.exec([], {});

    expect(consoleSpy).toHaveBeenCalledWith(
      '📊 Current cache size: 5000 B (1 entries)'
    );
  });

  it('should set default cache size when --set-default is used with --max-size', async () => {
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 1000,
      entriesScanned: 1,
      entriesDeleted: 0,
      spaceSaved: 0,
      maxSizeBytes: 10 * 1024 * 1024 * 1024,
      wasWithinLimit: true,
    });

    await prune.exec([], { 'max-size': '10GB', 'set-default': true });

    expect(mockSetDefaultMaxCacheSize).toHaveBeenCalledWith('10GB');
    expect(consoleSpy).toHaveBeenCalledWith(
      '📝 Default max cache size set to: 10GB'
    );
    expect(mockPruneCacheToSize).toHaveBeenCalledWith('10GB', {
      dryRun: false,
    });
  });

  it('should not set default cache size when --set-default is used without --max-size', async () => {
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 1000,
      entriesScanned: 1,
      entriesDeleted: 0,
      spaceSaved: 0,
      maxSizeBytes: 5 * 1024 * 1024 * 1024,
      wasWithinLimit: true,
    });

    await prune.exec([], { 'set-default': true });

    expect(mockSetDefaultMaxCacheSize).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Default max cache size set to')
    );
    expect(mockPruneCacheToSize).toHaveBeenCalledWith('5GB', { dryRun: false });
  });

  it('should handle camelCase options correctly', async () => {
    mockPruneCacheToSize.mockReturnValue({
      totalSize: 1000,
      entriesScanned: 1,
      entriesDeleted: 0,
      spaceSaved: 0,
      maxSizeBytes: 2 * 1024 * 1024 * 1024,
      wasWithinLimit: true,
    });

    await prune.exec([], { maxSize: '2GB', setDefault: true, dryRun: true });

    expect(mockSetDefaultMaxCacheSize).toHaveBeenCalledWith('2GB');
    expect(mockPruneCacheToSize).toHaveBeenCalledWith('2GB', { dryRun: true });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Simulating cache prune')
    );
  });
});
