import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getCacheDir } from './utils/path.js';

export interface GitCacheConfig {
  maxCacheSize: string;
}

const DEFAULT_CONFIG: GitCacheConfig = {
  maxCacheSize: '5GB',
};

/**
 * Get the path to the configuration file
 */
function getConfigPath(): string {
  const cacheDir = getCacheDir();
  return join(cacheDir, '.gitcache-config.json');
}

/**
 * Load configuration from file, creating default if it doesn't exist
 */
export function loadConfig(): GitCacheConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    // Create default config file
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  try {
    const configData = readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData) as Partial<GitCacheConfig>;

    // Merge with defaults to handle missing fields
    return {
      ...DEFAULT_CONFIG,
      ...config,
    };
  } catch (error) {
    console.warn(
      `Warning: Failed to load config file, using defaults: ${String(error)}`
    );
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to file
 */
export function saveConfig(config: GitCacheConfig): void {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  try {
    const configData = JSON.stringify(config, null, 2);
    writeFileSync(configPath, configData, 'utf8');
  } catch (error) {
    console.warn(`Warning: Failed to save config file: ${String(error)}`);
  }
}

/**
 * Get the default max cache size from config
 */
export function getDefaultMaxCacheSize(): string {
  const config = loadConfig();
  return config.maxCacheSize;
}

/**
 * Set the default max cache size and save to config
 */
export function setDefaultMaxCacheSize(maxSize: string): void {
  const config = loadConfig();
  config.maxCacheSize = maxSize;
  saveConfig(config);
}
