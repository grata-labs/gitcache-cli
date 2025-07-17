import { BaseCommand } from '../base-cmd.js';
import {
  scanLockfile,
  resolveGitReferences,
  type GitDependency,
} from '../lockfile/scan.js';
import {
  createTarballBuilder,
  type TarballBuilder,
} from '../lib/tarball-builder.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface PrepareOptions {
  lockfile?: string;
  force?: boolean;
  verbose?: boolean;
}

export class Prepare extends BaseCommand {
  static description = 'Pre-build tarballs for Git dependencies from lockfile';
  static commandName = 'prepare';
  static usage = [
    '',
    '--lockfile package-lock.json',
    '--force',
    '--verbose',
    '--lockfile npm-shrinkwrap.json --force --verbose',
  ];
  static params = ['lockfile', 'force', 'verbose'];

  async exec(args: string[], opts: PrepareOptions = {}): Promise<void> {
    const lockfilePath = this.resolveLockfilePath(opts.lockfile);

    if (!existsSync(lockfilePath)) {
      throw new Error(`Lockfile not found: ${lockfilePath}`);
    }

    try {
      console.log(`Scanning ${lockfilePath}...`);

      // Scan the lockfile for Git dependencies
      const scanResult = scanLockfile(lockfilePath);

      if (scanResult.dependencies.length === 0) {
        console.log('No Git dependencies found in lockfile.');
        console.log('Cache is already optimal for this project!');
        return;
      }

      if (opts.verbose) {
        console.log(
          `Found ${scanResult.dependencies.length} Git ${scanResult.dependencies.length === 1 ? 'dependency' : 'dependencies'}:`
        );
        for (const dep of scanResult.dependencies) {
          console.log(`  • ${dep.name}@${dep.reference}`);
        }
        console.log();
      }

      // Resolve Git references to commit SHAs
      console.log('Resolving Git references...');
      const resolved = await resolveGitReferences(scanResult.dependencies);

      const resolvable = resolved.filter((dep) => dep.resolvedSha);
      const failed = resolved.filter((dep) => !dep.resolvedSha);

      if (failed.length > 0) {
        console.log(
          `⚠ Warning: ${failed.length} ${failed.length === 1 ? 'dependency' : 'dependencies'} could not be resolved:`
        );
        for (const dep of failed) {
          console.log(`  • ${dep.name}@${dep.reference}`);
        }
        console.log();
      }

      if (resolvable.length === 0) {
        console.log('No resolvable Git dependencies found.');
        return;
      }

      console.log(
        `Building tarballs for ${resolvable.length} ${resolvable.length === 1 ? 'dependency' : 'dependencies'}...`
      );
      console.log();

      // Build tarballs with progress
      const tarballBuilder = createTarballBuilder();
      const results = await this.buildTarballsWithProgress(
        tarballBuilder,
        resolvable,
        opts
      );

      // Summary
      const successful = results.filter((r) => r.success).length;
      const failed_builds = results.filter((r) => !r.success).length;

      console.log();
      console.log(`✓ Cache preparation complete!`);
      console.log(`  Built: ${successful}/${resolvable.length} tarballs`);

      if (failed_builds > 0) {
        console.log(`  Failed: ${failed_builds} (see warnings above)`);
      }

      if (successful > 0) {
        console.log();
        console.log('Next npm install will be significantly faster! 🚀');
      }
    } catch (error) {
      throw new Error(`Failed to prepare cache: ${String(error)}`);
    }
  }

  private async buildTarballsWithProgress(
    tarballBuilder: TarballBuilder,
    dependencies: GitDependency[],
    opts: PrepareOptions
  ): Promise<Array<{ name: string; success: boolean; error?: string }>> {
    const results: Array<{ name: string; success: boolean; error?: string }> =
      [];

    for (let i = 0; i < dependencies.length; i++) {
      const dep = dependencies[i];
      const progress = `[${i + 1}/${dependencies.length}]`;

      try {
        if (opts.verbose) {
          console.log(
            `${progress} Building ${dep.name}@${dep.resolvedSha?.substring(0, 8)}...`
          );
        } else {
          // Simple progress indicator
          const progressBar = this.createProgressBar(
            i + 1,
            dependencies.length,
            30
          );
          process.stdout.write(`\r${progressBar} ${dep.name}`);
        }

        const result = await tarballBuilder.buildTarball(
          dep.preferredUrl.replace(/^git\+/, ''), // Remove git+ prefix for tarball builder
          dep.resolvedSha!,
          { force: opts.force }
        );

        if (opts.verbose) {
          console.log(`  ✓ Built: ${result.tarballPath}`);
        }

        results.push({ name: dep.name, success: true });
      } catch (error) {
        const errorMsg = String(error);

        if (opts.verbose) {
          console.log(`  ✗ Failed: ${errorMsg}`);
        } else {
          console.log(); // Clear progress line
          console.log(`⚠ Failed to build ${dep.name}: ${errorMsg}`);
        }

        results.push({ name: dep.name, success: false, error: errorMsg });
      }
    }

    if (!opts.verbose && dependencies.length > 0) {
      console.log(); // Clear the progress line
    }

    return results;
  }

  private createProgressBar(
    current: number,
    total: number,
    width: number
  ): string {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${percentage}%`;
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
