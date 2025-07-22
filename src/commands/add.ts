import { BaseCommand } from '../base-cmd.js';
import { getTargetPath } from '../lib/utils/path.js';
import { existsSync, rmSync } from 'node:fs';
import {
  cloneMirror,
  updateAndPruneMirror,
  repackRepository,
  resolveRef,
  type GitCacheOptions,
} from '../lib/utils/git.js';
import { createTarballBuilder } from '../lib/tarball-builder.js';

export interface AddOptions extends GitCacheOptions {
  ref?: string;
  build?: boolean;
}
export class Add extends BaseCommand {
  static description = 'Mirror a repository into your local cache';
  static commandName = 'add';
  static usage = [
    '<repo>',
    '<repo> --force',
    '<repo> --ref <branch|tag>',
    '<repo> --build',
  ];
  static params = ['force', 'ref', 'build'];
  static argumentSpec = { type: 'required', name: 'repo' } as const;

  async exec(args: string[], opts: AddOptions = {}): Promise<string> {
    if (args.length === 0) {
      throw this.usageError('Repository URL is required');
    }

    const [repo] = args;
    const targetPath = getTargetPath(repo);

    // Handle force flag: remove existing repository if it exists
    if (opts.force && existsSync(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true });
    }

    // Clone the repository as a mirror if it doesn't exist
    if (!existsSync(targetPath)) {
      cloneMirror(repo, targetPath);
    }

    // Resolve and log reference if specified
    let resolvedSha: string | undefined;
    if (opts.ref) {
      try {
        resolvedSha = resolveRef(repo, opts.ref);
        console.log(`Resolved ${opts.ref} → ${resolvedSha}`);
      } catch (error) {
        console.warn(
          `Warning: Failed to resolve ref '${opts.ref}': ${String(error)}`
        );
      }
    }

    // Optionally update and repack for optimization when force is used
    if (opts.force && existsSync(targetPath)) {
      updateAndPruneMirror(targetPath);
      repackRepository(targetPath);
    }

    // Build tarball if requested
    if (opts.build) {
      try {
        const tarballBuilder = createTarballBuilder();

        // If no ref specified, resolve the default branch (HEAD)
        let buildSha = resolvedSha;
        if (!buildSha) {
          try {
            buildSha = resolveRef(repo, 'HEAD');
            console.log(`Building tarball for HEAD → ${buildSha}`);
          } catch (error) {
            console.warn(
              `Warning: Could not resolve HEAD for tarball build: ${String(error)}`
            );
            return targetPath;
          }
        }

        const result = await tarballBuilder.buildTarball(repo, buildSha, {
          force: opts.force,
        });
        console.log(`✓ Tarball cached: ${result.tarballPath}`);
      } catch (error) {
        console.warn(`Warning: Failed to build tarball: ${String(error)}`);
      }
    }

    return targetPath;
  }
}
