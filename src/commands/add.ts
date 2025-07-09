import { BaseCommand } from '../base-cmd.js';
import { getTargetPath } from '../lib/utils/path.js';
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

    // Clone the repository as a mirror
    cloneMirror(repo, targetPath);

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
    if (opts.force) {
      updateAndPruneMirror(targetPath);
      repackRepository(targetPath);
    }

    return targetPath;
  }
}
