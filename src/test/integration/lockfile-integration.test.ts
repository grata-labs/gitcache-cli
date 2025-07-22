import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanLockfile, resolveGitReferences } from '../../lockfile/scan.js';

// Mock execSync for git commands
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

// Mock log utilities
vi.mock('../../lib/utils/log.js', () => ({
  logRefResolution: vi.fn(),
}));

describe('lockfile integration', () => {
  let tempTestDir: string;

  beforeEach(() => {
    tempTestDir = join(
      tmpdir(),
      `gitcache-integration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    mkdirSync(tempTestDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempTestDir)) {
      rmSync(tempTestDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it('should integrate lockfile scanning with tarball building workflow', async () => {
    // Create a realistic package.json with git dependencies
    const packageJsonPath = join(tempTestDir, 'package.json');
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      dependencies: {
        lodash: 'git+https://github.com/lodash/lodash.git#4.17.21',
        express: '^4.18.0', // Regular npm dependency
      },
      devDependencies: {
        chalk: 'github:chalk/chalk#v5.0.0',
      },
    };
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Create corresponding package-lock.json v2 (simulating npm v7+ SSH bug)
    const lockfilePath = join(tempTestDir, 'package-lock.json');
    const lockfileV2 = {
      name: 'test-project',
      version: '1.0.0',
      lockfileVersion: 2,
      requires: true,
      packages: {
        '': {
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            lodash: 'git+https://github.com/lodash/lodash.git#4.17.21',
            express: '^4.18.0',
          },
          devDependencies: {
            chalk: 'github:chalk/chalk#v5.0.0',
          },
        },
        'node_modules/lodash': {
          name: 'lodash',
          resolved: 'git+ssh://git@github.com/lodash/lodash.git#abc123def456', // SSH URL from npm v7+ bug
          integrity: 'sha512-lodash-integrity',
        },
        'node_modules/express': {
          name: 'express',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.0.tgz',
          integrity: 'sha512-express-integrity',
        },
        'node_modules/chalk': {
          name: 'chalk',
          resolved: 'git+ssh://git@github.com/chalk/chalk.git#def789abc123', // SSH URL
          integrity: 'sha512-chalk-integrity',
        },
      },
    };
    writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

    // Step 1: Scan lockfile for git dependencies
    const lockfileResult = scanLockfile(lockfilePath);

    expect(lockfileResult.hasGitDependencies).toBe(true);
    expect(lockfileResult.dependencies).toHaveLength(2); // lodash and chalk

    // Verify git dependencies are identified correctly
    const lodashDep = lockfileResult.dependencies.find(
      (dep) => dep.name === 'lodash'
    );
    const chalkDep = lockfileResult.dependencies.find(
      (dep) => dep.name === 'chalk'
    );

    expect(lodashDep).toBeDefined();
    expect(lodashDep?.packageJsonUrl).toBe(
      'git+https://github.com/lodash/lodash.git#4.17.21'
    );
    expect(lodashDep?.lockfileUrl).toBe(
      'git+ssh://git@github.com/lodash/lodash.git#abc123def456'
    );
    expect(lodashDep?.preferredUrl).toBe(
      'git+https://github.com/lodash/lodash.git#4.17.21'
    ); // Prefers HTTPS from package.json
    expect(lodashDep?.reference).toBe('abc123def456');

    expect(chalkDep).toBeDefined();
    expect(chalkDep?.packageJsonUrl).toBe('github:chalk/chalk#v5.0.0');
    expect(chalkDep?.preferredUrl).toBe(
      'git+https://github.com/chalk/chalk#v5.0.0.git'
    ); // Normalized from GitHub shorthand

    // Step 2: Verify data format is compatible with TarballBuilder
    // The resolved dependencies should be compatible with TarballBuilder.buildTarball()
    for (const dep of lockfileResult.dependencies) {
      // This demonstrates how the lockfile scanner output integrates with tarball building
      const buildArgs = {
        gitUrl: dep.preferredUrl.replace(/^git\+/, ''), // Remove git+ prefix for git operations
        reference: dep.reference,
        options: { force: true },
      };

      expect(buildArgs.gitUrl).toMatch(/^https:\/\/github\.com/); // Should be HTTPS URL
      expect(buildArgs.reference).toBeTruthy(); // Should have a reference

      // We don't actually call buildTarball in this test to avoid complex mocking,
      // but we verify the data format is correct for TarballBuilder integration
    }

    // Step 3: Verify that npm v7+ SSH bug handling works
    expect(lodashDep?.preferredUrl).toBe(
      'git+https://github.com/lodash/lodash.git#4.17.21'
    );
    expect(lodashDep?.lockfileUrl).toBe(
      'git+ssh://git@github.com/lodash/lodash.git#abc123def456'
    );

    // The scanner should prefer HTTPS from package.json over SSH from lockfile
    expect(lodashDep?.preferredUrl).not.toEqual(lodashDep?.lockfileUrl);
  });

  it('should handle mixed npm and git dependencies correctly', async () => {
    const lockfilePath = join(tempTestDir, 'package-lock.json');

    // Create lockfile with mix of git and npm dependencies
    const lockfileV2 = {
      lockfileVersion: 2,
      packages: {
        'node_modules/git-pkg': {
          name: 'git-pkg',
          resolved: 'git+https://github.com/user/git-pkg.git#main',
        },
        'node_modules/npm-pkg': {
          name: 'npm-pkg',
          resolved: 'https://registry.npmjs.org/npm-pkg/-/npm-pkg-1.0.0.tgz',
        },
        'node_modules/another-git-pkg': {
          name: 'another-git-pkg',
          resolved: 'git+ssh://git@gitlab.com/user/repo.git#v2.0.0',
        },
      },
    };
    writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

    const result = scanLockfile(lockfilePath);

    // Should only identify git dependencies, not npm registry dependencies
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies.map((dep) => dep.name)).toEqual([
      'git-pkg',
      'another-git-pkg',
    ]);
    expect(result.hasGitDependencies).toBe(true);

    // Verify that npm registry packages are filtered out
    const npmPkg = result.dependencies.find((dep) => dep.name === 'npm-pkg');
    expect(npmPkg).toBeUndefined();
  });

  it('should handle lockfile with no git dependencies', async () => {
    const lockfilePath = join(tempTestDir, 'package-lock.json');

    const lockfileV2 = {
      lockfileVersion: 2,
      packages: {
        'node_modules/express': {
          name: 'express',
          resolved: 'https://registry.npmjs.org/express/-/express-4.18.0.tgz',
        },
        'node_modules/lodash': {
          name: 'lodash',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
        },
      },
    };
    writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

    const result = scanLockfile(lockfilePath);

    expect(result.dependencies).toHaveLength(0);
    expect(result.hasGitDependencies).toBe(false);
    expect(result.lockfileVersion).toBe(2);

    // Should not attempt to resolve any git references
    const resolved = await resolveGitReferences(result.dependencies);
    expect(resolved).toHaveLength(0);
  });

  it('should demonstrate complete workflow', async () => {
    // Create a complete scenario with package.json and lockfile
    const packageJsonPath = join(tempTestDir, 'package.json');
    const packageJson = {
      name: 'demo-project',
      version: '2.0.0',
      dependencies: {
        moment: 'git+https://github.com/moment/moment.git#v2.29.4',
        axios: '^1.4.0',
      },
    };
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    const lockfilePath = join(tempTestDir, 'package-lock.json');
    const lockfileV3 = {
      name: 'demo-project',
      version: '2.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: {
        '': {
          name: 'demo-project',
          version: '2.0.0',
          dependencies: {
            moment: 'git+https://github.com/moment/moment.git#v2.29.4',
            axios: '^1.4.0',
          },
        },
        'node_modules/moment': {
          name: 'moment',
          resolved:
            'git+ssh://git@github.com/moment/moment.git#2d00c6916fd3c1a32d2b9e2b17c1e1ed2b1c8f2d',
          integrity: 'sha512-moment-integrity-hash',
        },
        'node_modules/axios': {
          name: 'axios',
          resolved: 'https://registry.npmjs.org/axios/-/axios-1.4.0.tgz',
          integrity: 'sha512-axios-integrity-hash',
        },
      },
    };
    writeFileSync(lockfilePath, JSON.stringify(lockfileV3, null, 2));

    // Demonstrate complete workflow without complex mocking

    // Step 1: Parse lockfile and identify git dependencies
    const result = scanLockfile(lockfilePath);

    expect(result.hasGitDependencies).toBe(true);
    expect(result.dependencies).toHaveLength(1); // Only moment is a git dependency

    const momentDep = result.dependencies[0];
    expect(momentDep.name).toBe('moment');
    expect(momentDep.packageJsonUrl).toBe(
      'git+https://github.com/moment/moment.git#v2.29.4'
    );
    expect(momentDep.lockfileUrl).toBe(
      'git+ssh://git@github.com/moment/moment.git#2d00c6916fd3c1a32d2b9e2b17c1e1ed2b1c8f2d'
    );

    // Step 2: Verify npm v7+ bug handling (HTTPS preferred over SSH)
    expect(momentDep.preferredUrl).toBe(
      'git+https://github.com/moment/moment.git#v2.29.4'
    );
    expect(momentDep.preferredUrl).not.toEqual(momentDep.lockfileUrl); // Should prefer package.json HTTPS

    // Step 3: Verify reference extraction
    expect(momentDep.reference).toBe(
      '2d00c6916fd3c1a32d2b9e2b17c1e1ed2b1c8f2d'
    );

    // Step 4: Verify data is ready for tarball building workflow
    // The lockfile scanner provides everything needed for TarballBuilder:
    // - preferredUrl: Clean HTTPS URL for git operations
    // - reference: Commit SHA or tag to checkout
    // - name: Package name for tarball naming

    const workflowData = {
      packageName: momentDep.name,
      gitUrl: momentDep.preferredUrl.replace(/^git\+/, ''),
      reference: momentDep.reference,
      isCommitSha: /^[a-f0-9]{40}$/.test(momentDep.reference),
    };

    expect(workflowData.packageName).toBe('moment');
    expect(workflowData.gitUrl).toBe(
      'https://github.com/moment/moment.git#v2.29.4'
    );
    expect(workflowData.reference).toBe(
      '2d00c6916fd3c1a32d2b9e2b17c1e1ed2b1c8f2d'
    );
    expect(workflowData.isCommitSha).toBe(true); // This is already a commit SHA

    // This demonstrates the complete integration:
    // 1. scanLockfile() parses package-lock.json and identifies git dependencies
    // 2. Handles npm v7+ SSH→HTTPS bug by preferring package.json URLs
    // 3. Extracts commit SHAs from lockfile for precise version control
    // 4. Provides clean data format for TarballBuilder.buildTarball()

    console.log(
      '✅ Complete workflow demonstrated: lockfile → git dependencies → tarball building data'
    );
  });
});
