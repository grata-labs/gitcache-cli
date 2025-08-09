import { Install } from '../commands/install.js';

/**
 * Run npm install using gitcache as the npm cache.
 *
 * @param args - Arguments to pass to npm install
 */
export function npmInstall(args: string[] = []): void {
  const install = new Install();
  install.exec(args);
}
