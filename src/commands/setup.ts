import { BaseCommand } from '../base-cmd.js';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getCacheDir } from '../lib/utils/path.js';
import {
  detectCIEnvironment,
  isInCI,
  CIEnvironment,
} from '../lib/ci-environment.js';
import { RegistryClient, RegistryConfig } from '../lib/registry-client.js';
import * as readline from 'node:readline/promises';

export interface SetupOptions {
  org?: string;
  ci?: boolean;
  token?: string;
}

interface AuthData {
  token: string;
  email?: string;
  orgId: string;
  tokenType: 'user' | 'ci';
  expiresAt: number | null;
}

export class Setup extends BaseCommand {
  static description = 'Setup GitCache registry access for team acceleration';
  static commandName = 'setup';
  static usage = [
    '--org <organization>',
    '--ci --org <organization>',
    '--ci --org <organization> --token <ci-token>',
  ];
  static params = ['org', 'ci', 'token'];
  static argumentSpec = { type: 'none' } as const;

  private _registryClient?: RegistryClient;

  private get registryClient(): RegistryClient {
    if (!this._registryClient) {
      // Create config that respects current environment variables
      const config: Partial<RegistryConfig> = {};
      if (process.env.GITCACHE_API_URL) {
        config.apiUrl = process.env.GITCACHE_API_URL;
      }
      this._registryClient = new RegistryClient(config);
    }
    return this._registryClient;
  }

  async exec(args: string[], opts: SetupOptions = {}): Promise<string> {
    const { org, ci, token } = opts;

    if (!org) {
      throw this.usageError(
        'Organization name is required. Use --org <organization>'
      );
    }

    console.log(`🔗 Setting up GitCache registry for organization: ${org}`);

    // Detect CI environment
    const ciEnv = detectCIEnvironment();
    const isCIMode = ci || ciEnv.detected;

    // Auto-configuration for CI environments and local environments with CI tokens
    if (ciEnv.hasToken && !ci && !token) {
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

    if (isCIMode) {
      return this.setupCI(org, token, ciEnv);
    } else {
      return this.setupInteractive(org);
    }
  }

  private authenticateWithToken(token: string, orgId: string): string {
    // Store CI token
    this.storeAuthData({
      token,
      orgId,
      tokenType: 'ci',
      expiresAt: null, // CI tokens never expire
    });

    return [
      '✓ CI token configured',
      '✓ Registry acceleration enabled',
      `✓ Connected to organization: ${orgId}`,
    ].join('\n');
  }

  private showCIErrorGuidance(ciEnv: CIEnvironment): string {
    return [
      '❌ GitCache CI setup failed',
      '',
      `Detected ${ciEnv.platform} environment but CI token is invalid.`,
      '',
      'To enable GitCache acceleration:',
      '1. Generate a CI token at: https://gitcache.grata-labs.com/tokens',
      '2. Set GITCACHE_TOKEN environment variable in your CI configuration',
      '',
      'Your builds will continue using Git sources without acceleration.',
    ].join('\n');
  }

  private async setupCI(
    org: string,
    explicitToken?: string,
    ciEnv?: CIEnvironment
  ): Promise<string> {
    const token = explicitToken || process.env.GITCACHE_TOKEN;

    if (!token) {
      return [
        '❌ GitCache CI token not found',
        '',
        `Detected ${ciEnv?.platform || 'CI'} environment but no GITCACHE_TOKEN found.`,
        '',
        'To enable GitCache acceleration:',
        '1. Generate a CI token at: https://gitcache.grata-labs.com/tokens',
        '2. Set GITCACHE_TOKEN environment variable in your CI configuration',
        '',
        'Your builds will continue using Git sources without acceleration.',
      ].join('\n');
    }

    if (!token.startsWith('ci_')) {
      return [
        '❌ Invalid CI token format',
        '',
        'CI tokens must start with "ci_"',
        'Generate a new CI token at: https://gitcache.grata-labs.com/tokens',
      ].join('\n');
    }

    try {
      // Validate CI token with API
      const validation = await this.registryClient.validateCIToken(token);

      if (!validation.valid) {
        return [
          '❌ GitCache CI token invalid or expired',
          '',
          `Error: ${validation.error}`,
          '',
          'To fix:',
          '1. Generate a new CI token at: https://gitcache.grata-labs.com/tokens',
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

      return this.authenticateWithToken(token, orgToUse);
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

  private async setupInteractive(org: string): Promise<string> {
    // Don't allow interactive setup in CI environments
    if (isInCI()) {
      return [
        '❌ Interactive setup not available in CI',
        '',
        'Detected CI environment. Use CI token authentication instead:',
        '1. Generate a CI token at: https://gitcache.grata-labs.com/tokens',
        '2. Set GITCACHE_TOKEN environment variable',
        '3. Run: gitcache setup --org <organization> --ci',
        '',
        'Your builds will continue using Git sources.',
      ].join('\n');
    }

    try {
      console.log('');

      // Get email
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const email = await rl.question('Email: ');
      if (!email) {
        rl.close();
        throw new Error('Email is required');
      }

      // Get password with masking
      process.stdout.write('Password: ');
      const password = await this.getPasswordInput();
      rl.close();

      console.log(''); // New line after password input

      // Authenticate with API
      const authResult = await this.authenticateUser(email, password, org);

      // Store user token
      this.storeAuthData({
        token: authResult.token,
        email,
        orgId: org,
        tokenType: 'user',
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      return [
        '✓ Connected to GitCache registry',
        `✓ Team cache sharing enabled for ${org}`,
        '',
        '🚀 Your gitcache install commands will now be accelerated!',
        '   Team members will automatically share cached dependencies',
      ].join('\n');
    } catch (error) {
      if (error instanceof Error && error.message.includes('SIGINT')) {
        return '\n❌ Setup cancelled by user';
      }

      return [
        '❌ Setup failed',
        '',
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        '',
        'Please verify:',
        '- Email and password are correct',
        '- You have access to the organization',
        '- Network connectivity to GitCache registry',
      ].join('\n');
    }
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

  private async authenticateUser(
    email: string,
    password: string,
    _org: string
  ): Promise<{ token: string }> {
    const apiUrl = this.getApiUrl();

    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        // Note: organization parameter may not be used in current auth implementation
        // The user's organizationId is determined by their account
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: { message: 'Authentication failed' } }));
      throw new Error(error.error?.message || 'Invalid credentials');
    }

    const result = await response.json();
    return { token: result.token };
  }

  private storeAuthData(authData: AuthData): void {
    const cacheDir = getCacheDir();
    const authPath = join(cacheDir, 'auth.json');
    const authDir = dirname(authPath);

    // Ensure directory exists
    if (!existsSync(authDir)) {
      mkdirSync(authDir, { recursive: true });
    }

    writeFileSync(authPath, JSON.stringify(authData, null, 2), 'utf8');
  }

  private getApiUrl(): string {
    return process.env.GITCACHE_API_URL || 'https://gitcache.grata-labs.com';
  }
}
