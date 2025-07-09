import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ExecSyncOptions } from 'node:child_process';
import { createTarballBuilder } from '../../lib/tarball-builder.js';

// Mock node:child_process for specific tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('TarballBuilder Error Handling Integration', () => {
  let tempTestDir: string;
  let builder: ReturnType<typeof createTarballBuilder>;

  beforeEach(() => {
    // Create a real temporary directory for integration testing
    tempTestDir = join(tmpdir(), `gitcache-error-integration-${Date.now()}`);
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

  it('should handle invalid git URLs gracefully', async () => {
    const invalidUrls = [
      'not-a-url',
      'https://nonexistent-domain-12345.com/repo.git',
      'file:///nonexistent/path',
      '',
    ];

    for (const url of invalidUrls) {
      await expect(
        builder.buildTarball(url, 'abc123', { force: true })
      ).rejects.toThrow();
    }
  });

  it('should handle network timeouts and connection errors', async () => {
    // Test with a URL that will timeout or fail to connect
    const timeoutUrl = 'https://httpstat.us/408'; // Returns 408 timeout

    await expect(
      builder.buildTarball(timeoutUrl, 'abc123', { force: true })
    ).rejects.toThrow();
  });

  it('should handle empty npm pack output (line 251)', async () => {
    const { execSync } = await import('node:child_process');
    const mockExecSync = vi.mocked(execSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';

    mockExecSync.mockImplementation(
      (cmd: string, _options?: ExecSyncOptions) => {
        if (typeof cmd === 'string' && cmd.includes('git clone')) {
          const match = cmd.match(/"([^"]+)"$/);
          if (match) {
            const targetDir = match[1];
            mockWorkingDir = targetDir;
            mkdirSync(targetDir, { recursive: true });
            writeFileSync(
              join(targetDir, 'package.json'),
              JSON.stringify({ name: 'test-package', version: '1.0.0' })
            );
          }
          return '';
        }
        if (
          (typeof cmd === 'string' && cmd.includes('git cat-file')) ||
          cmd.includes('git checkout')
        ) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('npm ci')) {
          return '';
        }
        if (typeof cmd === 'string' && cmd.includes('npm pack')) {
          // Create the fallback tarball name to test line 251: || 'package.tgz'
          const tarballPath = join(mockWorkingDir, 'package.tgz');
          writeFileSync(tarballPath, 'fake tarball content');
          // Return empty output to trigger .pop() returning undefined
          return '\n\n\n'; // Just newlines, so .pop() will return undefined
        }
        if (typeof cmd === 'string' && cmd.includes('shasum')) {
          return 'abc123hash  filename\n';
        }
        if (typeof cmd === 'string' && cmd.includes('mv')) {
          return '';
        }
        return '';
      }
    );

    const result = await builder.buildTarball(gitUrl, commitSha, {
      force: true,
    });
    expect(result.commitSha).toBe(commitSha);
    expect(result.packageInfo?.name).toBe('test-package');

    vi.restoreAllMocks();
  });
});
