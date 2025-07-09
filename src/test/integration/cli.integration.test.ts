import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { useIntegrationTestSetup } from './shared-setup.js';

describe.skipIf(process.env.CI || process.env.SKIP_INTEGRATION_TESTS)(
  'GitCache CLI Integration',
  () => {
    const ctx = useIntegrationTestSetup();
    const cliPath = join(__dirname, '../../index.ts');

    describe('Command Line Interface', () => {
      it('should support add command with repository', async () => {
        const testRepo = ctx.testRepos.simple;

        const result = execSync(`npx tsx ${cliPath} add ${testRepo.url}`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });

        expect(result).toContain('gitcache');

        // Verify repository was cached
        const expectedPath = result.trim();
        expect(existsSync(expectedPath)).toBe(true);
        expect(existsSync(join(expectedPath, 'HEAD'))).toBe(true);
      });

      it('should support cache alias for add command', async () => {
        const testRepo = ctx.testRepos.simple;

        const result = execSync(`npx tsx ${cliPath} cache ${testRepo.url}`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });

        expect(result).toContain('gitcache');

        const expectedPath = result.trim();
        expect(existsSync(expectedPath)).toBe(true);
      });

      it('should support --force flag integration', async () => {
        const testRepo = ctx.testRepos.simple;

        // First add
        const firstResult = execSync(`npx tsx ${cliPath} add ${testRepo.url}`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });

        const repoPath = firstResult.trim();
        expect(existsSync(repoPath)).toBe(true);

        // Force add again (should update and repack)
        const secondResult = execSync(
          `npx tsx ${cliPath} add ${testRepo.url} --force`,
          {
            encoding: 'utf8',
            stdio: 'pipe',
          }
        );

        expect(secondResult.trim()).toBe(repoPath);
        expect(existsSync(repoPath)).toBe(true);
      });

      it('should support --ref flag with test repository', async () => {
        const testRepo = ctx.testRepos.complex;

        try {
          const result = execSync(
            `npx tsx ${cliPath} add ${testRepo.url} --ref main`,
            {
              encoding: 'utf8',
              stdio: 'pipe',
            }
          );

          // Should show resolved reference
          expect(result).toMatch(/Resolved main → [a-f0-9]{40}/);

          // The path should be the last non-empty line
          const lines = result
            .trim()
            .split('\n')
            .filter((line) => line.trim().length > 0);
          const repoPath = lines[lines.length - 1].trim();
          expect(repoPath).toBeTruthy();
          expect(repoPath).toContain('.gitcache');
          expect(existsSync(repoPath)).toBe(true);
        } catch (error) {
          // If the command fails, let's see what went wrong
          console.error('--ref test failed:', error);
          throw error;
        }
      });

      it('should handle invalid reference gracefully', async () => {
        const testRepo = ctx.testRepos.simple;

        const result = execSync(
          `npx tsx ${cliPath} add ${testRepo.url} --ref nonexistent-branch`,
          {
            encoding: 'utf8',
            stdio: 'pipe',
          }
        );

        // Should warn about failed resolution but still cache repo
        // Check if warning appears in stdout (console.warn output varies by environment)
        const hasWarning =
          result.includes('Warning: Failed to resolve ref') ||
          result.includes('nonexistent-branch');

        if (!hasWarning) {
          // If not in stdout, the repository should still be cached successfully
          const lines = result
            .trim()
            .split('\n')
            .filter((line) => line.trim().length > 0);
          const repoPath = lines[lines.length - 1].trim();
          expect(repoPath).toBeTruthy();
          expect(repoPath).toContain('.gitcache');
          expect(existsSync(repoPath)).toBe(true);
        } else {
          expect(result).toContain('nonexistent-branch');
        }
      });

      it('should support install command aliases', async () => {
        // Test both 'install' and 'i' aliases
        const installResult = execSync(`npx tsx ${cliPath} install --version`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });

        const iResult = execSync(`npx tsx ${cliPath} i --version`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });

        // Both should return npm version
        expect(installResult.trim()).toMatch(/^\d+\.\d+\.\d+/);
        expect(iResult.trim()).toMatch(/^\d+\.\d+\.\d+/);
        expect(installResult).toBe(iResult);
      });

      it('should display help for commands', async () => {
        const helpResult = execSync(`npx tsx ${cliPath} --help`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });

        expect(helpResult).toContain('add');
        expect(helpResult).toContain('install');
        expect(helpResult).toContain('Mirror a repository');
      });

      it('should handle command errors gracefully', async () => {
        expect(() => {
          execSync(`npx tsx ${cliPath} add`, {
            encoding: 'utf8',
            stdio: 'pipe',
          });
        }).toThrow();

        expect(() => {
          execSync(`npx tsx ${cliPath} nonexistent-command`, {
            encoding: 'utf8',
            stdio: 'pipe',
          });
        }).toThrow();
      });
    });
  }
);
