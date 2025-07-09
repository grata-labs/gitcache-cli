import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface LogEntry {
  timestamp: string;
  repoUrl: string;
  ref: string;
  sha: string;
  action: string;
}

/**
 * Get the path to the GitCache log file
 */
function getLogPath(): string {
  const gitcacheDir = join(homedir(), '.gitcache');
  return join(gitcacheDir, 'activity.log');
}

/**
 * Ensure the log directory exists
 */
function ensureLogDir(): void {
  const logPath = getLogPath();
  const logDir = dirname(logPath);

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Read existing log entries
 */
function readLogEntries(): LogEntry[] {
  const logPath = getLogPath();

  if (!existsSync(logPath)) {
    return [];
  }

  try {
    const content = readFileSync(logPath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * Write a log entry
 */
export function logRefResolution(
  repoUrl: string,
  ref: string,
  sha: string
): void {
  ensureLogDir();

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    repoUrl,
    ref,
    sha,
    action: 'ref-resolved',
  };

  const logPath = getLogPath();
  const logLine = JSON.stringify(entry) + '\n';

  try {
    writeFileSync(logPath, logLine, { flag: 'a' });
  } catch (error) {
    // Log errors are non-fatal - don't break the main operation
    console.warn(
      `Warning: Failed to write to log: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get log entries for a specific repository
 */
export function getRefHistory(repoUrl: string): LogEntry[] {
  return readLogEntries().filter((entry) => entry.repoUrl === repoUrl);
}

/**
 * Get the most recent SHA resolution for a repository and ref
 */
export function getLastResolvedSha(
  repoUrl: string,
  ref: string
): string | null {
  const entries = readLogEntries()
    .filter((entry) => entry.repoUrl === repoUrl && entry.ref === ref)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  return entries.length > 0 ? entries[0].sha : null;
}
