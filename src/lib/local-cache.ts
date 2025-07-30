import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface LocalCacheOptions {
  cacheDir: string;
  maxSizeMB: number;
  verboseLogging: boolean;
}

export const DEFAULT_CACHE_OPTIONS: LocalCacheOptions = {
  cacheDir: join(homedir(), '.gitcache', 'cache'),
  maxSizeMB: 1024, // 1GB default
  verboseLogging: process.env.GITCACHE_VERBOSE === 'true',
};

/**
 * Local filesystem cache for GitCache artifacts
 */
export class LocalCache {
  private options: LocalCacheOptions;

  constructor(options: Partial<LocalCacheOptions> = {}) {
    this.options = { ...DEFAULT_CACHE_OPTIONS, ...options };
  }

  /**
   * Check if an artifact exists in the local cache
   */
  async has(packageId: string): Promise<boolean> {
    const cachePath = this.getCachePath(packageId);
    try {
      await fs.access(cachePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get an artifact from the local cache
   */
  async get(packageId: string): Promise<Buffer> {
    const cachePath = this.getCachePath(packageId);
    try {
      const data = await fs.readFile(cachePath);
      this.logVerbose(`Retrieved ${packageId} from local cache`);
      return data;
    } catch (error) {
      throw new Error(`Failed to read from local cache: ${error}`);
    }
  }

  /**
   * Store an artifact in the local cache
   */
  async store(packageId: string, data: Buffer): Promise<void> {
    const cachePath = this.getCachePath(packageId);

    try {
      // Ensure cache directory exists
      await fs.mkdir(dirname(cachePath), { recursive: true });

      // Check cache size limits
      await this.enforceSize();

      // Write to cache
      await fs.writeFile(cachePath, data);

      // Write metadata
      await this.writeMetadata(packageId, data);

      this.logVerbose(`Stored ${packageId} in local cache`);
    } catch (error) {
      throw new Error(`Failed to store in local cache: ${error}`);
    }
  }

  /**
   * Clear the entire local cache
   */
  async clear(): Promise<void> {
    try {
      await fs.rm(this.options.cacheDir, { recursive: true, force: true });
      this.logVerbose('Cleared local cache');
    } catch (error) {
      throw new Error(`Failed to clear local cache: ${error}`);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalSizeMB: number;
    oldestFile: Date | null;
    newestFile: Date | null;
  }> {
    try {
      const files = await this.getAllCacheFiles();
      let totalSize = 0;
      let oldestFile: Date | null = null;
      let newestFile: Date | null = null;

      for (const file of files) {
        try {
          const stats = await fs.stat(file);
          totalSize += stats.size;

          if (!oldestFile || stats.mtime < oldestFile) {
            oldestFile = stats.mtime;
          }
          if (!newestFile || stats.mtime > newestFile) {
            newestFile = stats.mtime;
          }
        } catch {
          // Ignore files that can't be read
        }
      }

      return {
        totalFiles: files.length,
        totalSizeMB: Math.round((totalSize / (1024 * 1024)) * 100) / 100,
        oldestFile,
        newestFile,
      };
    } catch {
      return {
        totalFiles: 0,
        totalSizeMB: 0,
        oldestFile: null,
        newestFile: null,
      };
    }
  }

  /**
   * Remove specific artifact from cache
   */
  async remove(packageId: string): Promise<boolean> {
    const cachePath = this.getCachePath(packageId);
    const metadataPath = this.getMetadataPath(packageId);

    try {
      await fs.unlink(cachePath);
      await fs.unlink(metadataPath).catch(() => {}); // Ignore metadata errors
      this.logVerbose(`Removed ${packageId} from local cache`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the file path for a cached package
   */
  private getCachePath(packageId: string): string {
    const hash = this.hashPackageId(packageId);
    const subdir = hash.substring(0, 2);
    return join(this.options.cacheDir, subdir, `${hash}.cache`);
  }

  /**
   * Get the metadata file path for a cached package
   */
  private getMetadataPath(packageId: string): string {
    const hash = this.hashPackageId(packageId);
    const subdir = hash.substring(0, 2);
    return join(this.options.cacheDir, subdir, `${hash}.meta`);
  }

  /**
   * Hash a package ID for cache file naming
   */
  private hashPackageId(packageId: string): string {
    return createHash('sha256').update(packageId).digest('hex');
  }

  /**
   * Write metadata for cached artifact
   */
  private async writeMetadata(packageId: string, data: Buffer): Promise<void> {
    const metadataPath = this.getMetadataPath(packageId);
    const metadata = {
      packageId,
      size: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
      cachedAt: new Date().toISOString(),
      accessCount: 1,
    };

    try {
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } catch {
      // Metadata is optional - don't fail the main operation
    }
  }

  /**
   * Update access count for cached artifact
   */
  private async updateAccessCount(packageId: string): Promise<void> {
    const metadataPath = this.getMetadataPath(packageId);

    try {
      const existing = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(existing);
      metadata.accessCount = (metadata.accessCount || 0) + 1;
      metadata.lastAccessed = new Date().toISOString();

      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } catch {
      // Metadata is optional
    }
  }

  /**
   * Enforce cache size limits by removing old files
   */
  private async enforceSize(): Promise<void> {
    const stats = await this.getStats();
    const maxSizeBytes = this.options.maxSizeMB * 1024 * 1024;

    if (stats.totalSizeMB * 1024 * 1024 <= maxSizeBytes) {
      return; // Under limit
    }

    this.logVerbose(
      `Cache size ${stats.totalSizeMB}MB exceeds limit ${this.options.maxSizeMB}MB`
    );

    // Get all cache files with their stats
    const files = await this.getAllCacheFiles();
    const fileStats = [];

    for (const file of files) {
      try {
        const stat = await fs.stat(file);
        fileStats.push({ path: file, mtime: stat.mtime, size: stat.size });
      } catch (error) {
        // Ignore files that can't be read
        this.logVerbose(
          `Skipping file ${file} - unable to read stats: ${error}`
        );
      }
    }

    // Sort by oldest first
    fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

    // Remove files until under limit
    let currentSize = stats.totalSizeMB * 1024 * 1024;
    for (const file of fileStats) {
      if (currentSize <= maxSizeBytes) {
        break;
      }

      try {
        await fs.unlink(file.path);
        currentSize -= file.size;

        // Also remove metadata file
        const metaPath = file.path.replace('.cache', '.meta');
        await fs.unlink(metaPath).catch(() => {});

        this.logVerbose(`Evicted ${file.path} from cache`);
      } catch {
        // Continue on error
      }
    }
  }

  /**
   * Get all cache files
   */
  private async getAllCacheFiles(): Promise<string[]> {
    const files: string[] = [];

    try {
      const subdirs = await fs.readdir(this.options.cacheDir);

      for (const subdir of subdirs) {
        const subdirPath = join(this.options.cacheDir, subdir);

        try {
          const subdirFiles = await fs.readdir(subdirPath);
          for (const file of subdirFiles) {
            if (file.endsWith('.cache')) {
              files.push(join(subdirPath, file));
            }
          }
        } catch {
          // Ignore subdirectories that can't be read
        }
      }
    } catch {
      // Cache directory doesn't exist or can't be read
    }

    return files;
  }

  private logVerbose(message: string): void {
    if (this.options.verboseLogging) {
      console.log(`[GitCache Local] ${message}`);
    }
  }
}
