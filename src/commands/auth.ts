import { BaseCommand } from '../base-cmd.js';
import { AuthManager } from '../lib/auth-manager.js';
import * as readline from 'node:readline/promises';

export interface AuthOptions {
  logout?: boolean;
  status?: boolean;
}

export class Auth extends BaseCommand {
  static description = 'Manage GitCache authentication';
  static commandName = 'auth';
  static usage = ['login <email>', 'logout', 'status'];
  static params = ['logout', 'status'];
  static argumentSpec = { type: 'variadic', name: 'subcommand' } as const;

  private authManager = new AuthManager();

  async exec(args: string[], opts: AuthOptions = {}): Promise<string> {
    const [subcommand, email] = args;

    if (opts.logout || subcommand === 'logout') {
      return this.logout();
    }

    if (opts.status || subcommand === 'status') {
      return this.status();
    }

    if (subcommand === 'login') {
      if (!email) {
        throw this.usageError('Email is required for login');
      }
      return this.login(email);
    }

    // Default to status if no subcommand
    if (!subcommand) {
      return this.status();
    }

    throw this.usageError(`Unknown auth command: ${subcommand}`);
  }

  private async login(email: string): Promise<string> {
    try {
      console.log(`🔐 Authenticating with GitCache...`);
      console.log('');

      // Get password
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      process.stdout.write('Password: ');
      const password = await this.getPasswordInput();
      rl.close();
      console.log(''); // New line after password

      // Authenticate with Cognito
      const authResult = await this.authenticateWithCognito(email, password);

      // Get user's organizations to determine default
      let defaultOrgId = authResult.orgId;
      let orgMessage = `🏢 Organization: ${defaultOrgId}`;

      try {
        // Create a temporary registry client to fetch organizations
        const { RegistryClient } = await import('../lib/registry-client.js');
        const tempClient = new RegistryClient();

        // Store the token temporarily to fetch organizations
        this.authManager.storeAuthData({
          token: authResult.idToken,
          email,
          orgId: authResult.orgId,
          tokenType: 'user',
          expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
        });

        const orgsResult = await tempClient.listOrganizations();
        if (orgsResult.defaultOrganization) {
          defaultOrgId = orgsResult.defaultOrganization;
          if (defaultOrgId !== authResult.orgId) {
            orgMessage = `🏢 Organization: ${defaultOrgId} (your default)`;
          }
        }
      } catch {
        // Fallback to the org from auth result if fetching organizations fails
      }

      // Extract expiration from JWT token
      let expiresAt: number;
      try {
        const jwtPayload = JSON.parse(
          Buffer.from(authResult.idToken.split('.')[1], 'base64').toString()
        );
        expiresAt = jwtPayload.exp * 1000; // Convert to milliseconds
      } catch {
        // Fallback to 1 hour if JWT parsing fails
        expiresAt = Date.now() + 60 * 60 * 1000;
      }

      // Store final auth data with correct organization
      this.authManager.storeAuthData({
        token: authResult.idToken,
        email,
        orgId: defaultOrgId,
        tokenType: 'user',
        expiresAt,
      });

      return [
        '✅ Authentication successful!',
        `📧 Logged in as: ${email}`,
        orgMessage,
        '',
        '💡 You can now:',
        '  • Create CI tokens: gitcache tokens create <name>',
        '  • List your tokens: gitcache tokens list',
        '  • List organizations: gitcache setup --list-orgs',
        '  • Use all GitCache features',
      ].join('\n');
    } catch (error) {
      if (error instanceof Error && error.message.includes('SIGINT')) {
        return '\n❌ Login cancelled by user';
      }

      return [
        '❌ Authentication failed',
        '',
        `Error: ${String(error)}`,
        '',
        'Please verify:',
        '• Email and password are correct',
        '• Your account is verified (check email for verification link)',
        '• Network connectivity to GitCache',
      ].join('\n');
    }
  }

  private logout(): string {
    if (!this.authManager.isAuthenticated()) {
      return '📝 You are not currently logged in';
    }

    // Clear auth data by storing null token
    this.authManager.storeAuthData({
      token: '',
      email: undefined,
      orgId: '',
      tokenType: 'user',
      expiresAt: null,
    });

    return '✅ Logged out successfully';
  }

