import { BaseCommand } from '../base-cmd.js';
import { AuthManager } from '../lib/auth-manager.js';

export interface TokensOptions {
  help?: boolean;
  'show-revoked'?: boolean;
}

interface Token {
  id: string;
  name: string;
  value?: string;
  prefix?: string;
  isActive?: boolean;
  revoked?: boolean;
  createdAt?: string;
  lastUsed?: string | null;
}

export class Tokens extends BaseCommand {
  static description = 'Manage CI tokens for automation';
  static commandName = 'tokens';
  static usage = [
    'create <name>',
    'list [--show-revoked]',
    'revoke <token-id>',
  ];
  static params = ['help', 'show-revoked'];
  static argumentSpec = { type: 'variadic', name: 'subcommand' } as const;

  private authManager = new AuthManager();

  async exec(args: string[], opts: TokensOptions = {}): Promise<string> {
    const [subcommand, ...subArgs] = args;

    // Ensure user is authenticated
    if (!this.authManager.isAuthenticated()) {
      return [
        '❌ Authentication required',
        '',
        'Please login first:',
        '  gitcache auth login <your-email>',
        '',
        'Or use a CI token:',
        '  export GITCACHE_TOKEN=ci_yourorg_...',
      ].join('\n');
    }

    // Only allow token management for user tokens (not CI tokens)
    if (this.authManager.getTokenType() === 'ci') {
      return [
        '❌ Token management not available with CI tokens',
        '',
        'To manage tokens, login with your user account:',
        '  gitcache auth login <your-email>',
        '',
        'CI tokens are managed through the dashboard:',
        '  https://grata-labs.com/gitcache/account/dashboard/',
      ].join('\n');
    }

    if (subcommand === 'create') {
      const [name] = subArgs;
      if (!name) {
        throw this.usageError(
          'Token name is required: gitcache tokens create <name>'
        );
      }
      return this.createToken(name);
    }

    if (subcommand === 'list') {
      return this.listTokens(opts);
    }

    if (subcommand === 'revoke') {
      const [tokenId] = subArgs;
      if (!tokenId) {
        throw this.usageError(
          'Token ID is required: gitcache tokens revoke <token-id>'
        );
      }
      return this.revokeToken(tokenId);
    }

    // Default action
    if (!subcommand) {
      return this.listTokens(opts);
    }

    throw this.usageError(`Unknown tokens command: ${subcommand}`);
  }

