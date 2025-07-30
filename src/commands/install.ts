import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BaseCommand } from '../base-cmd.js';
import { getDefaultMaxCacheSize } from '../lib/config.js';
import {
  calculateCacheSize,
  formatBytes,
  parseSizeToBytes,
} from '../lib/prune.js';
import { TarballBuilder } from '../lib/tarball-builder.js';
import {
  getCacheDir,
  getPlatformIdentifier,
  getTarballCachePath,
} from '../lib/utils/path.js';
import { resolveGitReferences, scanLockfile } from '../lockfile/scan.js';
import { CacheHierarchy } from '../lib/cache-hierarchy.js';

/**
 * Install command - runs npm install with gitcache as the npm cache
 * Now includes transparent caching with registry fallback
 */
export class Install extends BaseCommand {
  static description = 'Run npm install using gitcache as the npm cache';
  static commandName = 'install';
  static usage = ['[npm-args...]'];
  static params = [];
  static argumentSpec = { type: 'variadic', name: 'args' } as const;

  private cacheHierarchy: CacheHierarchy;

  constructor() {
    super();
    this.cacheHierarchy = new CacheHierarchy();
  }

  async exec(args: string[] = []): Promise<void> {
    const cacheDir = getCacheDir();

    // Set npm cache to gitcache directory
    const env = {
      ...process.env,
      npm_config_cache: cacheDir,
      NPM_CONFIG_CACHE: cacheDir, // Windows / PowerShell friendliness
    };

    // Build npm install command with all passed arguments
    const npmArgs = ['install', ...args];

    try {
      // Ensure cache directory exists before running npm
      // This is especially important on Windows
      try {
        mkdirSync(cacheDir, { recursive: true });
      } catch (mkdirError) {
        // Directory might already exist, which is fine
        // Only log if it's a real error
        if ((mkdirError as NodeJS.ErrnoException)?.code !== 'EEXIST') {
          console.warn(
            `Warning: Could not create cache directory: ${(mkdirError as Error).message}`
          );
        }
      }

      // Automatically prepare Git dependencies before install
      await this.prepareGitDependencies();

      // Show cache hierarchy status if authenticated
      await this.showCacheStatus();

      // Execute npm install with gitcache as cache
      const result = spawnSync('npm', npmArgs, {
        stdio: 'inherit', // Show npm output to user
        env,
        cwd: process.cwd(),
        shell: process.platform === 'win32', // Use shell on Windows
      });

      // Handle cross-platform differences in spawnSync return values
      // On Windows, status can be null for successful processes
      // On Unix-like systems, status is typically 0 for success
      let exitCode = 0;

      if (result.status !== null && result.status !== undefined) {
        exitCode = result.status;
      } else if (result.error) {
        // If there was an error but no status, treat as failure
        exitCode = 1;
      }
      // If status is null/undefined and no error, treat as success (exitCode = 0)

      if (exitCode !== 0) {
        throw new Error(`npm install failed with exit code ${exitCode}`);
      }

      // Show cache size information after successful install
      this.showCacheSizeInfo();
    } catch (error) {
      // Re-throw the error to let the CLI handle it
      throw error;
    }
  }

