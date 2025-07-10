import { spawnSync } from 'node:child_process';
import { BaseCommand } from '../base-cmd.js';
import { getCacheDir } from '../lib/utils/path.js';
import { mkdirSync } from 'fs';

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
      NPM_CONFIG_CACHE: cacheDir, // Windows / PowerShell friendliness
    };

    // Build npm install command with all passed arguments
    const npmArgs = ['install', ...args];

    try {
      // Ensure cache directory exists before running npm
      // This is especially important on Windows
      try {
        mkdirSync(cacheDir, { recursive: true });
      } catch (mkdirError) {
        // Directory might already exist, which is fine
        // Only log if it's a real error
        if ((mkdirError as any)?.code !== 'EEXIST') {
          console.warn(
            `Warning: Could not create cache directory: ${(mkdirError as Error).message}`
          );
        }
      }

      // Execute npm install with gitcache as cache
      const result = spawnSync('npm', npmArgs, {
        stdio: 'inherit',
        env,
        cwd: process.cwd(),
      });

      // Handle cross-platform differences in spawnSync return values
      // On Windows, status can be null for successful processes
      // On Unix-like systems, status is typically 0 for success
      let exitCode = 0;

      if (result.status !== null && result.status !== undefined) {
        exitCode = result.status;
      } else if (result.error) {
        // If there was an error but no status, treat as failure
        exitCode = 1;
      }
      // If status is null/undefined and no error, treat as success (exitCode = 0)

      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    } catch (error) {
      // Re-throw the error to let the CLI handle it
      throw error;
    }
  }
}
