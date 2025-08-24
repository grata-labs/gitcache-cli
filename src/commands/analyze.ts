import { BaseCommand } from '../base-cmd.js';
import {
  scanLockfile,
  resolveGitReferences,
  type GitDependency,
} from '../lockfile/scan.js';
import {
  getCacheDir,
  getPlatformIdentifier,
  getTarballCachePath,
} from '../lib/utils/path.js';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface AnalyzeOptions {
  lockfile?: string;
  verbose?: boolean;
  json?: boolean;
}

interface CacheAnalysis {
  lockfile: string;
  lockfileVersion: number;
  gitDependencies: {
    total: number;
    cached: number;
    uncached: number;
    failed: number;
  };
  cacheStatus: {
    hitRate: number;
    totalSize: number;
    tarballCount: number;
  };
  performance: {
    estimatedSpeedup: string;
    potential: string;
  };
  issues: {
    npmV7BugDetected: number;
    unresolvedReferences: number;
  };
  recommendations: string[];
  dependencies: Array<{
    name: string;
    gitUrl: string;
    reference: string;
    resolvedSha?: string;
    cached: boolean;
    issues: string[];
  }>;
}

export class Analyze extends BaseCommand {
  static description = 'Show detailed lockfile analysis and cache status';
  static commandName = 'analyze';
  static usage = [
    '',
    '--lockfile package-lock.json',
    '--verbose',
    '--json',
    '--lockfile npm-shrinkwrap.json --verbose',
  ];
  static params = ['lockfile', 'verbose', 'json'];
  static argumentSpec = { type: 'none' } as const;

