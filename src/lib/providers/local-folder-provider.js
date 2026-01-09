/**
 * Local folder storage provider
 * Uses Chrome Downloads API to save files to Downloads folder
 */
import { BaseProvider } from './base-provider.js';

export class LocalFolderProvider extends BaseProvider {
  static type = 'local';
  static displayName = 'Local Folder';
  static requiresAuth = false;
  static icon = 'folder';

  constructor(config) {
    super(config);
    // Subfolder within Downloads directory
    this.subfolder = config.subfolder || 'SaveMe';
  }

  async isReady() {
    // Downloads API is always available if permission granted
    return { ready: true };
  }

  async saveFile(blob, filename) {
    try {
      // Convert blob to data URL (URL.createObjectURL not available in service workers)
      const dataUrl = await this.blobToDataUrl(blob);

      // Build path: subfolder/filename
      const fullPath = this.subfolder ? `${this.subfolder}/${filename}` : filename;

      return new Promise((resolve) => {
        chrome.downloads.download({
          url: dataUrl,
          filename: fullPath,
          conflictAction: 'uniquify',
          saveAs: false
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message
            });
          } else {
            resolve({
              success: true,
              path: fullPath,
              downloadId: downloadId
            });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async blobToDataUrl(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return `data:${blob.type};base64,${base64}`;
  }

  async getDisplayInfo() {
    return {
      name: this.destinationName,
      path: `Downloads/${this.subfolder || ''}`.replace(/\/$/, ''),
      icon: 'folder'
    };
  }

  static getConfigSchema() {
    return {
      type: 'local',
      fields: [
        { name: 'name', type: 'text', label: 'Destination Name', required: true },
        {
          name: 'subfolder',
          type: 'text',
          label: 'Subfolder Name',
          placeholder: 'SaveMe',
          hint: 'Folder will be created inside your Downloads folder'
        }
      ]
    };
  }

  static async validateConfig(config) {
    if (!config.name || config.name.trim() === '') {
      return { valid: false, error: 'Destination name is required' };
    }
    // Validate subfolder name (no invalid path characters)
    if (config.subfolder) {
      const invalidChars = /[<>:"|?*\\]/;
      if (invalidChars.test(config.subfolder)) {
        return { valid: false, error: 'Subfolder name contains invalid characters' };
      }
    }
    return { valid: true };
  }
}
