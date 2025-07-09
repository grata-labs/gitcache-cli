import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { useIntegrationTestSetup } from './shared-setup.js';

describe.skipIf(process.env.CI || process.env.SKIP_INTEGRATION_TESTS)(
  'GitCache Logging Integration',
  () => {
    const ctx = useIntegrationTestSetup();
    const cliPath = join(__dirname, '../../index.ts');

    describe('Activity Logging', () => {
      it('should create activity log when resolving references', async () => {
        const testRepo = ctx.testRepos.complex;
        const ref = 'main';

        // Use add command with --ref to trigger logging
        const result = execSync(
          `npx tsx ${cliPath} add ${testRepo.url} --ref ${ref}`,
          {
            encoding: 'utf8',
            stdio: 'pipe',
          }
        );

        // Verify resolution was logged
        expect(result).toMatch(/Resolved main → [a-f0-9]{40}/);

        // Check that log file was created
        const logPath = join(ctx.testDir, '.gitcache', 'activity.log');
        expect(existsSync(logPath)).toBe(true);

        // Verify log content
        const logContent = readFileSync(logPath, 'utf8');
        const lines = logContent.trim().split('\n');
        expect(lines.length).toBeGreaterThan(0);

        const logEntry = JSON.parse(lines[lines.length - 1]);
        expect(logEntry.repoUrl).toBe(testRepo.url);
        expect(logEntry.ref).toBe(ref);
        expect(logEntry.sha).toMatch(/^[a-f0-9]{40}$/);
        expect(logEntry.action).toBe('ref-resolved');
        expect(logEntry.timestamp).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        );
      });

      it('should handle multiple reference resolutions in same session', async () => {
        const testRepo = ctx.testRepos.complex;

        // Resolve main branch
        execSync(`npx tsx ${cliPath} add ${testRepo.url} --ref main`, {
          stdio: 'pipe',
        });

        // Resolve feature branch
        execSync(
          `npx tsx ${cliPath} add ${testRepo.url} --ref feature/test --force`,
          {
            stdio: 'pipe',
          }
        );

        // Check log file
        const logPath = join(ctx.testDir, '.gitcache', 'activity.log');
        expect(existsSync(logPath)).toBe(true);

        const logContent = readFileSync(logPath, 'utf8');
        const lines = logContent
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        // Should have two successful resolutions
        expect(lines.length).toBe(2);

        // All lines should be valid JSON
        lines.forEach((line) => {
          const entry = JSON.parse(line);
          expect(entry.repoUrl).toBe(testRepo.url);
          expect(entry.action).toBe('ref-resolved');
        });

        // Should have different refs
        const entries = lines.map((line) => JSON.parse(line));
        const refs = entries.map((e) => e.ref);
        expect(refs).toContain('main');
        expect(refs).toContain('feature/test');
      });

      it('should persist log across multiple command invocations', async () => {
        const repo1 = ctx.testRepos.complex;
        const repo2 = ctx.testRepos.simple;

        // First resolution
        execSync(`npx tsx ${cliPath} add ${repo1.url} --ref main`, {
          stdio: 'pipe',
        });

        // Second resolution with different repo
        execSync(`npx tsx ${cliPath} add ${repo2.url} --ref main`, {
          stdio: 'pipe',
        });

        // Check that both are logged
        const logPath = join(ctx.testDir, '.gitcache', 'activity.log');
        const logContent = readFileSync(logPath, 'utf8');
        const lines = logContent
          .trim()
          .split('\n')
          .filter((line) => line.length > 0);

        expect(lines.length).toBe(2); // Both should succeed

        // Parse all entries and check variety
        const entries = lines.map((line) => JSON.parse(line));
        const repos = new Set(entries.map((e) => e.repoUrl));

        // Should have logging from both repos
        expect(repos.has(repo1.url)).toBe(true);
        expect(repos.has(repo2.url)).toBe(true);
      });

      it('should not log when reference resolution fails', async () => {
        const repoUrl = ctx.testRepos.simple.url;
        const invalidRef = 'definitely-nonexistent-branch';

        // Clear any existing log
        const logPath = join(ctx.testDir, '.gitcache', 'activity.log');

        // Attempt to resolve invalid reference
        const result = execSync(
          `npx tsx ${cliPath} add ${repoUrl} --ref ${invalidRef}`,
          {
            encoding: 'utf8',
            stdio: 'pipe',
          }
        );

        // Should still cache the repository successfully
        expect(result).toContain('.gitcache');

        // Log should either not exist or not contain the failed resolution
        if (existsSync(logPath)) {
          const logContent = readFileSync(logPath, 'utf8');
          const lines = logContent
            .trim()
            .split('\n')
            .filter((line) => line.length > 0);

          // No entries should be for the invalid ref
          lines.forEach((line) => {
            const entry = JSON.parse(line);
            expect(entry.ref).not.toBe(invalidRef);
          });
        }
      });
    });
  }
);
