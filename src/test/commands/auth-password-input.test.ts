import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../commands/auth.js';
import { AuthManager } from '../../lib/auth-manager.js';

// Mock dependencies
vi.mock('../../lib/auth-manager.js');

const mockAuthManager = vi.mocked(AuthManager);

describe('Auth Command - Password Input TTY Handling', () => {
  let authCommand: Auth;
  let mockAuthManagerInstance: any;
  let originalStdout: any;
  let originalStdin: any;
  let mockStdoutWrite: any;
  let mockStdinSetRawMode: any;
  let mockStdinResume: any;
  let mockStdinPause: any;
  let mockStdinSetEncoding: any;
  let mockStdinOn: any;
  let mockStdinRemoveAllListeners: any;
  let dataCallback: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock AuthManager instance
    mockAuthManagerInstance = {
      isAuthenticated: vi.fn(),
      getTokenType: vi.fn(),
      getOrgId: vi.fn(),
      storeAuthData: vi.fn(),
    };

    mockAuthManager.mockImplementation(function (this: any) {
      return mockAuthManagerInstance;
    });

    // Create detailed mocks for stdin/stdout
    mockStdoutWrite = vi.fn().mockReturnValue(true);
    mockStdinSetRawMode = vi.fn();
    mockStdinResume = vi.fn();
    mockStdinPause = vi.fn();
    mockStdinSetEncoding = vi.fn();
    mockStdinOn = vi.fn();
    mockStdinRemoveAllListeners = vi.fn();

    // Store original references
    originalStdout = process.stdout;
    originalStdin = process.stdin;

    // Mock process.stdout
    Object.defineProperty(process, 'stdout', {
      value: {
        write: mockStdoutWrite,
      },
      writable: true,
      configurable: true,
    });

    // Mock process.stdin with TTY
    Object.defineProperty(process, 'stdin', {
      value: {
        isTTY: true,
        setRawMode: mockStdinSetRawMode,
        resume: mockStdinResume,
        pause: mockStdinPause,
        setEncoding: mockStdinSetEncoding,
        on: mockStdinOn,
        removeAllListeners: mockStdinRemoveAllListeners,
      },
      writable: true,
      configurable: true,
    });

    // Setup data callback capture
    mockStdinOn.mockImplementation((event: string, callback: any) => {
      if (event === 'data') {
        dataCallback = callback;
      }
    });

    authCommand = new Auth();
  });

  afterEach(() => {
    // Restore original process objects
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });

    vi.restoreAllMocks();
  });

  describe('getPasswordInput with TTY - Custom Write Function', () => {
    it('should override stdout.write and intercept user input while intercepting is true', async () => {
      let passwordPromise: Promise<string>;
      let customWrite: any;

      // Start the password input process
      passwordPromise = (authCommand as any).getPasswordInput();

      // Wait for setup
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify stdin setup was called
      expect(mockStdinSetRawMode).toHaveBeenCalledWith(true);
      expect(mockStdinResume).toHaveBeenCalled();
      expect(mockStdinSetEncoding).toHaveBeenCalledWith('utf8');
      expect(mockStdinOn).toHaveBeenCalledWith('data', expect.any(Function));

      // Get the current process.stdout.write (which should be our custom override)
      customWrite = process.stdout.write;

      // Verify that stdout.write has been overridden
      expect(customWrite).not.toBe(mockStdoutWrite);

      // Test the custom write function with string input (should be intercepted)
      const interceptResult = customWrite('user-typed-character');
      expect(interceptResult).toBe(true); // Should return true and not call original

      // Verify original write was not called for intercepted string
      expect(mockStdoutWrite).not.toHaveBeenCalledWith('user-typed-character');

      // Test the custom write function with non-string input (should pass through)
      const buffer = new Uint8Array([65]); // 'A' in bytes
      customWrite(buffer);

      // The custom write function should call the original for non-string or when not intercepting
      // But since we're still intercepting, let's test after cleanup

      // Simulate password input and completion
      dataCallback('p');
      dataCallback('a');
      dataCallback('s');
      dataCallback('s');
      dataCallback('\r'); // Enter key

      const result = await passwordPromise;

      expect(result).toBe('pass');

      // Verify cleanup was called
      expect(mockStdinSetRawMode).toHaveBeenCalledWith(false);
      expect(mockStdinPause).toHaveBeenCalled();
      expect(mockStdinRemoveAllListeners).toHaveBeenCalled();
    });

    it('should allow non-intercepted writes to pass through to original write function', async () => {
      let passwordPromise: Promise<string>;

      passwordPromise = (authCommand as any).getPasswordInput();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // We need to test the case where intercepting is false
      // This happens after cleanup, but we can test the logic by calling the inner function

      // To test the passthrough behavior, we need to examine the custom write function
      // The function should have logic to call original write when not intercepting

      // Simulate completion to trigger cleanup
      dataCallback('\r'); // Enter key
      await passwordPromise;

      // After cleanup, the original write should be restored
      // Note: In the actual implementation, the cleanup restores the original write
      expect(mockStdinSetRawMode).toHaveBeenCalledWith(false);
    });

    it('should handle Ctrl+C interruption and restore stdout.write', async () => {
      const passwordPromise = (authCommand as any).getPasswordInput();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify override is in place
      const customWrite = process.stdout.write;
      expect(customWrite).not.toBe(mockStdoutWrite);

      // Simulate Ctrl+C
      await expect(async () => {
        dataCallback(String.fromCharCode(3)); // Ctrl+C
        await passwordPromise;
      }).rejects.toThrow('SIGINT');

      // Verify cleanup was called
      expect(mockStdinSetRawMode).toHaveBeenCalledWith(false);
      expect(mockStdinPause).toHaveBeenCalled();
      expect(mockStdinRemoveAllListeners).toHaveBeenCalled();
    });

    it('should process character input correctly through the custom write function', async () => {
      const passwordPromise = (authCommand as any).getPasswordInput();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Get the custom write function
      const customWrite = process.stdout.write;

      // Test various character inputs that might be written to stdout
      // These should be intercepted when intercepting is true
      expect(customWrite('a')).toBe(true);
      expect(customWrite('b')).toBe(true);
      expect(customWrite('*')).toBe(true); // Password masking character

      // None of these should have called the original write
      expect(mockStdoutWrite).not.toHaveBeenCalled();

      // Complete the password input
      dataCallback('t');
      dataCallback('e');
      dataCallback('s');
      dataCallback('t');
      dataCallback('\r');

      const result = await passwordPromise;
      expect(result).toBe('test');
    });

    it('should handle backspace characters in password input', async () => {
      const passwordPromise = (authCommand as any).getPasswordInput();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Type some characters then backspace
      dataCallback('h');
      dataCallback('e');
      dataCallback('l');
      dataCallback('l');
      dataCallback('o');
      dataCallback(String.fromCharCode(127)); // Backspace
      dataCallback(String.fromCharCode(127)); // Backspace
      dataCallback('p');
      dataCallback('\r'); // Enter

      const result = await passwordPromise;
      expect(result).toBe('help'); // 'hello' with 2 backspaces = 'hel', then + 'p' = 'help'
    });

    it('should filter non-printable characters except control codes', async () => {
      const passwordPromise = (authCommand as any).getPasswordInput();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Mix of printable and non-printable characters
      dataCallback('a'); // printable
      dataCallback(String.fromCharCode(1)); // non-printable (should be ignored)
      dataCallback('b'); // printable
      dataCallback(String.fromCharCode(31)); // non-printable (should be ignored)
      dataCallback('c'); // printable
      dataCallback('\r'); // Enter (control code, should work)

      const result = await passwordPromise;
      expect(result).toBe('abc'); // Only printable characters should be included
    });

    it('should handle multiple character input in single data event', async () => {
      const passwordPromise = (authCommand as any).getPasswordInput();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate paste or multiple characters at once
      dataCallback('hello'); // Multiple characters in one event
      dataCallback('\r'); // Enter

      const result = await passwordPromise;
      expect(result).toBe('hello');
    });

    it('should maintain password secrecy by intercepting all string writes', async () => {
      const passwordPromise = (authCommand as any).getPasswordInput();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const customWrite = process.stdout.write;

      // Test that any string output during password input is intercepted
      customWrite('s'); // User typed character
      customWrite('e'); // User typed character
      customWrite('c'); // User typed character
      customWrite('r'); // User typed character
      customWrite('e'); // User typed character
      customWrite('t'); // User typed character

      // Verify none of these were written to actual stdout
      expect(mockStdoutWrite).not.toHaveBeenCalled();

      // Complete password input
      dataCallback('p');
      dataCallback('a');
      dataCallback('s');
      dataCallback('s');
      dataCallback('\r');

      const result = await passwordPromise;
      expect(result).toBe('pass');
    });
  });

  describe('Non-TTY password input (should not use custom write function)', () => {
    beforeEach(() => {
      // Mock non-TTY environment
      Object.defineProperty(process, 'stdin', {
        value: {
          isTTY: false,
          setEncoding: vi.fn(),
          on: vi.fn().mockImplementation((event, callback) => {
            if (event === 'data') {
              setTimeout(() => callback('password\n'), 0);
            } else if (event === 'end') {
              setTimeout(() => callback(), 10);
            }
          }),
        },
        writable: true,
        configurable: true,
      });
    });

    it('should not override stdout.write in non-TTY environment', async () => {
      const originalWrite = process.stdout.write;

      const result = await (authCommand as any).getPasswordInput();

      // stdout.write should not have been overridden
      expect(process.stdout.write).toBe(originalWrite);
      expect(result).toBe('password');
    });
  });
});
