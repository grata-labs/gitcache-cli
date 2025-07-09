import { Add } from '../commands/add.js';
import { Install } from '../commands/install.js';

/**
 * Add a Git repository to the local cache directory.
 *
 * @param repo - The Git repository URL to add
 * @param opts - Add options
 * @param opts.force - Whether to repack the repository after adding
 * @returns The target directory path where the repo was cached
 */
export function addRepository(
  repo: string,
  opts: { force?: boolean } = {}
): string {
  const add = new Add();
  return add.exec([repo], opts) as string;
}

/**
 * Cache a Git repository to the local cache directory.
 * @deprecated Use addRepository instead. This function is an alias for backward compatibility.
 *
 * @param repo - The Git repository URL to cache
 * @param opts - Cache options
 * @param opts.force - Whether to repack the repository after caching
 * @returns The target directory path where the repo was cached
 */
export function cacheRepository(
  repo: string,
  opts: { force?: boolean } = {}
): string {
  return addRepository(repo, opts);
}

/**
 * Run npm install using gitcache as the npm cache.
 *
 * @param args - Arguments to pass to npm install
 */
export function npmInstall(args: string[] = []): void {
  const install = new Install();
  install.exec(args);
}
