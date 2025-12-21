/**
 * SaveMe Background Service Worker
 * Handles context menu, image fetching, and OneDrive upload
 */

import {
  isAuthenticated,
  getSelectedFolder,
  uploadFile,
  getValidAccessToken,
  refreshAccessToken,
  getTokens
} from './lib/onedrive-api.js';

import { addImageMetadata } from './lib/image-metadata.js';

// Constants
const CONTEXT_MENU_ID = 'saveme-image';
const HASH_RETENTION_DAYS = 90; // Keep hashes for 3 months
const HASH_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Clean up once per day
const MAX_STORED_HASHES = 10000; // Maximum hashes to store (safety limit)

/**
 * Create the context menu on extension install and open settings
 */
chrome.runtime.onInstalled.addListener((details) => {
  // Create context menu
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'SaveMe',
    contexts: ['image']
  });

  // Open settings page on first install
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }

  // Set up periodic token refresh alarm (every 3 hours)
  chrome.alarms.create('refreshToken', {
    delayInMinutes: 5, // First run in 5 minutes
    periodInMinutes: 60 * 3 // Then every 3 hours
  });
});

/**
 * Refresh token on browser startup
 */
chrome.runtime.onStartup.addListener(async () => {
  // Small delay to let things initialize
  setTimeout(() => proactiveTokenRefresh(), 10000);
});

/**
 * Handle alarms for background tasks
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'refreshToken') {
    await proactiveTokenRefresh();
  }
});

/**
 * Proactively refresh token to prevent expiration
 * Microsoft refresh tokens last 90 days if unused, refreshing extends them
 */
async function proactiveTokenRefresh() {
  try {
    const tokens = await getTokens();
    if (tokens?.refreshToken) {
      await refreshAccessToken();
      console.log('SaveMe: Token refreshed proactively');
    }
  } catch (error) {
    // Don't show notification for background refresh failures
    console.warn('SaveMe: Proactive token refresh failed:', error.message);
  }
}

/**
 * Handle context menu click
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;

  const imageUrl = info.srcUrl;

  if (!imageUrl) {
    showNotification('Error', 'No image URL found', 'error');
    return;
  }

  try {
    // Check if authenticated
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      showNotification(
        'Not Connected',
        'Please connect to OneDrive in the extension settings',
        'error',
        true // Always show setup errors
      );
      openOptionsPage();
      return;
    }

    // Check if folder is selected
    const folder = await getSelectedFolder();
    if (!folder) {
      showNotification(
        'No Folder Selected',
        'Please select a save folder in the extension settings',
        'error',
        true // Always show setup errors
      );
      openOptionsPage();
      return;
    }

    // Get notification settings
    const notifSettings = await getNotificationSettings();

    // Show progress notification (only if mode is 'all')
    if (notifSettings.enabled && notifSettings.mode === 'all') {
      showNotification('Saving...', 'Downloading image...', 'info');
    }

    // Fetch the image
    const { blob, mimeType, extension } = await fetchImage(imageUrl);

    // Calculate hash to check for duplicates
    const imageHash = await calculateImageHash(blob);

    // Check if this image was already saved
    const isDuplicate = await checkDuplicate(imageHash);
    if (isDuplicate) {
      if (notifSettings.enabled) {
        showNotification(
          'Duplicate',
          'This image was already saved recently',
          'info'
        );
      }
      return;
    }

    // Generate filename and timestamp
    const saveDate = new Date();
    const filename = generateFilename(imageUrl, extension, saveDate);

    // Add metadata to supported formats (JPEG, PNG, WebP)
    const blobWithMetadata = await addImageMetadata(blob, imageUrl, saveDate);

    // Update notification (only if mode is 'all')
    if (notifSettings.enabled && notifSettings.mode === 'all') {
      showNotification('Saving...', 'Uploading to OneDrive...', 'info');
    }

    // Upload to OneDrive
    await uploadFile(blobWithMetadata, filename, folder.id);

    // Store hash after successful upload
    await storeImageHash(imageHash, imageUrl);

    // Success notification (show if notifications enabled)
    if (notifSettings.enabled) {
      showNotification(
        'Saved!',
        `Image saved to ${folder.name}`,
        'success'
      );
    }

  } catch (error) {
    console.error('SaveMe error:', error);
    // Always show errors if notifications are enabled
    const notifSettings = await getNotificationSettings();
    if (notifSettings.enabled) {
      showNotification('Error', error.message, 'error');
    }
    // Open options page if re-authentication is required
    if (error.requiresReauth) {
      openOptionsPage();
    }
  }
});

/**
 * Fetch an image and return it as a blob
 */
