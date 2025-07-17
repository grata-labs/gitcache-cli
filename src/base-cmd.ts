/**
 * Base command class for GitCache CLI commands
 */
export abstract class BaseCommand {
  static description: string;
  static commandName: string;
  static usage: string[];
  static params?: string[];

  constructor() {}

  /**
   * Execute the command with given arguments
   */
  abstract exec(
    args: string[],
    opts?: Record<string, unknown>
  ): unknown | Promise<unknown>;

  /**
   * Get usage information for the command
   */
  static get describeUsage(): string {
    const { description, usage = [''], commandName } = this;

    const fullUsage = [
      `${description}`,
      '',
      'Usage:',
      ...usage.map((u) => `gitcache ${commandName} ${u}`.trim()),
    ];

    return fullUsage.join('\n');
  }

  /**
   * Create a usage error with proper formatting
   */
  usageError(message?: string): Error {
    const usage = (this.constructor as typeof BaseCommand).describeUsage;
    const prefix = message ? `${message}\n\n` : '';
    return new Error(`${prefix}${usage}`);
  }
}
