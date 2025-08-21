import { BaseCommand } from '../base-cmd.js';
import { AuthManager } from '../lib/auth-manager.js';
import { RegistryClient, RegistryConfig } from '../lib/registry-client.js';
import { detectCIEnvironment, CIEnvironment } from '../lib/ci-environment.js';
import * as readline from 'node:readline/promises';

export interface AuthOptions {
  logout?: boolean;
  status?: boolean;
  org?: string;
  ci?: boolean;
  token?: string;
}

export class Auth extends BaseCommand {
  static description = 'Manage GitCache authentication and organization access';
  static commandName = 'auth';
  static usage = [
    'login <email>',
    'logout',
    'status',
    'orgs [--org <organization>]',
    '--org <organization>  # Shortcut for orgs --org',
    'setup-ci --org <organization> [--token <ci-token>]',
  ];
  static params = ['logout', 'status', 'org', 'ci', 'token'];
  static argumentSpec = { type: 'variadic', name: 'subcommand' } as const;

  private authManager = new AuthManager();
  private _registryClient?: RegistryClient;

  private get registryClient(): RegistryClient {
    if (!this._registryClient) {
      const config: Partial<RegistryConfig> = {};
      if (process.env.GITCACHE_API_URL) {
        config.apiUrl = process.env.GITCACHE_API_URL;
      }
      this._registryClient = new RegistryClient(config);
    }
    return this._registryClient;
  }

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

    if (subcommand === 'orgs') {
      return this.manageOrgs(opts);
    }

    if (subcommand === 'setup-ci') {
      return this.setupCI(opts);
    }

    // If --org is provided without a subcommand, treat it as 'orgs --org'
    if (opts.org && !subcommand) {
      return this.manageOrgs(opts);
    }

    // Default to status if no subcommand and no --org flag
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
        '  • List organizations: gitcache auth orgs',
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
      '  • gitcache auth orgs - View organizations',
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

  /**
   * Manage organizations - list and switch organization context
   */
  private async manageOrgs(opts: AuthOptions): Promise<string> {
    if (!this.authManager.isAuthenticated()) {
      return [
        '❌ Authentication required to manage organizations',
        '',
        'Please login first:',
        '  gitcache auth login <your-email>',
      ].join('\n');
    }

    const { org } = opts;

    // If --org specified, switch organization context
    if (org) {
      return this.switchOrg(org);
    }

    // Otherwise list organizations
    return this.listOrganizations();
  }

  /**
   * List available organizations
   */
  private async listOrganizations(): Promise<string> {
    try {
      console.log('🔍 Fetching your organizations...');
      const result = await this.registryClient.listOrganizations();

      if (result.organizations.length === 0) {
        return [
          '📝 No organizations found',
          '',
          'You may need to:',
          '• Contact your administrator for organization access',
          '• Create an organization at: https://grata-labs.com/gitcache/account/',
        ].join('\n');
      }

      const currentOrgContext = this.authManager.getOrgId();

      const orgList = result.organizations
        .map((org) => {
          const role = ` (${org.role})`;
          const defaultMarker = org.isDefault ? ' 🏠 API Default' : '';
          const currentMarker =
            org.id === currentOrgContext ? ' 🎯 Current Context' : '';
          return `  • ${org.name} (ID: ${org.id})${role}${defaultMarker}${currentMarker}`;
        })
        .join('\n');

      const contextInfo = [];
      if (currentOrgContext && currentOrgContext !== 'unknown') {
        contextInfo.push(
          `\n💡 Your current organization context: ${currentOrgContext}`
        );
      } else {
        contextInfo.push(
          `\n⚠️  No organization context set. Use --org to set one.`
        );
      }
      if (
        result.defaultOrganization &&
        result.defaultOrganization !== currentOrgContext
      ) {
        contextInfo.push(
          `💡 API default organization: ${result.defaultOrganization}`
        );
      }

      return [
        `📋 Your Organizations (${result.organizations.length}):`,
        '',
        orgList,
        ...contextInfo,
        '',
        '🔧 Usage:',
        '  gitcache auth orgs --org <org-id>  # Switch organization context',
        '',
        '💡 The org-id sets your organization context for all GitCache operations.',
        '   🎯 = Currently configured organization context',
        '   🏠 = API default organization for your account',
      ].join('\n');
    } catch (error) {
      return [
        '❌ Failed to fetch organizations',
        '',
        `Error: ${String(error)}`,
        '',
        'Please verify:',
        '• Your authentication is valid',
        '• Network connectivity to GitCache',
        '• You have organization access permissions',
      ].join('\n');
    }
  }