  private status(): string {
    if (!this.authManager.isAuthenticated()) {
      return [
        '📝 Not authenticated',
        '',
        'To get started:',
        '  gitcache auth login <your-email>',
        '',
        'Or set CI token:',
        '  export GITCACHE_TOKEN=ci_yourorg_...',
      ].join('\n');
    }

    const tokenType = this.authManager.getTokenType();
    const orgId = this.authManager.getOrgId();
    const email = this.authManager.getEmail();

    if (tokenType === 'ci') {
      return [
        '✅ Authenticated with CI token',
        `🏢 Organization context: ${orgId}`,
        `🔑 Token type: CI token`,
        '',
        '💡 CI tokens are long-lived and perfect for automation',
      ].join('\n');
    }

    const userInfo = `✅ Authenticated as: ${email}`;

    return [
      userInfo,
      `🏢 Organization context: ${orgId}`,
      `🔑 Token type: User session`,
      '',
      '💡 Available commands:',
      '  • gitcache tokens create <name> - Generate CI token',
      '  • gitcache tokens list - View your tokens',
      '  • gitcache setup --list-orgs - View organizations',
    ].join('\n');
  }

  private async getPasswordInput(): Promise<string> {
    // If we're not in a TTY, just read from stdin normally
    if (!process.stdin.isTTY) {
      return new Promise((resolve) => {
        let password = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
          password += chunk;
        });
        process.stdin.on('end', () => {
          resolve(password.trim());
        });
      });
    }

    // For TTY, use a different approach
    return new Promise((resolve, reject) => {
      let password = '';
      const stdin = process.stdin;
      const stdout = process.stdout;

      // Create a hook to intercept and suppress output
      const originalWrite = process.stdout.write;
      let intercepting = true;

      // Override stdout.write to suppress echo
      process.stdout.write = ((
        chunk: string | Uint8Array,
        ...args: unknown[]
      ): boolean => {
        if (intercepting && typeof chunk === 'string') {
          // Don't write anything that looks like user input
          return true;
        }
        return (
          originalWrite as (
            chunk: string | Uint8Array,
            ...args: unknown[]
          ) => boolean
        ).apply(process.stdout, [chunk, ...args]);
      }) as typeof process.stdout.write;

      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      const cleanup = () => {
        intercepting = false;
        process.stdout.write = originalWrite;
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeAllListeners('data');
      };

      stdin.on('data', (key: string) => {
        // Process each character in the input
        for (let i = 0; i < key.length; i++) {
          const char = key[i];
          const code = char.charCodeAt(0);

          if (code === 3) {
            // Ctrl+C
            cleanup();
            stdout.write('\n');
            reject(new Error('SIGINT'));
            return;
          } else if (code === 13 || code === 10) {
            // Enter
            cleanup();
            stdout.write('\n');
            resolve(password);
            return;
          } else if (code === 127 || code === 8) {
            // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
            }
          } else if (code >= 32 && code <= 126) {
            // Printable characters
            password += char;
          }
        }
      });
    });
  }

  private async authenticateWithCognito(
    email: string,
    password: string
  ): Promise<{
    idToken: string;
    accessToken: string;
    refreshToken: string;
    orgId: string;
  }> {
    const apiUrl = this.getApiUrl();

    const response = await fetch(`${apiUrl}/auth/signin`, {
      // Updated to use Cognito endpoint
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: { message: 'Authentication failed' } }));
      throw new Error(error.error?.message || 'Invalid credentials');
    }

    const result = await response.json();

    // Extract organization from token or user data
    // For now, we'll use a default organization extraction
    // In a real implementation, this would come from the user's profile
    const orgId = result.organizationId || result.orgId || null;

    return {
      idToken: result.idToken,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      orgId: orgId || 'unknown', // Use 'unknown' instead of 'default'
    };
  }

  private getApiUrl(): string {
    return process.env.GITCACHE_API_URL || 'https://api.grata-labs.com';
  }
}
