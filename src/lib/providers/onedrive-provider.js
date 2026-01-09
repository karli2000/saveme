/**
 * OneDrive storage provider
 * Wraps existing onedrive-api.js functionality
 */
import { BaseProvider } from './base-provider.js';
import {
  isAuthenticated,
  uploadFile,
  listFolders as onedriveListFolders,
  getUserInfo
} from '../onedrive-api.js';

export class OneDriveProvider extends BaseProvider {
  static type = 'onedrive';
  static displayName = 'OneDrive';
  static requiresAuth = true;
  static icon = 'onedrive';

  constructor(config) {
    super(config);
    this.folderId = config.folderId;
    this.folderName = config.folderName;
  }

  async isReady() {
    try {
      const authenticated = await isAuthenticated();
      if (!authenticated) {
        return { ready: false, error: 'Not authenticated with OneDrive' };
      }
      if (!this.folderId) {
        return { ready: false, error: 'No folder selected' };
      }
      return { ready: true };
    } catch (error) {
      return { ready: false, error: error.message };
    }
  }

  async saveFile(blob, filename) {
    try {
      await uploadFile(blob, filename, this.folderId);
      return { success: true, path: `${this.folderName}/${filename}` };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        requiresReauth: error.requiresReauth || false
      };
    }
  }

  async listFolders(parentId = 'root') {
    return await onedriveListFolders(parentId);
  }

  async getDisplayInfo() {
    return {
      name: this.destinationName,
      path: this.folderName || 'No folder selected',
      icon: 'onedrive'
    };
  }

  /**
   * Get user info for display
   */
  async getUserInfo() {
    return await getUserInfo();
  }

  static getConfigSchema() {
    return {
      type: 'onedrive',
      fields: [
        { name: 'name', type: 'text', label: 'Destination Name', required: true },
        { name: 'folder', type: 'folder-picker', label: 'OneDrive Folder', required: true }
      ]
    };
  }

  static async validateConfig(config) {
    if (!config.name || config.name.trim() === '') {
      return { valid: false, error: 'Destination name is required' };
    }
    if (!config.folderId) {
      return { valid: false, error: 'Please select a OneDrive folder' };
    }
    return { valid: true };
  }
}
