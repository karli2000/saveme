/**
 * Abstract base class for storage providers
 * All providers must implement these methods
 */
export class BaseProvider {
  /**
   * Provider type identifier
   * @type {string}
   */
  static type = 'base';

  /**
   * Human-readable provider name
   * @type {string}
   */
  static displayName = 'Base Provider';

  /**
   * Whether this provider requires authentication
   * @type {boolean}
   */
  static requiresAuth = false;

  /**
   * Icon identifier for UI
   * @type {string}
   */
  static icon = 'folder';

  constructor(config) {
    this.config = config;
    this.destinationId = config.id;
    this.destinationName = config.name;
  }

  /**
   * Check if the provider is ready to save files
   * @returns {Promise<{ready: boolean, error?: string}>}
   */
  async isReady() {
    throw new Error('Not implemented');
  }

  /**
   * Save a file to this destination
   * @param {Blob} blob - File content
   * @param {string} filename - Target filename
   * @returns {Promise<{success: boolean, path?: string, error?: string, requiresReauth?: boolean}>}
   */
  async saveFile(blob, filename) {
    throw new Error('Not implemented');
  }

  /**
   * Get configuration UI schema for this provider
   * @returns {Object} - UI configuration schema
   */
  static getConfigSchema() {
    throw new Error('Not implemented');
  }

  /**
   * Validate destination configuration
   * @param {Object} config - Destination configuration
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  static async validateConfig(config) {
    throw new Error('Not implemented');
  }

  /**
   * For providers with folder selection, list available folders
   * @param {string} parentId - Parent folder ID
   * @returns {Promise<Array<{id: string, name: string}>>}
   */
  async listFolders(parentId) {
    return [];
  }

  /**
   * Get display info for the configured destination
   * @returns {Promise<{name: string, path?: string, icon: string}>}
   */
  async getDisplayInfo() {
    throw new Error('Not implemented');
  }
}
