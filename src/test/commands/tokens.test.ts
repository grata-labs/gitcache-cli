import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tokens } from '../../commands/tokens.js';
import { AuthManager } from '../../lib/auth-manager.js';

// Mock dependencies
vi.mock('../../lib/auth-manager.js');

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockAuthManager = vi.mocked(AuthManager);

describe('Tokens Command', () => {
  let tokensCommand: Tokens;
  let mockAuthManagerInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock AuthManager instance
    mockAuthManagerInstance = {
      isAuthenticated: vi.fn(),
      getTokenType: vi.fn(),
      getOrgId: vi.fn(),
      getAuthToken: vi.fn(),
      refreshTokenIfNeeded: vi.fn().mockResolvedValue(undefined),
    };

    mockAuthManager.mockImplementation(() => mockAuthManagerInstance);

    tokensCommand = new Tokens();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exec', () => {
    describe('authentication checks', () => {
      it('should require authentication', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(false);

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('❌ Authentication required');
        expect(result).toContain('Please login first:');
        expect(result).toContain('gitcache auth login <your-email>');
        expect(result).toContain('export GITCACHE_TOKEN=ci_yourorg_...');
      });

      it('should reject CI token authentication', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.getTokenType.mockReturnValue('ci');

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain(
          '❌ Token management not available with CI tokens'
        );
        expect(result).toContain(
          'To manage tokens, login with your user account:'
        );
        expect(result).toContain('gitcache auth login <your-email>');
        expect(result).toContain(
          'https://grata-labs.com/gitcache/account/dashboard/'
        );
      });

      it('should allow user token authentication', async () => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.getTokenType.mockReturnValue('user');
        mockAuthManagerInstance.getAuthToken.mockReturnValue('user-token');

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: [] }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('📝 No active CI tokens found');
      });
    });

    describe('create command', () => {
      beforeEach(() => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.getTokenType.mockReturnValue('user');
        mockAuthManagerInstance.getAuthToken.mockReturnValue('user-token');
        mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
      });

      it('should throw error when name is missing', async () => {
        await expect(tokensCommand.exec(['create'])).rejects.toThrow(
          'Token name is required: gitcache tokens create <name>'
        );
      });

      it('should create token successfully', async () => {
        const mockTokenResponse = {
          token: {
            id: 'token-123',
            name: 'test-token',
            value: 'ci_testorg_abc123def456',
          },
        };

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockTokenResponse),
        });

        const result = await tokensCommand.exec(['create', 'test-token']);

        expect(result).toContain('✅ CI Token Created Successfully!');
        expect(result).toContain('ID: token-123');
        expect(result).toContain('Name: test-token');
        expect(result).toContain('Value: ci_testorg_abc123def456');
        expect(result).toContain('Organization: test-org');
        expect(result).toContain('Prefix: ci_testorg_a...');
        expect(result).toContain(
          'export GITCACHE_TOKEN=ci_testorg_abc123def456'
        );
        expect(result).toContain('This token will only be shown once');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.grata-labs.com/api/tokens',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer user-token',
            },
            body: JSON.stringify({
              name: 'test-token',
              organizationId: 'test-org',
            }),
          }
        );
      });

      it('should use provided name when token name is missing from response', async () => {
        const mockTokenResponse = {
          token: {
            id: 'token-789',
            value: 'ci_testorg_noname123',
            // name is missing
          },
        };

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue(mockTokenResponse),
        });

        const result = await tokensCommand.exec(['create', 'fallback-name']);

        expect(result).toContain('Name: fallback-name');
      });

      it('should handle API error responses', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: { message: 'Permission denied' },
          }),
        });

        const result = await tokensCommand.exec(['create', 'test-token']);

        expect(result).toContain('❌ Failed to create CI token');
        expect(result).toContain('Error: Permission denied');
        expect(result).toContain('You have permission to create tokens');
        expect(result).toContain('Network connectivity to GitCache');
        expect(result).toContain('Your authentication is still valid');
      });

      it('should handle JSON parsing errors in error response', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockRejectedValue(new Error('JSON parse error')),
        });

        const result = await tokensCommand.exec(['create', 'test-token']);

        expect(result).toContain('❌ Failed to create CI token');
        expect(result).toContain('Error: Failed to create token');
      });

      it('should handle API error response with falsy error message', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: { message: null }, // Falsy message
          }),
        });

        const result = await tokensCommand.exec(['create', 'test-token']);

        expect(result).toContain('❌ Failed to create CI token');
        expect(result).toContain('Error: Token creation failed');
      });

      it('should handle API error response with empty string error message', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: { message: '' }, // Empty string message
          }),
        });

        const result = await tokensCommand.exec(['create', 'test-token']);

        expect(result).toContain('❌ Failed to create CI token');
        expect(result).toContain('Error: Token creation failed');
      });

      it('should handle API error response with undefined error object', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: undefined, // No error object
          }),
        });

        const result = await tokensCommand.exec(['create', 'test-token']);

        expect(result).toContain('❌ Failed to create CI token');
        expect(result).toContain('Error: Token creation failed');
      });

      it('should handle API error response with no error field', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            // No error field at all
            status: 'failed',
            reason: 'quota exceeded',
          }),
        });

        const result = await tokensCommand.exec(['create', 'test-token']);

        expect(result).toContain('❌ Failed to create CI token');
        expect(result).toContain('Error: Token creation failed');
      });

      it('should handle network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network unavailable'));

        const result = await tokensCommand.exec(['create', 'test-token']);

        expect(result).toContain('❌ Failed to create CI token');
        expect(result).toContain('Error: Network unavailable');
      });

      it('should handle non-Error exceptions', async () => {
        mockFetch.mockRejectedValue('String error');

        const result = await tokensCommand.exec(['create', 'test-token']);

        expect(result).toContain('❌ Failed to create CI token');
        expect(result).toContain('Error: Unknown error');
      });

      it('should use custom API URL from environment', async () => {
        const originalEnv = process.env.GITCACHE_API_URL;
        process.env.GITCACHE_API_URL = 'https://custom-api.example.com';

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            token: { id: 'test', name: 'test', value: 'test-token' },
          }),
        });

        await tokensCommand.exec(['create', 'test-token']);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://custom-api.example.com/api/tokens',
          expect.any(Object)
        );

        // Restore
        if (originalEnv) {
          process.env.GITCACHE_API_URL = originalEnv;
        } else {
          delete process.env.GITCACHE_API_URL;
        }
      });
    });

    describe('list command', () => {
      beforeEach(() => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.getTokenType.mockReturnValue('user');
        mockAuthManagerInstance.getAuthToken.mockReturnValue('user-token');
      });

      it('should list empty tokens', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: [] }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('📝 No active CI tokens found');
        expect(result).toContain('Create your first token:');
        expect(result).toContain('gitcache tokens create <name>');
      });

      it('should list active tokens', async () => {
        const mockTokens = [
          {
            id: 'token-1',
            name: 'production-token',
            prefix: 'ci_org_prod',
            isActive: true,
            revoked: false,
            createdAt: '2025-01-01T00:00:00Z',
            lastUsed: '2025-01-15T12:00:00Z',
          },
          {
            id: 'token-2',
            name: 'staging-token',
            prefix: 'ci_org_stagi***',
            isActive: true,
            createdAt: '2025-01-02T00:00:00Z',
            lastUsed: null,
          },
        ];

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: mockTokens }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('📋 Your CI Tokens (2):');
        expect(result).toContain('🔑 production-token');
        expect(result).toContain('ID: token-1');
        expect(result).toContain('Prefix: ci_org_prod');
        expect(result).toContain('Status: 🟢 Active');
        expect(result).toContain('🔑 staging-token');
        expect(result).toContain('ID: token-2');
        expect(result).toContain('Prefix: ci_org_stagi***');
        expect(result).toContain('Last used: Never');
        expect(result).toContain('gitcache tokens create <name>');
        expect(result).toContain('gitcache tokens revoke <token-id>');
      });

      it('should list tokens with revoked tokens available but not shown', async () => {
        const mockTokens = [
          {
            id: 'token-1',
            name: 'active-token',
            isActive: true,
            revoked: false,
            createdAt: '2025-01-01T00:00:00Z',
            lastUsed: null,
          },
          {
            id: 'token-2',
            name: 'revoked-token',
            isActive: false,
            revoked: true,
            createdAt: '2025-01-01T00:00:00Z',
            lastUsed: null,
          },
        ];

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: mockTokens }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('📋 Active CI Tokens (1 active, 1 revoked):');
        expect(result).toContain('🔑 active-token');
        expect(result).not.toContain('🔑 revoked-token');
        expect(result).toContain('gitcache tokens list --show-revoked');
      });

      it('should show revoked tokens when --show-revoked flag is used', async () => {
        const mockTokens = [
          {
            id: 'token-1',
            name: 'active-token',
            isActive: true,
            revoked: false,
            createdAt: '2025-01-01T00:00:00Z',
            lastUsed: null,
          },
          {
            id: 'token-2',
            name: 'revoked-token',
            isActive: false,
            revoked: true,
            createdAt: '2025-01-01T00:00:00Z',
            lastUsed: null,
          },
        ];

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: mockTokens }),
        });

        const result = await tokensCommand.exec(['list'], {
          'show-revoked': true,
        });

        expect(result).toContain(
          '📋 All CI Tokens (2 total: 1 active, 1 revoked):'
        );
        expect(result).toContain('🔑 active-token');
        expect(result).toContain('Status: 🟢 Active');
        expect(result).toContain('🔑 revoked-token');
        expect(result).toContain('Status: 🔴 Revoked');
        expect(result).not.toContain('gitcache tokens list --show-revoked');
      });

      it('should handle camelCase showRevoked option', async () => {
        const mockTokens = [
          {
            id: 'token-1',
            name: 'revoked-token',
            isActive: false,
            createdAt: '2025-01-01T00:00:00Z',
            lastUsed: null,
          },
        ];

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: mockTokens }),
        });

        const optsWithCamelCase = { showRevoked: true } as any;
        const result = await tokensCommand.exec(['list'], optsWithCamelCase);

        expect(result).toContain('📋 All CI Tokens');
        expect(result).toContain('Status: 🔴 Revoked');
      });

      it('should show empty message for revoked tokens when showing all', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: [] }),
        });

        const result = await tokensCommand.exec(['list'], {
          'show-revoked': true,
        });

        expect(result).toContain('📝 No CI tokens found');
        expect(result).toContain('Create your first token:');
        expect(result).toContain('gitcache tokens create <name>');
      });

      it('should show message when only revoked tokens exist', async () => {
        const mockTokens = [
          {
            id: 'token-1',
            name: 'revoked-token',
            isActive: false,
            createdAt: '2025-01-01T00:00:00Z',
            lastUsed: null,
          },
        ];

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: mockTokens }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('📝 No active CI tokens found');
        expect(result).toContain(
          'You have revoked tokens. Use --show-revoked to see them:'
        );
        expect(result).toContain('gitcache tokens list --show-revoked');
      });

      it('should handle tokens with missing optional fields', async () => {
        const mockTokens = [
          {
            id: 'token-1',
            // name is missing
            // createdAt is missing
            // lastUsed is missing
            // prefix is missing
            // value is missing
          },
        ];

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: mockTokens }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('🔑 Unnamed');
        expect(result).toContain('Created: Unknown');
        expect(result).toContain('Last used: Never');
        expect(result).toContain('Prefix: Unknown');
        expect(result).toContain('Status: 🟢 Active');
      });

      it('should handle API error responses', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: { message: 'Unauthorized access' },
          }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('❌ Failed to list tokens');
        expect(result).toContain('Error: Unauthorized access');
        expect(result).toContain(
          'Please verify your authentication and try again.'
        );
      });

      it('should handle JSON parsing errors in error response', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockRejectedValue(new Error('JSON parse error')),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('❌ Failed to list tokens');
        expect(result).toContain('Error: Failed to fetch tokens');
      });

      it('should handle API error response with falsy error message', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: { message: null }, // Falsy message
          }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('❌ Failed to list tokens');
        expect(result).toContain('Error: Failed to list tokens');
      });

      it('should handle API error response with empty string error message', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: { message: '' }, // Empty string message
          }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('❌ Failed to list tokens');
        expect(result).toContain('Error: Failed to list tokens');
      });

      it('should handle API error response with undefined error object', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            error: undefined, // No error object
          }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('❌ Failed to list tokens');
        expect(result).toContain('Error: Failed to list tokens');
      });

      it('should handle API error response with no error field', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          json: vi.fn().mockResolvedValue({
            // No error field at all
            status: 'failed',
            reason: 'quota exceeded',
          }),
        });

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('❌ Failed to list tokens');
        expect(result).toContain('Error: Failed to list tokens');
      });

      it('should handle network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));

        const result = await tokensCommand.exec(['list']);

        expect(result).toContain('❌ Failed to list tokens');
        expect(result).toContain('Error: Network error');
      });

      it('should default to list when no subcommand provided', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: [] }),
        });

        const result = await tokensCommand.exec([]);

        expect(result).toContain('📝 No active CI tokens found');
      });

      it('should format dates correctly', async () => {
        const mockTokens = [
          {
            id: 'token-1',
            name: 'date-test-token',
            createdAt: '2025-08-09T10:30:00Z',
            lastUsed: '2025-08-09T15:45:00Z',
          },
        ];

        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({ tokens: mockTokens }),
        });

        const result = await tokensCommand.exec(['list']);

        // Should contain formatted dates (exact format may vary by locale)
        expect(result).toContain('Created:');
        expect(result).toContain('Last used:');
        expect(result).not.toContain('2025-08-09T10:30:00Z'); // Should be formatted, not raw ISO
      });
    });

    describe('revoke command', () => {
      beforeEach(() => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.getTokenType.mockReturnValue('user');
        mockAuthManagerInstance.getAuthToken.mockReturnValue('user-token');
      });

      it('should throw error when token ID is missing', async () => {
        await expect(tokensCommand.exec(['revoke'])).rejects.toThrow(
          'Token ID is required: gitcache tokens revoke <token-id>'
        );
      });

      it('should revoke token successfully', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({}),
        });

        const result = await tokensCommand.exec(['revoke', 'token-123']);

        expect(result).toContain('✅ Token revoked successfully');
        expect(result).toContain('🔑 Revoked token ID: token-123');
        expect(result).toContain(
          'Any CI/CD systems using this token will no longer work'
        );
        expect(result).toContain('Generate a new token if needed:');
        expect(result).toContain('gitcache tokens create <name>');
        expect(result).toContain('gitcache tokens list');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.grata-labs.com/api/tokens/token-123',
          {
            method: 'DELETE',
            headers: {
              Authorization: 'Bearer user-token',
            },
          }
        );
      });

      it('should handle token not found (404)', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 404,
          json: vi.fn().mockResolvedValue({
            error: { message: 'Token not found' },
          }),
        });

        const result = await tokensCommand.exec([
          'revoke',
          'nonexistent-token',
        ]);

        expect(result).toContain('❌ Token not found');
        expect(result).toContain('No token found with ID: nonexistent-token');
        expect(result).toContain('List your tokens to see available IDs:');
        expect(result).toContain('gitcache tokens list');
      });

      it('should handle other API errors', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 403,
          json: vi.fn().mockResolvedValue({
            error: { message: 'Permission denied' },
          }),
        });

        const result = await tokensCommand.exec(['revoke', 'token-123']);

        expect(result).toContain('❌ Failed to revoke token');
        expect(result).toContain('Error: Permission denied');
        expect(result).toContain('Please verify the token ID and try again.');
        expect(result).toContain('Get token IDs with:');
        expect(result).toContain('gitcache tokens list');
      });

      it('should handle error response with message field directly', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: vi.fn().mockResolvedValue({
            message: 'Direct message error',
          }),
        });

        const result = await tokensCommand.exec(['revoke', 'token-123']);

        expect(result).toContain('❌ Failed to revoke token');
        expect(result).toContain('Error: Direct message error');
      });

      it('should handle JSON parsing errors in error response', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: vi.fn().mockRejectedValue(new Error('JSON parse error')),
        });

        const result = await tokensCommand.exec(['revoke', 'token-123']);

        expect(result).toContain('❌ Failed to revoke token');
        expect(result).toContain('Error: Failed to revoke token');
      });

      it('should handle API error response with falsy error message and no direct message', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: vi.fn().mockResolvedValue({
            error: { message: null }, // Falsy error message, no direct message
          }),
        });

        const result = await tokensCommand.exec(['revoke', 'token-123']);

        expect(result).toContain('❌ Failed to revoke token');
        expect(result).toContain('Error: Token revocation failed');
      });

      it('should handle API error response with empty string error message and no direct message', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: vi.fn().mockResolvedValue({
            error: { message: '' }, // Empty string error message, no direct message
          }),
        });

        const result = await tokensCommand.exec(['revoke', 'token-123']);

        expect(result).toContain('❌ Failed to revoke token');
        expect(result).toContain('Error: Token revocation failed');
      });

      it('should handle API error response with undefined error object and no direct message', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: vi.fn().mockResolvedValue({
            error: undefined, // No error object, no direct message
          }),
        });

        const result = await tokensCommand.exec(['revoke', 'token-123']);

        expect(result).toContain('❌ Failed to revoke token');
        expect(result).toContain('Error: Token revocation failed');
      });

      it('should handle API error response with no error field and no direct message', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: vi.fn().mockResolvedValue({
            // No error field and no direct message field
            status: 'failed',
            reason: 'internal error',
          }),
        });

        const result = await tokensCommand.exec(['revoke', 'token-123']);

        expect(result).toContain('❌ Failed to revoke token');
        expect(result).toContain('Error: Token revocation failed');
      });

      it('should handle network errors', async () => {
        mockFetch.mockRejectedValue(new Error('Connection failed'));

        const result = await tokensCommand.exec(['revoke', 'token-123']);

        expect(result).toContain('❌ Failed to revoke token');
        expect(result).toContain('Error: Connection failed');
      });

      it('should handle non-Error exceptions', async () => {
        mockFetch.mockRejectedValue('String error');

        const result = await tokensCommand.exec(['revoke', 'token-123']);

        expect(result).toContain('❌ Failed to revoke token');
        expect(result).toContain('Error: Unknown error');
      });
    });

    describe('unknown command', () => {
      beforeEach(() => {
        mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
        mockAuthManagerInstance.getTokenType.mockReturnValue('user');
      });

      it('should throw error for unknown subcommand', async () => {
        await expect(tokensCommand.exec(['unknown'])).rejects.toThrow(
          'Unknown tokens command: unknown'
        );
      });
    });
  });

  describe('getApiUrl', () => {
    it('should return default URL when no environment variable set', () => {
      const originalEnv = process.env.GITCACHE_API_URL;
      delete process.env.GITCACHE_API_URL;

      const result = (tokensCommand as any).getApiUrl();

      expect(result).toBe('https://api.grata-labs.com');

      // Restore
      if (originalEnv) {
        process.env.GITCACHE_API_URL = originalEnv;
      }
    });

    it('should return environment variable when set', () => {
      const originalEnv = process.env.GITCACHE_API_URL;
      process.env.GITCACHE_API_URL = 'https://custom-api.example.com';

      const result = (tokensCommand as any).getApiUrl();

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
      expect(Tokens.description).toBe('Manage CI tokens for automation');
      expect(Tokens.commandName).toBe('tokens');
      expect(Tokens.usage).toEqual([
        'create <name>',
        'list [--show-revoked]',
        'revoke <token-id>',
      ]);
      expect(Tokens.params).toEqual(['help', 'show-revoked']);
      expect(Tokens.argumentSpec).toEqual({
        type: 'variadic',
        name: 'subcommand',
      });
    });
  });

  describe('edge cases and error handling', () => {
    beforeEach(() => {
      mockAuthManagerInstance.isAuthenticated.mockReturnValue(true);
      mockAuthManagerInstance.getTokenType.mockReturnValue('user');
      mockAuthManagerInstance.getAuthToken.mockReturnValue('user-token');
      mockAuthManagerInstance.getOrgId.mockReturnValue('test-org');
    });

    it('should handle undefined options gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ tokens: [] }),
      });

      const result = await tokensCommand.exec(['list'], undefined);

      expect(result).toContain('📝 No active CI tokens found');
    });

    it('should handle empty subArgs array gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ tokens: [] }),
      });

      const result = await tokensCommand.exec(['list']);

      expect(result).toContain('📝 No active CI tokens found');
    });

    it('should handle null token response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(null),
      });

      const result = await tokensCommand.exec(['list']);

      // When result is null, result.tokens will cause an error
      // and it will be caught and handled as an error case
      expect(result).toContain('❌ Failed to list tokens');
      expect(result).toContain('Error:');
    });

    it('should handle tokens with complex revocation status', async () => {
      const mockTokens = [
        {
          id: 'token-1',
          name: 'complex-token-1',
          isActive: false, // Both false and revoked
          revoked: true,
        },
        {
          id: 'token-2',
          name: 'complex-token-2',
          isActive: false, // Only isActive false
          revoked: false,
        },
        {
          id: 'token-3',
          name: 'complex-token-3',
          isActive: true, // Only revoked true
          revoked: true,
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ tokens: mockTokens }),
      });

      const result = await tokensCommand.exec(['list'], {
        'show-revoked': true,
      });

      expect(result).toContain(
        '📋 All CI Tokens (3 total: 0 active, 3 revoked):'
      );
      expect(result).toContain('Status: 🔴 Revoked');
      // All should be marked as revoked due to the OR condition
    });

    it('should handle missing auth manager methods gracefully', async () => {
      mockAuthManagerInstance.getOrgId.mockReturnValue(null);

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          token: { id: 'test', name: 'test', value: 'test-token' },
        }),
      });

      const result = await tokensCommand.exec(['create', 'test-token']);

      expect(result).toContain('Organization: null');
    });

    it('should handle empty string token name', async () => {
      await expect(tokensCommand.exec(['create', ''])).rejects.toThrow(
        'Token name is required: gitcache tokens create <name>'
      );
    });

    it('should handle whitespace-only token name', async () => {
      // The command doesn't trim whitespace, so it should accept it
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          token: { id: 'test', name: '   ', value: 'test-token' },
        }),
      });

      const result = await tokensCommand.exec(['create', '   ']);

      expect(result).toContain('✅ CI Token Created Successfully!');
    });

    it('should handle extremely long token lists', async () => {
      const mockTokens = Array.from({ length: 100 }, (_, i) => ({
        id: `token-${i}`,
        name: `token-${i}`,
        isActive: i % 2 === 0, // Half active, half inactive
        createdAt: '2025-01-01T00:00:00Z',
        lastUsed: null,
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ tokens: mockTokens }),
      });

      const result = await tokensCommand.exec(['list'], {
        'show-revoked': true,
      });

      expect(result).toContain(
        '📋 All CI Tokens (100 total: 50 active, 50 revoked):'
      );
    });
  });
});
