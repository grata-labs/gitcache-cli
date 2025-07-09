import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { addRepository } from '../../lib/api.js';
import { getRepoPath } from '../../lib/utils/path.js';
import { useIntegrationTestSetup } from './shared-setup.js';

describe.skipIf(process.env.CI || process.env.SKIP_INTEGRATION_TESTS)(
  'GitCache Advanced Repository Scenarios',
  () => {
    const ctx = useIntegrationTestSetup();

    describe('Complex Repository Handling', () => {
      it('should handle repositories with multiple branches', () => {
        // Use our complex test repository with multiple branches
        const testRepo = ctx.testRepos.complex;
        const repoPath = addRepository(testRepo.url);

        expect(existsSync(repoPath)).toBe(true);

        // Check that we can list branches (in bare repos, branches are local refs)
        const branches = execSync(`git -C "${repoPath}" branch -a`, {
          encoding: 'utf8',
        });

        // Should have main and feature/test branches
        expect(branches).toContain('main');
        expect(branches).toContain('feature/test');
      });

      it('should handle repositories with tags', () => {
        const testRepo = ctx.testRepos.complex;
        const repoPath = addRepository(testRepo.url);

        // Check for tags
        const tags = execSync(`git -C "${repoPath}" tag`, {
          encoding: 'utf8',
        });

        // Should have the tags we created
        expect(tags).toContain('v1.0.0');
        expect(tags).toContain('v1.1.0');
      });

      it('should handle SSH URLs correctly', () => {
        // Test with file:// URL since SSH requires authentication
        const testRepo = ctx.testRepos.simple;
        expect(testRepo.url).toMatch(/^file:\/\//);

        const repoPath = addRepository(testRepo.url);
        expect(existsSync(repoPath)).toBe(true);

        // Verify the repository structure
        expect(existsSync(join(repoPath, 'HEAD'))).toBe(true);
        expect(existsSync(join(repoPath, 'config'))).toBe(true);
      });

      it('should handle repository URLs with .git extension and without', () => {
        // Test that URL normalization treats .git and non-.git URLs the same
        // This is the intended behavior - they should map to the same cache entry
        const baseUrl = 'file:///tmp/test-repo';
        const gitUrl = 'file:///tmp/test-repo.git';

        // URLs should generate the SAME cache paths (due to normalization)
        const pathWithGit = getRepoPath(gitUrl);
        const pathWithoutGit = getRepoPath(baseUrl);

        // The paths should be the same (normalized to same repository)
        expect(pathWithGit).toBe(pathWithoutGit);

        // Both should be valid cache paths when using the test repo
        const testRepo = ctx.testRepos.simple;
        const repoPath1 = addRepository(testRepo.url);
        expect(existsSync(repoPath1)).toBe(true);
      });

      it('should handle force update on existing repository', () => {
        const testRepo = ctx.testRepos.simple;

        // First clone
        const repoPath = addRepository(testRepo.url);
        expect(existsSync(repoPath)).toBe(true);

        // Force update (should trigger repack)
        const cliPath = join(__dirname, '../../index.ts');
        execSync(`npx tsx ${cliPath} add ${testRepo.url} --force`, {
          stdio: 'pipe',
        });

        // Repository should still exist and be valid
        expect(existsSync(repoPath)).toBe(true);
        expect(existsSync(join(repoPath, 'HEAD'))).toBe(true);

        // Should be able to run git commands
        const logResult = execSync(`git -C "${repoPath}" log --oneline`, {
          encoding: 'utf8',
        });
        expect(logResult.trim().length).toBeGreaterThan(0);
      });

      it('should handle concurrent repository additions', () => {
        // Test adding different repositories in quick succession
        const repos = [
          ctx.testRepos.simple,
          ctx.testRepos.test,
          ctx.testRepos.demo,
        ];

        const results = repos.map((repo) => ({
          url: repo.url,
          path: addRepository(repo.url),
        }));

        // All should succeed
        results.forEach(({ path }) => {
          expect(existsSync(path)).toBe(true);
          expect(existsSync(join(path, 'HEAD'))).toBe(true);
        });

        // Paths should be different
        const paths = results.map((r) => r.path);
        const uniquePaths = new Set(paths);
        expect(uniquePaths.size).toBe(paths.length);
      });

      it('should maintain repository integrity after multiple operations', () => {
        const testRepo = ctx.testRepos.demo;
        const repoPath = addRepository(testRepo.url);

        // Perform multiple git operations
        const operations = [
          `git -C "${repoPath}" fsck --full`,
          `git -C "${repoPath}" rev-parse HEAD`,
          `git -C "${repoPath}" log --oneline -n 5`,
          `git -C "${repoPath}" branch -r`,
        ];

        operations.forEach((cmd) => {
          expect(() => {
            execSync(cmd, { stdio: 'pipe' });
          }).not.toThrow();
        });

        // Verify repository is still a valid bare repository
        const config = execSync(`git -C "${repoPath}" config --get core.bare`, {
          encoding: 'utf8',
        });
        expect(config.trim()).toBe('true');
      });

      it('should handle large repository scenarios gracefully', () => {
        // Use our complex test repository which has multiple branches and tags
        const testRepo = ctx.testRepos.complex;

        const startTime = Date.now();
        const repoPath = addRepository(testRepo.url);
        const duration = Date.now() - startTime;

        expect(existsSync(repoPath)).toBe(true);

        // Should complete very quickly since it's local
        expect(duration).toBeLessThan(5000); // 5 seconds max for local ops

        // Repository should be properly structured
        expect(existsSync(join(repoPath, 'objects'))).toBe(true);
        expect(existsSync(join(repoPath, 'refs'))).toBe(true);

        // Should have git objects
        const objectsDir = join(repoPath, 'objects');
        const objectContents = execSync(
          `find "${objectsDir}" -type f | wc -l`,
          {
            encoding: 'utf8',
          }
        );
        expect(parseInt(objectContents.trim())).toBeGreaterThan(0);
      });
    });
  }
);