  private async createToken(name: string): Promise<string> {
    try {
      const apiUrl = this.getApiUrl();
      const authToken = this.authManager.getAuthToken();
      const orgId = this.authManager.getOrgId();

      const response = await fetch(`${apiUrl}/api/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name,
          organizationId: orgId,
        }),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: { message: 'Failed to create token' } }));
        throw new Error(error.error?.message || 'Token creation failed');
      }

      const result = await response.json();
      const token = result.token;

      return [
        '✅ CI Token Created Successfully!',
        '',
        '🔑 Token Details:',
        `   ID: ${token.id}`,
        `   Name: ${token.name || name}`,
        `   Value: ${token.value}`,
        `   Organization: ${orgId}`,
        `   Prefix: ${token.value.substring(0, 12)}...`,
        '',
        '💡 Add this to your CI environment:',
        `   export GITCACHE_TOKEN=${token.value}`,
        '',
        '⚠️  This token will only be shown once - save it now!',
        '',
        '🚀 Your CI/CD builds can now use GitCache acceleration:',
        '   gitcache install  # Will automatically use GITCACHE_TOKEN',
      ].join('\n');
    } catch (error) {
      return [
        '❌ Failed to create CI token',
        '',
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        '',
        'Please verify:',
        '• You have permission to create tokens in this organization',
        '• Network connectivity to GitCache',
        '• Your authentication is still valid',
      ].join('\n');
    }
  }

  private async listTokens(opts: TokensOptions = {}): Promise<string> {
    try {
      const apiUrl = this.getApiUrl();
      const authToken = this.authManager.getAuthToken();

      const response = await fetch(`${apiUrl}/api/tokens`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: { message: 'Failed to fetch tokens' } }));
        throw new Error(error.error?.message || 'Failed to list tokens');
      }

      const result = await response.json();
      const allTokens: Token[] = result.tokens;

      // Calculate counts first
      const activeTokens = allTokens.filter(
        (token: Token) => token.isActive !== false && !token.revoked
      );
      const revokedTokens = allTokens.filter(
        (token: Token) => token.isActive === false || token.revoked
      );
      const activeCount = activeTokens.length;
      const revokedCount = revokedTokens.length;

      // Filter tokens based on show-revoked flag
      // Check both kebab-case and camelCase versions
      const showRevoked =
        opts['show-revoked'] ||
        (opts as TokensOptions & { showRevoked?: boolean }).showRevoked ||
        false;

      const tokens = showRevoked ? allTokens : activeTokens;

      if (tokens.length === 0) {
        const hasRevokedTokens = revokedCount > 0 && !showRevoked;
        return [
          showRevoked
            ? '📝 No CI tokens found'
            : '📝 No active CI tokens found',
          '',
          hasRevokedTokens
            ? 'You have revoked tokens. Use --show-revoked to see them:'
            : 'Create your first token:',
          hasRevokedTokens
            ? '  gitcache tokens list --show-revoked'
            : '  gitcache tokens create <name>',
        ].join('\n');
      }

      const tokenList = tokens
        .map((token: Token) => {
          const created = token.createdAt
            ? new Date(token.createdAt).toLocaleDateString()
            : 'Unknown';
          const lastUsed = token.lastUsed
            ? new Date(token.lastUsed).toLocaleDateString()
            : 'Never';
          const status =
            token.isActive === false || token.revoked
              ? '🔴 Revoked'
              : '🟢 Active';

          return [
            `  🔑 ${token.name || 'Unnamed'}`,
            `     ID: ${token.id}`,
            `     Prefix: ${token.prefix || 'Unknown'}`,
            `     Created: ${created}`,
            `     Last used: ${lastUsed}`,
            `     Status: ${status}`,
          ].join('\n');
        })
        .join('\n\n');

      // Create status line based on what we're showing
      const statusLine = showRevoked
        ? `📋 All CI Tokens (${allTokens.length} total: ${activeCount} active, ${revokedCount} revoked):`
        : revokedCount > 0
          ? `📋 Active CI Tokens (${activeCount} active, ${revokedCount} revoked):`
          : `📋 Your CI Tokens (${activeCount}):`;

      return [
        statusLine,
        '',
        tokenList,
        '',
        '💡 Commands:',
        '  • gitcache tokens create <name> - Create new token',
        '  • gitcache tokens revoke <token-id> - Revoke token',
        !showRevoked && revokedCount > 0
          ? '  • gitcache tokens list --show-revoked - Show revoked tokens'
          : null,
      ]
        .filter(Boolean)
        .join('\n');
    } catch (error) {
      return [
        '❌ Failed to list tokens',
        '',
        `Error: ${String(error)}`,
        '',
        'Please verify your authentication and try again.',
      ].join('\n');
    }
  }

  private async revokeToken(tokenId: string): Promise<string> {
    try {
      const apiUrl = this.getApiUrl();
      const authToken = this.authManager.getAuthToken();

      // Revoke the token directly using the provided ID
      const revokeResponse = await fetch(`${apiUrl}/api/tokens/${tokenId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!revokeResponse.ok) {
        const error = await revokeResponse
          .json()
          .catch(() => ({ error: { message: 'Failed to revoke token' } }));

        if (revokeResponse.status === 404) {
          return [
            '❌ Token not found',
            '',
            `No token found with ID: ${tokenId}`,
            '',
            'List your tokens to see available IDs:',
            '  gitcache tokens list',
          ].join('\n');
        }

        throw new Error(
          error.error?.message || error.message || 'Token revocation failed'
        );
      }

      return [
        '✅ Token revoked successfully',
        '',
        `🔑 Revoked token ID: ${tokenId}`,
        '',
        '⚠️  Any CI/CD systems using this token will no longer work.',
        '   Generate a new token if needed:',
        '   gitcache tokens create <name>',
        '',
        '💡 Run "gitcache tokens list" to confirm the token status.',
      ].join('\n');
    } catch (error) {
      return [
        '❌ Failed to revoke token',
        '',
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        '',
        'Please verify the token ID and try again.',
        '',
        'Get token IDs with:',
        '  gitcache tokens list',
      ].join('\n');
    }
  }

  private getApiUrl(): string {
    return process.env.GITCACHE_API_URL || 'https://api.grata-labs.com';
  }
}
