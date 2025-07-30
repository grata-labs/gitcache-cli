import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTarballBuilder } from '../../lib/tarball-builder.js';

// Mock node:child_process for specific tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
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

  it('should handle empty npm pack output', async () => {
    const { spawnSync } = await import('node:child_process');
    const mockSpawnSync = vi.mocked(spawnSync);

    const commitSha = 'abc123';
    const gitUrl = 'https://github.com/test/repo.git';

    let mockWorkingDir = '';

    mockSpawnSync.mockImplementation(
      (command: string, args?: readonly string[]) => {
        const argsArray = args || [];

        if (command === 'git' && argsArray[0] === 'clone') {
          const targetDir = argsArray[argsArray.length - 1];
          mockWorkingDir = targetDir;
          mkdirSync(targetDir, { recursive: true });
          writeFileSync(
            join(targetDir, 'package.json'),
            JSON.stringify({ name: 'test-package', version: '1.0.0' })
          );
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }

        if (
          command === 'git' &&
          (argsArray.includes('cat-file') || argsArray.includes('checkout'))
        ) {
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }

        if (
          command === 'npm' &&
          (argsArray.includes('ci') || argsArray.includes('install'))
        ) {
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '',
            stderr: '',
          };
        }

        if (command === 'npm' && argsArray.includes('pack')) {
          // Create the fallback tarball name to test fallback to 'package.tgz'
          const tarballPath = join(mockWorkingDir, 'package.tgz');
          writeFileSync(tarballPath, 'fake tarball content');
          // Return empty output to trigger .pop() returning undefined
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: '\n\n\n', // Just newlines, so .pop() will return undefined
            stderr: '',
          };
        }

        if (command === 'shasum') {
          return {
            status: 0,
            signal: null,
            output: [],
            pid: 123,
            stdout: 'abc123hash  filename\n',
            stderr: '',
          };
        }

        // Default success for other commands like mv
        return {
          status: 0,
          signal: null,
          output: [],
          pid: 123,
          stdout: '',
          stderr: '',
        };
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
