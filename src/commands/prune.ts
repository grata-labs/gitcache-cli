import { BaseCommand } from '../base-cmd.js';
import {
  getDefaultMaxCacheSize,
  setDefaultMaxCacheSize,
} from '../lib/config.js';
import {
  calculateCacheSize,
  formatBytes,
  getCacheEntries,
  pruneCacheToSize,
  type PruneOptions,
} from '../lib/prune.js';

export interface PruneCommandOptions extends PruneOptions {
  'max-size'?: string;
  maxSize?: string; // camelCase version
  'dry-run'?: boolean;
  dryRun?: boolean; // camelCase version
  'set-default'?: boolean;
  setDefault?: boolean; // camelCase version
  verbose?: boolean;
}

export class Prune extends BaseCommand {
  static description =
    'Prune old cache entries to free disk space using LRU (Least Recently Used) strategy';
  static commandName = 'prune';
  static usage = [
    '--max-size 5GB',
    '--max-size 1TB --dry-run',
    '--max-size 10GB --set-default',
    '--dry-run',
  ];
  static params = ['max-size', 'dry-run', 'set-default', 'verbose'];

  async exec(args: string[], opts: PruneCommandOptions = {}): Promise<string> {
    const dryRun = opts['dry-run'] || opts.dryRun || false;
    const setDefault = opts['set-default'] || opts.setDefault || false;
    const verbose = opts.verbose || false;
    const maxSizeOption = opts['max-size'] || opts.maxSize;

    // Handle setting new default first
    if (setDefault && maxSizeOption) {
      setDefaultMaxCacheSize(maxSizeOption);
      console.log(`📝 Default max cache size set to: ${maxSizeOption}`);
      if (!dryRun) {
        console.log(
          '💡 This will be used for future prune operations and install cache advice'
        );
      }
    }

    // Now get the correct max size (either provided or default)
    const defaultMaxSize = getDefaultMaxCacheSize();
    const maxSize = maxSizeOption || defaultMaxSize;
    const usingDefault = !maxSizeOption;
    console.log(
      `🧹 ${dryRun ? 'Simulating' : 'Performing'} cache prune with ${maxSize} limit${usingDefault ? ' (default)' : ''}...`
    );

    // Show current cache state
    const currentSize = calculateCacheSize();
    const entries = getCacheEntries();

    console.log(
      `📊 Current cache size: ${formatBytes(currentSize)} (${entries.length} entries)`
    );

    if (verbose && entries.length > 0) {
      console.log('\n📋 Cache entries (oldest first):');
      entries.forEach((entry, index) => {
        const ago = Math.floor(
          (Date.now() - entry.accessTime.getTime()) / (1000 * 60 * 60 * 24)
        );
        console.log(
          `  ${index + 1}. ${entry.commitSha.substring(0, 8)} (${entry.platform}) - ${formatBytes(entry.size)} - ${ago}d ago`
        );
      });
    }

    // Perform the prune operation
    const result = pruneCacheToSize(maxSize, { dryRun });

    console.log(`\n📈 Prune Results:`);
    console.log(`   Max size limit: ${formatBytes(result.maxSizeBytes)}`);
    console.log(`   Total cache size: ${formatBytes(result.totalSize)}`);
    console.log(`   Entries scanned: ${result.entriesScanned}`);

    if (result.wasWithinLimit) {
      console.log('✅ Cache is already within size limit - no pruning needed');
    } else {
      console.log(
        `   Entries ${dryRun ? 'to delete' : 'deleted'}: ${result.entriesDeleted}`
      );
      console.log(
        `   Space ${dryRun ? 'to free' : 'freed'}: ${formatBytes(result.spaceSaved)}`
      );
      console.log(
        `   Final cache size: ${formatBytes(result.totalSize - result.spaceSaved)}`
      );

      if (dryRun) {
        console.log(
          '\n💡 Use without --dry-run to actually delete these entries'
        );
      } else {
        console.log('\n✅ Cache pruning completed successfully');
      }
    }

    return '';
  }
}
