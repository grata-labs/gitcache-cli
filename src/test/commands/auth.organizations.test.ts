import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../commands/auth.js';
import { RegistryClient } from '../../lib/registry-client.js';

// Mock dependencies
vi.mock('../../lib/auth-manager.js');
vi.mock('../../lib/registry-client.js');

describe('Auth - Organization Management', () => {
  describe('switchOrg', () => {
    let mockAuthManager: any;
    let mockRegistryClient: any;
    let originalConsoleLog: any;
    let authCommand: Auth;

    beforeEach(() => {
      // Mock console.log to capture output
      originalConsoleLog = console.log;
      console.log = vi.fn();

      // Create fresh auth command instance
      authCommand = new Auth();

      // Setup auth manager mock
      mockAuthManager = {
        getOrgId: vi.fn(),
        getEmail: vi.fn(),
        updateOrgContext: vi.fn(),
      };
      (authCommand as any).authManager = mockAuthManager;

      // Setup registry client mock
      mockRegistryClient = {
        listOrganizations: vi.fn(),
      };
      (authCommand as any)._registryClient = mockRegistryClient;
    });

    afterEach(() => {
      console.log = originalConsoleLog;
      vi.clearAllMocks();
    });

    it('should successfully switch organization by ID', async () => {
      const currentOrg = 'current-org';
      const targetOrg = 'target-org';
      const userEmail = 'user@example.com';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);
      mockAuthManager.updateOrgContext.mockReturnValue(true);

      const mockOrganizations = {
        organizations: [
          { id: 'current-org', name: 'Current Org', role: 'member' },
          { id: 'target-org', name: 'Target Org', role: 'admin' },
        ],
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(targetOrg);

      expect(console.log).toHaveBeenCalledWith(
        `🔍 Already authenticated as: ${userEmail}`
      );
      expect(console.log).toHaveBeenCalledWith(
        `🔄 Switching organization context from ${currentOrg} to ${targetOrg}...`
      );
      expect(mockRegistryClient.listOrganizations).toHaveBeenCalled();
      expect(mockAuthManager.updateOrgContext).toHaveBeenCalledWith(targetOrg);

      expect(result).toContain('✅ Organization context updated successfully!');
      expect(result).toContain(
        '🏢 Switched to: Target Org (target-org) - admin'
      );
      expect(result).toContain(
        '🚀 Your gitcache commands now use the new organization context.'
      );
      expect(result).toContain('💡 Next steps:');
      expect(result).toContain(
        '• Generate CI tokens: gitcache tokens create <name>'
      );
    });

    it('should successfully switch organization by name', async () => {
      const currentOrg = 'current-org';
      const targetOrgName = 'Target Org';
      const targetOrgId = 'target-org';
      const userEmail = 'user@example.com';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);
      mockAuthManager.updateOrgContext.mockReturnValue(true);

      const mockOrganizations = {
        organizations: [
          { id: 'current-org', name: 'Current Org', role: 'member' },
          { id: 'target-org', name: 'Target Org', role: 'admin' },
        ],
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(targetOrgName);

      expect(mockAuthManager.updateOrgContext).toHaveBeenCalledWith(
        targetOrgId
      );
      expect(result).toContain('✅ Organization context updated successfully!');
      expect(result).toContain(
        '🏢 Switched to: Target Org (target-org) - admin'
      );
    });

    it('should handle organization not found or not accessible', async () => {
      const currentOrg = 'current-org';
      const invalidOrg = 'invalid-org';
      const userEmail = 'user@example.com';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);

      const mockOrganizations = {
        organizations: [
          { id: 'current-org', name: 'Current Org', role: 'member' },
          { id: 'other-org', name: 'Other Org', role: 'viewer' },
        ],
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(invalidOrg);

      expect(mockAuthManager.updateOrgContext).not.toHaveBeenCalled();
      expect(result).toContain(
        '❌ Organization "invalid-org" not found or not accessible'
      );
      expect(result).toContain('Available organizations:');
      expect(result).toContain('• Current Org (ID: current-org) - member');
      expect(result).toContain('• Other Org (ID: other-org) - viewer');
      expect(result).toContain('💡 Use: gitcache auth orgs');
    });

    it('should handle auth manager update failure', async () => {
      const currentOrg = 'current-org';
      const targetOrg = 'target-org';
      const userEmail = 'user@example.com';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);
      mockAuthManager.updateOrgContext.mockReturnValue(false); // Simulate failure

      const mockOrganizations = {
        organizations: [
          { id: 'current-org', name: 'Current Org', role: 'member' },
          { id: 'target-org', name: 'Target Org', role: 'admin' },
        ],
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(targetOrg);

      expect(mockAuthManager.updateOrgContext).toHaveBeenCalledWith(targetOrg);
      expect(result).toContain('❌ Failed to update organization context');
      expect(result).toContain('Please try logging in again:');
      expect(result).toContain('gitcache auth login <your-email>');
    });

    it('should handle registry client network errors', async () => {
      const currentOrg = 'current-org';
      const targetOrg = 'target-org';
      const userEmail = 'user@example.com';
      const networkError = new Error('Network timeout');

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);
      mockRegistryClient.listOrganizations.mockRejectedValue(networkError);

      const result = await (authCommand as any).switchOrg(targetOrg);

      expect(mockAuthManager.updateOrgContext).not.toHaveBeenCalled();
      expect(result).toContain('❌ Failed to verify organization access');
      expect(result).toContain('Error: Network timeout');
      expect(result).toContain('Please verify:');
      expect(result).toContain('• Organization name/ID is correct');
      expect(result).toContain('• You have access to the organization');
      expect(result).toContain('• Network connectivity to GitCache');
    });

    it('should handle missing user email gracefully', async () => {
      const currentOrg = 'current-org';
      const targetOrg = 'target-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(null); // No email
      mockAuthManager.updateOrgContext.mockReturnValue(true);

      const mockOrganizations = {
        organizations: [
          { id: 'target-org', name: 'Target Org', role: 'admin' },
        ],
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(targetOrg);

      expect(console.log).toHaveBeenCalledWith(
        '🔍 Already authenticated as: user'
      );
      expect(result).toContain('✅ Organization context updated successfully!');
    });

    it('should handle empty organizations list', async () => {
      const currentOrg = 'current-org';
      const targetOrg = 'target-org';
      const userEmail = 'user@example.com';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);

      const mockOrganizations = {
        organizations: [], // Empty list
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(targetOrg);

      expect(result).toContain(
        '❌ Organization "target-org" not found or not accessible'
      );
      expect(result).toContain('Available organizations:');
      expect(result).toContain('💡 Use: gitcache auth orgs');
    });

    it('should handle organizations with various role types', async () => {
      const currentOrg = 'current-org';
      const targetOrg = 'admin-org';
      const userEmail = 'user@example.com';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);
      mockAuthManager.updateOrgContext.mockReturnValue(true);

      const mockOrganizations = {
        organizations: [
          { id: 'current-org', name: 'Current Org', role: 'member' },
          { id: 'viewer-org', name: 'Viewer Org', role: 'viewer' },
          { id: 'admin-org', name: 'Admin Org', role: 'admin' },
          { id: 'owner-org', name: 'Owner Org', role: 'owner' },
        ],
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(targetOrg);

      expect(result).toContain('🏢 Switched to: Admin Org (admin-org) - admin');
    });

    it('should handle organization names with special characters', async () => {
      const currentOrg = 'special-org';
      const targetOrgName = 'Special-Org & Co.';
      const targetOrgId = 'special-org-co';
      const userEmail = 'user@example.com';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);
      mockAuthManager.updateOrgContext.mockReturnValue(true);

      const mockOrganizations = {
        organizations: [
          { id: 'current-org', name: 'Current Org', role: 'member' },
          { id: 'special-org-co', name: 'Special-Org & Co.', role: 'admin' },
        ],
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(targetOrgName);

      expect(mockAuthManager.updateOrgContext).toHaveBeenCalledWith(
        targetOrgId
      );
      expect(result).toContain(
        '🏢 Switched to: Special-Org & Co. (special-org-co) - admin'
      );
    });

    it('should handle case-sensitive organization matching', async () => {
      const currentOrg = 'current-org';
      const targetOrgMixedCase = 'Target-Org';
      const userEmail = 'user@example.com';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);

      const mockOrganizations = {
        organizations: [
          { id: 'current-org', name: 'Current Org', role: 'member' },
          { id: 'target-org', name: 'target-org', role: 'admin' }, // lowercase
        ],
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(targetOrgMixedCase);

      // Should not find match due to case sensitivity
      expect(result).toContain(
        '❌ Organization "Target-Org" not found or not accessible'
      );
    });

    it('should prefer exact ID match over name match', async () => {
      const currentOrg = 'current-org';
      const searchTerm = 'duplicate';
      const userEmail = 'user@example.com';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);
      mockAuthManager.updateOrgContext.mockReturnValue(true);

      const mockOrganizations = {
        organizations: [
          { id: 'current-org', name: 'Current Org', role: 'member' },
          { id: 'duplicate', name: 'Duplicate Name Org', role: 'admin' }, // ID matches
          { id: 'other-id', name: 'duplicate', role: 'viewer' }, // Name matches
        ],
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(searchTerm);

      // Should match by ID first
      expect(mockAuthManager.updateOrgContext).toHaveBeenCalledWith(
        'duplicate'
      );
      expect(result).toContain(
        '🏢 Switched to: Duplicate Name Org (duplicate) - admin'
      );
    });

    it('should handle undefined organization fields gracefully', async () => {
      const currentOrg = 'current-org';
      const targetOrg = 'target-org';
      const userEmail = 'user@example.com';

      mockAuthManager.getOrgId.mockReturnValue(currentOrg);
      mockAuthManager.getEmail.mockReturnValue(userEmail);
      mockAuthManager.updateOrgContext.mockReturnValue(true);

      const mockOrganizations = {
        organizations: [
          {
            id: 'target-org',
            name: undefined,
            role: undefined,
            isDefault: undefined,
          },
          { id: 'null-org', name: null, role: null, isDefault: null },
        ],
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).switchOrg(targetOrg);

      expect(result).toContain('✅ Organization context updated successfully!');
      expect(result).toContain(
        '🏢 Switched to: undefined (target-org) - undefined'
      );
    });
  });

  describe('listOrganizations', () => {
    let mockAuthManager: any;
    let mockRegistryClient: any;
    let originalConsoleLog: any;
    let authCommand: Auth;

    beforeEach(() => {
      // Mock console.log to capture output
      originalConsoleLog = console.log;
      console.log = vi.fn();

      // Create fresh auth command instance
      authCommand = new Auth();

      // Setup auth manager mock
      mockAuthManager = {
        getOrgId: vi.fn(),
      };
      (authCommand as any).authManager = mockAuthManager;

      // Setup registry client mock
      mockRegistryClient = {
        listOrganizations: vi.fn(),
      };
      (authCommand as any)._registryClient = mockRegistryClient;
    });

    afterEach(() => {
      console.log = originalConsoleLog;
      vi.clearAllMocks();
    });

    it('should successfully list organizations with current context', async () => {
      const currentOrgContext = 'test-org';
      const defaultOrgId = 'default-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrgContext);

      const mockOrganizations = {
        organizations: [
          {
            id: 'test-org',
            name: 'Test Organization',
            role: 'admin',
            isDefault: false,
          },
          {
            id: 'default-org',
            name: 'Default Organization',
            role: 'member',
            isDefault: true,
          },
          {
            id: 'other-org',
            name: 'Other Organization',
            role: 'viewer',
            isDefault: false,
          },
        ],
        defaultOrganization: defaultOrgId,
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(console.log).toHaveBeenCalledWith(
        '🔍 Fetching your organizations...'
      );
      expect(mockRegistryClient.listOrganizations).toHaveBeenCalled();

      expect(result).toContain('📋 Your Organizations (3):');
      expect(result).toContain(
        '• Test Organization (ID: test-org) (admin) 🎯 Current Context'
      );
      expect(result).toContain(
        '• Default Organization (ID: default-org) (member) 🏠 API Default'
      );
      expect(result).toContain('• Other Organization (ID: other-org) (viewer)');
      expect(result).toContain(
        '💡 Your current organization context: test-org'
      );
      expect(result).toContain('💡 API default organization: default-org');
      expect(result).toContain('🔧 Usage:');
      expect(result).toContain('gitcache auth orgs --org <org-id>');
    });

    it('should handle organizations with no current context set', async () => {
      mockAuthManager.getOrgId.mockReturnValue('unknown');

      const mockOrganizations = {
        organizations: [
          {
            id: 'org1',
            name: 'Organization One',
            role: 'admin',
            isDefault: false,
          },
          {
            id: 'org2',
            name: 'Organization Two',
            role: 'member',
            isDefault: false,
          },
        ],
        defaultOrganization: 'org1',
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain('📋 Your Organizations (2):');
      expect(result).toContain(
        '⚠️  No organization context set. Use --org to set one.'
      );
      expect(result).toContain('💡 API default organization: org1');
    });

    it('should handle organizations with null current context', async () => {
      mockAuthManager.getOrgId.mockReturnValue(null);

      const mockOrganizations = {
        organizations: [
          {
            id: 'org1',
            name: 'Organization One',
            role: 'admin',
            isDefault: false,
          },
        ],
        defaultOrganization: 'org1',
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain(
        '⚠️  No organization context set. Use --org to set one.'
      );
    });

    it('should handle empty organizations list', async () => {
      mockAuthManager.getOrgId.mockReturnValue('test-org');

      const mockOrganizations = {
        organizations: [],
        defaultOrganization: null,
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain('📝 No organizations found');
      expect(result).toContain('You may need to:');
      expect(result).toContain(
        '• Contact your administrator for organization access'
      );
      expect(result).toContain(
        '• Create an organization at: https://grata-labs.com/gitcache/account/'
      );
    });

    it('should handle network errors', async () => {
      mockAuthManager.getOrgId.mockReturnValue('test-org');

      const networkError = new Error('Network timeout');
      mockRegistryClient.listOrganizations.mockRejectedValue(networkError);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain('❌ Failed to fetch organizations');
      expect(result).toContain('Error: Network timeout');
      expect(result).toContain('Please verify:');
      expect(result).toContain('• Your authentication is valid');
      expect(result).toContain('• Network connectivity to GitCache');
      expect(result).toContain('• You have organization access permissions');
    });

    it('should handle organizations without default organization', async () => {
      const currentOrgContext = 'test-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrgContext);

      const mockOrganizations = {
        organizations: [
          {
            id: 'test-org',
            name: 'Test Organization',
            role: 'admin',
            isDefault: false,
          },
          {
            id: 'other-org',
            name: 'Other Organization',
            role: 'member',
            isDefault: false,
          },
        ],
        defaultOrganization: null, // No default organization
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain('📋 Your Organizations (2):');
      expect(result).toContain(
        '💡 Your current organization context: test-org'
      );
      expect(result).not.toContain('💡 API default organization:');
    });

    it('should handle current context same as default organization', async () => {
      const currentOrgContext = 'test-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrgContext);

      const mockOrganizations = {
        organizations: [
          {
            id: 'test-org',
            name: 'Test Organization',
            role: 'admin',
            isDefault: true,
          },
          {
            id: 'other-org',
            name: 'Other Organization',
            role: 'member',
            isDefault: false,
          },
        ],
        defaultOrganization: 'test-org', // Same as current context
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain('📋 Your Organizations (2):');
      expect(result).toContain(
        '• Test Organization (ID: test-org) (admin) 🏠 API Default 🎯 Current Context'
      );
      expect(result).toContain(
        '💡 Your current organization context: test-org'
      );
      expect(result).not.toContain('💡 API default organization:'); // Should not show separate default message
    });

    it('should handle organizations with various roles', async () => {
      const currentOrgContext = 'admin-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrgContext);

      const mockOrganizations = {
        organizations: [
          { id: 'owner-org', name: 'Owner Org', role: 'owner' },
          { id: 'admin-org', name: 'Admin Org', role: 'admin' },
          { id: 'member-org', name: 'Member Org', role: 'member' },
          { id: 'viewer-org', name: 'Viewer Org', role: 'viewer' },
        ],
        defaultOrganization: 'owner-org',
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain('• Owner Org (ID: owner-org) (owner)');
      expect(result).toContain(
        '• Admin Org (ID: admin-org) (admin) 🎯 Current Context'
      );
      expect(result).toContain('• Member Org (ID: member-org) (member)');
      expect(result).toContain('• Viewer Org (ID: viewer-org) (viewer)');
    });

    it('should handle organizations with special characters in names', async () => {
      const currentOrgContext = 'special-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrgContext);

      const mockOrganizations = {
        organizations: [
          { id: 'special-org', name: 'Special & Co. - Org #1', role: 'admin' },
          { id: 'unicode-org', name: 'Ünîcødé Örg 🚀', role: 'member' },
        ],
        defaultOrganization: null,
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain(
        '• Special & Co. - Org #1 (ID: special-org) (admin) 🎯 Current Context'
      );
      expect(result).toContain('• Ünîcødé Örg 🚀 (ID: unicode-org) (member)');
    });

    it('should handle organizations with undefined/null properties', async () => {
      const currentOrgContext = 'test-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrgContext);

      const mockOrganizations = {
        organizations: [
          {
            id: 'test-org',
            name: undefined,
            role: undefined,
            isDefault: undefined,
          },
          { id: 'null-org', name: null, role: null, isDefault: null },
        ],
        defaultOrganization: null,
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain(
        '• undefined (ID: test-org) (undefined) 🎯 Current Context'
      );
      expect(result).toContain('• null (ID: null-org) (null)');
    });

    it('should handle API response with missing defaultOrganization field', async () => {
      const currentOrgContext = 'test-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrgContext);

      const mockOrganizations = {
        organizations: [
          {
            id: 'test-org',
            name: 'Test Organization',
            role: 'admin',
            isDefault: false,
          },
        ],
        // Missing defaultOrganization field
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain('📋 Your Organizations (1):');
      expect(result).toContain(
        '💡 Your current organization context: test-org'
      );
      expect(result).not.toContain('💡 API default organization:');
    });

    it('should handle API response with missing organizations field', async () => {
      const currentOrgContext = 'test-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrgContext);

      const mockOrganizations = {
        // Missing organizations field
        defaultOrganization: 'some-org',
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      // Should handle undefined organizations array gracefully
      expect(result).toContain('❌ Failed to fetch organizations');
    });

    it('should handle single organization scenario', async () => {
      const currentOrgContext = 'only-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrgContext);

      const mockOrganizations = {
        organizations: [
          {
            id: 'only-org',
            name: 'Only Organization',
            role: 'owner',
            isDefault: true,
          },
        ],
        defaultOrganization: 'only-org',
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain('📋 Your Organizations (1):');
      expect(result).toContain(
        '• Only Organization (ID: only-org) (owner) 🏠 API Default 🎯 Current Context'
      );
      expect(result).toContain(
        '💡 Your current organization context: only-org'
      );
      expect(result).not.toContain('💡 API default organization:');
    });

    it('should handle non-Error exceptions', async () => {
      mockAuthManager.getOrgId.mockReturnValue('test-org');

      mockRegistryClient.listOrganizations.mockRejectedValue('String error');

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain('❌ Failed to fetch organizations');
      expect(result).toContain('Error: String error');
    });

    it('should handle API response timeout', async () => {
      mockAuthManager.getOrgId.mockReturnValue('test-org');

      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      mockRegistryClient.listOrganizations.mockRejectedValue(timeoutError);

      const result = await (authCommand as any).listOrganizations();

      expect(result).toContain('❌ Failed to fetch organizations');
      expect(result).toContain('Error: Request timeout');
      expect(result).toContain('Please verify:');
    });

    it('should format organization list correctly with all markers', async () => {
      const currentOrgContext = 'current-org';

      mockAuthManager.getOrgId.mockReturnValue(currentOrgContext);

      const mockOrganizations = {
        organizations: [
          {
            id: 'default-org',
            name: 'Default Org',
            role: 'admin',
            isDefault: true,
          },
          {
            id: 'current-org',
            name: 'Current Org',
            role: 'member',
            isDefault: false,
          },
          {
            id: 'regular-org',
            name: 'Regular Org',
            role: 'viewer',
            isDefault: false,
          },
        ],
        defaultOrganization: 'default-org',
      };

      mockRegistryClient.listOrganizations.mockResolvedValue(mockOrganizations);

      const result = await (authCommand as any).listOrganizations();

      const lines = result.split('\n');
      const orgLines = lines.filter((line: string) => line.includes('•'));

      expect(orgLines[0]).toContain(
        '• Default Org (ID: default-org) (admin) 🏠 API Default'
      );
      expect(orgLines[1]).toContain(
        '• Current Org (ID: current-org) (member) 🎯 Current Context'
      );
      expect(orgLines[2]).toContain('• Regular Org (ID: regular-org) (viewer)');
      expect(orgLines[2]).not.toContain('🏠');
      expect(orgLines[2]).not.toContain('🎯');
    });
  });

  describe('Auth - Organization Management', () => {
    describe('manageOrgs', () => {
      let mockAuthManager: any;
      let mockRegistryClient: any;
      let originalConsoleLog: any;
      let authCommand: Auth;

      beforeEach(() => {
        // Mock console.log to capture output
        originalConsoleLog = console.log;
        console.log = vi.fn();

        // Create fresh auth command instance
        authCommand = new Auth();

        // Setup auth manager mock
        mockAuthManager = {
          isAuthenticated: vi.fn(),
          getOrgId: vi.fn(),
          getEmail: vi.fn(),
          updateOrgContext: vi.fn(),
        };
        (authCommand as any).authManager = mockAuthManager;

        // Setup registry client mock
        mockRegistryClient = {
          listOrganizations: vi.fn(),
        };
        (authCommand as any)._registryClient = mockRegistryClient;
      });

      afterEach(() => {
        console.log = originalConsoleLog;
        vi.clearAllMocks();
      });

      it('should require authentication to manage organizations', async () => {
        mockAuthManager.isAuthenticated.mockReturnValue(false);

        const result = await (authCommand as any).manageOrgs({});

        expect(mockAuthManager.isAuthenticated).toHaveBeenCalled();
        expect(result).toContain(
          '❌ Authentication required to manage organizations'
        );
        expect(result).toContain('Please login first:');
        expect(result).toContain('gitcache auth login <your-email>');
      });

      it('should switch organization when --org option is provided', async () => {
        const targetOrg = 'test-org';
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('current-org');
        mockAuthManager.getEmail.mockReturnValue('user@example.com');
        mockAuthManager.updateOrgContext.mockReturnValue(true);

        const mockOrganizations = {
          organizations: [
            { id: 'test-org', name: 'Test Organization', role: 'admin' },
          ],
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await (authCommand as any).manageOrgs({
          org: targetOrg,
        });

        expect(mockRegistryClient.listOrganizations).toHaveBeenCalled();
        expect(mockAuthManager.updateOrgContext).toHaveBeenCalledWith(
          targetOrg
        );
        expect(result).toContain(
          '✅ Organization context updated successfully!'
        );
        expect(result).toContain(
          '🏢 Switched to: Test Organization (test-org) - admin'
        );
      });

      it('should list organizations when no --org option is provided', async () => {
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('current-org');

        const mockOrganizations = {
          organizations: [
            {
              id: 'current-org',
              name: 'Current Organization',
              role: 'admin',
              isDefault: false,
            },
            {
              id: 'other-org',
              name: 'Other Organization',
              role: 'member',
              isDefault: true,
            },
          ],
          defaultOrganization: 'other-org',
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await (authCommand as any).manageOrgs({});

        expect(console.log).toHaveBeenCalledWith(
          '🔍 Fetching your organizations...'
        );
        expect(mockRegistryClient.listOrganizations).toHaveBeenCalled();
        expect(result).toContain('📋 Your Organizations (2):');
        expect(result).toContain(
          '• Current Organization (ID: current-org) (admin) 🎯 Current Context'
        );
        expect(result).toContain(
          '• Other Organization (ID: other-org) (member) 🏠 API Default'
        );
      });

      it('should handle organization switching failure gracefully', async () => {
        const targetOrg = 'invalid-org';
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('current-org');
        mockAuthManager.getEmail.mockReturnValue('user@example.com');

        const mockOrganizations = {
          organizations: [
            { id: 'current-org', name: 'Current Organization', role: 'admin' },
          ],
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await (authCommand as any).manageOrgs({
          org: targetOrg,
        });

        expect(mockAuthManager.updateOrgContext).not.toHaveBeenCalled();
        expect(result).toContain(
          '❌ Organization "invalid-org" not found or not accessible'
        );
        expect(result).toContain('Available organizations:');
        expect(result).toContain(
          '• Current Organization (ID: current-org) - admin'
        );
      });

      it('should handle empty organization list when listing', async () => {
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('test-org');

        const mockOrganizations = {
          organizations: [],
          defaultOrganization: null,
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await (authCommand as any).manageOrgs({});

        expect(result).toContain('📝 No organizations found');
        expect(result).toContain('You may need to:');
        expect(result).toContain(
          '• Contact your administrator for organization access'
        );
        expect(result).toContain(
          '• Create an organization at: https://grata-labs.com/gitcache/account/'
        );
      });

      it('should handle network errors when switching organizations', async () => {
        const targetOrg = 'test-org';
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('current-org');
        mockAuthManager.getEmail.mockReturnValue('user@example.com');

        const networkError = new Error('Network timeout');
        mockRegistryClient.listOrganizations.mockRejectedValue(networkError);

        const result = await (authCommand as any).manageOrgs({
          org: targetOrg,
        });

        expect(result).toContain('❌ Failed to verify organization access');
        expect(result).toContain('Error: Network timeout');
        expect(result).toContain('Please verify:');
        expect(result).toContain('• Organization name/ID is correct');
        expect(result).toContain('• You have access to the organization');
        expect(result).toContain('• Network connectivity to GitCache');
      });

      it('should handle network errors when listing organizations', async () => {
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('test-org');

        const networkError = new Error('Connection failed');
        mockRegistryClient.listOrganizations.mockRejectedValue(networkError);

        const result = await (authCommand as any).manageOrgs({});

        expect(result).toContain('❌ Failed to fetch organizations');
        expect(result).toContain('Error: Connection failed');
        expect(result).toContain('Please verify:');
        expect(result).toContain('• Your authentication is valid');
        expect(result).toContain('• Network connectivity to GitCache');
        expect(result).toContain('• You have organization access permissions');
      });

      it('should handle switching to organization by name instead of ID', async () => {
        const targetOrgName = 'Test Organization';
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('current-org');
        mockAuthManager.getEmail.mockReturnValue('user@example.com');
        mockAuthManager.updateOrgContext.mockReturnValue(true);

        const mockOrganizations = {
          organizations: [
            { id: 'current-org', name: 'Current Organization', role: 'member' },
            { id: 'test-org-id', name: 'Test Organization', role: 'admin' },
          ],
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await (authCommand as any).manageOrgs({
          org: targetOrgName,
        });

        expect(mockAuthManager.updateOrgContext).toHaveBeenCalledWith(
          'test-org-id'
        );
        expect(result).toContain(
          '✅ Organization context updated successfully!'
        );
        expect(result).toContain(
          '🏢 Switched to: Test Organization (test-org-id) - admin'
        );
      });

      it('should handle auth manager context update failure', async () => {
        const targetOrg = 'test-org';
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('current-org');
        mockAuthManager.getEmail.mockReturnValue('user@example.com');
        mockAuthManager.updateOrgContext.mockReturnValue(false); // Simulate failure

        const mockOrganizations = {
          organizations: [
            { id: 'test-org', name: 'Test Organization', role: 'admin' },
          ],
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await (authCommand as any).manageOrgs({
          org: targetOrg,
        });

        expect(mockAuthManager.updateOrgContext).toHaveBeenCalledWith(
          targetOrg
        );
        expect(result).toContain('❌ Failed to update organization context');
        expect(result).toContain('Please try logging in again:');
        expect(result).toContain('gitcache auth login <your-email>');
      });

      it('should handle missing user email gracefully during organization switch', async () => {
        const targetOrg = 'test-org';
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('current-org');
        mockAuthManager.getEmail.mockReturnValue(null); // No email
        mockAuthManager.updateOrgContext.mockReturnValue(true);

        const mockOrganizations = {
          organizations: [
            { id: 'test-org', name: 'Test Organization', role: 'admin' },
          ],
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await (authCommand as any).manageOrgs({
          org: targetOrg,
        });

        expect(console.log).toHaveBeenCalledWith(
          '🔍 Already authenticated as: user'
        );
        expect(result).toContain(
          '✅ Organization context updated successfully!'
        );
      });

      it('should handle listing organizations with unknown current context', async () => {
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('unknown');

        const mockOrganizations = {
          organizations: [
            {
              id: 'org1',
              name: 'Organization One',
              role: 'admin',
              isDefault: false,
            },
            {
              id: 'org2',
              name: 'Organization Two',
              role: 'member',
              isDefault: false,
            },
          ],
          defaultOrganization: 'org1',
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await (authCommand as any).manageOrgs({});

        expect(result).toContain('📋 Your Organizations (2):');
        expect(result).toContain(
          '⚠️  No organization context set. Use --org to set one.'
        );
        expect(result).toContain('💡 API default organization: org1');
      });

      it('should handle organizations with mixed context states correctly', async () => {
        const currentContext = 'current-org';
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue(currentContext);

        const mockOrganizations = {
          organizations: [
            {
              id: 'default-org',
              name: 'Default Org',
              role: 'admin',
              isDefault: true,
            },
            {
              id: 'current-org',
              name: 'Current Org',
              role: 'member',
              isDefault: false,
            },
            {
              id: 'regular-org',
              name: 'Regular Org',
              role: 'viewer',
              isDefault: false,
            },
          ],
          defaultOrganization: 'default-org',
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await (authCommand as any).manageOrgs({});

        expect(result).toContain('📋 Your Organizations (3):');
        expect(result).toContain(
          '• Default Org (ID: default-org) (admin) 🏠 API Default'
        );
        expect(result).toContain(
          '• Current Org (ID: current-org) (member) 🎯 Current Context'
        );
        expect(result).toContain('• Regular Org (ID: regular-org) (viewer)');
        expect(result).toContain(
          '💡 Your current organization context: current-org'
        );
        expect(result).toContain('💡 API default organization: default-org');
      });

      it('should handle case where current context matches default organization', async () => {
        const currentContext = 'same-org';
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue(currentContext);

        const mockOrganizations = {
          organizations: [
            {
              id: 'same-org',
              name: 'Same Organization',
              role: 'owner',
              isDefault: true,
            },
            {
              id: 'other-org',
              name: 'Other Organization',
              role: 'member',
              isDefault: false,
            },
          ],
          defaultOrganization: 'same-org',
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await (authCommand as any).manageOrgs({});

        expect(result).toContain('📋 Your Organizations (2):');
        expect(result).toContain(
          '• Same Organization (ID: same-org) (owner) 🏠 API Default 🎯 Current Context'
        );
        expect(result).toContain(
          '💡 Your current organization context: same-org'
        );
        expect(result).not.toContain('💡 API default organization:'); // Should not show separate line
      });
    });
  });

  describe('Auth - Organization Management', () => {
    describe('exec with orgs subcommand', () => {
      let mockAuthManager: any;
      let mockRegistryClient: any;
      let originalConsoleLog: any;
      let authCommand: Auth;

      beforeEach(() => {
        // Mock console.log to capture output
        originalConsoleLog = console.log;
        console.log = vi.fn();

        // Create fresh auth command instance
        authCommand = new Auth();

        // Setup auth manager mock
        mockAuthManager = {
          isAuthenticated: vi.fn(),
          getOrgId: vi.fn(),
          getEmail: vi.fn(),
          updateOrgContext: vi.fn(),
        };
        (authCommand as any).authManager = mockAuthManager;

        // Setup registry client mock
        mockRegistryClient = {
          listOrganizations: vi.fn(),
        };
        (authCommand as any)._registryClient = mockRegistryClient;
      });

      afterEach(() => {
        console.log = originalConsoleLog;
        vi.clearAllMocks();
      });

      it('should handle "orgs" subcommand to list organizations', async () => {
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('test-org');

        const mockOrganizations = {
          organizations: [
            {
              id: 'test-org',
              name: 'Test Organization',
              role: 'admin',
              isDefault: false,
            },
            {
              id: 'other-org',
              name: 'Other Organization',
              role: 'member',
              isDefault: true,
            },
          ],
          defaultOrganization: 'other-org',
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await authCommand.exec(['orgs'], {});

        expect(console.log).toHaveBeenCalledWith(
          '🔍 Fetching your organizations...'
        );
        expect(mockRegistryClient.listOrganizations).toHaveBeenCalled();
        expect(result).toContain('📋 Your Organizations (2):');
        expect(result).toContain(
          '• Test Organization (ID: test-org) (admin) 🎯 Current Context'
        );
        expect(result).toContain(
          '• Other Organization (ID: other-org) (member) 🏠 API Default'
        );
      });

      it('should handle "orgs" subcommand with --org option to switch organization', async () => {
        const targetOrg = 'target-org';
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('current-org');
        mockAuthManager.getEmail.mockReturnValue('user@example.com');
        mockAuthManager.updateOrgContext.mockReturnValue(true);

        const mockOrganizations = {
          organizations: [
            { id: 'current-org', name: 'Current Organization', role: 'member' },
            { id: 'target-org', name: 'Target Organization', role: 'admin' },
          ],
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await authCommand.exec(['orgs'], { org: targetOrg });

        expect(console.log).toHaveBeenCalledWith(
          `🔍 Already authenticated as: user@example.com`
        );
        expect(console.log).toHaveBeenCalledWith(
          `🔄 Switching organization context from current-org to ${targetOrg}...`
        );
        expect(mockRegistryClient.listOrganizations).toHaveBeenCalled();
        expect(mockAuthManager.updateOrgContext).toHaveBeenCalledWith(
          targetOrg
        );
        expect(result).toContain(
          '✅ Organization context updated successfully!'
        );
        expect(result).toContain(
          '🏢 Switched to: Target Organization (target-org) - admin'
        );
      });

      it('should handle "orgs" subcommand when not authenticated', async () => {
        mockAuthManager.isAuthenticated.mockReturnValue(false);

        const result = await authCommand.exec(['orgs'], {});

        expect(mockAuthManager.isAuthenticated).toHaveBeenCalled();
        expect(mockRegistryClient.listOrganizations).not.toHaveBeenCalled();
        expect(result).toContain(
          '❌ Authentication required to manage organizations'
        );
        expect(result).toContain('Please login first:');
        expect(result).toContain('gitcache auth login <your-email>');
      });

      it('should handle "orgs" subcommand with invalid organization', async () => {
        const invalidOrg = 'invalid-org';
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('current-org');
        mockAuthManager.getEmail.mockReturnValue('user@example.com');

        const mockOrganizations = {
          organizations: [
            { id: 'current-org', name: 'Current Organization', role: 'admin' },
            { id: 'other-org', name: 'Other Organization', role: 'member' },
          ],
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await authCommand.exec(['orgs'], { org: invalidOrg });

        expect(mockAuthManager.updateOrgContext).not.toHaveBeenCalled();
        expect(result).toContain(
          '❌ Organization "invalid-org" not found or not accessible'
        );
        expect(result).toContain('Available organizations:');
        expect(result).toContain(
          '• Current Organization (ID: current-org) - admin'
        );
        expect(result).toContain(
          '• Other Organization (ID: other-org) - member'
        );
      });

      it('should handle "orgs" subcommand with network error', async () => {
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('test-org');

        const networkError = new Error('Network connection failed');
        mockRegistryClient.listOrganizations.mockRejectedValue(networkError);

        const result = await authCommand.exec(['orgs'], {});

        expect(result).toContain('❌ Failed to fetch organizations');
        expect(result).toContain('Error: Network connection failed');
        expect(result).toContain('Please verify:');
        expect(result).toContain('• Your authentication is valid');
        expect(result).toContain('• Network connectivity to GitCache');
      });

      it('should handle "orgs" subcommand with empty organization list', async () => {
        mockAuthManager.isAuthenticated.mockReturnValue(true);
        mockAuthManager.getOrgId.mockReturnValue('test-org');

        const mockOrganizations = {
          organizations: [],
          defaultOrganization: null,
        };
        mockRegistryClient.listOrganizations.mockResolvedValue(
          mockOrganizations
        );

        const result = await authCommand.exec(['orgs'], {});

        expect(result).toContain('📝 No organizations found');
        expect(result).toContain('You may need to:');
        expect(result).toContain(
          '• Contact your administrator for organization access'
        );
        expect(result).toContain(
          '• Create an organization at: https://grata-labs.com/gitcache/account/'
        );
      });
    });
  });

  describe('Auth - Organization Management', () => {
    describe('registryClient getter', () => {
      let authCommand: Auth;
      let originalEnv: string | undefined;

      beforeEach(() => {
        // Save original environment variable
        originalEnv = process.env.GITCACHE_API_URL;
        delete process.env.GITCACHE_API_URL;

        // Create fresh auth command instance
        authCommand = new Auth();
      });

      afterEach(() => {
        // Restore original environment variable
        if (originalEnv !== undefined) {
          process.env.GITCACHE_API_URL = originalEnv;
        } else {
          delete process.env.GITCACHE_API_URL;
        }
        vi.clearAllMocks();
      });

      it('should create new RegistryClient when _registryClient is undefined', () => {
        // Ensure _registryClient is undefined
        expect((authCommand as any)._registryClient).toBeUndefined();

        // Access registryClient getter
        const client = (authCommand as any).registryClient;

        // Should create and cache the client
        expect(client).toBeDefined();
        expect((authCommand as any)._registryClient).toBe(client);
        expect((authCommand as any)._registryClient).toBeInstanceOf(
          RegistryClient
        );
      });

      it('should reuse existing RegistryClient when _registryClient is already set', () => {
        // Create initial client
        const firstClient = (authCommand as any).registryClient;

        // Access getter again
        const secondClient = (authCommand as any).registryClient;

        // Should return the same instance
        expect(secondClient).toBe(firstClient);
        expect((authCommand as any)._registryClient).toBe(firstClient);
      });

      it('should create RegistryClient with default config when no GITCACHE_API_URL env var', () => {
        // Ensure environment variable is not set
        delete process.env.GITCACHE_API_URL;

        // Access registryClient getter
        const client = (authCommand as any).registryClient;

        // Should create client with empty config (defaults will be used by RegistryClient)
        expect(client).toBeDefined();
        expect((authCommand as any)._registryClient).toBe(client);
      });
      it('should create RegistryClient with custom apiUrl when GITCACHE_API_URL env var is set', () => {
        const customApiUrl = 'https://custom-api.example.com';
        process.env.GITCACHE_API_URL = customApiUrl;

        // Create new instance and access registryClient getter
        const authCommandWithEnv = new Auth();
        const client = (authCommandWithEnv as any).registryClient;

        // Should create client with the environment variable
        expect(client).toBeDefined();
        expect((authCommandWithEnv as any)._registryClient).toBe(client);
      });

      it('should handle multiple calls with different environment variable states', () => {
        // First call without env var
        delete process.env.GITCACHE_API_URL;
        const firstCommand = new Auth();
        const firstClient = (firstCommand as any).registryClient;

        // Second call with env var
        process.env.GITCACHE_API_URL = 'https://test-api.example.com';
        const secondCommand = new Auth();
        const secondClient = (secondCommand as any).registryClient;

        // Both should be valid but different instances
        expect(firstClient).toBeDefined();
        expect(secondClient).toBeDefined();
        expect(firstClient).not.toBe(secondClient);
      });

      it('should handle empty string GITCACHE_API_URL environment variable', () => {
        process.env.GITCACHE_API_URL = '';

        // Access registryClient getter
        const client = (authCommand as any).registryClient;

        // Should still create client (empty string is truthy for env var check)
        expect(client).toBeDefined();
        expect((authCommand as any)._registryClient).toBe(client);
      });

      it('should handle whitespace-only GITCACHE_API_URL environment variable', () => {
        process.env.GITCACHE_API_URL = '   ';

        // Access registryClient getter
        const client = (authCommand as any).registryClient;

        // Should create client with the whitespace value
        expect(client).toBeDefined();
        expect((authCommand as any)._registryClient).toBe(client);
      });

      it('should create new client after _registryClient is manually cleared', () => {
        // Create initial client
        const firstClient = (authCommand as any).registryClient;
        expect((authCommand as any)._registryClient).toBe(firstClient);

        // Manually clear the cached client
        (authCommand as any)._registryClient = undefined;

        // Access getter again
        const secondClient = (authCommand as any).registryClient;

        // Should create a new instance
        expect(secondClient).toBeDefined();
        expect(secondClient).not.toBe(firstClient);
        expect((authCommand as any)._registryClient).toBe(secondClient);
      });
      it('should preserve config state during lazy initialization', () => {
        const testApiUrl = 'https://test-config.example.com';
        process.env.GITCACHE_API_URL = testApiUrl;

        // Create command and access client
        const command = new Auth();
        const client = (command as any).registryClient;

        // Should create a client successfully
        expect(client).toBeDefined();
        expect((command as any)._registryClient).toBe(client);
      });

      it('should maintain singleton behavior across multiple property accesses', () => {
        const command = new Auth();

        // Access the property multiple times
        const client1 = (command as any).registryClient;
        const client2 = (command as any).registryClient;
        const client3 = (command as any).registryClient;

        // All should be the same instance
        expect(client1).toBe(client2);
        expect(client2).toBe(client3);
        expect(client1).toBe(client3);

        // Internal field should also match
        expect((command as any)._registryClient).toBe(client1);
      });
    });
  });
});
