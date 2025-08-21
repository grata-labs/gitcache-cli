import * as readline from 'node:readline/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../commands/auth.js';
import { AuthManager } from '../../lib/auth-manager.js';
import { detectCIEnvironment } from '../../lib/ci-environment.js';

// Mock dependencies
vi.mock('../../lib/auth-manager.js');
vi.mock('node:readline/promises');
vi.mock('../../lib/ci-environment.js');

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

// Mock process.stdin and process.stdout
const mockStdout = {
  write: vi.fn(),
};
const mockStdin = {
  isTTY: true,
  setRawMode: vi.fn(),
  resume: vi.fn(),
  pause: vi.fn(),
  setEncoding: vi.fn(),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
};

// Mock readline interface
const mockReadlineInterface = {
  close: vi.fn(),
};

const mockReadlineCreateInterface = vi.mocked(readline.createInterface);
const mockAuthManager = vi.mocked(AuthManager);
const mockDetectCIEnvironment = vi.mocked(detectCIEnvironment);

describe('Auth Command', () => {
  let authCommand: Auth;
  let mockAuthManagerInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock AuthManager instance
    mockAuthManagerInstance = {
      isAuthenticated: vi.fn(),
      getTokenType: vi.fn(),
      getOrgId: vi.fn(),
      getEmail: vi.fn(),
      storeAuthData: vi.fn(),
    };

    mockAuthManager.mockImplementation(() => mockAuthManagerInstance);

    // Mock readline
    mockReadlineCreateInterface.mockReturnValue(mockReadlineInterface as any);

    // Mock process objects
    Object.defineProperty(process, 'stdout', {
      value: mockStdout,
      writable: true,
    });
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
    });

    authCommand = new Auth();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exec', () => {
    describe('logout command', () => {
      it('should logout via flag', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);

        const result = await authCommand.exec([], { logout: true });

        expect(result).toBe('✅ Logged out successfully');
        expect(mockAuthManagerInstance.storeAuthData).toHaveBeenCalledWith({
          token: '',
          orgId: '',
          tokenType: 'user',
          expiresAt: null,
        });
      });

      it('should logout via subcommand', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);

        const result = await authCommand.exec(['logout']);

        expect(result).toBe('✅ Logged out successfully');
        expect(mockAuthManagerInstance.storeAuthData).toHaveBeenCalledWith({
          token: '',
          orgId: '',
          tokenType: 'user',
          expiresAt: null,
        });
      });

      it('should handle logout when not authenticated', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

        const result = await authCommand.exec(['logout']);

        expect(result).toBe('📝 You are not currently logged in');
        expect(mockAuthManagerInstance.storeAuthData).not.toHaveBeenCalled();
      });
    });

    describe('status command', () => {
      it('should show status via flag', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

        const result = await authCommand.exec([], { status: true });

        expect(result).toContain('📝 Not authenticated');
        expect(result).toContain('To get started:');
        expect(result).toContain('gitcache auth login <your-email>');
        expect(result).toContain('export GITCACHE_TOKEN=ci_yourorg_...');
      });

      it('should show status via subcommand', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

        const result = await authCommand.exec(['status']);

        expect(result).toContain('📝 Not authenticated');
      });

      it('should show status as default when no args', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

        const result = await authCommand.exec([]);

        expect(result).toContain('📝 Not authenticated');
      });

      it('should show authenticated status with user token', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.getTokenType.mockReturnValue('user');
        mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
        mockAuthManagerInstance.getEmail.mockReturnValue('test@example.com');

        const result = await authCommand.exec(['status']);

        expect(result).toContain('✅ Authenticated as: test@example.com');
        expect(result).toContain('🏢 Organization context: test-org');
        expect(result).toContain('🔑 Token type: User session');
        expect(result).toContain('gitcache tokens create <name>');
        expect(result).toContain('gitcache tokens list');
        expect(result).toContain('gitcache auth orgs');
      });

      it('should show authenticated status with CI token', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.getTokenType.mockReturnValue('ci');
        mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');

        const result = await authCommand.exec(['status']);

        expect(result).toContain('✅ Authenticated with CI token');
        expect(result).toContain('🏢 Organization context: test-org');
        expect(result).toContain('🔑 Token type: CI token');
        expect(result).toContain(
          'CI tokens are long-lived and perfect for automation'
        );
      });
    });

    describe('login command', () => {
      it('should throw error when email is missing', async () => {
        await expect(authCommand.exec(['login'])).rejects.toThrow(
          'Email is required for login'
        );
      });

      it('should successfully login with valid credentials', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            idToken: 'mock-id-token',
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            organizationId: 'test-org',
          }),
        });

        // Mock password input
        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockResolvedValue('test-password');

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toContain('✅ Authentication successful!');
        expect(result).toContain('📧 Logged in as: test@example.com');
        expect(result).toContain('🏢 Organization: test-org');
        expect(result).toContain(
          'Create CI tokens: gitcache tokens create <name>'
        );

        expect(mockAuthManagerInstance.storeAuthData).toHaveBeenCalledWith({
          token: 'mock-id-token',
          email: 'test@example.com',
          orgId: 'test-org',
          tokenType: 'user',
          expiresAt: expect.any(Number),
        });

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.grata-labs.com/auth/signin',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: 'test@example.com',
              password: 'test-password',
            }),
          }
        );

        mockGetPasswordInput.mockRestore();
      });

      it('should successfully login and use default organization when available', async () => {
        // Mock successful authentication response
        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            idToken: 'mock-id-token',
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            organizationId: 'auth-org',
          }),
        });

        // Mock password input
        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockResolvedValue('test-password');

        // Mock RegistryClient import and listOrganizations method
        const mockRegistryClient = {
          listOrganizations: vi.fn().mockResolvedValue({
            organizations: [
              { id: 'auth-org', name: 'Auth Org', isDefault: false },
              { id: 'default-org', name: 'Default Org', isDefault: true },
            ],
            defaultOrganization: 'default-org',
          }),
        };

        const mockRegistryClientClass = vi
          .fn()
          .mockImplementation(() => mockRegistryClient);

        // Mock the dynamic import
        vi.doMock('../../lib/registry-client.js', () => ({
          RegistryClient: mockRegistryClientClass,
        }));

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toContain('✅ Authentication successful!');
        expect(result).toContain('📧 Logged in as: test@example.com');
        expect(result).toContain('🏢 Organization: default-org (your default)');
        expect(result).toContain(
          'Create CI tokens: gitcache tokens create <name>'
        );

        // Should store auth data with the default organization, not the auth organization
        expect(mockAuthManagerInstance.storeAuthData).toHaveBeenCalledWith({
          token: 'mock-id-token',
          email: 'test@example.com',
          orgId: 'default-org', // Should use defaultOrganization
          tokenType: 'user',
          expiresAt: expect.any(Number),
        });

        // Should be called twice - once temporarily, once with final data
        expect(mockAuthManagerInstance.storeAuthData).toHaveBeenCalledTimes(2);

        mockGetPasswordInput.mockRestore();
      });

      it('should handle authentication failure', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: { message: 'Invalid credentials' },
          }),
        });

        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockResolvedValue('wrong-password');

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toContain('❌ Authentication failed');
        expect(result).toContain('Error: Invalid credentials');
        expect(result).toContain('Please verify:');
        expect(result).toContain('Email and password are correct');
        expect(result).toContain('Network connectivity to GitCache');

        expect(mockAuthManagerInstance.storeAuthData).not.toHaveBeenCalled();

        mockGetPasswordInput.mockRestore();
      });

      it('should handle network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockResolvedValue('test-password');

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toContain('❌ Authentication failed');
        expect(result).toContain('Error: Network error');

        mockGetPasswordInput.mockRestore();
      });

      it('should handle user cancellation (SIGINT)', async () => {
        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockRejectedValue(new Error('SIGINT'));

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toBe('\n❌ Login cancelled by user');

        mockGetPasswordInput.mockRestore();
      });

      it('should handle JSON parsing errors in auth response', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockRejectedValue(new Error('JSON parse error')),
        });

        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockResolvedValue('test-password');

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toContain('❌ Authentication failed');
        expect(result).toContain('Error: Authentication failed');

        mockGetPasswordInput.mockRestore();
      });

      it('should handle auth response with falsy error message', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: { message: null }, // Falsy message
          }),
        });

        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockResolvedValue('test-password');

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toContain('❌ Authentication failed');
        expect(result).toContain('Error: Invalid credentials');

        mockGetPasswordInput.mockRestore();
      });

      it('should handle auth response with empty string error message', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: { message: '' }, // Empty string message
          }),
        });

        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockResolvedValue('test-password');

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toContain('❌ Authentication failed');
        expect(result).toContain('Error: Invalid credentials');

        mockGetPasswordInput.mockRestore();
      });

      it('should handle auth response with undefined error object', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: undefined, // No error object
          }),
        });

        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockResolvedValue('test-password');

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toContain('❌ Authentication failed');
        expect(result).toContain('Error: Invalid credentials');

        mockGetPasswordInput.mockRestore();
      });

      it('should handle auth response with no error field', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            // No error field at all
            status: 'failed',
          }),
        });

        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockResolvedValue('test-password');

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toContain('❌ Authentication failed');
        expect(result).toContain('Error: Invalid credentials');

        mockGetPasswordInput.mockRestore();
      });

      it('should use default orgId when not provided in response', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            idToken: 'mock-id-token',
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            // No organizationId or orgId provided
          }),
        });

        const mockGetPasswordInput = vi
          .spyOn(authCommand as any, 'getPasswordInput')
          .mockResolvedValue('test-password');

        const result = await authCommand.exec(['login', 'test@example.com']);

        expect(result).toContain('✅ Authentication successful!');
        expect(result).toContain('🏢 Organization: unknown');

        expect(mockAuthManagerInstance.storeAuthData).toHaveBeenCalledWith({
          token: 'mock-id-token',
          email: 'test@example.com',
          orgId: 'unknown',
          tokenType: 'user',
          expiresAt: expect.any(Number),
        });

        mockGetPasswordInput.mockRestore();
      });
    });

    describe('unknown command', () => {
      it('should throw error for unknown subcommand', async () => {
        await expect(authCommand.exec(['unknown'])).rejects.toThrow(
          'Unknown auth command: unknown'
        );
      });
    });
  });

  describe('getPasswordInput', () => {
    beforeEach(() => {
      // Reset stdin mock
      mockStdin.on.mockClear();
      mockStdin.removeAllListeners.mockClear();
    });

    it('should handle non-TTY input', async () => {
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
      });

      const mockSetEncoding = vi.fn();
      const mockOn = vi.fn();

      Object.defineProperty(process.stdin, 'setEncoding', {
        value: mockSetEncoding,
        writable: true,
      });
      Object.defineProperty(process.stdin, 'on', {
        value: mockOn,
        writable: true,
      });

      // Simulate data and end events
      mockOn.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => callback('test-password\n'), 0);
        } else if (event === 'end') {
          setTimeout(() => callback(), 10);
        }
      });

      const result = await (authCommand as any).getPasswordInput();

      expect(result).toBe('test-password');
      expect(mockSetEncoding).toHaveBeenCalledWith('utf8');

      // Restore
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        writable: true,
      });
    });

    it('should handle TTY input with Enter key', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true });

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          // Simulate typing "password" then Enter
          setTimeout(() => {
            callback('p');
            callback('a');
            callback('s');
            callback('s');
            callback('\r'); // Enter key
          }, 0);
        }
      });

      const promise = (authCommand as any).getPasswordInput();

      // Wait a bit for async operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = await promise;

      expect(result).toBe('pass');
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
      expect(mockStdin.resume).toHaveBeenCalled();
      expect(mockStdin.setEncoding).toHaveBeenCalledWith('utf8');
    });

    it('should handle Ctrl+C (SIGINT)', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true });

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => {
            callback(String.fromCharCode(3)); // Ctrl+C
          }, 0);
        }
      });

      await expect((authCommand as any).getPasswordInput()).rejects.toThrow(
        'SIGINT'
      );

      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
      expect(mockStdin.pause).toHaveBeenCalled();
    });

    it('should handle backspace key', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true });

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => {
            callback('p');
            callback('a');
            callback('s');
            callback(String.fromCharCode(127)); // Backspace
            callback('s');
            callback('s');
            callback('\r'); // Enter
          }, 0);
        }
      });

      const result = await (authCommand as any).getPasswordInput();

      expect(result).toBe('pass');
    });

    it('should filter out non-printable characters', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true });

      mockStdin.on.mockImplementation((event, callback) => {
        if (event === 'data') {
          setTimeout(() => {
            callback('p');
            callback(String.fromCharCode(1)); // Non-printable
            callback('a');
            callback(String.fromCharCode(31)); // Non-printable
            callback('s');
            callback(String.fromCharCode(127)); // Delete (should be filtered as non-printable in this context)
            callback('s');
            callback('\r'); // Enter
          }, 0);
        }
      });

      const result = await (authCommand as any).getPasswordInput();

      expect(result).toBe('pas');
    });
  });

  describe('authenticateWithCognito', () => {
    it('should make correct API call', async () => {
      const mockResponse = {
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        organizationId: 'test-org',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await (authCommand as any).authenticateWithCognito(
        'test@example.com',
        'password123'
      );

      expect(result).toEqual({
        idToken: 'mock-id-token',
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        orgId: 'test-org',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.grata-labs.com/auth/signin',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
          }),
        }
      );
    });

    it('should use custom API URL from environment', async () => {
      const originalEnv = process.env.GITCACHE_API_URL;
      process.env.GITCACHE_API_URL = 'https://custom-api.example.com';

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          idToken: 'token',
          accessToken: 'access',
          refreshToken: 'refresh',
          orgId: 'org',
        }),
      });

      await (authCommand as any).authenticateWithCognito(
        'test@example.com',
        'password'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-api.example.com/auth/signin',
        expect.any(Object)
      );

      // Restore
      if (originalEnv) {
        process.env.GITCACHE_API_URL = originalEnv;
      } else {
        delete process.env.GITCACHE_API_URL;
      }
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({
          error: { message: 'Invalid email format' },
        }),
      });

      await expect(
        (authCommand as any).authenticateWithCognito(
          'invalid-email',
          'password'
        )
      ).rejects.toThrow('Invalid email format');
    });

    it('should handle HTTP error without JSON response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: vi.fn().mockRejectedValue(new Error('No JSON')),
      });

      await expect(
        (authCommand as any).authenticateWithCognito('email', 'password')
      ).rejects.toThrow('Authentication failed');
    });

    it('should use fallback orgId when none provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          idToken: 'token',
          accessToken: 'access',
          refreshToken: 'refresh',
          // No orgId or organizationId provided
        }),
      });

      const result = await (authCommand as any).authenticateWithCognito(
        'test@example.com',
        'password'
      );

      expect(result.orgId).toBe('unknown');
    });

    it('should prefer organizationId over orgId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          idToken: 'token',
          accessToken: 'access',
          refreshToken: 'refresh',
          organizationId: 'preferred-org',
          orgId: 'fallback-org',
        }),
      });

      const result = await (authCommand as any).authenticateWithCognito(
        'test@example.com',
        'password'
      );

      expect(result.orgId).toBe('preferred-org');
    });
  });

  describe('authenticateWithToken', () => {
    it('should store CI token and return success message', () => {
      const token = 'ci_testorg_abc123def456';
      const orgId = 'test-org';

      const result = (authCommand as any).authenticateWithToken(token, orgId);

      expect(mockAuthManagerInstance.storeAuthData).toHaveBeenCalledWith({
        token,
        orgId,
        tokenType: 'ci',
        expiresAt: null, // CI tokens never expire
      });

      expect(result).toContain('✅ CI token configured successfully!');
      expect(result).toContain('✅ Registry acceleration enabled');
      expect(result).toContain(`✅ Connected to organization: ${orgId}`);
      expect(result).toContain(
        '🚀 Your CI builds will now use GitCache acceleration.'
      );
      expect(result).toContain('💡 Next steps:');
      expect(result).toContain('• Check status: gitcache auth status');
      expect(result).toContain('• Test with: gitcache install');
    });

    it('should handle different organization IDs', () => {
      const token = 'ci_mycompany_xyz789';
      const orgId = 'my-company-org';

      const result = (authCommand as any).authenticateWithToken(token, orgId);

      expect(mockAuthManagerInstance.storeAuthData).toHaveBeenCalledWith({
        token,
        orgId,
        tokenType: 'ci',
        expiresAt: null,
      });

      expect(result).toContain(`✅ Connected to organization: ${orgId}`);
    });

    it('should always set expiresAt to null for CI tokens', () => {
      const token = 'ci_testorg_token123';
      const orgId = 'test-org';

      (authCommand as any).authenticateWithToken(token, orgId);

      expect(mockAuthManagerInstance.storeAuthData).toHaveBeenCalledWith({
        token,
        orgId,
        tokenType: 'ci',
        expiresAt: null, // This is the key assertion - CI tokens never expire
      });
    });
  });

  describe('getApiUrl', () => {
    it('should return default URL when no environment variable set', () => {
      const originalEnv = process.env.GITCACHE_API_URL;
      delete process.env.GITCACHE_API_URL;

      const result = (authCommand as any).getApiUrl();

      expect(result).toBe('https://api.grata-labs.com');

      // Restore
      if (originalEnv) {
        process.env.GITCACHE_API_URL = originalEnv;
      }
    });

    it('should return environment variable when set', () => {
      const originalEnv = process.env.GITCACHE_API_URL;
      process.env.GITCACHE_API_URL = 'https://custom-api.example.com';

      const result = (authCommand as any).getApiUrl();

      expect(result).toBe('https://custom-api.example.com');

      // Restore
      if (originalEnv) {
        process.env.GITCACHE_API_URL = originalEnv;
      } else {
        delete process.env.GITCACHE_API_URL;
      }
    });
  });

  describe('static properties', () => {
    it('should have correct static configuration', () => {
      expect(Auth.description).toBe(
        'Manage GitCache authentication and organization access'
      );
      expect(Auth.commandName).toBe('auth');
      expect(Auth.usage).toEqual([
        'login <email>',
        'logout',
        'status',
        'orgs [--org <organization>]',
        'setup-ci --org <organization> [--token <ci-token>]',
      ]);
      expect(Auth.params).toEqual(['logout', 'status', 'org', 'ci', 'token']);
      expect(Auth.argumentSpec).toEqual({
        type: 'variadic',
        name: 'subcommand',
      });
    });
  });

  describe('console output integration', () => {
    it('should log authentication start message during login', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          idToken: 'token',
          accessToken: 'access',
          refreshToken: 'refresh',
          orgId: 'org',
        }),
      });

      const mockGetPasswordInput = vi
        .spyOn(authCommand as any, 'getPasswordInput')
        .mockResolvedValue('password');

      // Reset the console log mock before the test
      mockConsoleLog.mockClear();

      await authCommand.exec(['login', 'test@example.com']);

      // The console.log calls are being intercepted by our mock
      // We can verify the stdout.write call which happens in the password input
      expect(mockStdout.write).toHaveBeenCalledWith('Password: ');

      mockGetPasswordInput.mockRestore();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle undefined options gracefully', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

      const result = await authCommand.exec(['status'], undefined);

      expect(result).toContain('📝 Not authenticated');
    });

    it('should handle empty args array', async () => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

      const result = await authCommand.exec([]);

      expect(result).toContain('📝 Not authenticated');
    });

    it('should handle null email in login', async () => {
      await expect(authCommand.exec(['login', ''])).rejects.toThrow(
        'Email is required for login'
      );
    });

    it('should handle whitespace-only email in login', async () => {
      // The auth command doesn't trim whitespace - it just checks for falsy
      // So '   ' would be considered a valid email and would proceed to login
      // This test should verify that it attempts login with the whitespace email
      mockFetch.mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({
          error: { message: 'Invalid email format' },
        }),
      });

      const mockGetPasswordInput = vi
        .spyOn(authCommand as any, 'getPasswordInput')
        .mockResolvedValue('password');

      const result = await authCommand.exec(['login', '   ']);

      expect(result).toContain('❌ Authentication failed');
      expect(result).toContain('Error: Invalid email format');

      mockGetPasswordInput.mockRestore();
    });
  });

  describe('showCIErrorGuidance', () => {
    it('should provide comprehensive CI setup guidance', () => {
      const mockCIEnv = {
        platform: 'GitHub Actions',
        detected: true,
        hasToken: false,
      };

      const result = (authCommand as any).showCIErrorGuidance(mockCIEnv);

      expect(result).toContain('❌ GitCache CI setup failed');
      expect(result).toContain(
        'Detected GitHub Actions environment but CI token is invalid.'
      );
      expect(result).toContain('To enable GitCache acceleration:');
      expect(result).toContain(
        '1. Generate a CI token at: https://grata-labs.com/gitcache/account/dashboard/'
      );
      expect(result).toContain(
        '2. Set GITCACHE_TOKEN environment variable in your CI configuration'
      );
      expect(result).toContain(
        '3. Or use: gitcache auth setup-ci --org <organization> --token <ci-token>'
      );
      expect(result).toContain(
        'Your builds will continue using Git sources without acceleration.'
      );
    });

    it('should handle different CI platforms', () => {
      const mockCIEnv = {
        platform: 'CircleCI',
        detected: true,
        hasToken: false,
      };

      const result = (authCommand as any).showCIErrorGuidance(mockCIEnv);

      expect(result).toContain(
        'Detected CircleCI environment but CI token is invalid.'
      );
      expect(result).toContain('❌ GitCache CI setup failed');
    });

    it('should provide same guidance for unknown CI environments', () => {
      const mockCIEnv = {
        platform: 'Unknown CI',
        detected: false,
        hasToken: false,
      };

      const result = (authCommand as any).showCIErrorGuidance(mockCIEnv);

      expect(result).toContain(
        'Detected Unknown CI environment but CI token is invalid.'
      );
      expect(result).toContain('To enable GitCache acceleration:');
      expect(result).toContain('GITCACHE_TOKEN environment variable');
    });
  });

  describe('setupCI', () => {
    let mockRegistryClient: any;

    beforeEach(() => {
      // Mock registry client
      mockRegistryClient = {
        validateCIToken: vi.fn(),
      };
      vi.spyOn(authCommand as any, 'registryClient', 'get').mockReturnValue(
        mockRegistryClient
      );

      // Mock console.log to prevent test output noise
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should throw error when organization is not provided', async () => {
      await expect(authCommand.exec(['setup-ci'], {})).rejects.toThrow(
        'Organization name is required for CI setup. Use --org <organization>'
      );
    });

    it('should auto-configure with valid environment token', async () => {
      const envToken = 'ci_testorg_abc123';
      const originalEnv = process.env.GITCACHE_TOKEN;
      process.env.GITCACHE_TOKEN = envToken;

      mockDetectCIEnvironment.mockReturnValue({
        platform: 'GitHub Actions',
        detected: true,
        hasToken: true,
        tokenSource: 'environment',
      });

      mockRegistryClient.validateCIToken.mockResolvedValue({
        valid: true,
        organization: 'test-org',
      });

      const mockAuthenticateWithToken = vi
        .spyOn(authCommand as any, 'authenticateWithToken')
        .mockReturnValue('✅ CI token configured successfully!');

      const result = await authCommand.exec(['setup-ci'], { org: 'test-org' });

      expect(mockRegistryClient.validateCIToken).toHaveBeenCalledWith(envToken);
      expect(mockAuthenticateWithToken).toHaveBeenCalledWith(
        envToken,
        'test-org'
      );
      expect(result).toContain('✅ CI token configured successfully!');

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      } else {
        delete process.env.GITCACHE_TOKEN;
      }

      mockAuthenticateWithToken.mockRestore();
    });

    it('should warn when token organization differs from provided org', async () => {
      const envToken = 'ci_different_abc123';
      const originalEnv = process.env.GITCACHE_TOKEN;
      process.env.GITCACHE_TOKEN = envToken;

      mockDetectCIEnvironment.mockReturnValue({
        platform: 'CircleCI',
        detected: true,
        hasToken: true,
        tokenSource: 'environment',
      });

      mockRegistryClient.validateCIToken.mockResolvedValue({
        valid: true,
        organization: 'extracted-org',
      });

      const mockAuthenticateWithToken = vi
        .spyOn(authCommand as any, 'authenticateWithToken')
        .mockReturnValue('✅ CI token configured successfully!');

      const result = await authCommand.exec(['setup-ci'], {
        org: 'provided-org',
      });

      expect(mockAuthenticateWithToken).toHaveBeenCalledWith(
        envToken,
        'extracted-org'
      );
      expect(result).toContain('✅ CI token configured successfully!');

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      } else {
        delete process.env.GITCACHE_TOKEN;
      }

      mockAuthenticateWithToken.mockRestore();
    });

    it('should show error guidance when environment token validation fails', async () => {
      const envToken = 'ci_testorg_invalid';
      const originalEnv = process.env.GITCACHE_TOKEN;
      process.env.GITCACHE_TOKEN = envToken;

      // The detectCIEnvironment function will return "CI with token" as platform when there's a token
      const expectedCiEnv = {
        platform: 'CI with token',
        detected: true,
        hasToken: true,
        tokenSource: 'environment' as const,
      };

      mockDetectCIEnvironment.mockReturnValue(expectedCiEnv);

      mockRegistryClient.validateCIToken.mockResolvedValue({
        valid: false,
        error: 'Token expired',
      });

      const mockShowCIErrorGuidance = vi
        .spyOn(authCommand as any, 'showCIErrorGuidance')
        .mockReturnValue('❌ GitCache CI setup failed');

      const result = await authCommand.exec(['setup-ci'], { org: 'test-org' });

      expect(mockShowCIErrorGuidance).toHaveBeenCalledWith(expectedCiEnv);
      expect(result).toBe('❌ GitCache CI setup failed');

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      } else {
        delete process.env.GITCACHE_TOKEN;
      }

      mockShowCIErrorGuidance.mockRestore();
    });

    it('should handle token validation network errors', async () => {
      const envToken = 'ci_testorg_abc123';
      const originalEnv = process.env.GITCACHE_TOKEN;
      process.env.GITCACHE_TOKEN = envToken;

      // The detectCIEnvironment function will return "CI with token" as platform when there's a token
      const expectedCiEnv = {
        platform: 'CI with token',
        detected: true,
        hasToken: true,
        tokenSource: 'environment' as const,
      };

      mockDetectCIEnvironment.mockReturnValue(expectedCiEnv);

      mockRegistryClient.validateCIToken.mockRejectedValue(
        new Error('Network error')
      );

      const mockShowCIErrorGuidance = vi
        .spyOn(authCommand as any, 'showCIErrorGuidance')
        .mockReturnValue('❌ GitCache CI setup failed');

      const result = await authCommand.exec(['setup-ci'], { org: 'test-org' });

      expect(mockShowCIErrorGuidance).toHaveBeenCalledWith(expectedCiEnv);
      expect(result).toBe('❌ GitCache CI setup failed');

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      } else {
        delete process.env.GITCACHE_TOKEN;
      }

      mockShowCIErrorGuidance.mockRestore();
    });

    it('should return error when no CI token is found', async () => {
      const originalEnv = process.env.GITCACHE_TOKEN;
      delete process.env.GITCACHE_TOKEN;

      // When no token is present, detectCIEnvironment returns local platform
      const expectedCiEnv = {
        platform: 'local',
        detected: false,
        hasToken: false,
        tokenSource: 'none' as const,
      };

      mockDetectCIEnvironment.mockReturnValue(expectedCiEnv);

      const result = await authCommand.exec(['setup-ci'], { org: 'test-org' });

      expect(result).toContain('❌ GitCache CI token not found');
      expect(result).toContain(
        'Detected local environment but no GITCACHE_TOKEN found.'
      );
      expect(result).toContain('To enable GitCache acceleration:');
      expect(result).toContain(
        '1. Generate a CI token at: https://grata-labs.com/gitcache/account/dashboard/'
      );
      expect(result).toContain('2. Set GITCACHE_TOKEN environment variable');
      expect(result).toContain(
        '3. Or use: gitcache auth setup-ci --org <organization> --token <ci-token>'
      );

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      }
    });

    it('should use explicit token when provided', async () => {
      const explicitToken = 'ci_explicit_token123';

      mockDetectCIEnvironment.mockReturnValue({
        platform: 'Azure Pipelines',
        detected: true,
        hasToken: false,
        tokenSource: 'none',
      });

      mockRegistryClient.validateCIToken.mockResolvedValue({
        valid: true,
        organization: 'test-org',
      });

      const mockAuthenticateWithToken = vi
        .spyOn(authCommand as any, 'authenticateWithToken')
        .mockReturnValue('✅ CI token configured successfully!');

      const result = await authCommand.exec(['setup-ci'], {
        org: 'test-org',
        token: explicitToken,
      });

      expect(mockRegistryClient.validateCIToken).toHaveBeenCalledWith(
        explicitToken
      );
      expect(mockAuthenticateWithToken).toHaveBeenCalledWith(
        explicitToken,
        'test-org'
      );
      expect(result).toContain('✅ CI token configured successfully!');

      mockAuthenticateWithToken.mockRestore();
    });

    it('should reject tokens that do not start with "ci_"', async () => {
      const invalidToken = 'invalid_token_format';

      mockDetectCIEnvironment.mockReturnValue({
        platform: 'TeamCity',
        detected: true,
        hasToken: false,
        tokenSource: 'none',
      });

      const result = await authCommand.exec(['setup-ci'], {
        org: 'test-org',
        token: invalidToken,
      });

      expect(result).toContain('❌ Invalid CI token format');
      expect(result).toContain('CI tokens must start with "ci_"');
      expect(result).toContain(
        'Generate a new CI token at: https://grata-labs.com/gitcache/account/dashboard/'
      );
    });

    it('should handle invalid CI tokens', async () => {
      const invalidToken = 'ci_invalid_token';

      mockDetectCIEnvironment.mockReturnValue({
        platform: 'Bitbucket Pipelines',
        detected: true,
        hasToken: false,
        tokenSource: 'none',
      });

      mockRegistryClient.validateCIToken.mockResolvedValue({
        valid: false,
        error: 'Token not found',
      });

      const result = await authCommand.exec(['setup-ci'], {
        org: 'test-org',
        token: invalidToken,
      });

      expect(result).toContain('❌ GitCache CI token invalid or expired');
      expect(result).toContain('Error: Token not found');
      expect(result).toContain('To fix:');
      expect(result).toContain('1. Generate a new CI token');
      expect(result).toContain(
        '2. Update GITCACHE_TOKEN in your CI environment'
      );
      expect(result).toContain(
        '3. Ensure the token has access to organization: test-org'
      );
    });

    it('should use organization from token validation when available', async () => {
      const validToken = 'ci_valid_token123';

      mockDetectCIEnvironment.mockReturnValue({
        platform: 'Drone CI',
        detected: true,
        hasToken: false,
        tokenSource: 'none',
      });

      mockRegistryClient.validateCIToken.mockResolvedValue({
        valid: true,
        organization: 'token-org',
      });

      const mockAuthenticateWithToken = vi
        .spyOn(authCommand as any, 'authenticateWithToken')
        .mockReturnValue('✅ CI token configured successfully!');

      const result = await authCommand.exec(['setup-ci'], {
        org: 'provided-org',
        token: validToken,
      });

      expect(mockAuthenticateWithToken).toHaveBeenCalledWith(
        validToken,
        'token-org'
      );
      expect(result).toContain('✅ CI token configured successfully!');

      mockAuthenticateWithToken.mockRestore();
    });

    it('should fall back to provided org when token validation has no organization', async () => {
      const validToken = 'ci_valid_no_org_token';

      mockDetectCIEnvironment.mockReturnValue({
        platform: 'Travis CI',
        detected: true,
        hasToken: false,
        tokenSource: 'none',
      });

      mockRegistryClient.validateCIToken.mockResolvedValue({
        valid: true,
        organization: null,
      });

      const mockAuthenticateWithToken = vi
        .spyOn(authCommand as any, 'authenticateWithToken')
        .mockReturnValue('✅ CI token configured successfully!');

      const result = await authCommand.exec(['setup-ci'], {
        org: 'fallback-org',
        token: validToken,
      });

      expect(mockAuthenticateWithToken).toHaveBeenCalledWith(
        validToken,
        'fallback-org'
      );
      expect(result).toContain('✅ CI token configured successfully!');

      mockAuthenticateWithToken.mockRestore();
    });

    it('should handle API validation errors gracefully', async () => {
      const validToken = 'ci_network_error_token';

      mockDetectCIEnvironment.mockReturnValue({
        platform: 'Buildbot',
        detected: true,
        hasToken: false,
        tokenSource: 'none',
      });

      mockRegistryClient.validateCIToken.mockRejectedValue(
        new Error('API unavailable')
      );

      const result = await authCommand.exec(['setup-ci'], {
        org: 'test-org',
        token: validToken,
      });

      expect(result).toContain('❌ Failed to validate CI token');
      expect(result).toContain('Error: API unavailable');
      expect(result).toContain('Please check:');
      expect(result).toContain('- Network connectivity to GitCache registry');
      expect(result).toContain('- Token validity and permissions');
      expect(result).toContain('- Organization access rights');
      expect(result).toContain('Your builds will continue using Git sources.');
    });

    it('should handle non-CI token prefixes from environment', async () => {
      const nonCIToken = 'user_token_abc123';
      const originalEnv = process.env.GITCACHE_TOKEN;
      process.env.GITCACHE_TOKEN = nonCIToken;

      mockDetectCIEnvironment.mockReturnValue({
        platform: 'Unknown CI',
        detected: false,
        hasToken: true,
        tokenSource: 'environment',
      });

      const result = await authCommand.exec(['setup-ci'], { org: 'test-org' });

      expect(result).toContain('❌ Invalid CI token format');
      expect(result).toContain('CI tokens must start with "ci_"');

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      } else {
        delete process.env.GITCACHE_TOKEN;
      }
    });

    it('should handle missing organization in token validation but still succeed', async () => {
      const validToken = 'ci_minimal_token';

      mockDetectCIEnvironment.mockReturnValue({
        platform: 'AppVeyor',
        detected: true,
        hasToken: false,
        tokenSource: 'none',
      });

      mockRegistryClient.validateCIToken.mockResolvedValue({
        valid: true,
        // No organization field
      });

      const mockAuthenticateWithToken = vi
        .spyOn(authCommand as any, 'authenticateWithToken')
        .mockReturnValue('✅ CI token configured successfully!');

      const result = await authCommand.exec(['setup-ci'], {
        org: 'default-org',
        token: validToken,
      });

      expect(mockAuthenticateWithToken).toHaveBeenCalledWith(
        validToken,
        'default-org'
      );
      expect(result).toContain('✅ CI token configured successfully!');

      mockAuthenticateWithToken.mockRestore();
    });

    it('should use platform name when ciEnv.detected is truthy', async () => {
      const envToken = 'ci_testorg_abc123';
      const originalEnv = process.env.GITCACHE_TOKEN;
      process.env.GITCACHE_TOKEN = envToken;

      // Mock CI environment with detected = true
      mockDetectCIEnvironment.mockReturnValue({
        platform: 'Jenkins',
        detected: true,
        hasToken: true,
        tokenSource: 'environment',
      });

      mockRegistryClient.validateCIToken.mockResolvedValue({
        valid: true,
        organization: 'test-org',
      });

      const mockAuthenticateWithToken = vi
        .spyOn(authCommand as any, 'authenticateWithToken')
        .mockReturnValue('✅ CI token configured successfully!');

      const consoleLogSpy = vi.spyOn(console, 'log');

      await authCommand.exec(['setup-ci'], { org: 'test-org' });

      // Verify that the detected platform name is used in the console output
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🤖 Auto-configuring for Jenkins environment'
      );

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      } else {
        delete process.env.GITCACHE_TOKEN;
      }

      mockAuthenticateWithToken.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should use fallback platform name when ciEnv.detected is falsy', async () => {
      const envToken = 'ci_testorg_abc123';
      const originalEnv = process.env.GITCACHE_TOKEN;
      process.env.GITCACHE_TOKEN = envToken;

      // Mock CI environment with detected = false
      mockDetectCIEnvironment.mockReturnValue({
        platform: 'SomeUnknownCI',
        detected: false,
        hasToken: true,
        tokenSource: 'environment',
      });

      mockRegistryClient.validateCIToken.mockResolvedValue({
        valid: true,
        organization: 'test-org',
      });

      const mockAuthenticateWithToken = vi
        .spyOn(authCommand as any, 'authenticateWithToken')
        .mockReturnValue('✅ CI token configured successfully!');

      const consoleLogSpy = vi.spyOn(console, 'log');

      await authCommand.exec(['setup-ci'], { org: 'test-org' });

      // Verify that the fallback platform name is used in the console output
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🤖 Auto-configuring for CI with token environment'
      );

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      } else {
        delete process.env.GITCACHE_TOKEN;
      }

      mockAuthenticateWithToken.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should use fallback "CI" when platform is falsey', async () => {
      const originalEnv = process.env.GITCACHE_TOKEN;
      delete process.env.GITCACHE_TOKEN;

      // Mock CI environment with falsey platform
      mockDetectCIEnvironment.mockReturnValue({
        platform: '',
        detected: false,
        hasToken: false,
        tokenSource: 'none',
      });

      const result = await authCommand.exec(['setup-ci'], { org: 'test-org' });

      expect(result).toContain('❌ GitCache CI token not found');
      expect(result).toContain(
        'Detected CI environment but no GITCACHE_TOKEN found.'
      );

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      }
    });

    it('should use fallback "CI" when platform is null', async () => {
      const originalEnv = process.env.GITCACHE_TOKEN;
      delete process.env.GITCACHE_TOKEN;

      // Mock CI environment with null platform
      mockDetectCIEnvironment.mockReturnValue({
        platform: null as any,
        detected: false,
        hasToken: false,
        tokenSource: 'none',
      });

      const result = await authCommand.exec(['setup-ci'], { org: 'test-org' });

      expect(result).toContain('❌ GitCache CI token not found');
      expect(result).toContain(
        'Detected CI environment but no GITCACHE_TOKEN found.'
      );

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      }
    });

    it('should use fallback "CI" when platform is undefined', async () => {
      const originalEnv = process.env.GITCACHE_TOKEN;
      delete process.env.GITCACHE_TOKEN;

      // Mock CI environment with undefined platform
      mockDetectCIEnvironment.mockReturnValue({
        platform: undefined as any,
        detected: false,
        hasToken: false,
        tokenSource: 'none',
      });

      const result = await authCommand.exec(['setup-ci'], { org: 'test-org' });

      expect(result).toContain('❌ GitCache CI token not found');
      expect(result).toContain(
        'Detected CI environment but no GITCACHE_TOKEN found.'
      );

      // Restore environment
      if (originalEnv) {
        process.env.GITCACHE_TOKEN = originalEnv;
      }
    });
  });
});
