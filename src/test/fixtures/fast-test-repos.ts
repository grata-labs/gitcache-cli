import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

export interface FastTestRepository {
  name: string;
  path: string;
  url: string;
}

export class FastGitTestFixtures {
  private fixturesDir: string;
  private repos: Map<string, FastTestRepository> = new Map();

  constructor(baseDir: string = join(tmpdir(), 'gitcache-fast-fixtures')) {
    this.fixturesDir = baseDir;
  }

  /**
   * Create a minimal test repository optimized for speed
   */
  createMinimalRepository(name: string): FastTestRepository {
    const repoPath = join(this.fixturesDir, name);
    const workingPath = join(this.fixturesDir, `${name}-working`);

    try {
      // Clean up if exists
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(workingPath, { recursive: true, force: true });

      // Create working directory
      mkdirSync(workingPath, { recursive: true });

      // Initialize git repo with minimal config
      execSync('git init -q', { cwd: workingPath, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', {
        cwd: workingPath,
        stdio: 'pipe',
      });
      execSync('git config user.name "Test User"', {
        cwd: workingPath,
        stdio: 'pipe',
      });

      // Create single minimal file and commit
      writeFileSync(join(workingPath, 'README.md'), '# Test');
      execSync('git add .', { cwd: workingPath, stdio: 'pipe' });
      execSync('git commit -q -m "Initial"', {
        cwd: workingPath,
        stdio: 'pipe',
      });

      // Clone as bare repository
      execSync(`git clone -q --bare "${workingPath}" "${repoPath}"`, {
        stdio: 'pipe',
      });

      // Clean up working directory
      rmSync(workingPath, { recursive: true, force: true });

      const repo: FastTestRepository = {
        name,
        path: repoPath,
        url: `file://${repoPath}`,
      };

      this.repos.set(name, repo);
      return repo;
    } catch (error) {
      // Clean up on error
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(workingPath, { recursive: true, force: true });
      throw error;
    }
  }

  /**
   * Create standard fast test repositories
   */
  createFastRepos(): Record<string, FastTestRepository> {
    return {
      simple: this.createMinimalRepository('simple-repo'),
      test: this.createMinimalRepository('test-repo'),
      demo: this.createMinimalRepository('demo-repo'),
    };
  }

  /**
   * Clean up all test repositories
   */
  cleanup(): void {
    rmSync(this.fixturesDir, { recursive: true, force: true });
    this.repos.clear();
  }
}
