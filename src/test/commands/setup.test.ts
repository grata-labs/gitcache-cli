import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Setup } from '../../commands/setup.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getCacheDir } from '../../lib/utils/path.js';
import * as readline from 'node:readline/promises';
import * as ciEnvironment from '../../lib/ci-environment.js';

// Mock dependencies
vi.mock('node:fs');
vi.mock('../../lib/utils/path.js');
vi.mock('node:readline/promises');
vi.mock('../../lib/ci-environment.js');

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Setup Command', () => {
  let setup: Setup;
  let originalEnv: NodeJS.ProcessEnv;
  let mockStdin: any;
  let mockStdout: any;

  // Helper function to get expected auth file path
  const getExpectedAuthPath = () =>
    join(join('/', 'home', 'testuser', '.gitcache'), 'auth.json');
  const getExpectedCacheDir = () => join('/', 'home', 'testuser', '.gitcache');

  beforeEach(() => {
    setup = new Setup();
    originalEnv = { ...process.env };

    // Mock path utilities
    vi.mocked(getCacheDir).mockReturnValue(getExpectedCacheDir());

    // Mock filesystem
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{}');
    vi.mocked(writeFileSync).mockImplementation(() => {});
    vi.mocked(mkdirSync).mockImplementation(() => '');

    // Mock CI environment detection - default to local environment
    vi.mocked(ciEnvironment.detectCIEnvironment).mockImplementation(() => {
      const hasToken = !!process.env.GITCACHE_TOKEN;
      const tokenSource = hasToken
        ? ('environment' as const)
        : ('none' as const);

      // Check for CI environment variables and return appropriate object
      if (process.env.GITHUB_ACTIONS === 'true') {
        return {
          detected: true,
          platform: 'GitHub Actions',
          hasToken,
          tokenSource,
        };
      }
      if (process.env.GITLAB_CI === 'true') {
        return {
          detected: true,
          platform: 'GitLab CI',
          hasToken,
          tokenSource,
        };
      }
      if (process.env.CIRCLECI === 'true') {
        return {
          detected: true,
          platform: 'CircleCI',
          hasToken,
          tokenSource,
        };
      }
      if (process.env.CI === 'true') {
        return {
          detected: true,
          platform: 'Generic CI',
          hasToken,
          tokenSource,
        };
      }
      // Default to local environment
      return {
        detected: false,
        platform: 'local environment',
        hasToken,
        tokenSource,
      };
    });

    // Mock readline interface
    const mockRl = {
      question: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as any);

    // Mock stdin/stdout for password input
    mockStdin = {
      setRawMode: vi.fn(),
      resume: vi.fn(),
      pause: vi.fn(),
      setEncoding: vi.fn(),
      on: vi.fn(),
      removeAllListeners: vi.fn(),
      isTTY: true, // Mock TTY environment
    };
    mockStdout = {
      write: vi.fn(),
    };

    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: mockStdout,
      writable: true,
    });

    // Reset fetch mock
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    // Reset the lazy-loaded RegistryClient to ensure fresh instances
    (setup as any)._registryClient = undefined;
    vi.restoreAllMocks();
  });

  describe('exec', () => {
    it('should throw error when org parameter is missing', async () => {
      await expect(setup.exec([], {})).rejects.toThrow(
        'Organization name is required. Use --org <organization> or --list-orgs to see available organizations'
      );
    });

    it('should handle --list-orgs when not authenticated', async () => {
      const result = await setup.exec([], { 'list-orgs': true });

      expect(result).toContain(
        '❌ Authentication required to list organizations'
      );
      expect(result).toContain('Please login first:');
      expect(result).toContain('gitcache auth login <your-email>');
    });

    it('should handle --list-orgs when authenticated with organizations', async () => {
      // Mock authenticated state
      const registryClientSpy = vi
        .spyOn(setup as any, 'registryClient', 'get')
        .mockReturnValue({
          isAuthenticated: () => true,
          listOrganizations: () =>
            Promise.resolve({
              organizations: [
                {
                  id: 'org1',
                  name: 'Organization 1',
                  isDefault: true,
                  role: 'admin',
                },
                {
                  id: 'org2',
                  name: 'Organization 2',
                  isDefault: false,
                  role: 'member',
                },
              ],
              defaultOrganization: 'org1',
            }),
        });

      const result = await setup.exec([], { 'list-orgs': true });

      expect(result).toContain('📋 Your Organizations (2):');
      expect(result).toContain(
        '• Organization 1 (ID: org1) (admin) 🏠 API Default'
      );
      expect(result).toContain('• Organization 2 (ID: org2) (member)');
      expect(result).toContain('💡 API default organization: org1');
      expect(result).toContain('gitcache setup --org <org-id>');
      expect(result).toContain(
        'The org-id sets your organization context for all GitCache operations.'
      );

      registryClientSpy.mockRestore();
    });

    it('should handle --list-orgs when current organization context is set', async () => {
      // Mock authenticated state
      const registryClientSpy = vi
        .spyOn(setup as any, 'registryClient', 'get')
        .mockReturnValue({
          isAuthenticated: () => true,
          listOrganizations: () =>
            Promise.resolve({
              organizations: [
                {
                  id: 'org1',
                  name: 'Organization 1',
                  isDefault: true,
                  role: 'admin',
                },
                {
                  id: 'current-org',
                  name: 'Current Organization',
                  isDefault: false,
                  role: 'member',
                },
              ],
              defaultOrganization: 'org1',
            }),
        });

      // Mock AuthManager to return a specific current organization context
      const { AuthManager } = await import('../../lib/auth-manager.js');
      const authManagerSpy = vi
        .spyOn(AuthManager.prototype, 'getOrgId')
        .mockReturnValue('current-org');

      const result = await setup.exec([], { 'list-orgs': true });

      expect(result).toContain('📋 Your Organizations (2):');
      expect(result).toContain(
        '• Organization 1 (ID: org1) (admin) 🏠 API Default'
      );
      expect(result).toContain(
        '• Current Organization (ID: current-org) (member) 🎯 Current Context'
      );
      expect(result).toContain(
        '💡 Your current organization context: current-org'
      );
      expect(result).toContain('💡 API default organization: org1');
      expect(result).toContain('gitcache setup --org <org-id>');

      registryClientSpy.mockRestore();
      authManagerSpy.mockRestore();
    });

    it('should handle --list-orgs when no organizations found', async () => {
      const registryClientSpy = vi
        .spyOn(setup as any, 'registryClient', 'get')
        .mockReturnValue({
          isAuthenticated: () => true,
          listOrganizations: () =>
            Promise.resolve({
              organizations: [],
              defaultOrganization: undefined,
            }),
        });

      const result = await setup.exec([], { 'list-orgs': true });

      expect(result).toContain('📝 No organizations found');
      expect(result).toContain('You may need to:');
      expect(result).toContain(
        '• Contact your administrator for organization access'
      );
      expect(result).toContain(
        '• Create an organization at: https://grata-labs.com/gitcache/account/'
      );

      registryClientSpy.mockRestore();
    });

    it('should handle --list-orgs when API fails', async () => {
      const registryClientSpy = vi
        .spyOn(setup as any, 'registryClient', 'get')
        .mockReturnValue({
          isAuthenticated: () => true,
          listOrganizations: () =>
            Promise.reject(new Error('Network connection failed')),
        });

      const result = await setup.exec([], { 'list-orgs': true });

      expect(result).toContain('❌ Failed to fetch organizations');
      expect(result).toContain('Error: Network connection failed');
      expect(result).toContain('Please verify:');
      expect(result).toContain('• Your authentication is valid');
      expect(result).toContain('• Network connectivity to GitCache');

      registryClientSpy.mockRestore();
    });

    it('should detect CI environment from GitHub Actions', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organization: 'testorg' }),
      });

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Connected to organization: testorg');
    });

    it('should detect CI environment from GitLab CI', async () => {
      delete process.env.GITHUB_ACTIONS;
      process.env.GITLAB_CI = 'true';
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organization: 'testorg' }),
      });

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Connected to organization: testorg');
    });

    it('should detect CI environment from CircleCI', async () => {
      delete process.env.GITHUB_ACTIONS;
      process.env.CIRCLECI = 'true';
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organization: 'testorg' }),
      });

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Connected to organization: testorg');
    });

    it('should detect generic CI environment', async () => {
      delete process.env.GITHUB_ACTIONS;
      process.env.CI = 'true';
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organization: 'testorg' }),
      });

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Connected to organization: testorg');
    });

    it('should force CI mode with --ci flag', async () => {
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organization: 'testorg' }),
      });

      const result = await setup.exec([], { org: 'testorg', ci: true });

      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Connected to organization: testorg');
    });

    it('should warn when token organization differs from provided org', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITCACHE_TOKEN = 'ci_test123';

      // Mock console.log to capture the warning message
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organization: 'token-org' }),
      });

      const result = await setup.exec([], { org: 'provided-org' });

      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Connected to organization: token-org');

      // Verify the warning message was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        '⚠️  Using organization from token: token-org (overrides --org provided-org)'
      );

      consoleSpy.mockRestore();
    });

    it('should handle auto-configuration when validation organization is falsey', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITCACHE_TOKEN = 'ci_test123';

      // Mock console.log to capture output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock validation response with no organization field
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }), // Missing organization field
      });

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ GitCache CI setup failed');
      expect(result).toContain(
        'Detected GitHub Actions environment but CI token is invalid'
      );
      expect(result).toContain('To enable GitCache acceleration:');
      expect(result).toContain(
        '1. Generate a CI token at: https://grata-labs.com/gitcache/account/dashboard/'
      );

      consoleSpy.mockRestore();
    });

    it('should handle auto-configuration when validateCIToken throws an error', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITCACHE_TOKEN = 'ci_test123';

      // Mock console.log to capture output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock fetch to throw an error (which gets caught by validateCIToken internally)
      mockFetch.mockRejectedValueOnce(new Error('Network connection failed'));

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ GitCache CI setup failed');
      expect(result).toContain(
        'Detected GitHub Actions environment but CI token is invalid'
      );
      expect(result).toContain('To enable GitCache acceleration:');
      expect(result).toContain(
        '1. Generate a CI token at: https://grata-labs.com/gitcache/account/dashboard/'
      );

      // Verify the error was logged (validateCIToken catches the error internally)
      expect(consoleSpy).toHaveBeenCalledWith(
        '❌ CI token validation failed: Network connection failed'
      );

      consoleSpy.mockRestore();
    });

    it('should handle auto-configuration when validateCIToken method throws an error', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITCACHE_TOKEN = 'ci_test123';

      // Mock console.log to capture output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock the validateCIToken method directly to throw an error
      const registryClientSpy = vi
        .spyOn(setup as any, 'registryClient', 'get')
        .mockReturnValue({
          validateCIToken: vi
            .fn()
            .mockRejectedValue(new Error('Unexpected error')),
        });

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ GitCache CI setup failed');
      expect(result).toContain(
        'Detected GitHub Actions environment but CI token is invalid'
      );
      expect(result).toContain('To enable GitCache acceleration:');
      expect(result).toContain(
        '1. Generate a CI token at: https://grata-labs.com/gitcache/account/dashboard/'
      );

      // Verify the error was logged from the catch block
      expect(consoleSpy).toHaveBeenCalledWith(
        '❌ Failed to validate CI token: Error: Unexpected error'
      );

      consoleSpy.mockRestore();
      registryClientSpy.mockRestore();
    });
  });

  describe('CI mode', () => {
    it('should fail when CI token is missing', async () => {
      // Mock local environment (not CI) for this specific test
      vi.mocked(ciEnvironment.detectCIEnvironment).mockReturnValueOnce({
        detected: false,
        platform: 'local environment',
        hasToken: false,
        tokenSource: 'none',
      });

      const result = await setup.exec([], { org: 'testorg', ci: true });

      expect(result).toContain('❌ GitCache CI token not found');
      expect(result).toContain(
        'Detected local environment environment but no GITCACHE_TOKEN found'
      );
    });

    it('should fail when CI token is missing with undefined platform', async () => {
      // Directly test setupCI with a ciEnv that has undefined platform
      const ciEnvWithNoPlatform = {
        detected: true,
        platform: undefined as any, // Force undefined platform
        hasToken: false,
        tokenSource: 'none' as const,
      };

      const result = await (setup as any).setupCI(
        'testorg',
        undefined,
        ciEnvWithNoPlatform
      );

      expect(result).toContain('❌ GitCache CI token not found');
      expect(result).toContain(
        'Detected CI environment but no GITCACHE_TOKEN found'
      );
      expect(result).toContain('To enable GitCache acceleration:');
      expect(result).toContain(
        '1. Generate a CI token at: https://grata-labs.com/gitcache/account/dashboard/'
      );
      expect(result).toContain(
        '2. Set GITCACHE_TOKEN environment variable in your CI configuration'
      );
      expect(result).toContain(
        'Your builds will continue using Git sources without acceleration.'
      );
    });

    it('should fail when CI token format is invalid', async () => {
      process.env.GITCACHE_TOKEN = 'invalid_token';

      const result = await setup.exec([], { org: 'testorg', ci: true });

      expect(result).toContain('❌ Invalid CI token format');
      expect(result).toContain('CI tokens must start with "ci_"');
    });

    it('should use explicit token parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organization: 'testorg' }),
      });

      const result = await setup.exec([], {
        org: 'testorg',
        ci: true,
        token: 'ci_explicit123',
      });

      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Connected to organization: testorg');
    });

    it('should handle API validation failure', async () => {
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid token' } }),
      });

      const result = await setup.exec([], { org: 'testorg', ci: true });

      expect(result).toContain('❌ GitCache CI token invalid or expired');
      expect(result).toContain('Invalid or expired CI token');
    });

    it('should handle network error in authenticateUser', async () => {
      // Test line 330: When fetch throws error in authenticateUser
      // Ensure we're not in CI mode
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITCACHE_TOKEN;

      const mockRl = {
        question: vi.fn().mockResolvedValueOnce('test@example.com'),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      vi.spyOn(setup as any, 'getPasswordInput').mockResolvedValueOnce(
        'testpassword'
      );

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ Setup failed');
      expect(result).toContain('Network error');
    });

    it('should handle CI tokens not yet implemented', async () => {
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Not found' } }),
      });

      const result = await setup.exec([], { org: 'testorg', ci: true });

      expect(result).toContain('❌ GitCache CI token invalid or expired');
      expect(result).toContain('Validation failed: HTTP 404');
    });

    it('should store CI token data', async () => {
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await setup.exec([], { org: 'testorg', ci: true });

      expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
        getExpectedAuthPath(),
        expect.stringContaining('"token": "ci_test123"'),
        'utf8'
      );
    });

    it('should handle CI token validation returning false', async () => {
      // Set up environment for CI token with proper format
      process.env.GITCACHE_TOKEN = 'ci_invalid123';

      // Mock a validation failure response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Token access denied' } }),
      });

      const result = await setup.exec([], { org: 'testorg', ci: true });

      expect(result).toContain('❌ GitCache CI token invalid or expired');
      expect(result).toContain('CI token access denied');
    });

    it('should execute successful CI validation flow to completion', async () => {
      // Set up environment for CI token with proper format
      process.env.GITCACHE_TOKEN = 'ci_valid123';

      // Mock successful validation response for the fetch call in validateCIToken
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ organization: 'testorg' }),
      });

      const result = await setup.exec([], { org: 'testorg', ci: true });

      // Verify the success messages are returned
      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Connected to organization: testorg');

      // Verify the auth data was stored
      expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
        getExpectedAuthPath(),
        expect.stringContaining('"token": "ci_valid123"'),
        'utf8'
      );
      expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
        getExpectedAuthPath(),
        expect.stringContaining('"tokenType": "ci"'),
        'utf8'
      );
    });

    it('should show info message when CI token organization differs from provided org', async () => {
      // Set up environment for CI token with proper format
      process.env.GITCACHE_TOKEN = 'ci_valid123';

      // Mock console.log to capture the info message
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock validation response with different organization
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ organization: 'token-org' }),
      });

      const result = await setup.exec([], { org: 'provided-org', ci: true });

      // Verify the success messages are returned
      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Connected to organization: token-org');

      // Verify the info message was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'ℹ️  Using organization from token: token-org'
      );

      consoleSpy.mockRestore();
    });

    it('should handle successful CI token validation with explicit token', async () => {
      // Mock successful validation response (200 OK)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      const result = await setup.exec([], {
        org: 'testorg',
        ci: true,
        token: 'ci_valid123',
      });

      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Registry acceleration enabled');
      expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
        getExpectedAuthPath(),
        expect.stringContaining('"token": "ci_valid123"'),
        'utf8'
      );
      expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
        getExpectedAuthPath(),
        expect.stringContaining('"tokenType": "ci"'),
        'utf8'
      );
    });

    it('should detect CI token in local environment and set platform to "CI with token"', async () => {
      // Clear all CI environment variables to ensure platform starts as 'local'
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;

      // Set only a CI token (no other CI environment indicators)
      process.env.GITCACHE_TOKEN = 'ci_test123';

      // Mock successful validation response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ organization: 'testorg' }),
      });

      const result = await setup.exec([], { org: 'testorg' });

      // Should detect CI mode due to the ci_ token and succeed
      expect(result).toContain('✓ CI token configured');
      expect(result).toContain('✓ Connected to organization: testorg');
    });

    it('should handle error in authenticateWithToken during CI setup', async () => {
      // Set up environment for CI token with proper format
      process.env.GITCACHE_TOKEN = 'ci_valid123';

      // Mock successful validation response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ organization: 'testorg' }),
      });

      // Mock writeFileSync to throw an error (simulating filesystem issues)
      vi.mocked(writeFileSync).mockImplementationOnce(() => {
        throw new Error('Permission denied: Unable to write auth file');
      });

      const result = await setup.exec([], { org: 'testorg', ci: true });

      // Verify the catch block error message is returned
      expect(result).toContain('❌ Failed to validate CI token');
      expect(result).toContain(
        'Error: Permission denied: Unable to write auth file'
      );
      expect(result).toContain('Please check:');
      expect(result).toContain('- Network connectivity to GitCache registry');
      expect(result).toContain('- Token validity and permissions');
      expect(result).toContain('- Organization access rights');
      expect(result).toContain('Your builds will continue using Git sources.');
    });
  });

  describe('Interactive mode', () => {
    it('should handle user authentication success with default organization', async () => {
      // Ensure we're not in CI mode
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITCACHE_TOKEN;

      const mockRl = {
        question: vi.fn().mockResolvedValueOnce('test@example.com'),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      // Mock password input
      vi.spyOn(setup as any, 'getPasswordInput').mockResolvedValueOnce(
        'testpassword'
      );

      // Mock console.log to capture org message
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Mock authentication API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'user_token123' }),
      });

      // Mock the registry client's listOrganizations method
      const registryClientSpy = vi
        .spyOn(setup as any, 'registryClient', 'get')
        .mockReturnValue({
          listOrganizations: () =>
            Promise.resolve({
              organizations: [
                { id: 'default-org', name: 'Default Org', isDefault: true },
              ],
              defaultOrganization: 'default-org',
            }),
        });

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('✓ Connected to GitCache registry');
      expect(result).toContain('✓ Team cache sharing enabled for default-org');
      expect(result).toContain(
        '• List organizations: gitcache setup --list-orgs'
      );

      // Verify that the default organization message was shown
      expect(consoleSpy).toHaveBeenCalledWith(
        '💡 Setting organization context to your default: default-org'
      );

      consoleSpy.mockRestore();
      registryClientSpy.mockRestore();
    });

    it('should handle authentication failure', async () => {
      // Ensure we're not in CI mode
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITCACHE_TOKEN;

      const mockRl = {
        question: vi.fn().mockResolvedValueOnce('test@example.com'),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      vi.spyOn(setup as any, 'getPasswordInput').mockResolvedValueOnce(
        'wrongpassword'
      );

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid credentials' } }),
      });

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ Setup failed');
      expect(result).toContain('Invalid credentials');
    });

    it('should handle missing email', async () => {
      // Ensure we're not in CI mode
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITCACHE_TOKEN;

      const mockRl = {
        question: vi.fn().mockResolvedValueOnce(''), // Empty email
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ Setup failed');
      expect(result).toContain('Email is required');
    });

    it('should handle user cancellation (Ctrl+C)', async () => {
      // Ensure we're not in CI mode
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITCACHE_TOKEN;

      const mockRl = {
        question: vi.fn().mockResolvedValueOnce('test@example.com'),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      vi.spyOn(setup as any, 'getPasswordInput').mockRejectedValueOnce(
        new Error('SIGINT')
      );

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ Setup cancelled by user');
    });

    it('should store user token data with expiration', async () => {
      // Ensure we're not in CI mode
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITCACHE_TOKEN;

      const mockRl = {
        question: vi.fn().mockResolvedValueOnce('test@example.com'),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      vi.spyOn(setup as any, 'getPasswordInput').mockResolvedValueOnce(
        'testpassword'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'user_token123' }),
      });

      const beforeTime = Date.now();
      await setup.exec([], { org: 'testorg' });
      const afterTime = Date.now();

      expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
        getExpectedAuthPath(),
        expect.stringContaining('"tokenType": "user"'),
        'utf8'
      );

      const writtenData = JSON.parse(
        vi.mocked(writeFileSync).mock.calls[0][1] as string
      );
      expect(writtenData.expiresAt).toBeGreaterThan(
        beforeTime + 29 * 24 * 60 * 60 * 1000
      ); // ~30 days
      expect(writtenData.expiresAt).toBeLessThan(
        afterTime + 31 * 24 * 60 * 60 * 1000
      );
    });

    it('should block interactive setup when in CI environment', async () => {
      // Directly test the setupInteractive method when isInCI() returns true
      // We'll mock the isInCI function to return true to test this specific code path

      // First, clear all environment variables to ensure we start clean
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_HOME;
      delete process.env.GITCACHE_TOKEN;

      // Mock the isInCI function to return true for this test
      const isInCISpy = vi.spyOn(
        await import('../../lib/ci-environment.js'),
        'isInCI'
      );
      isInCISpy.mockReturnValueOnce(true);

      // Call setupInteractive directly to test the isInCI() check
      const result = await (setup as any).setupInteractive('testorg');

      expect(result).toContain('❌ Interactive setup not available in CI');
      expect(result).toContain(
        'Detected CI environment. Use CI token authentication instead:'
      );
      expect(result).toContain(
        '1. Generate a CI token at: https://grata-labs.com/gitcache/account/dashboard/'
      );
      expect(result).toContain('2. Set GITCACHE_TOKEN environment variable');
      expect(result).toContain(
        '3. Run: gitcache setup --org <organization> --ci'
      );
      expect(result).toContain('Your builds will continue using Git sources.');

      isInCISpy.mockRestore();
    });

    it('should allow interactive setup when not in CI environment', async () => {
      // Ensure we're not in CI mode by clearing all CI environment variables
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.GITCACHE_TOKEN;

      const mockRl = {
        question: vi.fn().mockResolvedValueOnce('test@example.com'),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      // Mock password input
      vi.spyOn(setup as any, 'getPasswordInput').mockResolvedValueOnce(
        'testpassword'
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'user_token123' }),
      });

      const result = await setup.exec([], { org: 'testorg' });

      // Should proceed with interactive setup and succeed
      expect(result).toContain('✓ Connected to GitCache registry');
      expect(result).toContain('✓ Team cache sharing enabled for testorg');
      expect(result).not.toContain('❌ Interactive setup not available in CI');
    });
  });

  describe('getPasswordInput', () => {
    it('should handle password input with suppressed output', async () => {
      const passwordPromise = (setup as any).getPasswordInput();

      // Simulate typing password
      const onData = mockStdin.on.mock.calls.find(
        (call: any) => call[0] === 'data'
      )[1];

      onData('pass');
      onData('\r'); // Enter key (carriage return)

      const password = await passwordPromise;
      expect(password).toBe('pass');

      // The new implementation suppresses output, so no asterisks are written
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
      expect(mockStdin.setEncoding).toHaveBeenCalledWith('utf8');
    });

    it('should handle backspace in password input', async () => {
      const passwordPromise = (setup as any).getPasswordInput();

      const onData = mockStdin.on.mock.calls.find(
        (call: any) => call[0] === 'data'
      )[1];

      onData('pa');
      onData('\u007f'); // Backspace
      onData('s');
      onData('\r'); // Enter key

      const password = await passwordPromise;
      expect(password).toBe('ps');
    });

    it('should handle Ctrl+C in password input', async () => {
      const passwordPromise = (setup as any).getPasswordInput();

      const onData = mockStdin.on.mock.calls.find(
        (call: any) => call[0] === 'data'
      )[1];

      onData('\u0003'); // Ctrl+C

      await expect(passwordPromise).rejects.toThrow('SIGINT');
    });

    it('should handle non-TTY password input', async () => {
      // Mock non-TTY environment
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
      });

      const passwordPromise = (setup as any).getPasswordInput();

      // Simulate data and end events for non-TTY stdin
      const onData = mockStdin.on.mock.calls.find(
        (call: any) => call[0] === 'data'
      )[1];
      const onEnd = mockStdin.on.mock.calls.find(
        (call: any) => call[0] === 'end'
      )[1];

      onData('test-password\n');
      onEnd();

      const password = await passwordPromise;
      expect(password).toBe('test-password');

      // Should set encoding but not use raw mode for non-TTY
      expect(mockStdin.setEncoding).toHaveBeenCalledWith('utf8');
      expect(mockStdin.setRawMode).not.toHaveBeenCalled();
    });

    it('should suppress stdout.write output during TTY password input', async () => {
      let actualOutput: string[] = [];

      // Store original write function
      const originalWrite = process.stdout.write;

      // Create a test write function that tracks what would be written
      const testWrite = (chunk: string | Uint8Array): boolean => {
        if (typeof chunk === 'string') {
          actualOutput.push(chunk);
        }
        return true; // Simulate successful write
      };

      // Replace stdout.write temporarily
      process.stdout.write = testWrite as any;

      const passwordPromise = (setup as any).getPasswordInput();

      // Get the data handler
      const onData = mockStdin.on.mock.calls.find(
        (call: any) => call[0] === 'data'
      )[1];

      // Now, getPasswordInput should have overridden stdout.write
      // Test the suppression by calling the overridden function directly
      const overriddenWrite = process.stdout.write;

      // Test suppression of string chunks (should be suppressed)
      const suppressResult = overriddenWrite('user-input-character');

      // Complete password input
      onData('test');
      onData('\r');

      const password = await passwordPromise;
      expect(password).toBe('test');

      // Verify that stdout.write was overridden and suppression worked
      expect(suppressResult).toBe(true); // Returns true but doesn't actually write

      // The suppressed output should not appear in actualOutput
      // because the override function returns true without calling originalWrite for strings
      expect(actualOutput).not.toContain('user-input-character');

      // Restore original write function
      process.stdout.write = originalWrite;
    });

    it('should restore stdout.write function after password input completion', async () => {
      const originalWrite = process.stdout.write;

      const passwordPromise = (setup as any).getPasswordInput();

      // Get the data handler
      const onData = mockStdin.on.mock.calls.find(
        (call: any) => call[0] === 'data'
      )[1];

      // Complete password input
      onData('test');
      onData('\r');

      await passwordPromise;

      // Verify that stdout.write was restored to original function
      expect(process.stdout.write).toBe(originalWrite);
    });

    it('should pass through non-string chunks and non-intercepted writes to original stdout.write', async () => {
      let nonStringPassedThrough = false;
      let afterCleanupPassedThrough = false;

      // Mock original write to track calls
      const originalWrite = process.stdout.write;
      process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
        if (chunk instanceof Uint8Array) {
          nonStringPassedThrough = true;
        } else if (typeof chunk === 'string' && chunk === 'after-cleanup') {
          afterCleanupPassedThrough = true;
        }
        return true;
      });

      const passwordPromise = (setup as any).getPasswordInput();

      // Test non-string chunk (should pass through)
      const overriddenWrite = process.stdout.write;
      overriddenWrite(new Uint8Array([65, 66, 67])); // 'ABC' as bytes

      // Get the data handler and complete password input
      const onData = mockStdin.on.mock.calls.find(
        (call: any) => call[0] === 'data'
      )[1];

      onData('test');
      onData('\r');

      await passwordPromise;

      // Test write after cleanup (intercepting should be false)
      process.stdout.write('after-cleanup');

      // Verify both code paths were exercised
      expect(nonStringPassedThrough).toBe(true);
      expect(afterCleanupPassedThrough).toBe(true);

      // Restore original
      process.stdout.write = originalWrite;
    });
  });

  describe('File system operations', () => {
    it('should create cache directory if it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await setup.exec([], { org: 'testorg', ci: true });

      expect(vi.mocked(mkdirSync)).toHaveBeenCalledWith(getExpectedCacheDir(), {
        recursive: true,
      });
    });
  });

  describe('API URL configuration', () => {
    it('should use default API URL when environment variable is not set', async () => {
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await setup.exec([], { org: 'testorg', ci: true });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.grata-labs.com/api/auth/validate-token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer ci_test123',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ token: 'ci_test123' }),
        })
      );
    });

    it('should use custom API URL from environment variable', async () => {
      process.env.GITCACHE_API_URL = 'https://custom-api.example.com';
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organization: 'testorg' }),
      });

      await setup.exec([], { org: 'testorg', ci: true });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-api.example.com/api/auth/validate-token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer ci_test123',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ token: 'ci_test123' }),
        })
      );
    });
  });

  describe('Branch coverage for uncovered lines', () => {
    it('should handle non-implementation error with different error format in CI setup', async () => {
      // Test error handling when network request fails
      process.env.GITCACHE_TOKEN = 'ci_test123';

      // Mock fetch to throw a network error
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await setup.exec([], { org: 'testorg', ci: true });

      expect(result).toContain('❌ GitCache CI token invalid or expired');
      expect(result).toContain('Network timeout');
    });

    it('should handle non-SIGINT error in interactive setup', async () => {
      // Test line 228: Error handling in setupInteractive for general errors (not SIGINT)
      // Ensure we're not in CI mode
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITCACHE_TOKEN;

      const mockRl = {
        question: vi.fn().mockRejectedValue(new Error('Connection refused')),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ Setup failed');
      expect(result).toContain('Connection refused');
      expect(result).toContain('Please verify:');
      expect(result).toContain('- Email and password are correct');
    });

    it('should handle JSON parsing error in validateCIToken', async () => {
      // Test when response.json() fails and returns default error
      process.env.GITCACHE_TOKEN = 'ci_test123';

      // Mock a response that is not ok and json() returns a promise that rejects
      const mockJsonFn = vi.fn().mockRejectedValue(new Error('Invalid JSON'));
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: mockJsonFn,
      });

      const result = await setup.exec([], { org: 'testorg', ci: true });

      expect(result).toContain('❌ GitCache CI token invalid or expired');
      expect(result).toContain('Validation failed: HTTP 500');
    });

    it('should handle validateCIToken with empty error object', async () => {
      // Test the case where error.error?.message is falsy
      process.env.GITCACHE_TOKEN = 'ci_test123';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          /* no error field */
        }),
      });

      const result = await setup.exec([], { org: 'testorg', ci: true });

      expect(result).toContain('❌ GitCache CI token invalid or expired');
      expect(result).toContain('CI token access denied');
    });

    it('should handle JSON parsing error in authenticateUser', async () => {
      // Test line 328: When response.json() fails in authenticateUser and returns default error
      // Ensure we're not in CI mode
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITCACHE_TOKEN;

      const mockRl = {
        question: vi.fn().mockResolvedValueOnce('test@example.com'),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      vi.spyOn(setup as any, 'getPasswordInput').mockResolvedValueOnce(
        'testpassword'
      );

      // Mock a response that is not ok and json() returns a promise that rejects
      const mockJsonFn = vi.fn().mockRejectedValue(new Error('Invalid JSON'));
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: mockJsonFn,
      });

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ Setup failed');
      expect(result).toContain('Authentication failed');
      expect(mockJsonFn).toHaveBeenCalled();
    });

    it('should handle authenticateUser with empty error object', async () => {
      // Clear CI environment variables to ensure interactive mode
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITCACHE_TOKEN;

      // Test line 328: error.error?.message || 'Invalid credentials'
      // This tests the case where error.error?.message is falsy
      const mockRl = {
        question: vi.fn().mockResolvedValueOnce('test@example.com'),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      vi.spyOn(setup as any, 'getPasswordInput').mockResolvedValueOnce(
        'testpassword'
      );

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          /* no error field */
        }),
      });

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ Setup failed');
      expect(result).toContain('Invalid credentials');
    });

    it('should handle non-Error thrown in setupCI (line 166)', async () => {
      // Test error handling when fetch throws a non-Error object
      process.env.GITCACHE_TOKEN = 'ci_test123';

      // Mock fetch to throw a non-Error object
      mockFetch.mockRejectedValueOnce('String error');

      const result = await setup.exec([], { org: 'testorg', ci: true });

      expect(result).toContain('❌ GitCache CI token invalid or expired');
      expect(result).toContain('Network error during validation');
    });

    it('should handle non-Error thrown in setupInteractive (line 228)', async () => {
      // Test line 228: error instanceof Error ? error.message : 'Unknown error'
      // Ensure we're not in CI mode
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITCACHE_TOKEN;

      const mockRl = {
        question: vi.fn().mockResolvedValueOnce('test@example.com'),
        close: vi.fn(),
      };
      vi.mocked(readline.createInterface).mockReturnValueOnce(mockRl as any);

      // Mock getPasswordInput to throw a non-Error object
      vi.spyOn(setup as any, 'getPasswordInput').mockRejectedValue(
        'String error'
      );

      const result = await setup.exec([], { org: 'testorg' });

      expect(result).toContain('❌ Setup failed');
      expect(result).toContain('Unknown error');
    });
  });

  describe('Static properties', () => {
    it('should have correct command metadata', () => {
      expect(Setup.description).toBe(
        'Setup GitCache registry access for team acceleration'
      );
      expect(Setup.commandName).toBe('setup');
      expect(Setup.params).toEqual(['org', 'ci', 'token', 'list-orgs']);
      expect(Setup.argumentSpec).toEqual({ type: 'none' });
      expect(Setup.usage).toEqual([
        '--org <organization>',
        '--ci --org <organization>',
        '--ci --org <organization> --token <ci-token>',
        '--list-orgs',
      ]);
    });
  });
});
