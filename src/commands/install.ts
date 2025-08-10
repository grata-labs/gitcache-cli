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
import { RegistryClient } from '../lib/registry-client.js';
import { GitCache } from '../lib/git-cache.js';
import { AuthManager } from '../lib/auth-manager.js';
import {
  getCacheDir,
  getPlatformIdentifier,
  getTarballCachePath,
} from '../lib/utils/path.js';
import { resolveGitReferences, scanLockfile } from '../lockfile/scan.js';
import {
  isInCI,
  detectCIEnvironment,
  getCIErrorMessage,
} from '../lib/ci-environment.js';

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

  private tarballBuilder: TarballBuilder;
  private registryClient: RegistryClient;
  private gitCache: GitCache;
  private authManager: AuthManager;

  constructor() {
    super();
    this.tarballBuilder = new TarballBuilder();
    this.registryClient = new RegistryClient();
    this.gitCache = new GitCache();
    this.authManager = new AuthManager();
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

      // Automatically build tarballs for Git dependencies before install
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
   * Automatically scan lockfile and build missing tarballs before install
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
      const existingTarballs: string[] = [];
      const missingTarballs: Array<{
        name: string;
        gitUrl: string;
        commitSha: string;
      }> = [];

      for (const dep of buildableDeps) {
        // Clean the git URL by removing any existing hash fragments (version tags, etc.)
        const rawGitUrl = dep.preferredUrl.replace(/^git\+/, '');
        const cleanGitUrl = rawGitUrl.split('#')[0]; // Take only the base URL part
        const isExisting = this.isTarballCached(dep.resolvedSha!);

        if (isExisting) {
          existingTarballs.push(dep.name);
        } else {
          missingTarballs.push({
            name: dep.name,
            gitUrl: cleanGitUrl, // Use the cleaned URL
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
            // Simple lookup logic: Local → Registry → Git
            const packageId = `${dep.gitUrl}#${dep.commitSha}`;
            let tarballFound = false;

            // 1. Check local cache first (TarballBuilder)
            const cachedTarball = this.tarballBuilder.getCachedTarball(
              dep.commitSha
            );
            if (cachedTarball) {
              console.log(`📥 Retrieved ${dep.name} from local cache`);
              tarballFound = true;
            } else {
              // 2. Try registry if authenticated (RegistryClient)
              if (this.authManager.isAuthenticated()) {
                try {
                  if (await this.registryClient.has(packageId)) {
                    const registryTarball =
                      await this.registryClient.get(packageId);
                    console.log(`📥 Retrieved ${dep.name} from registry`);
                    // Store in local cache for future use
                    const tarballPath = join(
                      getTarballCachePath(
                        dep.commitSha,
                        getPlatformIdentifier()
                      ),
                      'package.tgz'
                    );
                    const fs = await import('node:fs/promises');
                    await fs.mkdir(join(tarballPath, '..'), {
                      recursive: true,
                    });
                    await fs.writeFile(tarballPath, registryTarball);
                    tarballFound = true;
                  }
                } catch {
                  // Registry retrieval failed, will build from git
                  console.log(
                    `⚠️  Registry retrieval failed for ${dep.name}, building from git`
                  );
                }
              }

              // 3. Build from git if not found in local or registry
              if (!tarballFound) {
                console.log(`🔨 Building ${dep.name} from git repository`);
                await this.tarballBuilder.buildTarball(
                  dep.gitUrl,
                  dep.commitSha,
                  {
                    force: true,
                  }
                );

                // Upload to registry for team sharing if authenticated
                if (this.authManager.isAuthenticated()) {
                  try {
                    const tarballPath = join(
                      getTarballCachePath(
                        dep.commitSha,
                        getPlatformIdentifier()
                      ),
                      'package.tgz'
                    );
                    if (existsSync(tarballPath)) {
                      const fs = await import('node:fs/promises');
                      const localTarball = await fs.readFile(tarballPath);
                      await this.registryClient.upload(packageId, localTarball);
                      console.log(
                        `📤 Stored ${dep.name} in registry for team sharing`
                      );
                    }
                  } catch (uploadError) {
                    // Don't fail if upload fails
                    console.log(
                      `⚠️  Failed to upload ${dep.name} to registry: ${uploadError}`
                    );
                  }
                }
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
   * Show authentication status and cache info
   */
  private async showCacheStatus(): Promise<void> {
    try {
      const ciEnv = detectCIEnvironment();

      if (this.authManager.isAuthenticated()) {
        if (ciEnv.detected) {
          console.log(`🤖 GitCache accelerated build (${ciEnv.platform})`);
        } else {
          console.log(
            '🔗 Connected to GitCache registry for transparent caching'
          );
        }
      } else {
        // Not authenticated - check if in CI with token
        if (ciEnv.detected && ciEnv.hasToken) {
          // Try auto-setup for CI
          const token = process.env.GITCACHE_TOKEN;
          if (token?.startsWith('ci_')) {
            console.log(
              `🤖 Detected ${ciEnv.platform} with CI token, attempting auto-setup...`
            );
            try {
              const validation =
                await this.registryClient.validateCIToken(token);
              if (validation.valid && validation.organization) {
                // Store token using AuthManager to avoid duplication
                this.authManager.storeAuthData({
                  token,
                  orgId: validation.organization,
                  tokenType: 'ci',
                  expiresAt: null,
                });
                console.log(
                  `✅ Auto-configured GitCache for ${validation.organization}`
                );
                return;
              }
            } catch {
              // Auto-setup failed, show guidance
              console.log('⚠️  Auto-setup failed, continuing with Git sources');
              console.log(getCIErrorMessage('authentication_required'));
              return;
            }
          }
        }

        if (ciEnv.detected) {
          if (ciEnv.hasToken) {
            console.log('⚠️  GitCache token found but invalid');
            console.log(getCIErrorMessage('token_invalid'));
          } else {
            console.log('💡 GitCache not configured for CI acceleration');
            console.log(getCIErrorMessage('authentication_required'));
          }
        } else {
          console.log(
            '💡 Run "gitcache setup" to enable cloud registry caching'
          );
        }
      }
    } catch {
      // Network error or registry unavailable
      if (isInCI()) {
        console.log(
          '⚠️  GitCache registry unavailable, continuing with Git sources'
        );
        console.log(getCIErrorMessage('network_error'));
      } else {
        console.log(
          '⚠️  GitCache registry connection failed, using local cache only'
        );
      }
    }
  }
}
