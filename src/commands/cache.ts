import { BaseCommand } from '../base-cmd.js';
import { getTargetPath } from '../lib/utils/path.js';
import {
  cloneMirror,
  repackRepository,
  type GitCacheOptions,
} from '../lib/utils/git.js';

/**
 * Cache command - mirrors a Git repository locally
 */
export class Cache extends BaseCommand {
  static description = 'Mirror a repository into your local cache';
  static commandName = 'cache';
  static usage = ['<repo>', '<repo> --force'];
  static params = ['force'];

  exec(args: string[], opts: GitCacheOptions = {}): string {
    if (args.length === 0) {
      throw this.usageError('Repository URL is required');
    }

    const [repo] = args;
    const targetPath = getTargetPath(repo);

    // Clone the repository as a mirror
    cloneMirror(repo, targetPath);

    // Optionally repack for optimization
    if (opts.force) {
      repackRepository(targetPath);
    }

    return targetPath;
  }
}
