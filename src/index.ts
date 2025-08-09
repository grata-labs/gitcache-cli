#!/usr/bin/env node
/**
 * GitCache CLI - Universal Git-dependency cache & proxy
 *
 * Provides commands for caching Git repositories locally and syncing
 * with team-shared GitCache proxies.
 */

export { main } from './lib/cli.js';

// Only run CLI if this file is executed directly
/* c8 ignore start - CLI entry point only executes when script is run directly, not during imports/tests */
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/gitcache')
) {
  const { main } = await import('./lib/cli.js');
  main();
}
/* c8 ignore stop */
