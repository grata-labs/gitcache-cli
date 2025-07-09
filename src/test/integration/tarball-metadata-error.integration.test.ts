import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTarballBuilder } from '../../lib/tarball-builder.js';
import {
  getTarballCachePath,
  getPlatformIdentifier,
} from '../../lib/utils/path.js';

describe('TarballBuilder Metadata Error Handling Integration', () => {
  let tempTestDir: string;
  let builder: ReturnType<typeof createTarballBuilder>;

  beforeEach(() => {
    // Create a real temporary directory for integration testing
    tempTestDir = join(tmpdir(), `gitcache-metadata-integration-${Date.now()}`);
    mkdirSync(tempTestDir, { recursive: true });

    // Use the real builder without mocks
    builder = createTarballBuilder();
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(tempTestDir)) {
      rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  it('should handle corrupted metadata JSON in real file system', () => {
    const commitSha = 'test-integration-sha';
    const platform = getPlatformIdentifier();

    // Create the cache directory path using real utilities
    const cacheDir = getTarballCachePath(commitSha, platform);
    mkdirSync(cacheDir, { recursive: true });

    const metadataPath = join(cacheDir, 'metadata.json');
    const tarballPath = join(cacheDir, 'package.tgz');

    // Create tarball file
    writeFileSync(tarballPath, 'fake tarball content for integration test');

    // Write corrupted JSON that will cause JSON.parse to fail
    writeFileSync(metadataPath, '{ "gitUrl": "test", "incomplete": json }');

    // This should trigger the catch block in readTarballMetadata
    const result = builder.getCachedTarball(commitSha, platform);
    expect(result).toBeNull();

    // Cleanup
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('should handle binary content in metadata file', () => {
    const commitSha = 'test-binary-sha';
    const platform = getPlatformIdentifier();

    const cacheDir = getTarballCachePath(commitSha, platform);
    mkdirSync(cacheDir, { recursive: true });

    const metadataPath = join(cacheDir, 'metadata.json');
    const tarballPath = join(cacheDir, 'package.tgz');

    // Create tarball file
    writeFileSync(tarballPath, 'fake tarball content');

    // Write binary content that will cause issues with UTF-8 parsing
    const binaryContent = Buffer.from([
      0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd, 0xfc, 0x7b, 0x22, 0x69, 0x6e,
      0x76, 0x61, 0x6c, 0x69, 0x64,
    ]);
    writeFileSync(metadataPath, binaryContent);

    // This should trigger the catch block
    const result = builder.getCachedTarball(commitSha, platform);
    expect(result).toBeNull();

    // Cleanup
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('should handle completely invalid JSON syntax', () => {
    const commitSha = 'test-invalid-json-sha';
    const platform = getPlatformIdentifier();

    const cacheDir = getTarballCachePath(commitSha, platform);
    mkdirSync(cacheDir, { recursive: true });

    const metadataPath = join(cacheDir, 'metadata.json');
    const tarballPath = join(cacheDir, 'package.tgz');

    // Create tarball file
    writeFileSync(tarballPath, 'fake tarball content');

    // Write completely invalid JSON
    writeFileSync(metadataPath, 'this is not json at all! { } [ ] invalid');

    // This should trigger the catch block
    const result = builder.getCachedTarball(commitSha, platform);
    expect(result).toBeNull();

    // Cleanup
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('should handle truncated JSON file', () => {
    const commitSha = 'test-truncated-sha';
    const platform = getPlatformIdentifier();

    const cacheDir = getTarballCachePath(commitSha, platform);
    mkdirSync(cacheDir, { recursive: true });

    const metadataPath = join(cacheDir, 'metadata.json');
    const tarballPath = join(cacheDir, 'package.tgz');

    // Create tarball file
    writeFileSync(tarballPath, 'fake tarball content');

    // Write truncated JSON (missing closing brace)
    writeFileSync(
      metadataPath,
      '{"gitUrl": "https://github.com/test/repo.git", "commitSha": "abc123"'
    );

    // This should trigger the catch block
    const result = builder.getCachedTarball(commitSha, platform);
    expect(result).toBeNull();

    // Cleanup
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('should handle missing metadata file (lines 302-303)', () => {
    const commitSha = 'test-missing-metadata-sha';
    const platform = getPlatformIdentifier();

    const cacheDir = getTarballCachePath(commitSha, platform);
    mkdirSync(cacheDir, { recursive: true });

    const tarballPath = join(cacheDir, 'package.tgz');

    // Only create tarball file, not metadata - this should hit lines 302-303
    writeFileSync(tarballPath, 'fake tarball content');

    // This should trigger the early return null (lines 302-303)
    const result = builder.getCachedTarball(commitSha, platform);
    expect(result).toBeNull();

    // Cleanup
    rmSync(cacheDir, { recursive: true, force: true });
  });

  it('should handle missing tarball file (lines 302-303)', () => {
    const commitSha = 'test-missing-tarball-sha';
    const platform = getPlatformIdentifier();

    const cacheDir = getTarballCachePath(commitSha, platform);
    mkdirSync(cacheDir, { recursive: true });

    const metadataPath = join(cacheDir, 'metadata.json');

    // Only create metadata file, not tarball - this should hit lines 302-303
    writeFileSync(
      metadataPath,
      JSON.stringify({
        gitUrl: 'https://github.com/test/repo.git',
        commitSha,
        platform,
        integrity: 'sha256-test',
        buildTime: new Date().toISOString(),
        packageInfo: { name: 'test-package', version: '1.0.0' },
      })
    );

    // This should trigger the early return null (lines 302-303)
    const result = builder.getCachedTarball(commitSha, platform);
    expect(result).toBeNull();

    // Cleanup
    rmSync(cacheDir, { recursive: true, force: true });
  });
});
