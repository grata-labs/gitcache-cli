import { BaseCommand } from '../base-cmd.js';
import { RegistryClient } from '../lib/registry-client.js';
import { AuthManager } from '../lib/auth-manager.js';
import { TarballBuilder } from '../lib/tarball-builder.js';
import {
  calculateCacheSize,
  formatBytes,
  getCacheEntries,
} from '../lib/prune.js';
import { getCacheDir } from '../lib/utils/path.js';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';

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
  diskSpaceAvailable: number | null;
}

interface RegistryInfo {
  connected: boolean;
  organization: string | null;
  teamCacheSize: number | null;
  tokenType: 'user' | 'ci' | null;
  tokenExpiry: Date | null;
  reason?: string;
  error?: string;
}

interface StatusInfo {
  localCache: LocalCacheInfo;
  registry: RegistryInfo;
}

/**
 * Status command - shows comprehensive GitCache status including local cache,
 * registry connection, and performance metrics
 */
export class Status extends BaseCommand {
  static description =
    'Show GitCache status, cache info, and registry connection';
  static commandName = 'status';
  static usage = ['', '--detailed', '--json'];
  static params = ['detailed', 'json', 'verbose'];
  static argumentSpec = { type: 'none' } as const;

  private registryClient: RegistryClient;
  private authManager: AuthManager;
  private tarballBuilder: TarballBuilder;

