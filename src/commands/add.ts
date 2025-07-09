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

export interface AddOptions extends GitCacheOptions {
  ref?: string;
}
export class Add extends BaseCommand {
  static description = 'Mirror a repository into your local cache';
  static commandName = 'add';
  static usage = ['<repo>', '<repo> --force', '<repo> --ref <branch|tag>'];
  static params = ['force', 'ref'];

  exec(args: string[], opts: AddOptions = {}): string {
    if (args.length === 0) {
      throw this.usageError('Repository URL is required');
    }

    const [repo] = args;
    const targetPath = getTargetPath(repo);

    // Handle force flag: remove existing repository if it exists
    if (opts.force && existsSync(targetPath)) {
      rmSync(targetPath, { recursive: true, force: true });
    }

    // Clone the repository as a mirror (or skip if already exists and not forced)
    if (!existsSync(targetPath)) {
      cloneMirror(repo, targetPath);
    }

    // Resolve and log reference if specified
    if (opts.ref) {
      try {
        const sha = resolveRef(repo, opts.ref);
        console.log(`Resolved ${opts.ref} → ${sha}`);
      } catch (error) {
        console.warn(
          `Warning: Failed to resolve ref '${opts.ref}': ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Optionally update and repack for optimization
    if (opts.force && existsSync(targetPath)) {
      updateAndPruneMirror(targetPath);
      repackRepository(targetPath);
    }

    return targetPath;
  }
}
