import { BaseCommand } from '../base-cmd.js';
import { getTargetPath } from '../lib/utils/path.js';
import {
  cloneMirror,
  updateAndPruneMirror,
  repackRepository,
  type GitCacheOptions,
} from '../lib/utils/git.js';

/**
 * Add command - mirrors a Git repository locally
 */
export class Add extends BaseCommand {
  static description = 'Mirror a repository into your local cache';
  static commandName = 'add';
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

    // Optionally update and repack for optimization
    if (opts.force) {
      updateAndPruneMirror(targetPath);
      repackRepository(targetPath);
    }

    return targetPath;
  }
}