  /**
   * Switch organization context
   */
  private async switchOrg(org: string): Promise<string> {
    const currentOrg = this.authManager.getOrgId();
    const userEmail = this.authManager.getEmail();

    console.log(`🔍 Already authenticated as: ${userEmail || 'user'}`);
    console.log(
      `🔄 Switching organization context from ${currentOrg} to ${org}...`
    );

    try {
      // Verify user has access to the requested organization
      const orgsResult = await this.registryClient.listOrganizations();
      const targetOrg = orgsResult.organizations.find(
        (o) => o.id === org || o.name === org
      );

      if (!targetOrg) {
        return [
          `❌ Organization "${org}" not found or not accessible`,
          '',
          'Available organizations:',
          ...orgsResult.organizations.map(
            (o) => `  • ${o.name} (ID: ${o.id}) - ${o.role}`
          ),
          '',
          '💡 Use: gitcache auth orgs',
        ].join('\n');
      }

      // Use organization ID (not name) for consistency
      const orgId = targetOrg.id;

      // Update auth data with new organization context
      if (this.authManager.updateOrgContext(orgId)) {
        return [
          '✅ Organization context updated successfully!',
          `🏢 Switched to: ${targetOrg.name} (${orgId}) - ${targetOrg.role}`,
          '',
          '🚀 Your gitcache commands now use the new organization context.',
          '',
          '💡 Next steps:',
          '   • Generate CI tokens: gitcache tokens create <name>',
          '   • List your tokens: gitcache tokens list',
          '   • Check status: gitcache auth status',
        ].join('\n');
      } else {
        return [
          '❌ Failed to update organization context',
          '',
          'Please try logging in again:',
          '  gitcache auth login <your-email>',
        ].join('\n');
      }
    } catch (error) {
      return [
        '❌ Failed to verify organization access',
        '',
        `Error: ${String(error)}`,
        '',
        'Please verify:',
        '• Organization name/ID is correct',
        '• You have access to the organization',
        '• Network connectivity to GitCache',
      ].join('\n');
    }
  }

