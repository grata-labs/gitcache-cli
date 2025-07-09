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
   * Create a repository with multiple branches and tags for advanced testing
   */
  createComplexRepository(name: string): FastTestRepository {
    const repoPath = join(this.fixturesDir, name);
    const workingPath = join(this.fixturesDir, `${name}-working`);

    try {
      // Clean up if exists
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(workingPath, { recursive: true, force: true });

      // Create working directory
      mkdirSync(workingPath, { recursive: true });

      // Initialize git repo
      execSync('git init -q', { cwd: workingPath, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', {
        cwd: workingPath,
        stdio: 'pipe',
      });
      execSync('git config user.name "Test User"', {
        cwd: workingPath,
        stdio: 'pipe',
      });

      // Create initial commit on main
      writeFileSync(join(workingPath, 'README.md'), '# Complex Test Repo');
      execSync('git add .', { cwd: workingPath, stdio: 'pipe' });
      execSync('git commit -q -m "Initial commit"', {
        cwd: workingPath,
        stdio: 'pipe',
      });

      // Create a tag
      execSync('git tag v1.0.0', { cwd: workingPath, stdio: 'pipe' });

      // Create a feature branch
      execSync('git checkout -q -b feature/test', {
        cwd: workingPath,
        stdio: 'pipe',
      });
      writeFileSync(join(workingPath, 'feature.txt'), 'Feature content');
      execSync('git add .', { cwd: workingPath, stdio: 'pipe' });
      execSync('git commit -q -m "Add feature"', {
        cwd: workingPath,
        stdio: 'pipe',
      });

      // Create another tag
      execSync('git tag v1.1.0', { cwd: workingPath, stdio: 'pipe' });

      // Go back to main and make another commit
      execSync('git checkout -q main', { cwd: workingPath, stdio: 'pipe' });
      writeFileSync(join(workingPath, 'main.txt'), 'Main branch content');
      execSync('git add .', { cwd: workingPath, stdio: 'pipe' });
      execSync('git commit -q -m "Update main"', {
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
      complex: this.createComplexRepository('complex-repo'),
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
