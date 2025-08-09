/**
 * CI Environment Detection and Management
 *
 * Provides utilities for detecting CI environments and managing CI-specific behavior
 */

export interface CIEnvironment {
  detected: boolean;
  platform: string;
  hasToken: boolean;
  tokenSource: 'environment' | 'manual' | 'none';
}

/**
 * Detect if we're running in a CI environment and what platform
 */
export function detectCIEnvironment(): CIEnvironment {
  const envToken = process.env.GITCACHE_TOKEN;

  let platform = 'local';
  let detected = false;

  // Check for specific CI platforms
  if (process.env.GITHUB_ACTIONS === 'true') {
    platform = 'GitHub Actions';
    detected = true;
  } else if (process.env.GITLAB_CI === 'true') {
    platform = 'GitLab CI';
    detected = true;
  } else if (process.env.CIRCLECI === 'true') {
    platform = 'CircleCI';
    detected = true;
  } else if (process.env.JENKINS_HOME) {
    platform = 'Jenkins';
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

/**
 * Check if we're running in any CI environment
 */
export function isInCI(): boolean {
  return detectCIEnvironment().detected;
}

/**
 * Check if we should run in non-interactive mode
 */
export function shouldBeNonInteractive(): boolean {
  return isInCI();
}

/**
 * Get CI-specific error messages for common issues
 */
export function getCIErrorMessage(
  errorType: string,
  context?: Record<string, unknown>
): string {
  const ciEnv = detectCIEnvironment();

  if (errorType === 'authentication_required') {
    return [
      '❌ GitCache authentication required in CI',
      '',
      'To enable GitCache acceleration in CI:',
      '1. Generate a CI token at: https://grata-labs.com/gitcache/account/dashboard/',
      '2. Add GITCACHE_TOKEN environment variable to your CI configuration',
      '',
      `Example for ${ciEnv.platform}:`,
      getTokenSetupExample(ciEnv.platform),
      '',
      'Builds will continue using Git sources without acceleration.',
    ].join('\n');
  }

  if (errorType === 'token_invalid') {
    return [
      '❌ Invalid GitCache CI token',
      '',
      'Your CI token may be expired or revoked.',
      '',
      'To fix:',
      '1. Generate a new CI token at: https://grata-labs.com/gitcache/account/dashboard/',
      '2. Update GITCACHE_TOKEN in your CI environment',
      '',
      'Builds will continue using Git sources without acceleration.',
    ].join('\n');
  }

  if (errorType === 'network_error') {
    return [
      '⚠️  GitCache registry unreachable',
      '',
      'Unable to connect to GitCache registry.',
      'This may be due to network restrictions or temporary issues.',
      '',
      'Your build will continue using Git sources.',
      'No action required - this is expected in some CI environments.',
    ].join('\n');
  }

  if (errorType === 'quota_exceeded') {
    return [
      '⚠️  GitCache usage quota exceeded',
      '',
      'Your organization has reached its GitCache usage limit.',
      '',
      'To continue using GitCache acceleration:',
      '1. Visit: https://grata-labs.com/gitcache/account/dashboard/',
      '2. Upgrade your plan or wait for quota reset',
      '',
      'Builds will continue using Git sources.',
    ].join('\n');
  }

  if (errorType === 'organization_access') {
    const orgId = context?.orgId || 'your-org';
    return [
      '❌ GitCache organization access denied',
      '',
      `Your CI token does not have access to organization: ${orgId}`,
      '',
      'To fix:',
      `1. Verify the organization name is correct: ${orgId}`,
      '2. Ensure your CI token has access to this organization',
      '3. Generate a new token if needed: https://grata-labs.com/gitcache/account/dashboard/',
      '',
      'Builds will continue using Git sources without acceleration.',
    ].join('\n');
  }

  // Default case
  return [
    '❌ GitCache error in CI environment',
    '',
    `Error: ${errorType}`,
    '',
    'Your build will continue using Git sources.',
    'For support, visit: https://grata-labs.com/gitcache/account/dashboard/',
  ].join('\n');
}

/**
 * Get platform-specific examples for setting up CI tokens
 */
function getTokenSetupExample(platform: string): string {
  switch (platform) {
    case 'GitHub Actions':
      return [
        '# In your .github/workflows/*.yml:',
        'env:',
        '  GITCACHE_TOKEN: ${{ secrets.GITCACHE_TOKEN }}',
        '',
        '# Add GITCACHE_TOKEN to your repository secrets',
      ].join('\n');

    case 'GitLab CI':
      return [
        '# In your .gitlab-ci.yml:',
        'variables:',
        '  GITCACHE_TOKEN: $GITCACHE_TOKEN',
        '',
        '# Add GITCACHE_TOKEN to your project CI/CD variables',
      ].join('\n');

    case 'CircleCI':
      return [
        '# In your .circleci/config.yml:',
        'environment:',
        '  GITCACHE_TOKEN: $GITCACHE_TOKEN',
        '',
        '# Add GITCACHE_TOKEN to your project environment variables',
      ].join('\n');

    case 'Jenkins':
      return [
        '// In your Jenkinsfile:',
        'environment {',
        '  GITCACHE_TOKEN = credentials("gitcache-token")',
        '}',
        '',
        '// Add gitcache-token credential to Jenkins',
      ].join('\n');

    default:
      return [
        '# Set environment variable in your CI configuration:',
        'GITCACHE_TOKEN=ci_your_token_here',
      ].join('\n');
  }
}