  /**
   * Setup CI authentication
   */
  private async setupCI(opts: AuthOptions): Promise<string> {
    const { org, token } = opts;

    if (!org) {
      throw this.usageError(
        'Organization name is required for CI setup. Use --org <organization>'
      );
    }

    console.log(`🔗 Setting up GitCache CI authentication for: ${org}`);

    // Detect CI environment
    const ciEnv = detectCIEnvironment();

    // Auto-configuration for CI environments with tokens
    if (ciEnv.hasToken && !token) {
      const envToken = process.env.GITCACHE_TOKEN;
      if (envToken?.startsWith('ci_')) {
        const platform = ciEnv.detected ? ciEnv.platform : 'CI with token';
        console.log(`🤖 Auto-configuring for ${platform} environment`);

        try {
          // Validate CI token and extract organization
          const validation =
            await this.registryClient.validateCIToken(envToken);

          if (validation.valid && validation.organization) {
            // Use extracted organization, but warn if it differs from provided org
            const extractedOrg = validation.organization;
            if (extractedOrg !== org) {
              console.log(
                `⚠️  Using organization from token: ${extractedOrg} (overrides --org ${org})`
              );
            }

            return this.authenticateWithToken(envToken, extractedOrg);
          } else {
            console.log(`❌ CI token validation failed: ${validation.error}`);
            return this.showCIErrorGuidance(ciEnv);
          }
        } catch (error) {
          console.log(`❌ Failed to validate CI token: ${String(error)}`);
          return this.showCIErrorGuidance(ciEnv);
        }
      }
    }

    // Handle explicit token or missing token
    const ciToken = token || process.env.GITCACHE_TOKEN;

    if (!ciToken) {
      return [
        '❌ GitCache CI token not found',
        '',
        `Detected ${ciEnv?.platform || 'CI'} environment but no GITCACHE_TOKEN found.`,
        '',
        'To enable GitCache acceleration:',
        '1. Generate a CI token at: https://grata-labs.com/gitcache/account/dashboard/',
        '2. Set GITCACHE_TOKEN environment variable in your CI configuration',
        '3. Or use: gitcache auth setup-ci --org <organization> --token <ci-token>',
        '',
        'Your builds will continue using Git sources without acceleration.',
      ].join('\n');
    }

    if (!ciToken.startsWith('ci_')) {
      return [
        '❌ Invalid CI token format',
        '',
        'CI tokens must start with "ci_"',
        'Generate a new CI token at: https://grata-labs.com/gitcache/account/dashboard/',
      ].join('\n');
    }

    try {
      // Validate CI token with API
      const validation = await this.registryClient.validateCIToken(ciToken);

      if (!validation.valid) {
        return [
          '❌ GitCache CI token invalid or expired',
          '',
          `Error: ${validation.error}`,
          '',
          'To fix:',
          '1. Generate a new CI token at: https://grata-labs.com/gitcache/account/dashboard/',
          '2. Update GITCACHE_TOKEN in your CI environment',
          `3. Ensure the token has access to organization: ${org}`,
        ].join('\n');
      }

      // Use organization from token validation if available, otherwise use provided org
      const orgToUse = validation.organization || org;
      if (validation.organization && validation.organization !== org) {
        console.log(
          `ℹ️  Using organization from token: ${validation.organization}`
        );
      }

      return this.authenticateWithToken(ciToken, orgToUse);
    } catch (error) {
      return [
        '❌ Failed to validate CI token',
        '',
        `Error: ${String(error)}`,
        '',
        'Please check:',
        '- Network connectivity to GitCache registry',
        '- Token validity and permissions',
        '- Organization access rights',
        '',
        'Your builds will continue using Git sources.',
      ].join('\n');
    }
  }

  /**
   * Authenticate with CI token
   */
  private authenticateWithToken(token: string, orgId: string): string {
    // Store CI token
    this.authManager.storeAuthData({
      token,
      orgId,
      tokenType: 'ci',
      expiresAt: null, // CI tokens never expire
    });

    return [
      '✅ CI token configured successfully!',
      '✅ Registry acceleration enabled',
      `✅ Connected to organization: ${orgId}`,
      '',
      '🚀 Your CI builds will now use GitCache acceleration.',
      '',
      '💡 Next steps:',
      '   • Check status: gitcache auth status',
      '   • Test with: gitcache install',
    ].join('\n');
  }

  /**
   * Show CI error guidance
   */
  private showCIErrorGuidance(ciEnv: CIEnvironment): string {
    return [
      '❌ GitCache CI setup failed',
      '',
      `Detected ${ciEnv.platform} environment but CI token is invalid.`,
      '',
      'To enable GitCache acceleration:',
      '1. Generate a CI token at: https://grata-labs.com/gitcache/account/dashboard/',
      '2. Set GITCACHE_TOKEN environment variable in your CI configuration',
      '3. Or use: gitcache auth setup-ci --org <organization> --token <ci-token>',
      '',
      'Your builds will continue using Git sources without acceleration.',
    ].join('\n');
  }
}
