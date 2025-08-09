import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../commands/auth.js';
import { AuthManager } from '../../lib/auth-manager.js';
import * as readline from 'node:readline/promises';

// Mock dependencies
vi.mock('../../lib/auth-manager.js');
vi.mock('node:readline/promises');

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
        expect(result).toContain('gitcache setup --list-orgs');
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
          // No orgId or organizationId
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
      expect(Auth.description).toBe('Manage GitCache authentication');
      expect(Auth.commandName).toBe('auth');
      expect(Auth.usage).toEqual(['login <email>', 'logout', 'status']);
      expect(Auth.params).toEqual(['logout', 'status']);
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
});
