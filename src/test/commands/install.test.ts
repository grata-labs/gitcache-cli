import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Install } from '../../commands/install.js';
import * as nodeFs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { scanLockfile, resolveGitReferences } from '../../lockfile/scan.js';
import { TarballBuilder } from '../../lib/tarball-builder.js';
import { RegistryClient } from '../../lib/registry-client.js';
import { AuthManager } from '../../lib/auth-manager.js';
import { GitCache } from '../../lib/git-cache.js';
import * as pathUtils from '../../lib/utils/path.js';
import * as pruneUtils from '../../lib/prune.js';
import * as configUtils from '../../lib/config.js';
import * as ciEnvironment from '../../lib/ci-environment.js';

// Mock all dependencies
vi.mock('node:fs');
vi.mock('node:fs/promises');
vi.mock('node:child_process');
vi.mock('../../lockfile/scan.js');
vi.mock('../../lib/tarball-builder.js');
vi.mock('../../lib/registry-client.js');
vi.mock('../../lib/auth-manager.js');
vi.mock('../../lib/git-cache.js');
vi.mock('../../lib/utils/path.js');
vi.mock('../../lib/prune.js');
vi.mock('../../lib/config.js');
vi.mock('../../lib/ci-environment.js');

describe('Install Command - Comprehensive Unit Tests', () => {
  let installCommand: Install;
  let mockTarballBuilder: any;
  let mockRegistryClient: any;
  let mockAuthManager: any;
  let mockGitCache: any;
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;

  beforeEach(() => {
    // Setup mocks
    mockTarballBuilder = {
      getCachedTarball: vi.fn(),
      buildTarball: vi.fn(),
    };
    mockRegistryClient = {
      has: vi.fn(),
      get: vi.fn(),
      upload: vi.fn(),
      validateCIToken: vi.fn(),
    };
    mockAuthManager = {
      isAuthenticated: vi.fn(),
      storeAuthData: vi.fn(),
    };
    mockGitCache = {};

    vi.mocked(TarballBuilder).mockImplementation(() => mockTarballBuilder);
    vi.mocked(RegistryClient).mockImplementation(() => mockRegistryClient);
    vi.mocked(AuthManager).mockImplementation(() => mockAuthManager);
    vi.mocked(GitCache).mockImplementation(() => mockGitCache);

    // Setup path utils mocks
    vi.mocked(pathUtils.getCacheDir).mockReturnValue('/mock/cache');
    vi.mocked(pathUtils.getPlatformIdentifier).mockReturnValue('linux-x64');
    vi.mocked(pathUtils.getTarballCachePath).mockReturnValue(
      '/mock/tarball/path'
    );

    // Setup config and prune utils mocks
    vi.mocked(configUtils.getDefaultMaxCacheSize).mockReturnValue('5GB');
    vi.mocked(pruneUtils.calculateCacheSize).mockReturnValue(
      1024 * 1024 * 1024
    ); // 1GB
    vi.mocked(pruneUtils.formatBytes).mockReturnValue('1.0 GB');
    vi.mocked(pruneUtils.parseSizeToBytes).mockReturnValue(
      5 * 1024 * 1024 * 1024
    ); // 5GB

    // Mock console methods
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    console.log = vi.fn();
    console.warn = vi.fn();

    installCommand = new Install();
    vi.clearAllMocks();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    vi.restoreAllMocks();
  });

  describe('Basic execution', () => {
    it('should execute npm install successfully with basic setup', async () => {
      // Mock successful npm execution
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from('npm install successful'),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from('npm install successful'), Buffer.from('')],
        pid: 12345,
      });

      // Mock no lockfile exists
      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      // Mock authentication status
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec(['--verbose']);

      expect(spawnSync).toHaveBeenCalledWith('npm', ['install', '--verbose'], {
        stdio: 'inherit',
        env: expect.objectContaining({
          npm_config_cache: '/mock/cache',
          NPM_CONFIG_CACHE: '/mock/cache',
        }),
        cwd: process.cwd(),
        shell: process.platform === 'win32',
      });
    });

    it('should handle npm install failure', async () => {
      // Mock failed npm execution
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from('npm install failed'),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('npm install failed')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await expect(installCommand.exec()).rejects.toThrow(
        'npm install failed with exit code 1'
      );
    });

    it('should handle null status as success', async () => {
      // Mock npm execution with null status (Windows scenario)
      vi.mocked(spawnSync).mockReturnValue({
        status: null,
        error: undefined,
        stdout: Buffer.from('success'),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from('success'), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await expect(installCommand.exec()).resolves.toBeUndefined();
    });

    it('should treat error with null status as failure', async () => {
      // Mock npm execution with error and null status
      vi.mocked(spawnSync).mockReturnValue({
        status: null,
        error: new Error('Command failed'),
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await expect(installCommand.exec()).rejects.toThrow(
        'npm install failed with exit code 1'
      );
    });
  });

  describe('Cache directory creation', () => {
    it('should create cache directory successfully', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(nodeFs.mkdirSync).toHaveBeenCalledWith('/mock/cache', {
        recursive: true,
      });
    });

    it('should handle EEXIST error silently when creating cache directory', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      const eexistError = new Error('Directory exists');
      (eexistError as NodeJS.ErrnoException).code = 'EEXIST';
      vi.mocked(nodeFs.mkdirSync).mockImplementation(() => {
        throw eexistError;
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should warn on non-EEXIST mkdirSync errors', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      const permissionError = new Error('Permission denied');
      (permissionError as NodeJS.ErrnoException).code = 'EACCES';
      vi.mocked(nodeFs.mkdirSync).mockImplementation(() => {
        throw permissionError;
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.warn).toHaveBeenCalledWith(
        'Warning: Could not create cache directory: Permission denied'
      );
    });
  });

  describe('Git dependency preparation', () => {
    it('should skip preparation when no lockfile exists', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(scanLockfile).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Scanning lockfile')
      );
    });

    it('should skip preparation when no Git dependencies found', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        return String(path).includes('package-lock.json');
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: false,
        lockfileVersion: 2,
        dependencies: [],
      });

      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '🔍 Scanning lockfile for Git dependencies...'
      );
      expect(resolveGitReferences).not.toHaveBeenCalled();
    });

    it('should handle lockfile with Git dependencies but no resolvable ones', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        return String(path).includes('package-lock.json');
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'test-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'main',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([]);

      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith('📦 Found 1 Git dependencies');
      expect(console.log).toHaveBeenCalledWith(
        '⚠️  No Git dependencies could be resolved, skipping preparation'
      );
    });
  });

  describe('Tarball caching logic', () => {
    it('should report when all tarballs are already cached', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        return (
          pathStr.includes('package-lock.json') ||
          pathStr.includes('package.tgz')
        );
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'cached-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'cached-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          resolvedSha: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
        },
      ]);

      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '✅ 1/1 tarballs already cached'
      );
      expect(console.log).toHaveBeenCalledWith(
        '🚀 All tarballs ready! Running install with optimized cache...\n'
      );
    });

    it('should build missing tarballs from git when not in cache or registry', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        return (
          pathStr.includes('package-lock.json') &&
          !pathStr.includes('package.tgz')
        );
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'new-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'new-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          resolvedSha: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
        },
      ]);

      mockTarballBuilder.getCachedTarball.mockReturnValue(null);
      mockTarballBuilder.buildTarball.mockResolvedValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '🚀 Building 1 missing tarballs...'
      );
      expect(console.log).toHaveBeenCalledWith(
        '🔨 Building new-dep from git repository'
      );
      expect(mockTarballBuilder.buildTarball).toHaveBeenCalledWith(
        'https://github.com/test/repo.git',
        'abc123',
        { force: true }
      );
    });

    it('should retrieve tarball from local cache when available', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        return (
          pathStr.includes('package-lock.json') &&
          !pathStr.includes('package.tgz')
        );
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'local-cached-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'local-cached-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          resolvedSha: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
        },
      ]);

      mockTarballBuilder.getCachedTarball.mockReturnValue(
        '/path/to/cached/tarball'
      );
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '📥 Retrieved local-cached-dep from local cache'
      );
      expect(mockTarballBuilder.buildTarball).not.toHaveBeenCalled();
    });
  });

  describe('Registry integration when authenticated', () => {
    beforeEach(() => {
      mockAuthManager.isAuthenticated.mockReturnValue(true);
    });

    it('should retrieve tarball from registry when not in local cache', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        return (
          pathStr.includes('package-lock.json') &&
          !pathStr.includes('package.tgz')
        );
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'registry-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'registry-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          resolvedSha: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
        },
      ]);

      mockTarballBuilder.getCachedTarball.mockReturnValue(null);
      mockRegistryClient.has.mockResolvedValue(true);
      mockRegistryClient.get.mockResolvedValue(Buffer.from('registry-tarball'));

      // Mock fs/promises for local storage
      const mockFsPromises = {
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
      };
      vi.doMock('node:fs/promises', () => mockFsPromises);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '📥 Retrieved registry-dep from registry'
      );
      expect(mockRegistryClient.has).toHaveBeenCalledWith(
        'https://github.com/test/repo.git#abc123'
      );
      expect(mockRegistryClient.get).toHaveBeenCalledWith(
        'https://github.com/test/repo.git#abc123'
      );
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it('should upload newly built tarball to registry', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      // Mock file existence - tarball exists after build
      let buildComplete = false;
      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        if (pathStr.includes('package-lock.json')) return true;
        if (pathStr.includes('package.tgz')) return buildComplete;
        return false;
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'upload-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'upload-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          resolvedSha: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
        },
      ]);

      mockTarballBuilder.getCachedTarball.mockReturnValue(null);
      mockTarballBuilder.buildTarball.mockImplementation(async () => {
        buildComplete = true; // Simulate tarball being created
        return undefined;
      });
      mockRegistryClient.has.mockResolvedValue(false);
      mockRegistryClient.upload.mockResolvedValue(undefined);

      // Mock fs/promises for reading built tarball
      const mockFsPromises = {
        readFile: vi.fn().mockResolvedValue(Buffer.from('built-tarball')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
      };
      vi.doMock('node:fs/promises', () => mockFsPromises);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '🔨 Building upload-dep from git repository'
      );
      expect(console.log).toHaveBeenCalledWith(
        '📤 Stored upload-dep in registry for team sharing'
      );
      expect(mockRegistryClient.upload).toHaveBeenCalledWith(
        'https://github.com/test/repo.git#abc123',
        Buffer.from('built-tarball')
      );
    });

    it('should handle registry retrieval failure gracefully', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        return (
          pathStr.includes('package-lock.json') &&
          !pathStr.includes('package.tgz')
        );
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'registry-fail-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'registry-fail-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          resolvedSha: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
        },
      ]);

      mockTarballBuilder.getCachedTarball.mockReturnValue(null);
      mockTarballBuilder.buildTarball.mockResolvedValue(undefined);
      mockRegistryClient.has.mockRejectedValue(new Error('Registry error'));

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '⚠️  Registry retrieval failed for registry-fail-dep, building from git'
      );
      expect(console.log).toHaveBeenCalledWith(
        '🔨 Building registry-fail-dep from git repository'
      );
    });

    it('should handle registry upload failure gracefully', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      let buildComplete = false;
      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        if (pathStr.includes('package-lock.json')) return true;
        if (pathStr.includes('package.tgz')) return buildComplete;
        return false;
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'upload-fail-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'upload-fail-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          resolvedSha: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
        },
      ]);

      mockTarballBuilder.getCachedTarball.mockReturnValue(null);
      mockTarballBuilder.buildTarball.mockImplementation(async () => {
        buildComplete = true;
        return undefined;
      });
      mockRegistryClient.has.mockResolvedValue(false);
      mockRegistryClient.upload.mockRejectedValue(new Error('Upload failed'));

      const mockFsPromises = {
        readFile: vi.fn().mockResolvedValue(Buffer.from('built-tarball')),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
      };
      vi.doMock('node:fs/promises', () => mockFsPromises);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '⚠️  Failed to upload upload-fail-dep to registry: Error: Upload failed'
      );
    });
  });

  describe('Error handling in tarball building', () => {
    it('should handle tarball build failures gracefully', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        return (
          pathStr.includes('package-lock.json') &&
          !pathStr.includes('package.tgz')
        );
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'fail-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'fail-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          resolvedSha: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
        },
      ]);

      mockTarballBuilder.getCachedTarball.mockReturnValue(null);
      mockTarballBuilder.buildTarball.mockRejectedValue(
        new Error('Build failed')
      );
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Failed to build fail-dep: Error: Build failed'
      );
      // Note: The "Built 0/1 new tarballs" message only shows when successful > 0
      // When all builds fail (successful = 0), the message is not shown
      expect(console.log).not.toHaveBeenCalledWith('✅ Built 0/1 new tarballs');
    });

    it('should handle non-Error exceptions in tarball building', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        return (
          pathStr.includes('package-lock.json') &&
          !pathStr.includes('package.tgz')
        );
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'string-error-dep',
            gitUrl: 'https://github.com/test/repo.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/repo.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'string-error-dep',
          gitUrl: 'https://github.com/test/repo.git',
          reference: 'abc123',
          resolvedSha: 'abc123',
          preferredUrl: 'git+https://github.com/test/repo.git',
        },
      ]);

      mockTarballBuilder.getCachedTarball.mockReturnValue(null);
      mockTarballBuilder.buildTarball.mockRejectedValue('string error');
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Failed to build string-error-dep: string error'
      );
    });

    it('should handle mixed success and failure in tarball building', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        const pathStr = String(path);
        return (
          pathStr.includes('package-lock.json') &&
          !pathStr.includes('package.tgz')
        );
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockReturnValue({
        hasGitDependencies: true,
        lockfileVersion: 2,
        dependencies: [
          {
            name: 'success-dep',
            gitUrl: 'https://github.com/test/success.git',
            reference: 'abc123',
            preferredUrl: 'git+https://github.com/test/success.git',
          },
          {
            name: 'fail-dep',
            gitUrl: 'https://github.com/test/fail.git',
            reference: 'def456',
            preferredUrl: 'git+https://github.com/test/fail.git',
          },
        ],
      });

      vi.mocked(resolveGitReferences).mockResolvedValue([
        {
          name: 'success-dep',
          gitUrl: 'https://github.com/test/success.git',
          reference: 'abc123',
          resolvedSha: 'abc123',
          preferredUrl: 'git+https://github.com/test/success.git',
        },
        {
          name: 'fail-dep',
          gitUrl: 'https://github.com/test/fail.git',
          reference: 'def456',
          resolvedSha: 'def456',
          preferredUrl: 'git+https://github.com/test/fail.git',
        },
      ]);

      mockTarballBuilder.getCachedTarball.mockReturnValue(null);
      mockTarballBuilder.buildTarball
        .mockResolvedValueOnce(undefined) // First call succeeds
        .mockRejectedValueOnce(new Error('Build failed')); // Second call fails
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '🔨 Building success-dep from git repository'
      );
      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Failed to build fail-dep: Error: Build failed'
      );
      expect(console.log).toHaveBeenCalledWith('✅ Built 1/2 new tarballs');
    });

    it('should handle preparation failure gracefully', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        return String(path).includes('package-lock.json');
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockImplementation(() => {
        throw new Error('Lockfile parsing failed');
      });

      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Cache preparation failed: Error: Lockfile parsing failed'
      );
      expect(console.log).toHaveBeenCalledWith(
        '⏭️  Continuing with normal install...\n'
      );
    });

    it('should handle non-Error exceptions in preparation', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockImplementation((path: any) => {
        return String(path).includes('package-lock.json');
      });
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      vi.mocked(scanLockfile).mockImplementation(() => {
        throw 'string error in preparation';
      });

      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.warn).toHaveBeenCalledWith(
        '⚠️  Cache preparation failed: string error in preparation'
      );
      expect(console.log).toHaveBeenCalledWith(
        '⏭️  Continuing with normal install...\n'
      );
    });
  });

  describe('Cache status and size reporting', () => {
    it('should show authentication status when authenticated', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(true);

      // Mock local environment (not CI)
      vi.mocked(ciEnvironment.detectCIEnvironment).mockReturnValue({
        detected: false,
        platform: 'local',
        hasToken: false,
        tokenSource: 'none',
      });

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '🔗 Connected to GitCache registry for transparent caching'
      );
    });

    it('should show CI accelerated build message when authenticated in CI environment', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(true);

      // Mock CI environment detection
      vi.mocked(ciEnvironment.detectCIEnvironment).mockReturnValue({
        detected: true,
        platform: 'GitHub Actions',
        hasToken: true,
        tokenSource: 'environment',
      });

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '🤖 GitCache accelerated build (GitHub Actions)'
      );
    });

    it('should show setup advice when not authenticated', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      // Mock local environment (not CI)
      vi.mocked(ciEnvironment.detectCIEnvironment).mockReturnValue({
        detected: false,
        platform: 'local',
        hasToken: false,
        tokenSource: 'none',
      });

      // Mock isInCI to return false so we don't get network error message
      vi.mocked(ciEnvironment.isInCI).mockReturnValue(false);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '💡 Run "gitcache setup" to enable cloud registry caching'
      );
    });

    it('should handle authentication status check failure gracefully', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockImplementation(() => {
        throw new Error('Auth check failed');
      });

      // Should not throw, authentication status is non-critical
      await expect(installCommand.exec()).resolves.toBeUndefined();
    });

    it('should auto-setup CI token when detected with valid token', async () => {
      const originalEnv = process.env.GITCACHE_TOKEN;
      process.env.GITCACHE_TOKEN = 'ci_test_token_123';

      try {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          error: undefined,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          signal: null,
          output: [null, Buffer.from(''), Buffer.from('')],
          pid: 12345,
        });

        vi.mocked(nodeFs.existsSync).mockReturnValue(false);
        vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
        mockAuthManager.isAuthenticated.mockReturnValue(false);
        mockAuthManager.storeAuthData.mockReturnValue(undefined);

        // Mock CI environment with token
        vi.mocked(ciEnvironment.detectCIEnvironment).mockReturnValue({
          detected: true,
          platform: 'GitHub Actions',
          hasToken: true,
          tokenSource: 'environment',
        });

        // Mock successful token validation
        mockRegistryClient.validateCIToken.mockResolvedValue({
          valid: true,
          organization: 'test-org',
        });

        await installCommand.exec();

        expect(console.log).toHaveBeenCalledWith(
          '🤖 Detected GitHub Actions with CI token, attempting auto-setup...'
        );
        expect(mockRegistryClient.validateCIToken).toHaveBeenCalledWith(
          'ci_test_token_123'
        );
        expect(mockAuthManager.storeAuthData).toHaveBeenCalledWith({
          token: 'ci_test_token_123',
          orgId: 'test-org',
          tokenType: 'ci',
          expiresAt: null,
        });
        expect(console.log).toHaveBeenCalledWith(
          '✅ Auto-configured GitCache for test-org'
        );
      } finally {
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.GITCACHE_TOKEN = originalEnv;
        } else {
          delete process.env.GITCACHE_TOKEN;
        }
      }
    });

    it('should handle storeAuthData error during auto-setup gracefully', async () => {
      const originalEnv = process.env.GITCACHE_TOKEN;
      process.env.GITCACHE_TOKEN = 'ci_test_token_123';

      try {
        vi.mocked(spawnSync).mockReturnValue({
          status: 0,
          error: undefined,
          stdout: Buffer.from(''),
          stderr: Buffer.from(''),
          signal: null,
          output: [null, Buffer.from(''), Buffer.from('')],
          pid: 12345,
        });

        vi.mocked(nodeFs.existsSync).mockReturnValue(false);
        vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
        mockAuthManager.isAuthenticated.mockReturnValue(false);

        // Mock storeAuthData to throw an error
        mockAuthManager.storeAuthData.mockImplementation(() => {
          throw new Error('Failed to store auth data');
        });

        // Mock CI environment with token
        vi.mocked(ciEnvironment.detectCIEnvironment).mockReturnValue({
          detected: true,
          platform: 'GitLab CI',
          hasToken: true,
          tokenSource: 'environment',
        });

        // Mock successful token validation
        mockRegistryClient.validateCIToken.mockResolvedValue({
          valid: true,
          organization: 'test-org',
        });

        // Mock getCIErrorMessage
        vi.mocked(ciEnvironment.getCIErrorMessage).mockReturnValue(
          'Mock CI error message'
        );

        await installCommand.exec();

        expect(console.log).toHaveBeenCalledWith(
          '🤖 Detected GitLab CI with CI token, attempting auto-setup...'
        );
        expect(mockRegistryClient.validateCIToken).toHaveBeenCalledWith(
          'ci_test_token_123'
        );
        expect(mockAuthManager.storeAuthData).toHaveBeenCalledWith({
          token: 'ci_test_token_123',
          orgId: 'test-org',
          tokenType: 'ci',
          expiresAt: null,
        });
        expect(console.log).toHaveBeenCalledWith(
          '⚠️  Auto-setup failed, continuing with Git sources'
        );
        expect(console.log).toHaveBeenCalledWith('Mock CI error message');
      } finally {
        // Restore original environment
        if (originalEnv !== undefined) {
          process.env.GITCACHE_TOKEN = originalEnv;
        } else {
          delete process.env.GITCACHE_TOKEN;
        }
      }
    });

    it('should show invalid token message when in CI with invalid token', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      // Mock CI environment with token that's invalid
      vi.mocked(ciEnvironment.detectCIEnvironment).mockReturnValue({
        detected: true,
        platform: 'GitHub Actions',
        hasToken: true,
        tokenSource: 'environment',
      });

      // Mock getCIErrorMessage
      vi.mocked(ciEnvironment.getCIErrorMessage).mockReturnValue(
        'Mock token invalid message'
      );

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '⚠️  GitCache token found but invalid'
      );
      expect(console.log).toHaveBeenCalledWith('Mock token invalid message');
      expect(ciEnvironment.getCIErrorMessage).toHaveBeenCalledWith(
        'token_invalid'
      );
    });

    it('should show authentication required message when in CI without token', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      // Mock CI environment without token
      vi.mocked(ciEnvironment.detectCIEnvironment).mockReturnValue({
        detected: true,
        platform: 'GitLab CI',
        hasToken: false,
        tokenSource: 'none',
      });

      // Mock getCIErrorMessage
      vi.mocked(ciEnvironment.getCIErrorMessage).mockReturnValue(
        'Mock authentication required message'
      );

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '💡 GitCache not configured for CI acceleration'
      );
      expect(console.log).toHaveBeenCalledWith(
        'Mock authentication required message'
      );
      expect(ciEnvironment.getCIErrorMessage).toHaveBeenCalledWith(
        'authentication_required'
      );
    });

    it('should show network error message when showCacheStatus fails in CI environment', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);

      // Make detectCIEnvironment throw an error to trigger the catch block
      vi.mocked(ciEnvironment.detectCIEnvironment).mockImplementation(() => {
        throw new Error('Network error');
      });

      // Mock isInCI to return true (CI environment)
      vi.mocked(ciEnvironment.isInCI).mockReturnValue(true);

      // Mock getCIErrorMessage
      vi.mocked(ciEnvironment.getCIErrorMessage).mockReturnValue(
        'Mock network error message'
      );

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '⚠️  GitCache registry unavailable, continuing with Git sources'
      );
      expect(console.log).toHaveBeenCalledWith('Mock network error message');
      expect(ciEnvironment.getCIErrorMessage).toHaveBeenCalledWith(
        'network_error'
      );
    });

    it('should show basic cache size info', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      // Set cache size to 3GB (which is > 50% of 5GB limit (2.5GB))
      vi.mocked(pruneUtils.calculateCacheSize).mockReturnValue(
        3 * 1024 * 1024 * 1024
      );
      vi.mocked(pruneUtils.formatBytes).mockReturnValue('3.0 GB');

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith('📊 Cache size: 3.0 GB');
      // Cache size is 3GB, which is > 50% of 5GB limit (2.5GB), so should show prune advice
      expect(console.log).toHaveBeenCalledWith(
        "💡 Run 'gitcache prune' to manage cache size when needed"
      );
    });

    it('should show pruning advice when cache is 80% of limit', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      // Set cache size to 81% of 5GB limit (4.05GB) to trigger the > 80% condition
      vi.mocked(pruneUtils.calculateCacheSize).mockReturnValue(
        4.05 * 1024 * 1024 * 1024
      );
      vi.mocked(pruneUtils.formatBytes).mockReturnValue('4.05 GB');

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith('📊 Cache size: 4.05 GB');
      expect(console.log).toHaveBeenCalledWith(
        '💡 Your cache is getting large (4.05 GB)'
      );
      expect(console.log).toHaveBeenCalledWith(
        '   Consider running: gitcache prune'
      );
    });

    it('should show custom limit advice when cache exceeds default limit', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      // Set cache size to exceed 5GB limit (6GB)
      vi.mocked(pruneUtils.calculateCacheSize).mockReturnValue(
        6 * 1024 * 1024 * 1024
      );
      vi.mocked(pruneUtils.formatBytes).mockReturnValue('6.0 GB');

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(console.log).toHaveBeenCalledWith(
        '💡 Your cache is getting large (6.0 GB)'
      );
      expect(console.log).toHaveBeenCalledWith(
        '   Consider running: gitcache prune'
      );
      expect(console.log).toHaveBeenCalledWith(
        '   Or set a custom limit: gitcache prune --max-size 10GB --set-default'
      );
    });

    it('should handle cache size calculation failure gracefully', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(pruneUtils.calculateCacheSize).mockImplementation(() => {
        throw new Error('Cannot calculate cache size');
      });
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      // Should not throw, cache size is just informational
      await expect(installCommand.exec()).resolves.toBeUndefined();
    });
  });

  describe('Platform-specific behavior', () => {
    it('should use shell on Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(spawnSync).toHaveBeenCalledWith('npm', ['install'], {
        stdio: 'inherit',
        env: expect.objectContaining({
          npm_config_cache: '/mock/cache',
          NPM_CONFIG_CACHE: '/mock/cache',
        }),
        cwd: process.cwd(),
        shell: true,
      });

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should not use shell on non-Windows platforms', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        error: undefined,
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
        output: [null, Buffer.from(''), Buffer.from('')],
        pid: 12345,
      });

      vi.mocked(nodeFs.existsSync).mockReturnValue(false);
      vi.mocked(nodeFs.mkdirSync).mockReturnValue(undefined);
      mockAuthManager.isAuthenticated.mockReturnValue(false);

      await installCommand.exec();

      expect(spawnSync).toHaveBeenCalledWith('npm', ['install'], {
        stdio: 'inherit',
        env: expect.objectContaining({
          npm_config_cache: '/mock/cache',
          NPM_CONFIG_CACHE: '/mock/cache',
        }),
        cwd: process.cwd(),
        shell: false,
      });

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });
});
