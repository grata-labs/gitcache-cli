import { BaseCommand } from '../base-cmd.js';
import {
  getDefaultMaxCacheSize,
  loadConfig,
  setDefaultMaxCacheSize,
} from '../lib/config.js';
import { parseSizeToBytes } from '../lib/prune.js';

export interface ConfigOptions {
  get?: string;
  set?: string;
  list?: boolean;
}

export class Config extends BaseCommand {
  static description = 'Manage gitcache configuration';
  static commandName = 'config';
  static usage = [
    '--list',
    '--get max-cache-size',
    '--set max-cache-size=10GB',
  ];
  static params = ['get', 'set', 'list'];

  async exec(args: string[], opts: ConfigOptions = {}): Promise<string> {
    if (opts.list) {
      return this.listConfig();
    }

    if (opts.get) {
      return this.getConfigValue(opts.get);
    }

    if (opts.set) {
      return this.setConfigValue(opts.set);
    }

    // Default: show current configuration
    return this.listConfig();
  }

  private listConfig(): string {
    const config = loadConfig();
    const output = ['📋 GitCache Configuration:', ''];

    output.push(`  max-cache-size: ${config.maxCacheSize}`);

    output.push('');
    output.push('💡 Use --set to change values:');
    output.push('   gitcache config --set max-cache-size=10GB');

    return output.join('\n');
  }

  private getConfigValue(key: string): string {
    const normalizedKey = key.toLowerCase().replace(/-/g, '');

    if (normalizedKey === 'maxcachesize') {
      const value = getDefaultMaxCacheSize();
      return `max-cache-size: ${value}`;
    }

    throw new Error(`Unknown config key: ${key}. Available: max-cache-size`);
  }

  private setConfigValue(assignment: string): string {
    const [key, value] = assignment.split('=');

    if (!key || !value) {
      throw new Error('Invalid format. Use: --set key=value');
    }

    const normalizedKey = key.trim().toLowerCase().replace(/-/g, '');
    const trimmedValue = value.trim();

    if (normalizedKey === 'maxcachesize') {
      // Validate the size format
      try {
        parseSizeToBytes(trimmedValue);
      } catch {
        throw new Error(
          `Invalid size format: ${trimmedValue}. Use format like '5GB', '1TB', '100MB'`
        );
      }

      setDefaultMaxCacheSize(trimmedValue);
      return `✅ Set max-cache-size to: ${trimmedValue}`;
    }

    throw new Error(`Unknown config key: ${key}. Available: max-cache-size`);
  }
}
