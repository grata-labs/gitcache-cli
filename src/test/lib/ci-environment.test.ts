import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectCIEnvironment,
  isInCI,
  shouldBeNonInteractive,
  getCIErrorMessage,
} from '../../lib/ci-environment.js';

describe('CI Environment Detection', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear CI-related environment variables
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.CIRCLECI;
    delete process.env.JENKINS_HOME;
    delete process.env.GITCACHE_TOKEN;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('detectCIEnvironment', () => {
    it('should detect local environment by default', () => {
      const env = detectCIEnvironment();

      expect(env).toEqual({
        detected: false,
        platform: 'local',
        hasToken: false,
        tokenSource: 'none',
      });
    });

    it('should detect GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';

      const env = detectCIEnvironment();

      expect(env).toEqual({
        detected: true,
        platform: 'GitHub Actions',
        hasToken: false,
        tokenSource: 'none',
      });
    });

    it('should detect GitLab CI', () => {
      process.env.GITLAB_CI = 'true';

      const env = detectCIEnvironment();

      expect(env).toEqual({
        detected: true,
        platform: 'GitLab CI',
        hasToken: false,
        tokenSource: 'none',
      });
    });

    it('should detect CircleCI', () => {
      process.env.CIRCLECI = 'true';

      const env = detectCIEnvironment();

      expect(env).toEqual({
        detected: true,
        platform: 'CircleCI',
        hasToken: false,
        tokenSource: 'none',
      });
    });

    it('should detect Jenkins', () => {
      process.env.JENKINS_HOME = '/var/jenkins_home';

      const env = detectCIEnvironment();

      expect(env).toEqual({
        detected: true,
        platform: 'Jenkins',
        hasToken: false,
        tokenSource: 'none',
      });
    });

    it('should detect generic CI', () => {
      process.env.CI = 'true';

      const env = detectCIEnvironment();

      expect(env).toEqual({
        detected: true,
        platform: 'Generic CI',
        hasToken: false,
        tokenSource: 'none',
      });
    });

    it('should prioritize specific platforms over generic CI', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';

      const env = detectCIEnvironment();

      expect(env.platform).toBe('GitHub Actions');
      expect(env.detected).toBe(true);
    });

    it('should detect CI token presence', () => {
      process.env.GITCACHE_TOKEN = 'ci_test_token_123';

      const env = detectCIEnvironment();

      expect(env).toEqual({
        detected: true,
        platform: 'CI with token',
        hasToken: true,
        tokenSource: 'environment',
      });
    });

    it('should detect CI token with specific platform', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITCACHE_TOKEN = 'ci_test_token_123';

      const env = detectCIEnvironment();

      expect(env).toEqual({
        detected: true,
        platform: 'GitHub Actions',
        hasToken: true,
        tokenSource: 'environment',
      });
    });

    it('should detect regular token (not CI)', () => {
      process.env.GITCACHE_TOKEN = 'user_test_token_123';

      const env = detectCIEnvironment();

      expect(env).toEqual({
        detected: false,
        platform: 'local',
        hasToken: true,
        tokenSource: 'environment',
      });
    });

    it('should handle empty token', () => {
      process.env.GITCACHE_TOKEN = '';

      const env = detectCIEnvironment();

      expect(env).toEqual({
        detected: false,
        platform: 'local',
        hasToken: false,
        tokenSource: 'none',
      });
    });
  });

  describe('isInCI', () => {
    it('should return false in local environment', () => {
      expect(isInCI()).toBe(false);
    });

    it('should return true in CI environment', () => {
      process.env.GITHUB_ACTIONS = 'true';

      expect(isInCI()).toBe(true);
    });

    it('should return true with CI token', () => {
      process.env.GITCACHE_TOKEN = 'ci_test_token_123';

      expect(isInCI()).toBe(true);
    });
  });

  describe('shouldBeNonInteractive', () => {
    it('should return false in local environment', () => {
      expect(shouldBeNonInteractive()).toBe(false);
    });

    it('should return true in CI environment', () => {
      process.env.CI = 'true';

      expect(shouldBeNonInteractive()).toBe(true);
    });
  });

  describe('getCIErrorMessage', () => {
    beforeEach(() => {
      process.env.GITHUB_ACTIONS = 'true';
    });

    it('should provide authentication_required message', () => {
      const message = getCIErrorMessage('authentication_required');

      expect(message).toContain('GitCache authentication required in CI');
      expect(message).toContain('Generate a CI token');
      expect(message).toContain('GITCACHE_TOKEN');
      expect(message).toContain('GitHub Actions');
    });

    it('should provide token_invalid message', () => {
      const message = getCIErrorMessage('token_invalid');

      expect(message).toContain('Invalid GitCache CI token');
      expect(message).toContain('expired or revoked');
      expect(message).toContain('Generate a new CI token');
    });

    it('should provide network_error message', () => {
      const message = getCIErrorMessage('network_error');

      expect(message).toContain('GitCache registry unreachable');
      expect(message).toContain('continue using Git sources');
      expect(message).toContain('network restrictions');
    });

    it('should provide quota_exceeded message', () => {
      const message = getCIErrorMessage('quota_exceeded');

      expect(message).toContain('usage quota exceeded');
      expect(message).toContain('Upgrade your plan');
    });

    it('should provide organization_access message with context', () => {
      const message = getCIErrorMessage('organization_access', {
        orgId: 'test-org',
      });

      expect(message).toContain('organization access denied');
      expect(message).toContain('test-org');
      expect(message).toContain('CI token does not have access');
    });

    it('should provide organization_access message with falsey orgId', () => {
      const message = getCIErrorMessage('organization_access', { orgId: null });

      expect(message).toContain('organization access denied');
      expect(message).toContain('your-org'); // Should use default fallback
      expect(message).toContain('CI token does not have access');
    });

    it('should provide organization_access message with undefined context', () => {
      const message = getCIErrorMessage('organization_access');

      expect(message).toContain('organization access denied');
      expect(message).toContain('your-org'); // Should use default fallback
      expect(message).toContain('CI token does not have access');
    });

    it('should provide default message for unknown error', () => {
      const message = getCIErrorMessage('unknown_error');

      expect(message).toContain('GitCache error in CI environment');
      expect(message).toContain('unknown_error');
      expect(message).toContain('continue using Git sources');
    });

    it('should adapt platform-specific examples', () => {
      // Test GitHub Actions
      process.env.GITHUB_ACTIONS = 'true';
      delete process.env.GITLAB_CI;

      const githubMessage = getCIErrorMessage('authentication_required');
      expect(githubMessage).toContain('.github/workflows');
      expect(githubMessage).toContain('secrets.GITCACHE_TOKEN');

      // Test GitLab CI
      delete process.env.GITHUB_ACTIONS;
      process.env.GITLAB_CI = 'true';

      const gitlabMessage = getCIErrorMessage('authentication_required');
      expect(gitlabMessage).toContain('.gitlab-ci.yml');
      expect(gitlabMessage).toContain('CI/CD variables');

      // Test CircleCI
      delete process.env.GITLAB_CI;
      process.env.CIRCLECI = 'true';

      const circleMessage = getCIErrorMessage('authentication_required');
      expect(circleMessage).toContain('.circleci/config.yml');
      expect(circleMessage).toContain('environment variables');

      // Test Jenkins
      delete process.env.CIRCLECI;
      process.env.JENKINS_HOME = '/var/jenkins_home';

      const jenkinsMessage = getCIErrorMessage('authentication_required');
      expect(jenkinsMessage).toContain('Jenkinsfile');
      expect(jenkinsMessage).toContain('credentials');
    });
  });

  describe('edge cases', () => {
    it('should handle multiple CI indicators', () => {
      process.env.CI = 'true';
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITLAB_CI = 'true';

      const env = detectCIEnvironment();

      // Should prioritize the first specific platform detected
      expect(env.detected).toBe(true);
      expect(env.platform).toBe('GitHub Actions');
    });

    it('should handle case sensitivity', () => {
      process.env.CI = 'TRUE'; // Different case

      const env = detectCIEnvironment();

      expect(env.detected).toBe(false); // Should be case sensitive
    });

    it('should handle undefined vs empty values', () => {
      process.env.GITHUB_ACTIONS = '';

      const env = detectCIEnvironment();

      expect(env.detected).toBe(false);
    });

    it('should handle falsy CI values', () => {
      process.env.CI = 'false';

      const env = detectCIEnvironment();

      expect(env.detected).toBe(false);
    });
  });

  describe('getTokenSetupExample default case', () => {
    it('should use default token setup example for unrecognized platform', () => {
      // Ensure we're in local environment with no recognized CI platform
      delete process.env.GITHUB_ACTIONS;
      delete process.env.GITLAB_CI;
      delete process.env.CIRCLECI;
      delete process.env.JENKINS_HOME;
      delete process.env.CI;
      delete process.env.GITCACHE_TOKEN;

      // This will create a scenario where platform is 'local' and trigger the default case
      const message = getCIErrorMessage('authentication_required');

      // Verify it contains the default example from the default case
      expect(message).toContain('Example for local:');
      expect(message).toContain(
        '# Set environment variable in your CI configuration:'
      );
      expect(message).toContain('GITCACHE_TOKEN=ci_your_token_here');

      // Verify it does NOT contain platform-specific examples
      expect(message).not.toContain('.github/workflows');
      expect(message).not.toContain('.gitlab-ci.yml');
      expect(message).not.toContain('.circleci/config.yml');
      expect(message).not.toContain('Jenkinsfile');
    });
  });
});
