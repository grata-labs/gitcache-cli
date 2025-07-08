import { beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

import {
  FastGitTestFixtures,
  FastTestRepository,
} from '../fixtures/fast-test-repos.js';

export interface IntegrationTestContext {
  testDir: string;
  gitcacheDir: string;
  fixtures: FastGitTestFixtures;
  testRepos: Record<string, FastTestRepository>;
  originalHome: string;
}

/**
 * Shared setup for integration tests that creates isolated test environment
 * with real git repositories for testing GitCache functionality
 */
export function useIntegrationTestSetup(): IntegrationTestContext {
  let context: IntegrationTestContext;

  beforeEach(() => {
    // Create isolated test environment
    const testDir = mkdtempSync(join(tmpdir(), 'gitcache-integration-test-'));
    const originalHome = process.env.HOME!;
    process.env.HOME = testDir;
    const gitcacheDir = join(testDir, '.gitcache');

    // Create fast test fixtures with real git repositories
    const fixtures = new FastGitTestFixtures(join(testDir, 'fixtures'));
    const testRepos = fixtures.createFastRepos();

    context = {
      testDir,
      gitcacheDir,
      fixtures,
      testRepos,
      originalHome,
    };
  });

  afterEach(() => {
    if (context) {
      process.env.HOME = context.originalHome;
      context.fixtures.cleanup();
      rmSync(context.testDir, { recursive: true, force: true });
    }
  });

  return new Proxy({} as IntegrationTestContext, {
    get(_, prop) {
      if (!context) {
        throw new Error(
          'Integration test context not initialized. Make sure you are inside a test that uses useIntegrationTestSetup()'
        );
      }
      return context[prop as keyof IntegrationTestContext];
    },
  });
}
