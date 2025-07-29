import { BaseCommand } from '../base-cmd.js';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getCacheDir } from '../lib/utils/path.js';
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

interface CIEnvironment {
  detected: boolean;
  platform: string;
  hasToken: boolean;
  tokenSource: 'environment' | 'manual' | 'none';
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

  async exec(args: string[], opts: SetupOptions = {}): Promise<string> {
    const { org, ci, token } = opts;

    if (!org) {
      throw this.usageError(
        'Organization name is required. Use --org <organization>'
      );
    }

    console.log(`🔗 Setting up GitCache registry for organization: ${org}`);

    // Detect CI environment
    const ciEnv = this.detectCIEnvironment();
    const isCIMode = ci || ciEnv.detected;

    if (isCIMode) {
      return this.setupCI(org, token, ciEnv);
    } else {
      return this.setupInteractive(org);
    }
  }

  private detectCIEnvironment(): CIEnvironment {
    const envToken = process.env.GITCACHE_TOKEN;

    let platform = 'local';
    let detected = false;

    if (process.env.GITHUB_ACTIONS === 'true') {
      platform = 'GitHub Actions';
      detected = true;
    } else if (process.env.GITLAB_CI === 'true') {
      platform = 'GitLab CI';
      detected = true;
    } else if (process.env.CIRCLECI === 'true') {
      platform = 'CircleCI';
      detected = true;
    } else if (process.env.CI === 'true') {
      platform = 'Generic CI';
      detected = true;
    }

    // Also detect if we have a CI token
    if (envToken?.startsWith('ci_')) {
      detected = true;
      if (platform === 'local') {
        platform = 'CI with token';
      }
    }

    return {
      detected,
      platform,
      hasToken: !!envToken,
      tokenSource: envToken ? 'environment' : 'none',
    };
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
        'CI token authentication is not yet fully implemented.',
        'For now, please use interactive mode:',
        `  gitcache setup --org ${org}`,
        '',
        'CI tokens will be available at: https://gitcache.grata-labs.com/tokens',
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
      const isValid = await this.validateCIToken(token, org);

      if (!isValid) {
        return [
          '❌ GitCache CI token invalid or expired',
          '',
          'Generate a new CI token at: https://gitcache.grata-labs.com/tokens',
          `Ensure the token has access to organization: ${org}`,
        ].join('\n');
      }

      // Store CI token
      this.storeAuthData({
        token,
        orgId: org,
        tokenType: 'ci',
        expiresAt: null, // CI tokens never expire
      });

      const result = [
        '✓ CI token configured',
        '✓ Registry acceleration enabled',
      ];

      if (ciEnv?.detected) {
        result.push(`✓ Detected ${ciEnv.platform} environment`);
      }

      return result.join('\n');
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('not yet implemented')
      ) {
        return [
          '❌ CI token authentication not yet implemented',
          '',
          'For now, please use interactive mode:',
          `  gitcache setup --org ${org}`,
          '',
          'CI tokens will be available in a future update.',
        ].join('\n');
      }

      return [
        '❌ Failed to validate CI token',
        '',
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        '',
        'Please check:',
        '- Network connectivity',
        '- Token validity',
        '- Organization access permissions',
      ].join('\n');
    }
  }

  private async setupInteractive(org: string): Promise<string> {
    try {
      console.log(`🔗 Setting up GitCache registry for organization: ${org}`);
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
    return new Promise((resolve, reject) => {
      let password = '';

      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      const cleanup = () => {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeAllListeners('data');
      };

      stdin.on('data', (key: string) => {
        switch (key) {
          case '\n':
          case '\r':
          case '\r\n':
            cleanup();
            resolve(password);
            break;
          case '\u0003': // Ctrl+C
            cleanup();
            reject(new Error('SIGINT'));
            break;
          case '\u007f': // Backspace
          case '\b':
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            password += key;
            process.stdout.write('*');
            break;
        }
      });
    });
  }

  private async validateCIToken(token: string, org: string): Promise<boolean> {
    const apiUrl = this.getApiUrl();

    // Note: CI token validation endpoint not yet implemented in infrastructure
    // For now, this is a placeholder that would validate against /auth/ci-token/validate
    const response = await fetch(`${apiUrl}/auth/ci-token/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        token,
        organization: org,
      }),
    });

    if (!response.ok) {
      // For now, assume CI tokens are not implemented and return error
      if (response.status === 404) {
        throw new Error(
          'CI token authentication not yet implemented. Please use interactive mode.'
        );
      }
      const error = await response
        .json()
        .catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(error.error?.message || `HTTP ${response.status}`);
    }

    return true;
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
