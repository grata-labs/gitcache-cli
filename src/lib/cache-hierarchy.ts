export interface CacheStrategy {
  has(packageId: string): Promise<boolean>;
  get(packageId: string): Promise<Buffer>;
  store(packageId: string, data: Buffer): Promise<void>;
  name: string;
}

export interface CacheHierarchyOptions {
  enableRegistry: boolean;
  enableGitFallback: boolean;
  verboseLogging: boolean;
}

export const DEFAULT_CACHE_OPTIONS: CacheHierarchyOptions = {
  enableRegistry: true,
  enableGitFallback: true,
  verboseLogging: process.env.GITCACHE_VERBOSE === 'true',
};

/**
 * Implements transparent caching hierarchy: Local → Registry → Git
 */
import { RegistryClient } from './registry-client.js';
import { LocalCache } from './local-cache.js';
import { GitCache } from './git-cache.js';

export class CacheHierarchy {
  private options: CacheHierarchyOptions;
  private strategies: CacheStrategy[];

  constructor(options: Partial<CacheHierarchyOptions> = {}) {
    this.options = { ...DEFAULT_CACHE_OPTIONS, ...options };
    this.strategies = this.buildStrategies();
  }

  /**
   * Check if an artifact exists in any cache
   */
  async has(packageId: string): Promise<boolean> {
    for (const strategy of this.strategies) {
      try {
        const exists = await strategy.has(packageId);
        if (exists) {
          this.logVerbose(`Found ${packageId} in ${strategy.name}`);
          return true;
        }
      } catch (error) {
        this.logVerbose(
          `Failed to check ${strategy.name} for ${packageId}: ${error}`
        );
        continue;
      }
    }
    return false;
  }

  /**
   * Get an artifact from the cache hierarchy with transparent fallback
   */
  async get(packageId: string): Promise<Buffer> {
    let data: Buffer | null = null;
    let sourceStrategy: string | null = null;

    // Try each strategy in order
    for (const strategy of this.strategies) {
      try {
        if (await strategy.has(packageId)) {
          data = await strategy.get(packageId);
          sourceStrategy = strategy.name;
          this.logVerbose(`Retrieved ${packageId} from ${sourceStrategy}`);
          break;
        }
      } catch (error) {
        this.logVerbose(`Failed to get from ${strategy.name}: ${error}`);
        continue;
      }
    }

    if (!data || !sourceStrategy) {
      throw new Error(`Package ${packageId} not found in any cache`);
    }

    // Propagate to higher-priority caches
    await this.propagateToHigherCaches(packageId, data, sourceStrategy);

    return data;
  }

  /**
   * Store an artifact in the appropriate cache layers
   */
  async store(packageId: string, data: Buffer): Promise<void> {
    const results: { strategy: string; success: boolean; error?: unknown }[] =
      [];

    // Store in all available caches
    for (const strategy of this.strategies) {
      try {
        await strategy.store(packageId, data);
        results.push({ strategy: strategy.name, success: true });
        this.logVerbose(`Stored ${packageId} in ${strategy.name}`);
      } catch (error) {
        results.push({ strategy: strategy.name, success: false, error });
        this.logVerbose(`Failed to store in ${strategy.name}: ${error}`);
      }
    }

    // At least local cache should succeed
    const localResult = results.find((r) => r.strategy === 'Local');
    if (!localResult?.success) {
      throw new Error('Failed to store in local cache');
    }
  }

  /**
   * Get cache status for all strategies
   */
  async getStatus(): Promise<
    { strategy: string; available: boolean; authenticated?: boolean }[]
  > {
    const status = [];

    for (const strategy of this.strategies) {
      try {
        if (strategy.name === 'Registry') {
          const registryClient = strategy as unknown as RegistryClient;
          status.push({
            strategy: strategy.name,
            available: true,
            authenticated: registryClient.isAuthenticated(),
          });
        } else {
          // For local and git, check if they can perform basic operations
          await strategy.has('__health_check__');
          status.push({
            strategy: strategy.name,
            available: true,
          });
        }
      } catch {
        status.push({
          strategy: strategy.name,
          available: false,
        });
      }
    }

    return status;
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    for (const strategy of this.strategies) {
      try {
        if ('clear' in strategy && typeof strategy.clear === 'function') {
          await (strategy as unknown as { clear(): Promise<void> }).clear();
          this.logVerbose(`Cleared ${strategy.name} cache`);
        }
      } catch (error) {
        this.logVerbose(`Failed to clear ${strategy.name}: ${error}`);
      }
    }
  }

  /**
   * Build the cache strategy hierarchy
   */
  private buildStrategies(): CacheStrategy[] {
    const strategies: CacheStrategy[] = [];

    // 1. Local cache (always enabled)
    strategies.push(new LocalCacheStrategy());

    // 2. Registry cache (optional)
    if (this.options.enableRegistry) {
      strategies.push(new RegistryStrategy());
    }

    // 3. Git cache (optional)
    if (this.options.enableGitFallback) {
      strategies.push(new GitCacheStrategy());
    }

    return strategies;
  }

  /**
   * Propagate data to higher-priority caches
   */
  private async propagateToHigherCaches(
    packageId: string,
    data: Buffer,
    sourceStrategy: string
  ): Promise<void> {
    const sourceIndex = this.strategies.findIndex(
      (s) => s.name === sourceStrategy
    );

    // Store in all higher-priority caches (lower indices)
    for (let i = 0; i < sourceIndex; i++) {
      const strategy = this.strategies[i];
      try {
        await strategy.store(packageId, data);
        this.logVerbose(`Propagated ${packageId} to ${strategy.name}`);
      } catch (error) {
        this.logVerbose(`Failed to propagate to ${strategy.name}: ${error}`);
      }
    }
  }

  private logVerbose(message: string): void {
    if (this.options.verboseLogging) {
      console.log(`[GitCache Hierarchy] ${message}`);
    }
  }
}

/**
 * Local cache strategy
 */
class LocalCacheStrategy implements CacheStrategy {
  name = 'Local';
  private cache: LocalCache;

  constructor() {
    this.cache = new LocalCache();
  }

  async has(packageId: string): Promise<boolean> {
    return this.cache.has(packageId);
  }

  async get(packageId: string): Promise<Buffer> {
    return this.cache.get(packageId);
  }

  async store(packageId: string, data: Buffer): Promise<void> {
    return this.cache.store(packageId, data);
  }

  async clear(): Promise<void> {
    return this.cache.clear();
  }
}

/**
 * Registry cache strategy
 */
class RegistryStrategy implements CacheStrategy {
  name = 'Registry';
  private client: RegistryClient;

  constructor() {
    this.client = new RegistryClient();
  }

  async has(packageId: string): Promise<boolean> {
    return this.client.has(packageId);
  }

  async get(packageId: string): Promise<Buffer> {
    return this.client.get(packageId);
  }

  async store(packageId: string, data: Buffer): Promise<void> {
    return this.client.uploadAsync(packageId, data);
  }

  isAuthenticated(): boolean {
    return this.client.isAuthenticated();
  }
}

/**
 * Git cache strategy (fallback to original git operations)
 */
class GitCacheStrategy implements CacheStrategy {
  name = 'Git';
  private cache: GitCache;

  constructor() {
    this.cache = new GitCache();
  }

  async has(packageId: string): Promise<boolean> {
    return this.cache.has(packageId);
  }

  async get(packageId: string): Promise<Buffer> {
    return this.cache.get(packageId);
  }

  async store(_packageId: string, _data: Buffer): Promise<void> {
    // Git cache doesn't support storing - it's read-only
    return Promise.resolve();
  }
}
