import { existsSync, statSync } from 'node:fs';
import { BaseCommand } from '../base-cmd.js';
import { AuthManager } from '../lib/auth-manager.js';
import {
  calculateCacheSize,
  formatBytes,
  getCacheEntries,
} from '../lib/prune.js';
import { getCacheDir } from '../lib/utils/path.js';

export interface StatusOptions {
  detailed?: boolean;
  json?: boolean;
  verbose?: boolean;
}

interface LocalCacheInfo {
  size: number;
  packageCount: number;
  lastCleanup: Date | null;
  directory: string;
}

interface RegistryInfo {
  connected: boolean;
  reason?: string;
  error?: string;
}

interface StatusInfo {
  localCache: LocalCacheInfo;
  registry: RegistryInfo;
}

/**
 * Status command - shows GitCache cache status and basic registry connectivity
 * For authentication details, use: gitcache auth status
 */
export class Status extends BaseCommand {
  static description = 'Show GitCache cache status and registry connectivity';
  static commandName = 'status';
  static usage = ['', '--detailed', '--json'];
  static params = ['detailed', 'json', 'verbose'];
  static argumentSpec = { type: 'none' } as const;

  private authManager: AuthManager;

  constructor() {
    super();
    this.authManager = new AuthManager();
  }

  async exec(_args: string[] = [], opts: StatusOptions = {}): Promise<string> {
    try {
      const statusInfo = await this.collectStatusInfo();

      if (opts.json) {
        return JSON.stringify(statusInfo, null, 2);
      }

      if (opts.detailed) {
        return this.formatDetailedStatus(statusInfo);
      }

      return this.formatBasicStatus(statusInfo);
    } catch (error) {
      if (opts.json) {
        return JSON.stringify({
          error: 'Failed to collect status information',
          message: String(error),
        });
      }
      throw new Error(`Failed to get status: ${String(error)}`);
    }
  }

  /**
   * Collect all status information
   */
  private async collectStatusInfo(): Promise<StatusInfo> {
    const [localCacheInfo, registryInfo] = await Promise.all([
      this.getLocalCacheInfo(),
      this.getRegistryInfo(),
    ]);

    return {
      localCache: localCacheInfo,
      registry: registryInfo,
    };
  }

  /**
   * Get local cache information
   */
  private async getLocalCacheInfo(): Promise<LocalCacheInfo> {
    const cacheDir = getCacheDir();
    const cacheSize = calculateCacheSize();

    // Count actual tarballs
    const tarballCount = await this.countTarballs();

    // Get last cleanup time (approximate from directory modification time)
    let lastCleanup: Date | null = null;
    try {
      if (existsSync(cacheDir)) {
        const dirStat = statSync(cacheDir);
        lastCleanup = dirStat.mtime;
      }
    } catch {
      // Ignore errors getting directory stats
    }

    return {
      size: cacheSize,
      packageCount: tarballCount,
      lastCleanup,
      directory: cacheDir,
    };
  }

  /**
   * Count the number of built tarballs in the cache
   */
  private async countTarballs(): Promise<number> {
    const cacheEntries = getCacheEntries();
    return cacheEntries.length;
  }

  /**
   * Get basic registry connection status
   */
  private async getRegistryInfo(): Promise<RegistryInfo> {
    // Simple connectivity check - just check if we have valid auth
    try {
      const isAuthenticated = this.authManager.isAuthenticated();
      if (!isAuthenticated) {
        return {
          connected: false,
          reason: 'not_authenticated',
        };
      }

      // Try a simple validation
      const isValid = await this.authManager.validateToken();
      return {
        connected: isValid,
        reason: isValid ? undefined : 'invalid_token',
      };
    } catch (error) {
      return {
        connected: false,
        reason: 'network_error',
        error: String(error),
      };
    }
  }

  /**
   * Format basic status output
   */
  private formatBasicStatus(status: StatusInfo): string {
    const lines: string[] = [];

    // Local cache status
    const cacheSize = formatBytes(status.localCache.size);
    const packageCount = status.localCache.packageCount;
    lines.push(`📦 Local cache: ${cacheSize} (${packageCount} packages)`);

    // Registry status
    if (status.registry.connected) {
      lines.push(`🔗 Registry: Connected`);
    } else {
      lines.push(this.formatRegistryError(status.registry));
    }

    // Add helpful message about auth details
    if (!status.registry.connected) {
      lines.push('');
      lines.push('💡 For authentication details: gitcache auth status');
    }

    return lines.join('\n');
  }

  /**
   * Format detailed status output
   */
  private formatDetailedStatus(status: StatusInfo): string {
    const lines: string[] = [];

    // Local Cache section
    lines.push('Local Cache:');
    lines.push(
      `  Size: ${formatBytes(status.localCache.size)} (${status.localCache.packageCount} packages)`
    );
    lines.push(`  Directory: ${status.localCache.directory}`);

    if (status.localCache.lastCleanup) {
      const daysSince = Math.round(
        (Date.now() - status.localCache.lastCleanup.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      lines.push(`  Last cleanup: ${daysSince} days ago`);
    } else {
      lines.push('  Last cleanup: Unknown');
    }

    lines.push('');

    // Registry section
    lines.push('Registry:');
    if (status.registry.connected) {
      lines.push(`  Status: Connected`);

      // Add API endpoint info
      const apiUrl =
        process.env.GITCACHE_API_URL || 'https://api.grata-labs.com';
      lines.push(`  API endpoint: ${apiUrl}`);
    } else {
      lines.push('  Status: Not connected');
      lines.push(`  Reason: ${this.getDisconnectionReason(status.registry)}`);
    }

    lines.push('');
    lines.push('💡 For authentication and organization details:');
    lines.push('   gitcache auth status');

    return lines.join('\n');
  }

  /**
   * Format registry connection error
   */
  private formatRegistryError(registry: RegistryInfo): string {
    if (registry.reason === 'not_authenticated') {
      return '❌ Registry: Not authenticated\n   Run: gitcache auth login <your-email>';
    }

    if (registry.reason === 'invalid_token') {
      return '⚠️  Registry: Token expired\n   Run: gitcache auth login to refresh';
    }

    if (registry.reason === 'network_error') {
      return '⚠️  Registry: Connection failed\n   Check your network connection';
    }

    return '❌ Registry: Not connected';
  }

  /**
   * Get disconnection reason for detailed output
   */
  private getDisconnectionReason(registry: RegistryInfo): string {
    if (registry.reason === 'not_authenticated') {
      return 'Not authenticated (run: gitcache auth login <your-email>)';
    }

    if (registry.reason === 'invalid_token') {
      return 'Token expired (run: gitcache auth login to refresh)';
    }

    if (registry.reason === 'network_error') {
      return `Network error: ${registry.error || 'Unknown error'}`;
    }

    return 'Unknown';
  }
}
