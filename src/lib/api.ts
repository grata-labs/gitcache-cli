import { Add } from '../commands/add.js';
import { Install } from '../commands/install.js';

/**
 * Add a Git repository to the local cache directory.
 *
 * @param repo - The Git repository URL to add
 * @param opts - Add options
 * @param opts.force - Whether to repack the repository after adding
 * @param opts.build - Whether to build tarball for the repository
 * @returns The target directory path where the repo was cached
 */
export async function addRepository(
  repo: string,
  opts: { force?: boolean; build?: boolean } = {}
): Promise<string> {
  const add = new Add();
  return add.exec([repo], opts) as Promise<string>;
}

/**
 * Cache a Git repository to the local cache directory.
 * @deprecated Use addRepository instead. This function is an alias for backward compatibility.
 *
 * @param repo - The Git repository URL to cache
 * @param opts - Cache options
 * @param opts.force - Whether to repack the repository after caching
 * @param opts.build - Whether to build tarball for the repository
 * @returns The target directory path where the repo was cached
 */
export async function cacheRepository(
  repo: string,
  opts: { force?: boolean; build?: boolean } = {}
): Promise<string> {
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