  /**
   * Automatically scan lockfile and prepare missing tarballs before install
   */
  private async prepareGitDependencies(): Promise<void> {
    try {
      // Look for lockfile in current directory
      const lockfilePath = join(process.cwd(), 'package-lock.json');

      if (!existsSync(lockfilePath)) {
        // No lockfile found, skip preparation
        return;
      }

      console.log('🔍 Scanning lockfile for Git dependencies...');

      // Scan lockfile for Git dependencies
      const lockfileResult = scanLockfile(lockfilePath);

      if (!lockfileResult.hasGitDependencies) {
        // No Git dependencies found, skip preparation
        return;
      }

      console.log(
        `📦 Found ${lockfileResult.dependencies.length} Git dependencies`
      );

      // Resolve Git references to commit SHAs
      const resolvedDeps = await resolveGitReferences(
        lockfileResult.dependencies
      );

      // Filter to only dependencies that resolved successfully
      const buildableDeps = resolvedDeps.filter((dep) => dep.resolvedSha);

      if (buildableDeps.length === 0) {
        console.log(
          '⚠️  No Git dependencies could be resolved, skipping preparation'
        );
        return;
      }

      // Check which tarballs already exist vs need to be built
      const tarballBuilder = new TarballBuilder();
      const existingTarballs: string[] = [];
      const missingTarballs: Array<{
        name: string;
        gitUrl: string;
        commitSha: string;
      }> = [];

      for (const dep of buildableDeps) {
        const gitUrl = dep.preferredUrl.replace(/^git\+/, '');
        const isExisting = this.isTarballCached(dep.resolvedSha!);

        if (isExisting) {
          existingTarballs.push(dep.name);
        } else {
          missingTarballs.push({
            name: dep.name,
            gitUrl,
            commitSha: dep.resolvedSha!,
          });
        }
      }

      // Report cache status
      if (existingTarballs.length > 0) {
        console.log(
          `✅ ${existingTarballs.length}/${buildableDeps.length} tarballs already cached`
        );
      }

      if (missingTarballs.length === 0) {
        console.log(
          '🚀 All tarballs ready! Running install with optimized cache...\n'
        );
        return;
      }

      console.log(`🚀 Building ${missingTarballs.length} missing tarballs...`);

      // Build only the missing tarballs
      const results = await Promise.allSettled(
        missingTarballs.map(async (dep) => {
          try {
            // First, try to get from cache hierarchy
            const packageId = `${dep.gitUrl}#${dep.commitSha}`;
            let tarballData: Buffer | null = null;

            try {
              if (await this.cacheHierarchy.has(packageId)) {
                tarballData = await this.cacheHierarchy.get(packageId);
                console.log(`📥 Retrieved ${dep.name} from cache`);
              }
            } catch {
              // Cache retrieval failed, will build locally
              console.log(
                `⚠️  Cache retrieval failed for ${dep.name}, building locally`
              );
            }

            if (!tarballData) {
              // Build tarball locally
              await tarballBuilder.buildTarball(dep.gitUrl, dep.commitSha, {
                force: true,
              });

              // Store in cache hierarchy for future use
              try {
                const tarballPath = join(
                  getTarballCachePath(dep.commitSha, getPlatformIdentifier()),
                  'package.tgz'
                );
                if (existsSync(tarballPath)) {
                  const fs = await import('node:fs/promises');
                  const localTarball = await fs.readFile(tarballPath);
                  await this.cacheHierarchy.store(packageId, localTarball);
                  console.log(`📤 Stored ${dep.name} in cache hierarchy`);
                }
              } catch (cacheError) {
                // Don't fail if cache storage fails
                console.log(
                  `⚠️  Failed to store ${dep.name} in cache: ${cacheError}`
                );
              }
            }

            return { name: dep.name, success: true };
          } catch (error) {
            console.warn(`⚠️  Failed to build ${dep.name}: ${String(error)}`);
            return { name: dep.name, success: false };
          }
        })
      );

      const successful = results.filter(
        (result) => result.status === 'fulfilled' && result.value.success
      ).length;

      if (successful > 0) {
        const totalReady = existingTarballs.length + successful;
        console.log(
          `✅ Built ${successful}/${missingTarballs.length} new tarballs`
        );
        console.log(
          `🚀 ${totalReady}/${buildableDeps.length} tarballs ready! Running install with optimized cache...\n`
        );
      }
    } catch (error) {
      // Don't fail the install if preparation fails
      console.warn(`⚠️  Cache preparation failed: ${String(error)}`);
      console.log('⏭️  Continuing with normal install...\n');
    }
  }

  /**
   * Check if a tarball already exists in cache for the given commit SHA
   */
  private isTarballCached(commitSha: string): boolean {
    const platform = getPlatformIdentifier();
    const tarballCacheDir = getTarballCachePath(commitSha, platform);
    const tarballPath = join(tarballCacheDir, 'package.tgz');
    return existsSync(tarballPath);
  }

  /**
   * Show cache size information and pruning advice after install
   */
  private showCacheSizeInfo(): void {
    try {
      const cacheSize = calculateCacheSize();
      const defaultMaxSize = getDefaultMaxCacheSize();
      const defaultLimit = parseSizeToBytes(defaultMaxSize);

      console.log(`📊 Cache size: ${formatBytes(cacheSize)}`);

      // Show advice if cache is getting large
      if (cacheSize > defaultLimit * 0.8) {
        // 80% of default limit
        console.log(
          `💡 Your cache is getting large (${formatBytes(cacheSize)})`
        );
        console.log(`   Consider running: gitcache prune`);
        if (cacheSize > defaultLimit) {
          console.log(
            `   Or set a custom limit: gitcache prune --max-size 10GB --set-default`
          );
        }
      } else if (cacheSize > defaultLimit * 0.5) {
        // 50% of default limit
        console.log(`💡 Run 'gitcache prune' to manage cache size when needed`);
      }
    } catch {
      // Don't fail the install if cache size calculation fails
      // This is just informational
    }
  }

  /**
   * Show cache hierarchy status and authentication info
   */
  private async showCacheStatus(): Promise<void> {
    try {
      const status = await this.cacheHierarchy.getStatus();
      const authStatus = status.find((s) => s.strategy === 'Registry');

      if (authStatus?.available && authStatus.authenticated) {
        console.log(
          '🔗 Connected to GitCache registry for transparent caching'
        );
      } else if (authStatus?.available && !authStatus.authenticated) {
        console.log('💡 Run "gitcache setup" to enable cloud registry caching');
      }
    } catch {
      // Status check is non-critical, don't fail the install
    }
  }
}
