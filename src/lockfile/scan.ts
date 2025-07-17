import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { logRefResolution } from '../lib/utils/log.js';

interface LockfileV1Dependency {
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, LockfileV1Dependency>;
}

interface LockfileV1Data {
  lockfileVersion?: number;
  dependencies?: Record<string, LockfileV1Dependency>;
}

interface LockfileV2Package {
  resolved?: string;
  integrity?: string;
  name?: string;
}

interface LockfileV2Data {
  lockfileVersion: number;
  packages?: Record<string, LockfileV2Package>;
}

export interface GitDependency {
  name: string;
  gitUrl: string;
  reference: string; // tag, branch, or commit SHA
  resolvedSha?: string; // resolved commit SHA
  integrity?: string;
  packageJsonUrl?: string; // Original URL from package.json (preferred for npm v7+ bug)
  lockfileUrl?: string; // URL from lockfile (may be SSH converted)
  preferredUrl: string; // Final URL to use (HTTPS preferred)
}

export interface LockfileParseResult {
  dependencies: GitDependency[];
  lockfileVersion: number;
  hasGitDependencies: boolean;
}

/**
 * Scan package-lock.json to identify Git dependencies
 */
export function scanLockfile(lockfilePath: string): LockfileParseResult {
  if (!existsSync(lockfilePath)) {
    throw new Error(`Lockfile not found: ${lockfilePath}`);
  }

  const lockfileContent = readFileSync(lockfilePath, 'utf8');
  let lockfileData: LockfileV1Data | LockfileV2Data;

  try {
    lockfileData = JSON.parse(lockfileContent) as
      | LockfileV1Data
      | LockfileV2Data;
  } catch (error) {
    throw new Error(
      `Failed to parse lockfile: ${error instanceof Error ? error.message : 'Invalid JSON'}`
    );
  }

  const lockfileVersion =
    lockfileData.lockfileVersion !== undefined
      ? lockfileData.lockfileVersion
      : 1;
  const workspaceDir = dirname(lockfilePath);
  const packageJsonPath = join(workspaceDir, 'package.json');

  // Parse package.json for original URLs (handles npm v7+ SSH bug)
  const packageJsonDeps = parsePackageJsonGitDeps(packageJsonPath);

  let dependencies: GitDependency[] = [];

  if (lockfileVersion === 1) {
    dependencies = parseLockfileV1(
      lockfileData as LockfileV1Data,
      packageJsonDeps
    );
  } else if (lockfileVersion >= 2) {
    dependencies = parseLockfileV2Plus(
      lockfileData as LockfileV2Data,
      packageJsonDeps
    );
  }

  return {
    dependencies,
    lockfileVersion,
    hasGitDependencies: dependencies.length > 0,
  };
}

/**
 * Parse package.json to extract original Git URLs (more reliable than lockfile due to npm v7+ bug)
 */
