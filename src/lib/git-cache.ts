import { execSync } from 'node:child_process';

export interface GitCacheOptions {
  timeout: number;
  verboseLogging: boolean;
}

export const DEFAULT_GIT_OPTIONS: GitCacheOptions = {
  timeout: 30000, // 30 seconds
  verboseLogging: process.env.GITCACHE_VERBOSE === 'true',
};

/**
 * Git-based cache that falls back to direct git operations
 * This provides compatibility with existing git repositories
 */
export class GitCache {
  private options: GitCacheOptions;

  constructor(options: Partial<GitCacheOptions> = {}) {
    this.options = { ...DEFAULT_GIT_OPTIONS, ...options };
  }

  /**
   * Check if an artifact exists in git (always true for git cache)
   */
  async has(_packageId: string): Promise<boolean> {
    // Git cache is a fallback - it "has" everything because it can fetch it
    // The actual availability is determined when get() is called
    return true;
  }

  /**
   * Get an artifact using git operations
   * This is the fallback when registry and local cache fail
   */
  async get(packageId: string): Promise<Buffer> {
    try {
      // Parse package ID to extract git information
      const gitInfo = this.parsePackageId(packageId);

      this.logVerbose(`Fetching ${packageId} via git`);

      // Use git to fetch the specific commit/ref
      const data = await this.gitFetch(gitInfo);

      this.logVerbose(`Successfully fetched ${packageId} via git`);
      return data;
    } catch (error) {
      throw new Error(`Git fetch failed for ${packageId}: ${error}`);
    }
  }

  /**
   * Store operation is not supported for git cache (read-only)
   */
  async store(packageId: string, _data: Buffer): Promise<void> {
    // Git cache is read-only - storing is not supported
    this.logVerbose(
      `Store operation not supported for git cache (${packageId})`
    );
    return Promise.resolve();
  }

  /**
   * Parse package ID to extract git repository information
   */
  private parsePackageId(packageId: string): GitPackageInfo {
    // Package ID format: repo-url#commit-hash
    // Example: https://github.com/user/repo.git#abc123
    const parts = packageId.split('#');
    if (parts.length !== 2) {
      throw new Error(`Invalid package ID format: ${packageId}`);
    }

    const [repoUrl, commitHash] = parts;

    return {
      repoUrl: repoUrl.trim(),
      commitHash: commitHash.trim(),
      packageId,
    };
  }

  /**
   * Fetch data from git repository
   */
  private async gitFetch(gitInfo: GitPackageInfo): Promise<Buffer> {
    try {
      // Create a temporary directory for the operation
      const tempDir = this.createTempDir();

      try {
        // Clone the repository (shallow clone for efficiency)
        this.logVerbose(`Cloning ${gitInfo.repoUrl}`);
        this.execGit(`clone --depth=1 "${gitInfo.repoUrl}" "${tempDir}"`);

        // Fetch the specific commit if needed
        if (!this.isShallowCommitAvailable(tempDir, gitInfo.commitHash)) {
          this.logVerbose(`Fetching specific commit ${gitInfo.commitHash}`);
          this.execGit(`fetch origin ${gitInfo.commitHash}`, tempDir);
        }

        // Checkout the specific commit
        this.execGit(`checkout ${gitInfo.commitHash}`, tempDir);

        // Create archive of the repository
        const archiveData = this.execGit(
          `archive --format=tar ${gitInfo.commitHash}`,
          tempDir
        );

        return Buffer.from(archiveData);
      } finally {
        // Clean up temporary directory
        this.cleanupTempDir(tempDir);
      }
    } catch (error) {
      throw new Error(`Git operation failed: ${error}`);
    }
  }

  /**
   * Execute a git command
   */
  private execGit(command: string, cwd?: string): string {
    const fullCommand = `git ${command}`;

    try {
      const result = execSync(fullCommand, {
        cwd,
        timeout: this.options.timeout,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      return result;
    } catch (error: unknown) {
      const errorMessage =
        (error as { stderr?: string; message?: string })?.stderr ||
        (error as { message?: string })?.message ||
        'Unknown git error';
      throw new Error(`Git command failed: ${fullCommand}\n${errorMessage}`);
    }
  }

  /**
   * Check if a commit is available in a shallow clone
   */
  private isShallowCommitAvailable(
    repoDir: string,
    commitHash: string
  ): boolean {
    try {
      this.execGit(`cat-file -e ${commitHash}`, repoDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a temporary directory for git operations
   */
  private createTempDir(): string {
    const tempBase = process.env.TMPDIR || '/tmp';
    const tempDir = `${tempBase}/gitcache-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      execSync(`mkdir -p "${tempDir}"`);
      return tempDir;
    } catch (error) {
      throw new Error(`Failed to create temp directory: ${error}`);
    }
  }

  /**
   * Clean up temporary directory
   */
  private cleanupTempDir(tempDir: string): void {
    try {
      execSync(`rm -rf "${tempDir}"`);
    } catch (error) {
      this.logVerbose(`Failed to cleanup temp directory ${tempDir}: ${error}`);
    }
  }

  /**
   * Get git repository status
   */
  async getGitStatus(): Promise<{
    available: boolean;
    version: string | null;
    error?: string;
  }> {
    try {
      const version = this.execGit('--version').trim();
      return {
        available: true,
        version,
      };
    } catch (error) {
      return {
        available: false,
        version: null,
        error: String(error),
      };
    }
  }

  /**
   * Validate a package ID format
   */
  static validatePackageId(packageId: string): boolean {
    try {
      const parts = packageId.split('#');
      if (parts.length !== 2) {
        return false;
      }

      const [repoUrl, commitHash] = parts;

      // Basic URL validation
      if (!repoUrl.includes('://') && !repoUrl.startsWith('git@')) {
        return false;
      }

      // Basic commit hash validation (should be hex and reasonable length)
      if (!/^[a-f0-9]{7,40}$/i.test(commitHash)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a package ID from repository URL and commit
   */
  static createPackageId(repoUrl: string, commitHash: string): string {
    return `${repoUrl}#${commitHash}`;
  }

  private logVerbose(message: string): void {
    if (this.options.verboseLogging) {
      console.log(`[GitCache Git] ${message}`);
    }
  }
}

interface GitPackageInfo {
  repoUrl: string;
  commitHash: string;
  packageId: string;
}