async function fetchImage(url) {
  // Try different fetch strategies for CORS
  let response;

  try {
    // First try: normal fetch (works for same-origin and CORS-enabled images)
    response = await fetch(url);
  } catch (e) {
    try {
      // Second try: no-cors mode (returns opaque response, limited use)
      response = await fetch(url, { mode: 'no-cors' });
    } catch (e2) {
      throw new Error('Could not fetch image. It may be protected from downloading.');
    }
  }

  if (!response.ok && response.type !== 'opaque') {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();

  // Determine MIME type
  let mimeType = blob.type;
  let extension = getExtensionFromMimeType(mimeType);

  // If no MIME type, try to get from URL
  if (!mimeType || mimeType === 'application/octet-stream') {
    const urlExtension = getExtensionFromUrl(url);
    if (urlExtension) {
      extension = urlExtension;
      mimeType = getMimeTypeFromExtension(extension);
    }
  }

  // Default to png if still unknown
  if (!extension) {
    extension = 'png';
    mimeType = 'image/png';
  }

  return { blob, mimeType, extension };
}

/**
 * Generate a filename from the image URL and datetime
 */
function generateFilename(url, extension, datetime = new Date()) {
  // Parse URL
  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    urlObj = { hostname: 'unknown', pathname: '/image' };
  }

  // Get domain (sanitized)
  const domain = urlObj.hostname
    .replace(/^www\./, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_');

  // Get path slug (last part of path without extension)
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  let pathSlug = pathParts[pathParts.length - 1] || 'image';

  // Remove existing extension from path slug
  pathSlug = pathSlug.replace(/\.[^.]+$/, '');

  // Sanitize path slug
  pathSlug = pathSlug
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 50); // Limit length

  // Generate timestamp
  const timestamp = datetime.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '');

  // Combine parts
  return `${domain}_${pathSlug}_${timestamp}.${extension}`;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType) {
  const mimeMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/x-icon': 'ico'
  };
  return mimeMap[mimeType] || null;
}

/**
 * Get MIME type from file extension
 */
function getMimeTypeFromExtension(extension) {
  const extMap = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'tiff': 'image/tiff',
    'ico': 'image/x-icon'
  };
  return extMap[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * Get file extension from URL
 */
function getExtensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
    if (match) {
      const ext = match[1].toLowerCase();
      // Verify it's an image extension
      const validExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico'];
      if (validExtensions.includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Get notification settings from storage
 */
async function getNotificationSettings() {
  const result = await chrome.storage.sync.get('notificationSettings');
  return result.notificationSettings || {
    enabled: true,
    mode: 'all'
  };
}

/**
 * Show a Chrome notification
 */
function showNotification(title, message, type = 'info', forceShow = false) {
  // forceShow bypasses settings (used for setup errors)
  const iconPath = 'icons/icon48.png';

  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconPath,
    title: `SaveMe: ${title}`,
    message: message,
    priority: type === 'error' ? 2 : 1
  });
}

/**
 * Open the options page
 */
function openOptionsPage() {
  chrome.runtime.openOptionsPage();
}

// Listen for messages from options page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'checkAuth') {
    isAuthenticated().then(result => {
      sendResponse({ authenticated: result });
    });
    return true; // Keep channel open for async response
  }
});

// ==================== Duplicate Detection ====================

/**
 * Calculate SHA-256 hash of image blob
 */
async function calculateImageHash(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if image hash already exists (is a duplicate)
 */
async function checkDuplicate(hash) {
  const result = await chrome.storage.local.get('imageHashes');
  const hashes = result.imageHashes || {};
  return hash in hashes;
}

/**
 * Store image hash with timestamp
 */
async function storeImageHash(hash, url) {
  const result = await chrome.storage.local.get('imageHashes');
  const hashes = result.imageHashes || {};

  hashes[hash] = {
    timestamp: Date.now(),
    url: url.substring(0, 200) // Store truncated URL for reference
  };

  await chrome.storage.local.set({ imageHashes: hashes });

  // Trigger cleanup of old hashes
  await cleanupOldHashes();
}

/**
 * Remove hashes older than retention period and enforce max limit
 */
async function cleanupOldHashes(forceCleanup = false) {
  const result = await chrome.storage.local.get(['imageHashes', 'lastHashCleanup']);
  const hashes = result.imageHashes || {};
  const lastCleanup = result.lastHashCleanup || 0;

  // Only cleanup once per day (unless forced)
  if (!forceCleanup && Date.now() - lastCleanup < HASH_CLEANUP_INTERVAL) {
    return;
  }

  const cutoffTime = Date.now() - (HASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let cleanedCount = 0;

  // Remove expired hashes
  for (const hash in hashes) {
    if (hashes[hash].timestamp < cutoffTime) {
      delete hashes[hash];
      cleanedCount++;
    }
  }

  // Enforce maximum limit - remove oldest if over limit
  const hashCount = Object.keys(hashes).length;
  if (hashCount > MAX_STORED_HASHES) {
    // Sort by timestamp and remove oldest
    const sortedHashes = Object.entries(hashes)
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = hashCount - MAX_STORED_HASHES;
    for (let i = 0; i < toRemove; i++) {
      delete hashes[sortedHashes[i][0]];
      cleanedCount++;
    }
    console.log(`SaveMe: Removed ${toRemove} oldest hashes (limit: ${MAX_STORED_HASHES})`);
  }

  await chrome.storage.local.set({
    imageHashes: hashes,
    lastHashCleanup: Date.now()
  });

  if (cleanedCount > 0) {
    console.log(`SaveMe: Cleaned up ${cleanedCount} old image hashes`);
  }
}

/**
 * Get hash statistics (for debugging/options page)
 */
async function getHashStats() {
  const result = await chrome.storage.local.get('imageHashes');
  const hashes = result.imageHashes || {};
  const count = Object.keys(hashes).length;

  let oldestTimestamp = Date.now();
  let newestTimestamp = 0;

  for (const hash in hashes) {
    const ts = hashes[hash].timestamp;
    if (ts < oldestTimestamp) oldestTimestamp = ts;
    if (ts > newestTimestamp) newestTimestamp = ts;
  }

  return {
    count,
    oldestDate: count > 0 ? new Date(oldestTimestamp).toISOString() : null,
    newestDate: count > 0 ? new Date(newestTimestamp).toISOString() : null
  };
}
