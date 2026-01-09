/**
 * Provider Registry
 * Factory for creating and managing storage providers
 */
import { OneDriveProvider } from './onedrive-provider.js';
import { LocalFolderProvider } from './local-folder-provider.js';

const providers = {
  onedrive: OneDriveProvider,
  local: LocalFolderProvider
  // Future providers:
  // gdrive: GoogleDriveProvider,
  // dropbox: DropboxProvider,
  // s3: S3Provider
};

/**
 * Get a provider class by type
 * @param {string} type - Provider type identifier
 * @returns {typeof BaseProvider | null}
 */
export function getProviderClass(type) {
  return providers[type] || null;
}

/**
 * Get all available provider types
 * @returns {string[]}
 */
export function getProviderTypes() {
  return Object.keys(providers);
}

/**
 * Get all provider classes
 * @returns {Array<typeof BaseProvider>}
 */
export function getAllProviderClasses() {
  return Object.values(providers);
}

/**
 * Create a provider instance from destination config
 * @param {Object} destination - Destination configuration
 * @returns {BaseProvider}
 */
export function createProvider(destination) {
  const ProviderClass = providers[destination.type];
  if (!ProviderClass) {
    throw new Error(`Unknown provider type: ${destination.type}`);
  }
  return new ProviderClass(destination);
}

/**
 * Get provider metadata for UI display
 * @returns {Array<{type: string, displayName: string, icon: string, requiresAuth: boolean}>}
 */
export function getProviderMetadata() {
  return Object.entries(providers).map(([type, ProviderClass]) => ({
    type,
    displayName: ProviderClass.displayName,
    icon: ProviderClass.icon,
    requiresAuth: ProviderClass.requiresAuth
  }));
}

/**
 * Validate a destination configuration
 * @param {Object} config - Destination configuration
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
export async function validateDestination(config) {
  const ProviderClass = providers[config.type];
  if (!ProviderClass) {
    return { valid: false, error: `Unknown provider type: ${config.type}` };
  }
  return await ProviderClass.validateConfig(config);
}
