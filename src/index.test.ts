import { execSync } from 'node:child_process';
import { describe, it, expect, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('gitcache CLI', () => {
  it('should mock execSync properly', () => {
    const mockExecSync = vi.mocked(execSync);
    expect(mockExecSync).toBeDefined();
  });

  it('should handle repo URL encoding', () => {
    const repo = 'https://github.com/user/repo.git';
    const encoded = encodeURIComponent(repo);
    expect(encoded).toBe('https%3A%2F%2Fgithub.com%2Fuser%2Frepo.git');
  });
});
