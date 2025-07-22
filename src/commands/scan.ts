import { BaseCommand } from '../base-cmd.js';
import {
  scanLockfile,
  resolveGitReferences,
  type GitDependency,
} from '../lockfile/scan.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ScanOptions {
  lockfile?: string;
  json?: boolean;
}

export class Scan extends BaseCommand {
  static description = 'Scan lockfile for Git dependencies';
  static commandName = 'scan';
  static usage = [
    '',
    '--lockfile package-lock.json',
    '--json',
    '--lockfile npm-shrinkwrap.json --json',
  ];
  static params = ['lockfile', 'json'];
  static argumentSpec = { type: 'none' } as const;

  async exec(args: string[], opts: ScanOptions = {}): Promise<void> {
    const lockfilePath = this.resolveLockfilePath(opts.lockfile);

    if (!existsSync(lockfilePath)) {
      throw new Error(`Lockfile not found: ${lockfilePath}`);
    }

    try {
      // Scan the lockfile for Git dependencies
      const scanResult = scanLockfile(lockfilePath);

      if (scanResult.dependencies.length === 0) {
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                lockfile: lockfilePath,
                lockfileVersion: scanResult.lockfileVersion,
                gitDependencies: [],
                hasGitDependencies: false,
                message: 'No Git dependencies found',
              },
              null,
              2
            )
          );
        } else {
          console.log('No Git dependencies found in lockfile.');
        }
        return;
      }

      // Resolve Git references to commit SHAs
      const resolved = await resolveGitReferences(scanResult.dependencies);

      if (opts.json) {
        this.outputJson(lockfilePath, scanResult.lockfileVersion, resolved);
      } else {
        this.outputFormatted(
          lockfilePath,
          scanResult.lockfileVersion,
          resolved
        );
      }
    } catch (error) {
      throw new Error(`Failed to scan lockfile: ${String(error)}`);
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

  private outputJson(
    lockfilePath: string,
    lockfileVersion: number,
    dependencies: GitDependency[]
  ): void {
    const output = {
      lockfile: lockfilePath,
      lockfileVersion,
      gitDependencies: dependencies.map((dep) => ({
        name: dep.name,
        gitUrl: dep.gitUrl,
        preferredUrl: dep.preferredUrl,
        reference: dep.reference,
        resolvedSha: dep.resolvedSha,
        packageJsonUrl: dep.packageJsonUrl,
        lockfileUrl: dep.lockfileUrl,
        integrity: dep.integrity,
      })),
      hasGitDependencies: dependencies.length > 0,
      summary: {
        total: dependencies.length,
        resolved: dependencies.filter((d) => d.resolvedSha).length,
        unresolved: dependencies.filter((d) => !d.resolvedSha).length,
      },
    };

    console.log(JSON.stringify(output, null, 2));
  }

  private outputFormatted(
    lockfilePath: string,
    lockfileVersion: number,
    dependencies: GitDependency[]
  ): void {
    console.log(`\nScanning ${lockfilePath} (v${lockfileVersion})...\n`);

    console.log(
      `Found ${dependencies.length} Git ${dependencies.length === 1 ? 'dependency' : 'dependencies'}:\n`
    );

    for (const dep of dependencies) {
      const status = dep.resolvedSha ? '✓' : '⚠';
      const resolvedInfo = dep.resolvedSha
        ? `→ ${dep.resolvedSha.substring(0, 8)}`
        : '(resolution failed)';

      console.log(`  ${status} ${dep.name}@${dep.reference} ${resolvedInfo}`);
      console.log(`    URL: ${dep.preferredUrl}`);

      // Show npm v7+ bug detection
      if (
        dep.packageJsonUrl &&
        dep.lockfileUrl &&
        dep.packageJsonUrl !== dep.lockfileUrl
      ) {
        if (
          dep.packageJsonUrl.includes('ssh://') &&
          dep.lockfileUrl.includes('https://')
        ) {
          console.log(
            `    ⚠ npm v7+ bug detected: SSH→HTTPS conversion applied`
          );
        }
      }

      if (dep.integrity) {
        console.log(`    Integrity: ${dep.integrity}`);
      }

      console.log();
    }

    const resolved = dependencies.filter((d) => d.resolvedSha).length;
    const unresolved = dependencies.length - resolved;

    console.log(`Summary:`);
    console.log(`  Total: ${dependencies.length}`);
    console.log(`  Resolved: ${resolved}`);
    if (unresolved > 0) {
      console.log(`  Failed: ${unresolved}`);
      console.log(
        `\nNote: Failed resolutions may indicate network issues or invalid references.`
      );
    }
  }
}
