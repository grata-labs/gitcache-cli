import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

import { addRepository } from '../../lib/api.js';
import { useIntegrationTestSetup } from './shared-setup.js';

describe.skipIf(process.env.CI || process.env.SKIP_INTEGRATION_TESTS)(
  'GitCache Integration Tests',
  () => {
    const ctx = useIntegrationTestSetup();

    describe('End-to-End Workflows', () => {
      it('should complete full repository caching workflow', () => {
        const testRepo = ctx.testRepos.simple;

        // Add repository
        const repoPath = addRepository(testRepo.url);

        // Verify caching worked
        expect(existsSync(repoPath)).toBe(true);
        expect(repoPath).toBe(
          join(ctx.gitcacheDir, encodeURIComponent(testRepo.url))
        );

        // Verify git integrity
        const result = execSync(`git -C "${repoPath}" log --oneline`, {
          encoding: 'utf8',
        });
        expect(result.trim()).toContain('Initial');
      });

      it('should handle multiple repositories in same session', () => {
        // Add all test repositories
        const results = Object.entries(ctx.testRepos).map(([name, repo]) => ({
          name,
          repo,
          path: addRepository(repo.url),
        }));

        // Verify all were cached
        results.forEach(({ path }) => {
          expect(existsSync(path)).toBe(true);
        });

        // Verify cache directory structure
        expect(results).toHaveLength(3);
        expect(existsSync(ctx.gitcacheDir)).toBe(true);
      });

      it('should maintain isolation between test runs', () => {
        // This test verifies that our test setup properly isolates each test
        const testRepo = ctx.testRepos.test;
        const repoPath = addRepository(testRepo.url);

        expect(existsSync(repoPath)).toBe(true);
        expect(ctx.testDir).toMatch(/gitcache-integration-test-/);
        expect(process.env.HOME).toBe(ctx.testDir);
      });
    });
  }
);