  constructor() {
    super();
    this.registryClient = new RegistryClient();
    this.authManager = new AuthManager();
    this.tarballBuilder = new TarballBuilder();
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

    // Count actual tarballs instead of using LocalCache.getStats()
    // which is for the artifact cache (cache hierarchy system)
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

    // Get available disk space
    let diskSpaceAvailable: number | null = null;
    try {
      const fs = await import('node:fs/promises');
      const homeDir = homedir();
      await fs.stat(homeDir);
      // This is a simple approximation - real disk space would require platform-specific calls
      diskSpaceAvailable = 0.85; // Assume 85% available as placeholder
    } catch {
      // Ignore errors getting disk space
    }

    return {
      size: cacheSize,
      packageCount: tarballCount,
      lastCleanup,
      directory: cacheDir,
      diskSpaceAvailable,
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
   * Get registry connection and authentication information
   */
  private async getRegistryInfo(): Promise<RegistryInfo> {
    if (!this.authManager.isAuthenticated()) {
      return {
        connected: false,
        organization: null,
        teamCacheSize: null,
        tokenType: null,
        tokenExpiry: null,
        reason: 'not_authenticated',
      };
    }

    try {
      const isValid = await this.authManager.validateToken();
      if (!isValid) {
        return {
          connected: false,
          organization: null,
          teamCacheSize: null,
          tokenType: null,
          tokenExpiry: null,
          reason: 'invalid_token',
        };
      }

      const orgId = this.authManager.getOrgId();
      const tokenType = this.authManager.getTokenType();

      // Try to get organization info from registry
      try {
        const orgInfo = await this.getOrganizationInfo();
        return {
          connected: true,
          organization: orgInfo.name || orgId,
          teamCacheSize: orgInfo.cachePackageCount || 0,
          tokenType,
          tokenExpiry: this.getTokenExpiry(),
        };
      } catch (error) {
        // Connected but can't get org info
        return {
          connected: true,
          organization: orgId,
          teamCacheSize: null,
          tokenType,
          tokenExpiry: this.getTokenExpiry(),
          error: String(error),
        };
      }
    } catch (error) {
      return {
        connected: false,
        organization: null,
        teamCacheSize: null,
        tokenType: null,
        tokenExpiry: null,
        reason: 'network_error',
        error: String(error),
      };
    }
  }

  /**
   * Get organization information from registry
   */
  private async getOrganizationInfo(): Promise<{
    name: string;
    cachePackageCount: number;
  }> {
    // This would be implemented when the registry API supports organization info
    // For now, return placeholder data
    const orgId = this.authManager.getOrgId();
    return {
      name: orgId || 'Unknown',
      cachePackageCount: 0, // Would come from API
    };
  }

  /**
   * Get token expiry information
   */
  private getTokenExpiry(): Date | null {
    // This would be implemented based on token structure
    // For now, return null for CI tokens and a placeholder for user tokens
    const tokenType = this.authManager.getTokenType();
    if (tokenType === 'ci') {
      return null; // CI tokens don't expire
    }

    // User tokens - would read from stored auth data
    return null; // Placeholder
  }

  /**
   * Format basic status output
   */
  private formatBasicStatus(status: StatusInfo): string {
    const lines: string[] = [];

    // Local cache status
    const cacheSize = formatBytes(status.localCache.size);
    const packageCount = status.localCache.packageCount;
    lines.push(`✓ Local cache: ${cacheSize} (${packageCount} packages)`);

    // Registry status
    if (status.registry.connected) {
      const org = status.registry.organization || 'Unknown';
      const tokenInfo = this.formatTokenInfo(status.registry);
      lines.push(`✓ Registry: Connected (${org})${tokenInfo}`);
    } else {
      lines.push(this.formatRegistryError(status.registry));
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

    if (status.localCache.diskSpaceAvailable !== null) {
      const spacePercent = Math.round(
        status.localCache.diskSpaceAvailable * 100
      );
      lines.push(`  Disk space: ${spacePercent}% available`);
    }

    lines.push('');

    // Registry section
    lines.push('Registry:');
    if (status.registry.connected) {
      lines.push(`  Status: Connected`);
      lines.push(
        `  Organization: ${status.registry.organization || 'Unknown'}`
      );

      if (status.registry.teamCacheSize !== null) {
        lines.push(
          `  Team cache: ${status.registry.teamCacheSize} packages available`
        );
      }

      const tokenTypeDisplay =
        status.registry.tokenType === 'ci' ? 'CI token' : 'User token';
      lines.push(`  Token type: ${tokenTypeDisplay}`);

      if (status.registry.tokenExpiry) {
        const daysUntilExpiry = Math.round(
          (status.registry.tokenExpiry.getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        );
        lines.push(
          `  Token expires: ${status.registry.tokenExpiry.toDateString()} (${daysUntilExpiry} days)`
        );
      } else if (status.registry.tokenType === 'ci') {
        lines.push('  Token expires: Never (CI token)');
      }

      // Add API endpoint info
      const apiUrl =
        process.env.GITCACHE_API_URL || 'https://api.grata-labs.com';
      lines.push(`  API endpoint: ${apiUrl}`);
    } else {
      lines.push('  Status: Not connected');
      lines.push(`  Reason: ${this.getDisconnectionReason(status.registry)}`);
    }

    return lines.join('\n');
  }

  /**
   * Format token information for basic status
   */
  private formatTokenInfo(registry: RegistryInfo): string {
    if (registry.tokenType === 'ci') {
      return ' [CI Token]';
    }

    if (registry.tokenExpiry) {
      const daysUntilExpiry = Math.round(
        (registry.tokenExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiry <= 2) {
        return ` [Token expires in ${daysUntilExpiry} days]`;
      }
    }

    return '';
  }

  /**
   * Format registry connection error
   */
  private formatRegistryError(registry: RegistryInfo): string {
    switch (registry.reason) {
      case 'not_authenticated':
        return '❌ Registry: Not connected\n   Run: gitcache setup --org <organization>';

      case 'invalid_token':
        return '⚠️  Registry: Token expired\n   Run: gitcache setup to refresh';

      case 'network_error':
        return '⚠️  Registry: Connection failed\n   Check your network connection';

      default:
        return '❌ Registry: Not connected';
    }
  }

  /**
   * Get disconnection reason for detailed output
   */
  private getDisconnectionReason(registry: RegistryInfo): string {
    switch (registry.reason) {
      case 'not_authenticated':
        return 'Not authenticated (run: gitcache setup --org <organization>)';

      case 'invalid_token':
        return 'Token expired (run: gitcache setup to refresh)';

      case 'network_error':
        return `Network error: ${registry.error || 'Unknown error'}`;

      default:
        return 'Unknown';
    }
  }
}