function parsePackageJsonGitDeps(packageJsonPath: string): Map<string, string> {
  const gitDeps = new Map<string, string>();

  if (!existsSync(packageJsonPath)) {
    return gitDeps;
  }

  try {
    const packageContent = readFileSync(packageJsonPath, 'utf8');
    const packageData = JSON.parse(packageContent);

    // Check all dependency sections
    const depSections = [
      'dependencies',
      'devDependencies',
      'peerDependencies',
      'optionalDependencies',
    ];

    for (const section of depSections) {
      const deps = packageData[section];
      if (deps && typeof deps === 'object') {
        for (const [name, version] of Object.entries(deps)) {
          if (typeof version === 'string' && isGitUrl(version)) {
            gitDeps.set(name, version);
          }
        }
      }
    }
  } catch (error) {
    // package.json parsing failed, continue without it
    console.warn(
      `Failed to parse package.json: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  return gitDeps;
}

/**
 * Parse npm lockfile version 1 format
 */
function parseLockfileV1(
  lockfileData: LockfileV1Data,
  packageJsonDeps: Map<string, string>
): GitDependency[] {
  const dependencies: GitDependency[] = [];
  const deps = lockfileData.dependencies || {};

  function extractFromDeps(
    depObj: Record<string, LockfileV1Dependency>,
    path: string[] = []
  ): void {
    for (const [name, depData] of Object.entries(depObj)) {
      if (depData && typeof depData === 'object') {
        const resolved = depData.resolved;
        const integrity = depData.integrity;

        if (resolved && isGitUrl(resolved)) {
          const packageJsonUrl = packageJsonDeps.get(name);
          const preferredUrl = normalizeGitUrl(packageJsonUrl || resolved);
          const reference = extractReferenceFromUrl(resolved);

          dependencies.push({
            name,
            gitUrl: resolved,
            reference,
            integrity,
            packageJsonUrl,
            lockfileUrl: resolved,
            preferredUrl,
          });
        }

        // Recursively check nested dependencies
        const nestedDeps = depData.dependencies;
        if (nestedDeps && typeof nestedDeps === 'object') {
          extractFromDeps(nestedDeps, [...path, name]);
        }
      }
    }
  }

  extractFromDeps(deps);
  return dependencies;
}

/**
 * Parse npm lockfile version 2+ format
 */
function parseLockfileV2Plus(
  lockfileData: LockfileV2Data,
  packageJsonDeps: Map<string, string>
): GitDependency[] {
  const dependencies: GitDependency[] = [];
  const packages = lockfileData.packages || {};

  for (const [packagePath, packageData] of Object.entries(packages)) {
    if (packageData && typeof packageData === 'object') {
      const resolved = packageData.resolved;
      const integrity = packageData.integrity;
      const name = packageData.name || extractNameFromPath(packagePath);

      if (resolved && isGitUrl(resolved) && name) {
        const packageJsonUrl = packageJsonDeps.get(name);
        const preferredUrl = normalizeGitUrl(packageJsonUrl || resolved);
        const reference = extractReferenceFromUrl(resolved);

        dependencies.push({
          name,
          gitUrl: resolved,
          reference,
          integrity,
          packageJsonUrl,
          lockfileUrl: resolved,
          preferredUrl,
        });
      }
    }
  }

  return dependencies;
}

/**
 * Check if a URL is a Git URL
 */
function isGitUrl(url: string): boolean {
  return (
    url.startsWith('git+') ||
    url.startsWith('git://') ||
    url.startsWith('git@') ||
    url.includes('github:') ||
    url.includes('gitlab:') ||
    url.includes('bitbucket:') ||
    (url.includes('.git') &&
      (url.startsWith('https://') || url.startsWith('http://')))
  );
}

/**
 * Extract package name from npm lockfile v2+ package path
 */
function extractNameFromPath(packagePath: string): string | null {
  // Package paths in lockfile v2+ are like "node_modules/package-name" or "node_modules/@scope/package-name"
  const match = packagePath.match(
    /node_modules\/(@[^/]+\/[^/]+|[^/]+)(?:\/|$)/
  );
  return match ? match[1] : null;
}

/**
 * Extract reference (tag, branch, commit) from Git URL
 */
function extractReferenceFromUrl(url: string): string {
  // Look for #ref at the end of URL
  const hashMatch = url.match(/#(.+)$/);
  if (hashMatch) {
    return hashMatch[1];
  }

  // Default to main/master for URLs without explicit ref
  return 'HEAD';
}

/**
 * Normalize Git URL to prefer HTTPS over SSH (handles npm v7+ bug)
 */
function normalizeGitUrl(url: string): string {
  // Preserve original git+ prefix state
  const hasGitPrefix = url.startsWith('git+');

  // Remove git+ prefix temporarily for processing
  let normalizedUrl = url.replace(/^git\+/, '');

  // Convert SSH to HTTPS for GitHub (handles npm v7+ bug)
  normalizedUrl = normalizedUrl.replace(
    /^ssh:\/\/git@github\.com\/([^/]+\/[^/]+)\.git/,
    'https://github.com/$1.git'
  );

  // Convert git@github.com: format to HTTPS
  normalizedUrl = normalizedUrl.replace(
    /^git@github\.com:([^/]+\/[^/]+)\.git/,
    'https://github.com/$1.git'
  );

  // Handle GitHub shorthand (github:owner/repo)
  normalizedUrl = normalizedUrl.replace(
    /^github:([^/]+\/[^/]+)/,
    'https://github.com/$1.git'
  );

  // Handle GitLab shorthand
  normalizedUrl = normalizedUrl.replace(
    /^gitlab:([^/]+\/[^/]+)/,
    'https://gitlab.com/$1.git'
  );

  // Handle Bitbucket shorthand
  normalizedUrl = normalizedUrl.replace(
    /^bitbucket:([^/]+\/[^/]+)/,
    'https://bitbucket.org/$1.git'
  );

  // Restore git+ prefix if it was originally present, or add it for HTTPS URLs
  if (hasGitPrefix || normalizedUrl.startsWith('https://')) {
    if (!normalizedUrl.startsWith('git+')) {
      normalizedUrl = `git+${normalizedUrl}`;
    }
  }

  return normalizedUrl;
}

/**
 * Resolve Git references (branches/tags) to commit SHAs using git ls-remote
 */
export async function resolveGitReferences(
  dependencies: GitDependency[]
): Promise<GitDependency[]> {
  const resolved: GitDependency[] = [];

  for (const dep of dependencies) {
    try {
      // Skip if reference is already a commit SHA (40 hex characters)
      if (dep.reference.match(/^[a-f0-9]{40}$/)) {
        resolved.push({
          ...dep,
          resolvedSha: dep.reference,
        });
        continue;
      }

      // Use preferred URL for resolution
      const urlForResolution = dep.preferredUrl.replace(/^git\+/, '');
      const sha = await resolveRefToSha(urlForResolution, dep.reference);

      resolved.push({
        ...dep,
        resolvedSha: sha,
      });
    } catch (error) {
      console.warn(
        `Failed to resolve ${dep.name}@${dep.reference}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      // Include unresolved dependency with warning
      resolved.push({
        ...dep,
        resolvedSha: undefined,
      });
    }
  }

  return resolved;
}

/**
 * Resolve a Git reference to commit SHA using git ls-remote
 */
async function resolveRefToSha(repoUrl: string, ref: string): Promise<string> {
  try {
    // Handle HEAD reference
    const refToResolve = ref === 'HEAD' ? 'HEAD' : ref;

    const output = execSync(
      `git ls-remote --heads --tags "${repoUrl}" "${refToResolve}"`,
      {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 30000, // 30 second timeout
      }
    );

    const lines = output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      // Try resolving HEAD if specific ref not found
      if (ref !== 'HEAD') {
        return await resolveRefToSha(repoUrl, 'HEAD');
      }

      throw new Error(`Reference '${ref}' not found in repository ${repoUrl}`);
    }

    // git ls-remote output format: "<commit-sha>\t<ref-name>"
    const sha = lines[0].split('\t')[0];
    if (!sha || !sha.match(/^[a-f0-9]{40}$/)) {
      throw new Error(`Invalid commit SHA received for ref '${ref}': ${sha}`);
    }

    // Log the resolution for future reference
    logRefResolution(repoUrl, ref, sha);

    return sha;
  } catch (error) {
    throw new Error(
      `Failed to resolve ref '${ref}' for ${repoUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