  async exec(args: string[], opts: AnalyzeOptions = {}): Promise<void> {
    const lockfilePath = this.resolveLockfilePath(opts.lockfile);

    if (!existsSync(lockfilePath)) {
      throw new Error(`Lockfile not found: ${lockfilePath}`);
    }

    try {
      console.log('🔍 Analyzing project dependencies and cache status...\n');

      // Scan the lockfile for Git dependencies
      const scanResult = scanLockfile(lockfilePath);

      if (scanResult.dependencies.length === 0) {
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                lockfile: lockfilePath,
                lockfileVersion: scanResult.lockfileVersion,
                gitDependencies: {
                  total: 0,
                  cached: 0,
                  uncached: 0,
                  failed: 0,
                },
                message: 'No Git dependencies found',
                cacheStatus: { hitRate: 1.0, totalSize: 0, tarballCount: 0 },
                performance: {
                  estimatedSpeedup: 'N/A',
                  potential: 'No optimization available',
                },
                issues: { npmV7BugDetected: 0, unresolvedReferences: 0 },
                recommendations: [
                  'Consider using Git dependencies to benefit from GitCache optimization.',
                ],
                dependencies: [],
              },
              null,
              2
            )
          );
        } else {
          console.log('No Git dependencies found in lockfile.');
          console.log(
            'Consider using Git dependencies to benefit from GitCache optimization.'
          );
        }
        return;
      }

      // Resolve Git references to commit SHAs
      console.log('Resolving Git references...');
      const resolved = await resolveGitReferences(scanResult.dependencies);

      // Analyze cache status and issues
      const analysis = await this.performCacheAnalysis(
        lockfilePath,
        scanResult.lockfileVersion,
        resolved
      );

      if (opts.json) {
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        this.displayAnalysis(analysis, opts.verbose || false);
      }
    } catch (error) {
      throw new Error(`Failed to analyze lockfile: ${String(error)}`);
    }
  }

  private async performCacheAnalysis(
    lockfilePath: string,
    lockfileVersion: number,
    dependencies: GitDependency[]
  ): Promise<CacheAnalysis> {
    const cacheDir = getCacheDir();

    let cached = 0;
    let uncached = 0;
    let failed = 0;
    let npmV7BugDetected = 0;
    let unresolvedReferences = 0;

    const dependencyAnalysis = dependencies.map((dep) => {
      const issues: string[] = [];
      let isCached = false;

      // Check if dependency failed to resolve
      if (!dep.resolvedSha) {
        failed++;
        unresolvedReferences++;
        issues.push('Failed to resolve Git reference');
      } else {
        // Check if tarball is cached using the same logic as install command
        const platform = getPlatformIdentifier();
        const tarballCacheDir = getTarballCachePath(dep.resolvedSha, platform);
        const tarballPath = join(tarballCacheDir, 'package.tgz');
        isCached = existsSync(tarballPath);

        if (isCached) {
          cached++;
        } else {
          uncached++;
        }
      }

      // Detect npm v7+ SSH bug
      if (
        dep.packageJsonUrl &&
        dep.lockfileUrl &&
        dep.packageJsonUrl !== dep.lockfileUrl
      ) {
        if (
          dep.packageJsonUrl.includes('ssh://') &&
          dep.lockfileUrl.includes('https://')
        ) {
          npmV7BugDetected++;
          issues.push('npm v7+ SSH→HTTPS conversion detected');
        }
      }

      return {
        name: dep.name,
        gitUrl: dep.gitUrl,
        reference: dep.reference,
        resolvedSha: dep.resolvedSha,
        cached: isCached,
        issues,
      };
    });

    // Calculate cache statistics
    const totalDeps = dependencies.length;
    const hitRate = cached / totalDeps;

    // Calculate cache size
    const { totalSize, tarballCount } = this.calculateCacheSize(cacheDir);

    // Generate performance estimates
    const performance = this.estimatePerformance(cached, uncached, failed);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      uncached,
      failed,
      npmV7BugDetected,
      hitRate
    );

    return {
      lockfile: lockfilePath,
      lockfileVersion,
      gitDependencies: {
        total: totalDeps,
        cached,
        uncached,
        failed,
      },
      cacheStatus: {
        hitRate,
        totalSize,
        tarballCount,
      },
      performance,
      issues: {
        npmV7BugDetected,
        unresolvedReferences,
      },
      recommendations,
      dependencies: dependencyAnalysis,
    };
  }

  private calculateCacheSize(cacheDir: string): {
    totalSize: number;
    tarballCount: number;
  } {
    let totalSize = 0;
    let tarballCount = 0;

    const tarballsDir = join(cacheDir, 'tarballs');

    if (!existsSync(tarballsDir)) {
      return { totalSize: 0, tarballCount: 0 };
    }

    try {
      const entries = readdirSync(tarballsDir);
      for (const entry of entries) {
        const entryPath = join(tarballsDir, entry);
        const stat = statSync(entryPath);

        if (stat.isDirectory()) {
          // Check if this directory contains a tarball
          const tarballPath = join(entryPath, 'package.tgz');
          if (existsSync(tarballPath)) {
            const tarballStat = statSync(tarballPath);
            totalSize += tarballStat.size;
            tarballCount++;
          }
        }
      }
    } catch (error) {
      // If we can't read the cache directory, return zeros
      console.warn(`Warning: Could not read cache directory: ${String(error)}`);
    }

    return { totalSize, tarballCount };
  }

  private estimatePerformance(
    cached: number,
    uncached: number,
    failed: number
  ): {
    estimatedSpeedup: string;
    potential: string;
  } {
    const total = cached + uncached + failed;

    if (cached === total) {
      return {
        estimatedSpeedup: 'All dependencies cached',
        potential: 'Fully optimized! All Git dependencies are cached.',
      };
    }

    const cacheRatio = cached / total;
    const percentage = Math.round(cacheRatio * 100);

    return {
      estimatedSpeedup: `${percentage}% of dependencies cached`,
      potential:
        uncached > 0
          ? `${uncached} dependencies will be cached automatically on next install`
          : `${failed} dependencies could not be resolved`,
    };
  }

  private generateRecommendations(
    uncached: number,
    failed: number,
    npmV7BugDetected: number,
    hitRate: number
  ): string[] {
    const recommendations: string[] = [];

    if (uncached > 0) {
      recommendations.push(
        `${uncached} missing tarballs will be built automatically on next install`
      );
    }

    if (failed > 0) {
      recommendations.push(
        `${failed} Git dependencies failed to resolve - check network connectivity and repository URLs`
      );
    }

    if (npmV7BugDetected > 0) {
      recommendations.push(
        `${npmV7BugDetected} dependencies affected by npm v7+ SSH→HTTPS bug - consider using HTTPS URLs for better CI/CD compatibility`
      );
    }

    if (hitRate < 0.5 && uncached > 0) {
      recommendations.push(
        'Cache hit rate is low - tarballs will be built automatically on next install to improve performance'
      );
    }

    if (hitRate === 1.0 && uncached === 0) {
      recommendations.push(
        'Cache is fully optimized! Your next npm install will be significantly faster.'
      );
    }

    return recommendations;
  }

  private displayAnalysis(analysis: CacheAnalysis, verbose: boolean): void {
    const { gitDependencies, cacheStatus, performance, issues } = analysis;

    // Header
    console.log(
      `Lockfile Analysis (${analysis.lockfile} v${analysis.lockfileVersion}):`
    );
    console.log('├─ Git Dependencies:', `${gitDependencies.total} found`);
    console.log(
      '├─ Cache Status:',
      `${Math.round(cacheStatus.hitRate * 100)}% ready (${gitDependencies.cached}/${gitDependencies.total} cached)`
    );

    if (issues.npmV7BugDetected > 0) {
      console.log('├─ npm v7+ Issues:', `${issues.npmV7BugDetected} detected`);
    }

    if (cacheStatus.totalSize > 0) {
      const sizeMB =
        Math.round((cacheStatus.totalSize / 1024 / 1024) * 10) / 10;
      console.log(
        '├─ Disk Usage:',
        `${sizeMB}MB cached tarballs (${cacheStatus.tarballCount} files)`
      );
    }

    console.log('└─ Performance:', `${performance.estimatedSpeedup}\n`);

    // Dependencies details (verbose mode)
    if (verbose && gitDependencies.total > 0) {
      console.log('Dependencies:');
      for (const dep of analysis.dependencies) {
        const status = dep.cached ? '✓' : dep.resolvedSha ? '⚠' : '✗';
        const statusText = dep.cached
          ? 'cached'
          : dep.resolvedSha
            ? 'not cached'
            : 'failed to resolve';

        console.log(`  ${status} ${dep.name}@${dep.reference} (${statusText})`);
        console.log(`    URL: ${dep.gitUrl}`);

        if (dep.resolvedSha) {
          console.log(`    SHA: ${dep.resolvedSha.substring(0, 8)}`);
        }

        for (const issue of dep.issues) {
          console.log(`    ⚠ ${issue}`);
        }

        console.log();
      }
    }

    // Performance insight
    console.log('Performance Analysis:');
    console.log(`  ${performance.potential}`);
    if (gitDependencies.cached > 0) {
      console.log(`  Cached dependencies will install faster than Git cloning`);
    }
    console.log();

    // Recommendations
    console.log('Recommendations:');
    for (const recommendation of analysis.recommendations) {
      console.log(`  • ${recommendation}`);
    }
  }

  private resolveLockfilePath(providedPath?: string): string {
    if (providedPath) {
      return providedPath;
    }

    // Try common lockfile names in order of preference
    // npm-shrinkwrap.json has higher priority than package-lock.json
    const commonLockfiles = [
      'npm-shrinkwrap.json',
      'package-lock.json',
      'yarn.lock',
    ];

    for (const lockfile of commonLockfiles) {
      const path = join(process.cwd(), lockfile);
      if (existsSync(path)) {
        return path;
      }
    }

    // Default to package-lock.json even if it doesn't exist (will show better error)
    return join(process.cwd(), 'package-lock.json');
  }
}
