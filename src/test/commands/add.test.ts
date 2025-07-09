import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Add } from '../../commands/add.js';
import { getTargetPath } from '../../lib/utils/path.js';
import { TarballBuilder } from '../../lib/tarball-builder.js';

vi.mock('../../lib/utils/git.js', () => ({
  cloneMirror: vi.fn(),
  updateAndPruneMirror: vi.fn(),
  repackRepository: vi.fn(),
  resolveRef: vi.fn(),
}));

vi.mock('../../lib/tarball-builder.js', () => ({
  createTarballBuilder: vi.fn(() => ({
    buildTarball: vi.fn(),
  })),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  rmSync: vi.fn(),
}));

const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv, HOME: '/home/testuser' };
});

describe('Add command', () => {
  it('should execute git clone --mirror with correct target path', async () => {
    const { cloneMirror } = await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return false (no existing repo)
    mockExistsSync.mockReturnValue(false);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo]);

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(result).toBe(expectedTarget);
  });

  it('should execute update and repack when force option is true', async () => {
    const { cloneMirror, updateAndPruneMirror, repackRepository } =
      await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockUpdateAndPruneMirror = vi.mocked(updateAndPruneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return false for force check, false for clone check, then true for update check
    mockExistsSync
      .mockReturnValueOnce(false) // First call: force check - no existing repo to remove
      .mockReturnValueOnce(false) // Second call: clone check - no existing repo, so clone
      .mockReturnValue(true); // Third call: force update check - repo exists after cloning

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    await add.exec([repo], { force: true });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockUpdateAndPruneMirror).toHaveBeenCalledWith(expectedTarget);
    expect(mockRepackRepository).toHaveBeenCalledWith(expectedTarget);
  });

  it('should not execute update and repack when force option is false', async () => {
    const { cloneMirror, updateAndPruneMirror, repackRepository } =
      await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockUpdateAndPruneMirror = vi.mocked(updateAndPruneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return false (no existing repo to clone)
    mockExistsSync.mockReturnValue(false);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';

    await add.exec([repo], { force: false });

    expect(mockCloneMirror).toHaveBeenCalledTimes(1);
    expect(mockUpdateAndPruneMirror).not.toHaveBeenCalled();
    expect(mockRepackRepository).not.toHaveBeenCalled();
  });

  it('should not execute update and repack when no options provided', async () => {
    const { cloneMirror, updateAndPruneMirror, repackRepository } =
      await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockUpdateAndPruneMirror = vi.mocked(updateAndPruneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return false (no existing repo to clone)
    mockExistsSync.mockReturnValue(false);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';

    await add.exec([repo]);

    expect(mockCloneMirror).toHaveBeenCalledTimes(1);
    expect(mockUpdateAndPruneMirror).not.toHaveBeenCalled();
    expect(mockRepackRepository).not.toHaveBeenCalled();
  });

  it('should handle complex repository URLs correctly', async () => {
    const { cloneMirror } = await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return false (no existing repo)
    mockExistsSync.mockReturnValue(false);

    const add = new Add();
    const repo = 'git@github.com:org/repo-with-dashes.git';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo]);

    expect(result).toBe(expectedTarget);
    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
  });

  it('should throw error when no repository URL provided', async () => {
    const add = new Add();

    await expect(async () => await add.exec([])).rejects.toThrow(
      'Repository URL is required'
    );
  });

  it('should resolve reference when ref option is provided', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return false (no existing repo)
    mockExistsSync.mockReturnValue(false);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockSha = 'a1b2c3d4e5f6789012345678901234567890abcd';
    mockResolveRef.mockReturnValue(mockSha);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const ref = 'v1.0.0';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { ref });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, ref);
    expect(consoleSpy).toHaveBeenCalledWith(`Resolved ${ref} → ${mockSha}`);
    expect(result).toBe(expectedTarget);

    consoleSpy.mockRestore();
  });

  it('should handle ref resolution errors gracefully', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return false (no existing repo)
    mockExistsSync.mockReturnValue(false);

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockResolveRef.mockImplementation(() => {
      throw new Error('Reference not found');
    });

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const ref = 'nonexistent-branch';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { ref });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, ref);
    expect(consoleSpy).toHaveBeenCalledWith(
      `Warning: Failed to resolve ref 'nonexistent-branch': Reference not found`
    );
    expect(result).toBe(expectedTarget);

    consoleSpy.mockRestore();
  });

  it('should work with both force and ref options together', async () => {
    const { cloneMirror, updateAndPruneMirror, repackRepository, resolveRef } =
      await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockUpdateAndPruneMirror = vi.mocked(updateAndPruneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);
    const mockResolveRef = vi.mocked(resolveRef);
    const mockExistsSync = vi.mocked(existsSync);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockSha = 'b2c3d4e5f6789012345678901234567890abcdef';
    mockResolveRef.mockReturnValue(mockSha);

    // Mock existsSync to return false for force check, false for clone check, then true for update check
    mockExistsSync
      .mockReturnValueOnce(false) // First call: force check - no existing repo to remove
      .mockReturnValueOnce(false) // Second call: clone check - no existing repo, so clone
      .mockReturnValue(true); // Third call: force update check - repo exists after cloning

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const ref = 'main';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { force: true, ref });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, ref);
    expect(mockUpdateAndPruneMirror).toHaveBeenCalledWith(expectedTarget);
    expect(mockRepackRepository).toHaveBeenCalledWith(expectedTarget);
    expect(consoleSpy).toHaveBeenCalledWith(`Resolved ${ref} → ${mockSha}`);
    expect(result).toBe(expectedTarget);

    consoleSpy.mockRestore();
  });

  it('should handle non-Error exceptions during ref resolution', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return false (no existing repo)
    mockExistsSync.mockReturnValue(false);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock resolveRef to throw a non-Error object
    mockResolveRef.mockImplementation(() => {
      throw 'string error'; // Non-Error object
    });

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const ref = 'test-ref';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { ref });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, ref);
    expect(warnSpy).toHaveBeenCalledWith(
      "Warning: Failed to resolve ref 'test-ref': Unknown error"
    );
    expect(result).toBe(expectedTarget);

    warnSpy.mockRestore();
  });

  it('should remove existing repository when force option is used', async () => {
    const { cloneMirror, updateAndPruneMirror, repackRepository } =
      await import('../../lib/utils/git.js');
    const { existsSync, rmSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockUpdateAndPruneMirror = vi.mocked(updateAndPruneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);
    const mockExistsSync = vi.mocked(existsSync);
    const mockRmSync = vi.mocked(rmSync);

    // Mock existsSync to return true initially (existing repo), false after removal, then true after cloning
    mockExistsSync
      .mockReturnValueOnce(true) // Initial check for force removal
      .mockReturnValueOnce(false) // Check before cloning
      .mockReturnValue(true); // Check after cloning for force update

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { force: true });

    expect(mockRmSync).toHaveBeenCalledWith(expectedTarget, {
      recursive: true,
      force: true,
    });
    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockUpdateAndPruneMirror).toHaveBeenCalledWith(expectedTarget);
    expect(mockRepackRepository).toHaveBeenCalledWith(expectedTarget);
    expect(result).toBe(expectedTarget);
  });

  it('should be idempotent when repository already exists (no force)', async () => {
    const { cloneMirror, updateAndPruneMirror, repackRepository } =
      await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockUpdateAndPruneMirror = vi.mocked(updateAndPruneMirror);
    const mockRepackRepository = vi.mocked(repackRepository);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return true (repository already exists)
    mockExistsSync.mockReturnValue(true);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo]);

    // Should return path without cloning or updating since repo already exists
    expect(mockCloneMirror).not.toHaveBeenCalled();
    expect(mockUpdateAndPruneMirror).not.toHaveBeenCalled();
    expect(mockRepackRepository).not.toHaveBeenCalled();
    expect(result).toBe(expectedTarget);
  });

  it('should build tarball when build flag is used with ref', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const { createTarballBuilder } = await import(
      '../../lib/tarball-builder.js'
    );
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);
    const mockExistsSync = vi.mocked(existsSync);
    const mockCreateTarballBuilder = vi.mocked(createTarballBuilder);

    const mockBuildTarball = vi.fn().mockResolvedValue({
      gitUrl: 'https://github.com/user/repo.git',
      commitSha: 'abc123',
      tarballPath: '/home/testuser/.gitcache/tarballs/abc123/package.tgz',
      integrity: 'sha256-test',
      buildTime: new Date(),
    });

    mockCreateTarballBuilder.mockReturnValue({
      buildTarball: mockBuildTarball,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Mock existsSync to return false (no existing repo)
    mockExistsSync.mockReturnValue(false);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockSha = 'abc123';
    mockResolveRef.mockReturnValue(mockSha);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const ref = 'v1.0.0';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { ref, build: true });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, ref);
    expect(mockBuildTarball).toHaveBeenCalledWith(repo, mockSha, {
      force: undefined,
    });
    expect(consoleSpy).toHaveBeenCalledWith(`Resolved ${ref} → ${mockSha}`);
    expect(consoleSpy).toHaveBeenCalledWith(
      `✓ Tarball cached: /home/testuser/.gitcache/tarballs/abc123/package.tgz`
    );
    expect(result).toBe(expectedTarget);

    consoleSpy.mockRestore();
  });

  it('should build tarball when build flag is used without ref (uses HEAD)', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const { createTarballBuilder } = await import(
      '../../lib/tarball-builder.js'
    );
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);
    const mockExistsSync = vi.mocked(existsSync);
    const mockCreateTarballBuilder = vi.mocked(createTarballBuilder);

    const mockBuildTarball = vi.fn().mockResolvedValue({
      gitUrl: 'https://github.com/user/repo.git',
      commitSha: 'def456',
      tarballPath: '/home/testuser/.gitcache/tarballs/def456/package.tgz',
      integrity: 'sha256-test2',
      buildTime: new Date(),
    });

    mockCreateTarballBuilder.mockReturnValue({
      buildTarball: mockBuildTarball,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Mock existsSync to return false (no existing repo)
    mockExistsSync.mockReturnValue(false);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockSha = 'def456';
    mockResolveRef.mockReturnValue(mockSha);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { build: true });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, 'HEAD');
    expect(mockBuildTarball).toHaveBeenCalledWith(repo, mockSha, {
      force: undefined,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      `Building tarball for HEAD → ${mockSha}`
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      `✓ Tarball cached: /home/testuser/.gitcache/tarballs/def456/package.tgz`
    );
    expect(result).toBe(expectedTarget);

    consoleSpy.mockRestore();
  });

  it('should handle tarball build errors gracefully', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const { createTarballBuilder } = await import(
      '../../lib/tarball-builder.js'
    );
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);
    const mockExistsSync = vi.mocked(existsSync);
    const mockCreateTarballBuilder = vi.mocked(createTarballBuilder);

    const mockBuildTarball = vi
      .fn()
      .mockRejectedValue(new Error('Build failed'));

    mockCreateTarballBuilder.mockReturnValue({
      buildTarball: mockBuildTarball,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    // Mock existsSync to return false (no existing repo)
    mockExistsSync.mockReturnValue(false);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockSha = 'abc123';
    mockResolveRef.mockReturnValue(mockSha);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const ref = 'v1.0.0';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { ref, build: true });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockBuildTarball).toHaveBeenCalledWith(repo, mockSha, {
      force: undefined,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      'Warning: Failed to build tarball: Build failed'
    );
    expect(result).toBe(expectedTarget);

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('should handle HEAD resolution failure when building without ref', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return false (no existing repo)
    mockExistsSync.mockReturnValue(false);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock resolveRef to fail for HEAD
    mockResolveRef.mockImplementation((repo: string, ref: string) => {
      if (ref === 'HEAD') {
        throw new Error('Could not resolve HEAD');
      }
      return 'some-sha';
    });

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { build: true });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, 'HEAD');
    expect(warnSpy).toHaveBeenCalledWith(
      'Warning: Could not resolve HEAD for tarball build: Could not resolve HEAD'
    );
    expect(result).toBe(expectedTarget);

    warnSpy.mockRestore();
  });

  it('should handle HEAD resolution non-Error exception when building without ref', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const { existsSync } = await import('node:fs');
    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);
    const mockExistsSync = vi.mocked(existsSync);

    // Mock existsSync to return false (no existing repo)
    mockExistsSync.mockReturnValue(false);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock resolveRef to throw a non-Error exception for HEAD
    mockResolveRef.mockImplementation((repo: string, ref: string) => {
      if (ref === 'HEAD') {
        throw 'String error instead of Error object';
      }
      return 'some-sha';
    });

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { build: true });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, 'HEAD');
    expect(warnSpy).toHaveBeenCalledWith(
      'Warning: Could not resolve HEAD for tarball build: Unknown error'
    );
    expect(result).toBe(expectedTarget);

    warnSpy.mockRestore();
  });

  it('should handle non-Error exception during tarball building', async () => {
    const { cloneMirror, resolveRef } = await import('../../lib/utils/git.js');
    const { createTarballBuilder } = await import(
      '../../lib/tarball-builder.js'
    );

    const mockCloneMirror = vi.mocked(cloneMirror);
    const mockResolveRef = vi.mocked(resolveRef);
    const mockCreateTarballBuilder = vi.mocked(createTarballBuilder);

    const mockBuildTarball = vi.fn().mockImplementation(() => {
      throw 'string error'; // Non-Error object
    });

    mockCreateTarballBuilder.mockReturnValue({
      buildTarball: mockBuildTarball,
    } as unknown as TarballBuilder);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockSha = 'abc123';
    mockResolveRef.mockReturnValue(mockSha);

    const add = new Add();
    const repo = 'https://github.com/user/repo.git';
    const expectedTarget = getTargetPath(repo);

    const result = await add.exec([repo], { ref: 'main', build: true });

    expect(mockCloneMirror).toHaveBeenCalledWith(repo, expectedTarget);
    expect(mockResolveRef).toHaveBeenCalledWith(repo, 'main');
    expect(mockBuildTarball).toHaveBeenCalledWith(repo, mockSha, {
      force: undefined,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      'Warning: Failed to build tarball: Unknown error'
    );
    expect(result).toBe(expectedTarget);

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
