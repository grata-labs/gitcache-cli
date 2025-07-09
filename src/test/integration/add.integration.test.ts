import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

import { addRepository } from '../../lib/api.js';
import { getRepoPath } from '../../lib/utils/path.js';
import { useIntegrationTestSetup } from './shared-setup.js';

describe.skipIf(process.env.CI || process.env.SKIP_INTEGRATION_TESTS)(
  'GitCache Add Command Integration',
  () => {
    const ctx = useIntegrationTestSetup();

    describe('API: addRepository()', () => {
      it('should clone and cache a repository via API', async () => {
        const testRepo = ctx.testRepos.simple;
        const result = await addRepository(testRepo.url);

        const expectedPath = join(ctx.gitcacheDir, getRepoPath(testRepo.url));
        expect(result).toBe(expectedPath);
        expect(existsSync(expectedPath)).toBe(true);
      });

      it('should create bare repository structure', async () => {
        const testRepo = ctx.testRepos.simple;
        const repoPath = await addRepository(testRepo.url);

        // Verify bare repository structure
        expect(existsSync(join(repoPath, 'HEAD'))).toBe(true);
        expect(existsSync(join(repoPath, 'refs'))).toBe(true);
        expect(existsSync(join(repoPath, 'objects'))).toBe(true);
        expect(existsSync(join(repoPath, 'config'))).toBe(true);

        // Should NOT have working directory files
        expect(existsSync(join(repoPath, 'README.md'))).toBe(false);
      });

      it('should handle multiple repository additions', async () => {
        // Add all repositories
        const results = await Promise.all(
          Object.entries(ctx.testRepos).map(async ([name, repo]) => ({
            name,
            repo,
            path: await addRepository(repo.url),
          }))
        );

        // Verify all repositories were cached
        results.forEach(({ repo, path }) => {
          expect(existsSync(path)).toBe(true);
          expect(path).toBe(join(ctx.gitcacheDir, getRepoPath(repo.url)));
        });

        expect(results).toHaveLength(4);
      });

      it('should return same path for duplicate additions', async () => {
        // Test idempotent behavior - adding the same repository twice should work
        const testRepo = ctx.testRepos.test;

        const firstAdd = await addRepository(testRepo.url);
        const secondAdd = await addRepository(testRepo.url);

        expect(firstAdd).toBe(secondAdd);
        expect(existsSync(firstAdd)).toBe(true);
      });

      it('should maintain git repository integrity', async () => {
        const testRepo = ctx.testRepos.demo;
        const repoPath = await addRepository(testRepo.url);

        // Should be able to run git commands on cached repository
        const logResult = execSync(`git -C "${repoPath}" log --oneline`, {
          encoding: 'utf8',
        });
        const commits = logResult
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        expect(commits).toHaveLength(1); // Single commit from fast fixture
        expect(commits[0]).toContain('Initial');

        // Should be able to inspect repository metadata
        const branchResult = execSync(`git -C "${repoPath}" branch`, {
          encoding: 'utf8',
        });
        expect(branchResult.trim()).toContain('main');
      });

      it('should handle file:// URLs correctly', async () => {
        const testRepo = ctx.testRepos.simple;
        expect(testRepo.url).toMatch(/^file:\/\//);

        const result = await addRepository(testRepo.url);
        expect(existsSync(result)).toBe(true);

        // Verify SHA-256 hash in path
        const hashedPath = getRepoPath(testRepo.url);
        expect(result).toContain(hashedPath);
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid repository URLs', async () => {
        const invalidUrl = 'file:///nonexistent/path';

        await expect(addRepository(invalidUrl)).rejects.toThrow();
      });

      it('should handle malformed URLs gracefully', async () => {
        const malformedUrl = 'not-a-valid-url';

        await expect(addRepository(malformedUrl)).rejects.toThrow();
      });
    });
  }
);
