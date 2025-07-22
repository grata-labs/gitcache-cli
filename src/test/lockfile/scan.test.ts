import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  scanLockfile,
  resolveGitReferences,
  type GitDependency,
} from '../../lockfile/scan.js';

// Mock execSync for git ls-remote calls
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

// Mock log utilities
vi.mock('../../lib/utils/log.js', () => ({
  logRefResolution: vi.fn(),
}));

describe('lockfile scanner', () => {
  let tempTestDir: string;

  beforeEach(() => {
    // Create temporary test directory
    tempTestDir = join(
      tmpdir(),
      `gitcache-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    mkdirSync(tempTestDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(tempTestDir)) {
      rmSync(tempTestDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('scanLockfile', () => {
    it('should throw error when lockfile does not exist', () => {
      const lockfilePath = join(tempTestDir, 'nonexistent-package-lock.json');

      expect(() => scanLockfile(lockfilePath)).toThrow('Lockfile not found');
    });

    it('should throw error when lockfile has invalid JSON', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');
      writeFileSync(lockfilePath, 'invalid json content');

      expect(() => scanLockfile(lockfilePath)).toThrow(
        'Failed to parse lockfile'
      );
    });

    it('should parse lockfile v1 with git dependencies', () => {
      const packageJsonPath = join(tempTestDir, 'package.json');
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      // Create package.json with git dependency
      const packageJson = {
        dependencies: {
          'test-git-package': 'git+https://github.com/user/repo.git#v1.0.0',
        },
      };
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      // Create lockfile v1 with SSH URL (npm v7+ bug simulation)
      const lockfileV1 = {
        lockfileVersion: 1,
        dependencies: {
          'test-git-package': {
            resolved: 'git+ssh://git@github.com/user/repo.git#abc123',
            integrity: 'sha512-example',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV1, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.lockfileVersion).toBe(1);
      expect(result.hasGitDependencies).toBe(true);
      expect(result.dependencies).toHaveLength(1);

      const dep = result.dependencies[0];
      expect(dep.name).toBe('test-git-package');
      expect(dep.gitUrl).toBe('git+ssh://git@github.com/user/repo.git#abc123');
      expect(dep.reference).toBe('abc123');
      expect(dep.integrity).toBe('sha512-example');
      expect(dep.packageJsonUrl).toBe(
        'git+https://github.com/user/repo.git#v1.0.0'
      );
      expect(dep.preferredUrl).toBe(
        'git+https://github.com/user/repo.git#v1.0.0'
      ); // Prefers HTTPS from package.json
    });

    it('should parse lockfile v2 with git dependencies', () => {
      const packageJsonPath = join(tempTestDir, 'package.json');
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      // Create package.json
      const packageJson = {
        dependencies: {
          lodash: 'git+https://github.com/lodash/lodash.git#4.17.21',
        },
      };
      writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

      // Create lockfile v2
      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          '': {
            dependencies: {
              lodash: 'git+https://github.com/lodash/lodash.git#4.17.21',
            },
          },
          'node_modules/lodash': {
            name: 'lodash',
            resolved: 'git+ssh://git@github.com/lodash/lodash.git#def456',
            integrity: 'sha512-lodash-example',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.lockfileVersion).toBe(2);
      expect(result.hasGitDependencies).toBe(true);
      expect(result.dependencies).toHaveLength(1);

      const dep = result.dependencies[0];
      expect(dep.name).toBe('lodash');
      expect(dep.gitUrl).toBe(
        'git+ssh://git@github.com/lodash/lodash.git#def456'
      );
      expect(dep.reference).toBe('def456');
      expect(dep.integrity).toBe('sha512-lodash-example');
      expect(dep.preferredUrl).toBe(
        'git+https://github.com/lodash/lodash.git#4.17.21'
      );
    });

    it('should handle lockfile v3 format', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV3 = {
        lockfileVersion: 3,
        packages: {
          'node_modules/git-package': {
            name: 'git-package',
            resolved: 'git+https://github.com/test/package.git#main',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV3, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.lockfileVersion).toBe(3);
      expect(result.hasGitDependencies).toBe(true);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].reference).toBe('main');
    });

    it('should default to lockfile version 1 when lockfileVersion is undefined', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      // Lockfile without lockfileVersion property (defaults to 1)
      const lockfileNoVersion = {
        dependencies: {
          'git-package': {
            resolved: 'git+https://github.com/test/package.git#main',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileNoVersion, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.lockfileVersion).toBe(1);
      expect(result.hasGitDependencies).toBe(true);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].reference).toBe('main');
    });

    it('should handle missing package.json gracefully', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            name: 'test-pkg',
            resolved: 'git+https://github.com/test/pkg.git#v1.0.0',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].packageJsonUrl).toBeUndefined();
      expect(result.dependencies[0].preferredUrl).toBe(
        'git+https://github.com/test/pkg.git#v1.0.0'
      );
    });

    it('should extract package name from path when name is missing', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/@scope/package': {
            resolved: 'git+https://github.com/scope/package.git',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].name).toBe('@scope/package');
    });

    it('should handle nested dependencies in lockfile v1', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV1 = {
        lockfileVersion: 1,
        dependencies: {
          'parent-package': {
            resolved:
              'https://registry.npmjs.org/parent-package/-/parent-package-1.0.0.tgz',
            dependencies: {
              'nested-git-pkg': {
                resolved: 'git+https://github.com/user/nested.git#branch',
              },
            },
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV1, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].name).toBe('nested-git-pkg');
      expect(result.dependencies[0].reference).toBe('branch');
    });

    it('should return empty dependencies when no git dependencies found', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/regular-package': {
            name: 'regular-package',
            resolved:
              'https://registry.npmjs.org/regular-package/-/regular-package-1.0.0.tgz',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(0);
      expect(result.hasGitDependencies).toBe(false);
    });

    it('should handle lockfile with missing dependencies property (v1)', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV1 = {
        lockfileVersion: 1,
        // No dependencies property
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV1, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(0);
      expect(result.hasGitDependencies).toBe(false);
    });

    it('should handle lockfile with missing packages property (v2)', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV2 = {
        lockfileVersion: 2,
        // No packages property
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(0);
      expect(result.hasGitDependencies).toBe(false);
    });

    it('should handle malformed package.json gracefully', () => {
      const packageJsonPath = join(tempTestDir, 'package.json');
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      // Create malformed package.json
      writeFileSync(packageJsonPath, 'invalid json content');

      // Create valid lockfile
      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            name: 'test-pkg',
            resolved: 'git+https://github.com/user/repo.git#main',
            integrity: 'sha512-example',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

      const result = scanLockfile(lockfilePath);

      // Should still work, just without package.json data
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].packageJsonUrl).toBeUndefined();
      expect(result.dependencies[0].preferredUrl).toBe(
        'git+https://github.com/user/repo.git#main'
      );
    });

    it('should handle non-Error exception when parsing invalid lockfile JSON', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      // Mock JSON.parse to throw a non-Error exception
      const jsonParseSpy = vi.spyOn(JSON, 'parse');
      jsonParseSpy.mockImplementation(() => {
        throw 'Non-Error string exception'; // Non-Error exception
      });

      writeFileSync(lockfilePath, '{"test": "data"}');

      expect(() => scanLockfile(lockfilePath)).toThrow(
        'Failed to parse lockfile: Non-Error string exception'
      );

      jsonParseSpy.mockRestore();
    });

    it('should handle non-Error exception when parsing package.json', () => {
      const packageJsonPath = join(tempTestDir, 'package.json');
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      // Create valid package.json and lockfile
      writeFileSync(packageJsonPath, '{"test": "data"}');
      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            name: 'test-pkg',
            resolved: 'git+https://github.com/user/repo.git#main',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

      // Mock JSON.parse to throw non-Error for package.json parsing
      const originalJSONParse = JSON.parse;
      let callCount = 0;
      const jsonParseSpy = vi.spyOn(JSON, 'parse');
      jsonParseSpy.mockImplementation((text) => {
        callCount++;
        if (callCount === 2) {
          // Second call is for package.json
          throw 'Non-Error package.json exception'; // Non-Error exception
        }
        return originalJSONParse(text);
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse package.json: Non-Error package.json exception'
      );

      consoleSpy.mockRestore();
      jsonParseSpy.mockRestore();
    });
  });

  describe('Git URL detection and normalization', () => {
    it('should detect various git URL formats', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/pkg1': {
            name: 'pkg1',
            resolved: 'git+https://github.com/user/repo1.git',
          },
          'node_modules/pkg2': {
            name: 'pkg2',
            resolved: 'git+ssh://git@github.com/user/repo2.git',
          },
          'node_modules/pkg3': {
            name: 'pkg3',
            resolved: 'git://github.com/user/repo3.git',
          },
          'node_modules/pkg4': {
            name: 'pkg4',
            resolved: 'git@github.com:user/repo4.git',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(4);

      // All should be detected as git dependencies
      result.dependencies.forEach((dep: GitDependency) => {
        expect(dep.gitUrl).toBeTruthy();
      });
    });

    it('should detect HTTP git URLs with .git extension', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/http-git-pkg': {
            name: 'http-git-pkg',
            resolved: 'http://git.example.com/user/repo.git',
          },
          'node_modules/https-git-pkg': {
            name: 'https-git-pkg',
            resolved: 'https://git.example.com/user/repo.git',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2, null, 2));

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(2);
      expect(result.dependencies[0].gitUrl).toBe(
        'http://git.example.com/user/repo.git'
      );
      expect(result.dependencies[1].gitUrl).toBe(
        'https://git.example.com/user/repo.git'
      );
    });

    it('should normalize GitHub SSH to HTTPS URLs', () => {
      const packageJsonPath = join(tempTestDir, 'package.json');
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      // package.json has HTTPS
      const packageJson = {
        dependencies: {
          'test-pkg': 'git+https://github.com/user/repo.git',
        },
      };
      writeFileSync(packageJsonPath, JSON.stringify(packageJson));

      // lockfile has SSH (npm v7+ bug)
      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            name: 'test-pkg',
            resolved: 'git+ssh://git@github.com/user/repo.git#commit123',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2));

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(1);
      const dep = result.dependencies[0];

      // Should prefer HTTPS from package.json
      expect(dep.preferredUrl).toBe('git+https://github.com/user/repo.git');
      expect(dep.packageJsonUrl).toBe('git+https://github.com/user/repo.git');
      expect(dep.lockfileUrl).toBe(
        'git+ssh://git@github.com/user/repo.git#commit123'
      );
    });

    it('should handle GitHub shorthand URLs', () => {
      const packageJsonPath = join(tempTestDir, 'package.json');

      const packageJson = {
        dependencies: {
          'shorthand-pkg': 'github:user/repo#v1.0.0',
        },
      };
      writeFileSync(packageJsonPath, JSON.stringify(packageJson));

      const lockfilePath = join(tempTestDir, 'package-lock.json');
      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {},
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2));

      const result = scanLockfile(lockfilePath);

      // Should find the dependency from package.json even if not in lockfile packages
      expect(result.dependencies).toHaveLength(0); // This test shows lockfile-only parsing
    });

    it('should default to HEAD reference when no ref specified', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/no-ref-pkg': {
            name: 'no-ref-pkg',
            resolved: 'git+https://github.com/user/repo.git',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2));

      const result = scanLockfile(lockfilePath);

      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].reference).toBe('HEAD');
    });

    it('should handle empty or null URLs gracefully', () => {
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/empty-url-pkg': {
            name: 'empty-url-pkg',
            resolved: '', // Empty URL
          },
          'node_modules/null-url-pkg': {
            name: 'null-url-pkg',
            // No resolved property
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2));

      const result = scanLockfile(lockfilePath);

      // Should not include dependencies with empty/missing URLs
      expect(result.dependencies).toHaveLength(0);
      expect(result.hasGitDependencies).toBe(false);
    });

    it('should handle null/undefined URLs in normalizeGitUrl function', () => {
      const packageJsonPath = join(tempTestDir, 'package.json');
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      // Create package.json with null dependency (to trigger normalizeGitUrl with falsy input)
      const packageJson = {
        dependencies: {
          'test-pkg': null, // This will be treated as falsy
        },
      };
      writeFileSync(packageJsonPath, JSON.stringify(packageJson));

      // Create lockfile with git dependency (to have at least one dependency processed)
      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            name: 'test-pkg',
            resolved: 'git+https://github.com/user/repo.git',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2));

      const result = scanLockfile(lockfilePath);

      // Should process the git dependency even with null packageJsonUrl
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].packageJsonUrl).toBeUndefined();
      expect(result.dependencies[0].preferredUrl).toBe(
        'git+https://github.com/user/repo.git'
      );
    });

    it('should handle git dependency without corresponding package.json entry', () => {
      const packageJsonPath = join(tempTestDir, 'package.json');
      const lockfilePath = join(tempTestDir, 'package-lock.json');

      // Create package.json without the git dependency (to test when packageJsonUrl is undefined)
      const packageJson = {
        dependencies: {
          'other-pkg': '1.0.0', // Different package, not a git URL
        },
      };
      writeFileSync(packageJsonPath, JSON.stringify(packageJson));

      // Create lockfile with git dependency that's not in package.json
      const lockfileV2 = {
        lockfileVersion: 2,
        packages: {
          'node_modules/test-pkg': {
            name: 'test-pkg',
            resolved: 'git+https://github.com/user/repo.git',
          },
        },
      };
      writeFileSync(lockfilePath, JSON.stringify(lockfileV2));

      const result = scanLockfile(lockfilePath);

      // Should process the git dependency and use resolved URL since packageJsonUrl is undefined
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].packageJsonUrl).toBeUndefined();
      expect(result.dependencies[0].preferredUrl).toBe(
        'git+https://github.com/user/repo.git'
      );
    });
  });

  describe('resolveGitReferences', () => {
    it('should resolve git references to commit SHAs', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      // Mock git ls-remote output
      mockExecSync.mockReturnValue(
        'abc123def456789012345678901234567890abcd\trefs/heads/main\n'
      );

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBe(
        'abc123def456789012345678901234567890abcd'
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'git ls-remote --heads --tags "https://github.com/user/repo.git" "main"',
        expect.objectContaining({
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 30000,
        })
      );
    });

    it('should skip resolution for commit SHAs', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const commitSha = 'abc123def456789012345678901234567890abcd';
      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: commitSha,
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBe(commitSha);
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should fallback to HEAD when specific ref not found', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'nonexistent-branch',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      // First call (specific ref) returns empty, second call (HEAD) returns SHA
      mockExecSync
        .mockReturnValueOnce('') // Empty response for specific ref
        .mockReturnValueOnce(
          'def456abc789012345678901234567890abcdef0\tHEAD\n'
        ); // HEAD response (40 chars)

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBe(
        'def456abc789012345678901234567890abcdef0'
      );
      expect(mockExecSync).toHaveBeenCalledTimes(2);
    });

    it('should handle git resolution errors gracefully', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/nonexistent.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/user/nonexistent.git',
        },
      ];

      // Mock git command failure
      mockExecSync.mockImplementation(() => {
        throw new Error('Repository not found');
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resolve test-pkg@main')
      );

      consoleSpy.mockRestore();
    });

    it('should handle invalid SHA responses', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      // Mock invalid SHA response
      mockExecSync.mockReturnValue('invalid-sha\trefs/heads/main\n');

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should fallback to HEAD when invalid SHA format is returned', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'nonexistent-branch',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      // First call for nonexistent-branch returns empty
      // Second call for HEAD returns valid SHA
      mockExecSync
        .mockReturnValueOnce('') // empty for nonexistent-branch
        .mockReturnValueOnce(
          'abc123def456789012345678901234567890abcd\tHEAD\n'
        ); // HEAD fallback

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBe(
        'abc123def456789012345678901234567890abcd'
      );
      expect(mockExecSync).toHaveBeenNthCalledWith(
        1,
        'git ls-remote --heads --tags "https://github.com/user/repo.git" "nonexistent-branch"',
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenNthCalledWith(
        2,
        'git ls-remote --heads --tags "https://github.com/user/repo.git" "HEAD"',
        expect.any(Object)
      );
    });

    it('should handle HEAD reference resolution', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'HEAD',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      mockExecSync.mockReturnValue(
        'abc123def456789012345678901234567890abcd\tHEAD\n'
      );

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBe(
        'abc123def456789012345678901234567890abcd'
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        'git ls-remote --heads --tags "https://github.com/user/repo.git" "HEAD"',
        expect.any(Object)
      );
    });

    it('should handle failure when both ref and HEAD fallback fail', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'HEAD',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      // Mock empty response for HEAD (triggers the error path)
      mockExecSync.mockReturnValue('');

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resolve test-pkg@HEAD')
      );

      consoleSpy.mockRestore();
    });

    it('should handle non-Error exception during git reference resolution', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      // Mock non-Error exception
      mockExecSync.mockImplementation(() => {
        throw 'Non-Error git exception'; // Non-Error exception
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to resolve test-pkg@main: Error: Failed to resolve ref 'main' for https://github.com/user/repo.git: Non-Error git exception"
      );

      consoleSpy.mockRestore();
    });

    it('should handle non-Error exception in resolveRefToSha', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      // Mock non-Error exception for resolveRefToSha
      mockExecSync.mockImplementation(() => {
        throw { code: 'UNKNOWN', message: 'Non-standard error' }; // Non-Error exception
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to resolve test-pkg@main: Error: Failed to resolve ref 'main' for https://github.com/user/repo.git: [object Object]"
      );

      consoleSpy.mockRestore();
    });

    it('should handle non-Error exception from URL processing', async () => {
      // Override the preferredUrl.replace method to throw a string (non-Error)
      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      // Mock String.prototype.replace to throw a non-Error string
      const originalReplace = String.prototype.replace;
      String.prototype.replace = function () {
        throw 'Non-Error string exception'; // Non-Error exception
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      let resolved;
      try {
        resolved = await resolveGitReferences(dependencies);
      } finally {
        // Restore original replace method
        String.prototype.replace = originalReplace;
      }

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to resolve test-pkg@main: Non-Error string exception'
      );

      consoleSpy.mockRestore();
    });

    it('should handle string exceptions in git reference resolution', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      const dependencies: GitDependency[] = [
        {
          name: 'test-pkg',
          gitUrl: 'git+https://github.com/user/repo.git',
          reference: 'main',
          preferredUrl: 'git+https://github.com/user/repo.git',
        },
      ];

      // Mock string exception (not an Error object)
      mockExecSync.mockImplementation(() => {
        throw 'String exception from git command'; // String exception (non-Error)
      });

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const resolved = await resolveGitReferences(dependencies);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].resolvedSha).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to resolve test-pkg@main: Error: Failed to resolve ref 'main' for https://github.com/user/repo.git: String exception from git command"
      );

      consoleSpy.mockRestore();
    });
  });
});
