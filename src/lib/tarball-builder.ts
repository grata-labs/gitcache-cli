import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { getTarballCachePath, getPlatformIdentifier } from './utils/path.js';

export interface TarballBuildResult {
  gitUrl: string;
  commitSha: string;
  platform: string;
  tarballPath: string;
  integrity: string;
  buildTime: Date;
  packageInfo?: {
    name: string;
    version: string;
  };
}

export interface TarballBuildOptions {
  force?: boolean;
  skipBuildScripts?: boolean;
  platform?: string;
}

export class TarballBuilder {
  /**
   * Build a tarball for a Git repository at a specific commit SHA
   */
  async buildTarball(
    gitUrl: string,
    commitSha: string,
    options: TarballBuildOptions = {}
  ): Promise<TarballBuildResult> {
    const platform = options.platform || getPlatformIdentifier();
    const tarballCacheDir = getTarballCachePath(commitSha, platform);
    const tarballPath = join(tarballCacheDir, 'package.tgz');

    // Check if tarball already exists (unless force is specified)
    if (!options.force && existsSync(tarballPath)) {
      const metadata = this.readTarballMetadata(tarballCacheDir);
      if (metadata) {
        return metadata;
      }
    }

    console.log(
      `Building tarball for ${gitUrl} at ${commitSha} (${platform})...`
    );

    // Create temporary working directory
    const tempDir = join(
      tmpdir(),
      `gitcache-build-${randomBytes(8).toString('hex')}`
    );

    try {
      // Checkout the specific commit SHA to temporary directory
      this.checkoutCommit(gitUrl, commitSha, tempDir);

      // Build the tarball
      const { tarballFile, packageInfo } = this.buildPackage(tempDir, options);

      // Ensure cache directory exists
      mkdirSync(tarballCacheDir, { recursive: true });

      // Move tarball to cache
      const finalTarballPath = join(tarballCacheDir, 'package.tgz');
      renameSync(tarballFile, finalTarballPath);

      // Calculate integrity hash
      const integrity = this.calculateIntegrity(finalTarballPath);

      // Create build result
      const result: TarballBuildResult = {
        gitUrl,
        commitSha,
        platform,
        tarballPath: finalTarballPath,
        integrity,
        buildTime: new Date(),
        packageInfo,
      };

      // Store metadata
      this.storeTarballMetadata(tarballCacheDir, result);

      console.log(
        `✓ Built tarball: ${basename(finalTarballPath)} (${platform})`
      );
      return result;
    } finally {
      // Clean up temporary directory
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  /**
   * Get cached tarball if it exists
   */
  getCachedTarball(
    commitSha: string,
    platform?: string
  ): TarballBuildResult | null {
    const platformId = platform || getPlatformIdentifier();
    const tarballCacheDir = getTarballCachePath(commitSha, platformId);
    const tarballPath = join(tarballCacheDir, 'package.tgz');

    if (!existsSync(tarballPath)) {
      return null;
    }

    return this.readTarballMetadata(tarballCacheDir);
  }

  /**
   * Build multiple tarballs in parallel
   */
  async buildBatch(
    dependencies: Array<{ gitUrl: string; commitSha: string }>,
    options: TarballBuildOptions = {}
  ): Promise<TarballBuildResult[]> {
    const promises = dependencies.map(({ gitUrl, commitSha }) =>
      this.buildTarball(gitUrl, commitSha, options)
    );

    return Promise.all(promises);
  }

  /**
   * Parse Git URL to extract just the repository URL without fragments or query parameters
   */
  private parseGitUrl(gitUrl: string): string {
    try {
      // Remove git+ prefix if present
      let cleanUrl = gitUrl.replace(/^git\+/, '');

      // Parse the URL to remove fragment (everything after #)
      const url = new URL(cleanUrl);

      // Reconstruct URL without fragment or query
      return `${url.protocol}//${url.host}${url.pathname}`;
    } catch {
      // If URL parsing fails, try simple fragment removal
      return gitUrl
        .replace(/^git\+/, '')
        .split('#')[0]
        .split('?')[0];
    }
  }

  private checkoutCommit(
    gitUrl: string,
    commitSha: string,
    targetDir: string
  ): void {
    try {
      // Parse the Git URL to remove any fragment (commit hash) that might be included
      const cleanGitUrl = this.parseGitUrl(gitUrl);

      // Clone with depth 1 for efficiency, then checkout specific commit
      const cloneResult = spawnSync(
        'git',
        ['clone', '--depth', '1', cleanGitUrl, targetDir],
        {
          stdio: 'pipe',
          encoding: 'utf8',
        }
      );

      if (cloneResult.status !== 0) {
        throw new Error(
          `git clone failed with exit code ${cloneResult.status}: ${cloneResult.stderr}`
        );
      }

      // Fetch the specific commit if not already available
      try {
        const catResult = spawnSync(
          'git',
          ['-C', targetDir, 'cat-file', '-e', commitSha],
          {
            stdio: 'pipe',
          }
        );

        if (catResult.status !== 0) {
          throw new Error('Commit not found');
        }
      } catch {
        // Commit not found, need to fetch more history
        const fetchResult = spawnSync(
          'git',
          ['-C', targetDir, 'fetch', '--unshallow'],
          {
            stdio: 'pipe',
          }
        );

        if (fetchResult.status !== 0) {
          throw new Error(
            `git fetch --unshallow failed with exit code ${fetchResult.status}`
          );
        }
      }

      // Checkout the specific commit
      const checkoutResult = spawnSync(
        'git',
        ['-C', targetDir, 'checkout', commitSha],
        {
          stdio: 'pipe',
        }
      );

      if (checkoutResult.status !== 0) {
        throw new Error(
          `git checkout failed with exit code ${checkoutResult.status}: ${checkoutResult.stderr}`
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to checkout commit ${commitSha}: ${String(error)}`
      );
    }
  }

  private buildPackage(
    workingDir: string,
    options: TarballBuildOptions
  ): { tarballFile: string; packageInfo?: { name: string; version: string } } {
    try {
      // Read package.json for metadata
      let packageInfo: { name: string; version: string } | undefined;
      const packageJsonPath = join(workingDir, 'package.json');
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        packageInfo = {
          name: packageJson.name || 'unknown',
          version: packageJson.version || '0.0.0',
        };
      }

      // Install dependencies
      // Try npm ci first (preferred for lockfile-based installs)
      try {
        const ciArgs = options.skipBuildScripts
          ? ['ci', '--ignore-scripts']
          : ['ci'];

        console.log(`  Running: npm ${ciArgs.join(' ')}`);
        const result = spawnSync('npm', ciArgs, {
          cwd: workingDir,
          stdio: 'pipe',
          encoding: 'utf8',
        });

        if (result.status !== 0) {
          throw new Error(`npm ci failed with exit code ${result.status}`);
        }
      } catch {
        // If npm ci fails, try npm install as fallback
        console.log('  npm ci failed, falling back to npm install...');
        try {
          const installArgs = options.skipBuildScripts
            ? ['install', '--ignore-scripts']
            : ['install'];

          console.log(`  Running: npm ${installArgs.join(' ')}`);
          const result = spawnSync('npm', installArgs, {
            cwd: workingDir,
            stdio: 'pipe',
            encoding: 'utf8',
          });

          if (result.status !== 0) {
            throw new Error(
              `npm install failed with exit code ${result.status}`
            );
          }
        } catch (installError) {
          throw new Error(
            `Both npm ci and npm install failed: ${String(installError)}`
          );
        }
      }

      // Run build scripts if not skipped
      if (!options.skipBuildScripts) {
        // Check if prepare script exists
        const packageJson = existsSync(packageJsonPath)
          ? JSON.parse(readFileSync(packageJsonPath, 'utf8'))
          : {};

        if (packageJson.scripts?.prepare) {
          console.log('  Running: npm run prepare');
          const result = spawnSync('npm', ['run', 'prepare'], {
            cwd: workingDir,
            stdio: 'pipe',
            encoding: 'utf8',
          });

          if (result.status !== 0) {
            throw new Error(
              `npm run prepare failed with exit code ${result.status}`
            );
          }
        }
      }

      // Create tarball
      console.log('  Running: npm pack');
      const packResult = spawnSync('npm', ['pack'], {
        cwd: workingDir,
        stdio: 'pipe',
        encoding: 'utf8',
      });

      if (packResult.status !== 0) {
        throw new Error(`npm pack failed with exit code ${packResult.status}`);
      }

      const packOutput = packResult.stdout.trim();

      const tarballFile = join(
        workingDir,
        packOutput.split('\n').pop() || 'package.tgz'
      );

      if (!existsSync(tarballFile)) {
        throw new Error('npm pack did not create expected tarball');
      }

      return { tarballFile, packageInfo };
    } catch (error) {
      throw new Error(`Failed to build package: ${String(error)}`);
    }
  }

  private calculateIntegrity(tarballPath: string): string {
    try {
      const result = spawnSync('shasum', ['-a', '256', tarballPath], {
        encoding: 'utf8',
      });

      if (result.status !== 0) {
        throw new Error(
          `shasum failed with exit code ${result.status}: ${result.stderr}`
        );
      }

      const hash = result.stdout.split(' ')[0];
      return `sha256-${Buffer.from(hash, 'hex').toString('base64')}`;
    } catch (error) {
      throw new Error(`Failed to calculate integrity: ${String(error)}`);
    }
  }

  private storeTarballMetadata(
    cacheDir: string,
    result: TarballBuildResult
  ): void {
    const metadataPath = join(cacheDir, 'metadata.json');
    const metadata = {
      gitUrl: result.gitUrl,
      commitSha: result.commitSha,
      platform: result.platform,
      integrity: result.integrity,
      buildTime: result.buildTime.toISOString(),
      packageInfo: result.packageInfo,
    };

    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  private readTarballMetadata(cacheDir: string): TarballBuildResult | null {
    const metadataPath = join(cacheDir, 'metadata.json');
    const tarballPath = join(cacheDir, 'package.tgz');

    if (!existsSync(metadataPath) || !existsSync(tarballPath)) {
      return null;
    }

    try {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
      return {
        gitUrl: metadata.gitUrl,
        commitSha: metadata.commitSha,
        platform: metadata.platform || getPlatformIdentifier(), // fallback for older metadata
        tarballPath,
        integrity: metadata.integrity,
        buildTime: new Date(metadata.buildTime),
        packageInfo: metadata.packageInfo,
      };
    } catch {
      return null;
    }
  }
}

export function createTarballBuilder(): TarballBuilder {
  return new TarballBuilder();
}
