import { spawnSync } from 'node:child_process';
import { BaseCommand } from '../base-cmd.js';
import { getCacheDir } from '../lib/utils/path.js';

/**
 * Install command - runs npm install with gitcache as the npm cache
 */
export class Install extends BaseCommand {
  static description = 'Run npm install using gitcache as the npm cache';
  static commandName = 'install';
  static usage = ['[npm-args...]'];
  static params = [];

  exec(args: string[] = []): void {
    const cacheDir = getCacheDir();
    
    // Set npm cache to gitcache directory
    const env = {
      ...process.env,
      npm_config_cache: cacheDir,
      NPM_CONFIG_CACHE: cacheDir   // Windows / PowerShell friendliness
    };

    // Build npm install command with all passed arguments
    const npmArgs = ['install', ...args];

    try {
      // Execute npm install with gitcache as cache
      const { status } = spawnSync('npm', npmArgs, {
        stdio: 'inherit',
        env,
        cwd: process.cwd(),
      });
      
      if (status !== 0) {
        process.exit(status);
      }
    } catch (error) {
      // Re-throw the error to let the CLI handle it
      throw error;
    }
  }
}
