/**
 * SaveMe Background Service Worker
 * Handles context menu, image fetching, and multi-destination upload
 */

import { isAuthenticated, refreshAccessToken, getTokens } from './lib/onedrive-api.js';
import { addImageMetadata } from './lib/image-metadata.js';
import { createProvider } from './lib/providers/provider-registry.js';
import {
  getDestinationsSorted,
  getDestinationById,
  migrateFromLegacy
} from './lib/storage-schema.js';

// Constants
const CONTEXT_MENU_PARENT_ID = 'saveme-parent';
const CONTEXT_MENU_SETUP_ID = 'saveme-setup';
const HASH_RETENTION_DAYS = 90;
const HASH_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
const MAX_STORED_HASHES = 10000;

// ==================== Service Worker Initialization ====================
// This runs every time the service worker wakes up (not just on browser start)

(async function initServiceWorker() {
  const now = Date.now();
  console.log('SaveMe: Service worker initializing...', {
    timestamp: new Date(now).toISOString()
  });

  // Ensure the refresh alarm exists - check and recreate if missing
  const existingAlarm = await chrome.alarms.get('refreshToken');
  if (!existingAlarm) {
    console.log('SaveMe: No refresh alarm found, creating one (every 30 minutes)');
    chrome.alarms.create('refreshToken', {
      delayInMinutes: 1,
      periodInMinutes: 30  // Refresh every 30 minutes instead of 3 hours
    });
  } else {
    const nextFire = new Date(existingAlarm.scheduledTime);
    console.log('SaveMe: Refresh alarm exists, next fire:', nextFire.toISOString());
  }

  // Check if we have tokens and if they need refresh
  try {
    const result = await chrome.storage.local.get('tokens');
    const tokens = result.tokens;

    if (tokens?.refreshToken) {
      const expiresAt = tokens.expiresAt || 0;
      const timeUntilExpiry = expiresAt - now;
      const lastRefreshAge = tokens.lastRefresh ? now - tokens.lastRefresh : Infinity;
      const oneHour = 60 * 60 * 1000;

      console.log('SaveMe: Token status on wake', {
        hasTokens: true,
        accessTokenExpiresIn: Math.round(timeUntilExpiry / 1000 / 60) + ' minutes',
        accessTokenExpired: timeUntilExpiry < 0,
        lastRefresh: tokens.lastRefresh ? new Date(tokens.lastRefresh).toISOString() : 'never',
        lastRefreshAge: Math.round(lastRefreshAge / 1000 / 60) + ' minutes ago',
        refreshCount: tokens.refreshCount || 0
      });

      // Refresh if:
      // 1. Access token expires within 30 minutes, OR
      // 2. Last refresh was more than 1 hour ago (keep refresh token active)
      const needsRefresh = timeUntilExpiry < (30 * 60 * 1000) || lastRefreshAge > oneHour;

      if (needsRefresh) {
        const reason = timeUntilExpiry < (30 * 60 * 1000)
          ? 'access token expiring soon'
          : 'refresh token keepalive (>1 hour since last refresh)';
        console.log(`SaveMe: Refreshing on wake - ${reason}`);
        await refreshAccessToken();
        console.log('SaveMe: Proactive refresh on wake completed');
      }
    } else {
      console.log('SaveMe: No tokens found, user needs to authenticate');
    }
  } catch (error) {
    console.error('SaveMe: Init token check failed:', error.message);
  }
})();

/**
 * Build context menu based on destination count
 */
async function rebuildContextMenu() {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(async () => {
      const destinations = await getDestinationsSorted();

      if (destinations.length === 0) {
        // No destinations - show setup prompt
        chrome.contextMenus.create({
          id: CONTEXT_MENU_SETUP_ID,
          title: 'SaveMe - Setup Required',
          contexts: ['image']
        });
      } else if (destinations.length === 1) {
        // Single destination - flat menu item
        const dest = destinations[0];
        chrome.contextMenus.create({
          id: `saveme-${dest.id}`,
          title: `SaveMe to ${dest.name}`,
          contexts: ['image']
        });
      } else {
        // Multiple destinations - submenu
        chrome.contextMenus.create({
          id: CONTEXT_MENU_PARENT_ID,
          title: 'SaveMe',
          contexts: ['image']
        });

        // Create child items in order
        for (const dest of destinations) {
          chrome.contextMenus.create({
            id: `saveme-${dest.id}`,
            parentId: CONTEXT_MENU_PARENT_ID,
            title: dest.name,
            contexts: ['image']
          });
        }
      }

      resolve();
    });
  });
}

/**
 * Initialize on extension install/update
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  // Run migration from legacy schema
  const migrationResult = await migrateFromLegacy();
  if (migrationResult.migrated) {
    console.log('SaveMe: Migration completed', migrationResult);
  }

  // Build context menu
  await rebuildContextMenu();

  // Open settings page on first install
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }

  // Set up periodic token refresh alarm (every 30 minutes for reliability)
  chrome.alarms.create('refreshToken', {
    delayInMinutes: 1,
    periodInMinutes: 30
  });
  console.log('SaveMe: Token refresh alarm created (every 30 minutes)');
});

/**
 * Refresh token on browser startup
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('SaveMe: Browser startup detected at', new Date().toISOString());

  // Rebuild context menu on startup
  await rebuildContextMenu();

  // Ensure the refresh alarm exists (in case it was cleared)
  await ensureRefreshAlarm();

  // Create a one-time alarm for immediate refresh (minimum 1 minute in Chrome)
  chrome.alarms.create('refreshTokenNow', { delayInMinutes: 1 });
  console.log('SaveMe: Scheduled immediate token refresh');
});

/**
 * Handle alarms for background tasks
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'refreshToken' || alarm.name === 'refreshTokenNow') {
    console.log(`SaveMe: Alarm fired - ${alarm.name}`);
    await proactiveTokenRefresh();
  }
});

/**
 * Ensure the periodic refresh alarm exists
 */
async function ensureRefreshAlarm() {
  const existingAlarm = await chrome.alarms.get('refreshToken');
  if (!existingAlarm) {
    console.log('SaveMe: Creating token refresh alarm (every 30 minutes)');
    chrome.alarms.create('refreshToken', {
      delayInMinutes: 1,
      periodInMinutes: 30
    });
  } else {
    // Check if alarm has old 3-hour period and recreate with 30-minute period
    if (existingAlarm.periodInMinutes && existingAlarm.periodInMinutes > 60) {
      console.log('SaveMe: Updating alarm from', existingAlarm.periodInMinutes, 'to 30 minutes');
      await chrome.alarms.clear('refreshToken');
      chrome.alarms.create('refreshToken', {
        delayInMinutes: 1,
        periodInMinutes: 30
      });
    } else {
      console.log('SaveMe: Token refresh alarm already exists', {
        scheduledTime: new Date(existingAlarm.scheduledTime).toISOString(),
        periodInMinutes: existingAlarm.periodInMinutes
      });
    }
  }
}

/**
 * Listen for storage changes to rebuild menu
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.destinations) {
    rebuildContextMenu();
  }
});

/**
 * Proactively refresh OneDrive token
 */
async function proactiveTokenRefresh() {
  try {
    const tokens = await getTokens();
    if (!tokens?.refreshToken) {
      console.log('SaveMe: No refresh token found, skipping proactive refresh');
      return;
    }

    const now = Date.now();
    const expiresAt = tokens.expiresAt || 0;
    const timeUntilExpiry = expiresAt - now;
    const lastRefreshAge = tokens.lastRefresh ? now - tokens.lastRefresh : Infinity;

    console.log('SaveMe: Proactive token refresh check', {
      currentlyExpired: timeUntilExpiry < 0,
      expiresIn: Math.round(timeUntilExpiry / 1000 / 60) + ' minutes',
      lastRefresh: tokens.lastRefresh ? new Date(tokens.lastRefresh).toISOString() : 'never',
      lastRefreshAge: Math.round(lastRefreshAge / 1000 / 60) + ' minutes ago',
      refreshCount: tokens.refreshCount || 0
    });

    // Always refresh to keep the refresh token active
    // Microsoft refresh tokens can expire if not used regularly
    console.log('SaveMe: Performing token refresh...');
    await refreshAccessToken();
    console.log('SaveMe: Proactive token refresh completed successfully');
  } catch (error) {
    console.error('SaveMe: Proactive token refresh failed:', error.message);
    // If it's a re-auth error, the tokens have already been cleared by refreshAccessToken
    if (error.requiresReauth) {
      console.log('SaveMe: Re-authentication required, tokens cleared');
      // Show notification to user
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'SaveMe: OneDrive Session Expired',
        message: 'Please open SaveMe settings to reconnect to OneDrive.',
        priority: 2
      });
    }
  }
}

/**
 * Handle context menu click
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = info.menuItemId;
  const imageUrl = info.srcUrl;

  if (!imageUrl) {
    showNotification('Error', 'No image URL found', 'error');
    return;
  }

  // Handle setup required click
  if (menuId === CONTEXT_MENU_SETUP_ID) {
    openOptionsPage();
    return;
  }

  // Extract destination ID from menu item ID
  if (typeof menuId === 'string' && menuId.startsWith('saveme-')) {
    const destId = menuId.replace('saveme-', '');
    await saveToDestination(destId, imageUrl, tab);
  }
});

/**
 * Save image to specific destination
 */
async function saveToDestination(destinationId, imageUrl, tab) {
  const destination = await getDestinationById(destinationId);
  if (!destination) {
    showNotification('Error', 'Destination not found', 'error');
    await rebuildContextMenu();
    return;
  }

  const provider = createProvider(destination);
  const notifSettings = await getNotificationSettings();

  try {
    // Check if provider is ready
    const readyCheck = await provider.isReady();
    if (!readyCheck.ready) {
      showNotification('Not Ready', readyCheck.error, 'error', true);
      if (destination.type === 'onedrive') {
        // Store pending save so it can be retried after re-authentication
        await chrome.storage.local.set({
          pendingSave: {
            destinationId: destinationId,
            imageUrl: imageUrl,
            pageUrl: tab?.url,
            timestamp: Date.now()
          }
        });
        openOptionsPage();
      }
      return;
    }

    // Show progress notification
    if (notifSettings.enabled && notifSettings.mode === 'all') {
      showNotification('Saving...', 'Downloading image...', 'info');
    }

    // Fetch the image
    const { blob, extension } = await fetchImage(imageUrl);

    // Calculate hash to check for duplicates
    const imageHash = await calculateImageHash(blob);

    // Check if this image was already saved
    const duplicateCheck = await checkDuplicate(imageHash, destinationId);
    if (duplicateCheck.isDuplicate) {
      if (notifSettings.enabled) {
        const message = duplicateCheck.savedTo
          ? `Already saved to "${duplicateCheck.savedTo}"`
          : 'This image was already saved recently';
        showNotification('Duplicate', message, 'info');
      }
      return;
    }

    // Generate filename and timestamp
    const saveDate = new Date();
    const pageUrl = tab?.url || imageUrl;
    const filename = generateFilename(pageUrl, imageUrl, extension, saveDate);

    // Add metadata to supported formats (JPEG, PNG, WebP)
    const blobWithMetadata = await addImageMetadata(blob, pageUrl, imageUrl, saveDate);

    // Update notification
    if (notifSettings.enabled && notifSettings.mode === 'all') {
      const destInfo = await provider.getDisplayInfo();
      showNotification('Saving...', `Uploading to ${destInfo.name}...`, 'info');
    }

    // Save using provider
    const result = await provider.saveFile(blobWithMetadata, filename);

    if (!result.success) {
      throw Object.assign(new Error(result.error), { requiresReauth: result.requiresReauth });
    }

    // Store hash after successful upload
    await storeImageHash(imageHash, imageUrl, destinationId);

    // Success notification
    if (notifSettings.enabled) {
      showNotification('Saved!', `Image saved to ${destination.name}`, 'success');
    }

  } catch (error) {
    console.error('SaveMe error:', error);
    if (notifSettings.enabled) {
      showNotification('Error', error.message, 'error');
    }
    // Handle re-authentication for OneDrive
    if (error.requiresReauth && destination.type === 'onedrive') {
      await chrome.storage.local.set({
        pendingSave: {
          destinationId: destinationId,
          imageUrl: imageUrl,
          pageUrl: tab?.url,
          timestamp: Date.now()
        }
      });
      openOptionsPage();
    }
  }
}

/**
 * Retry a pending save after re-authentication
 */
async function retryPendingSave() {
  const result = await chrome.storage.local.get('pendingSave');
  const pending = result.pendingSave;

  if (!pending) {
    return { success: false, reason: 'no_pending' };
  }

  // Check if pending save is not too old (max 10 minutes)
  if (Date.now() - pending.timestamp > 10 * 60 * 1000) {
    await chrome.storage.local.remove('pendingSave');
    return { success: false, reason: 'expired' };
  }

  // Get destination (use stored ID or fall back to first destination)
  let destination;
  if (pending.destinationId) {
    destination = await getDestinationById(pending.destinationId);
  }
  if (!destination) {
    const destinations = await getDestinationsSorted();
    destination = destinations.find(d => d.type === 'onedrive');
  }
  if (!destination) {
    await chrome.storage.local.remove('pendingSave');
    return { success: false, reason: 'no_destination' };
  }

  const provider = createProvider(destination);
  const notifSettings = await getNotificationSettings();

  try {
    // Check if provider is ready
    const readyCheck = await provider.isReady();
    if (!readyCheck.ready) {
      return { success: false, reason: 'not_ready', error: readyCheck.error };
    }

    // Show progress notification
    if (notifSettings.enabled && notifSettings.mode === 'all') {
      showNotification('Saving...', 'Retrying pending image...', 'info');
    }

    // Fetch the image
    const { blob, extension } = await fetchImage(pending.imageUrl);

    // Calculate hash to check for duplicates
    const imageHash = await calculateImageHash(blob);

    // Check if this image was already saved
    const duplicateCheck = await checkDuplicate(imageHash, destination.id);
    if (duplicateCheck.isDuplicate) {
      await chrome.storage.local.remove('pendingSave');
      if (notifSettings.enabled) {
        const message = duplicateCheck.savedTo
          ? `Already saved to "${duplicateCheck.savedTo}"`
          : 'This image was already saved recently';
        showNotification('Duplicate', message, 'info');
      }
      return { success: true, reason: 'duplicate' };
    }

    // Generate filename and timestamp
    const saveDate = new Date();
    const pageUrl = pending.pageUrl || pending.imageUrl;
    const filename = generateFilename(pageUrl, pending.imageUrl, extension, saveDate);

    // Add metadata to supported formats
    const blobWithMetadata = await addImageMetadata(blob, pageUrl, pending.imageUrl, saveDate);

    // Update notification
    if (notifSettings.enabled && notifSettings.mode === 'all') {
      showNotification('Saving...', `Uploading to ${destination.name}...`, 'info');
    }

    // Save using provider
    const saveResult = await provider.saveFile(blobWithMetadata, filename);

    if (!saveResult.success) {
      throw new Error(saveResult.error);
    }

    // Store hash after successful upload
    await storeImageHash(imageHash, pending.imageUrl, destination.id);

    // Clear pending save
    await chrome.storage.local.remove('pendingSave');

    // Success notification
    if (notifSettings.enabled) {
      showNotification('Saved!', `Image saved to ${destination.name}`, 'success');
    }

    return { success: true };
  } catch (error) {
    console.error('SaveMe retry error:', error);
    return { success: false, reason: 'error', message: error.message };
  }
}

// ==================== Utility Functions ====================

/**
 * Fetch an image and return it as a blob
 */
async function fetchImage(url) {
  let response;

  try {
    response = await fetch(url);
  } catch (_e) {
    try {
      response = await fetch(url, { mode: 'no-cors' });
    } catch (_e2) {
      throw new Error('Could not fetch image. It may be protected from downloading.');
    }
  }

  if (!response.ok && response.type !== 'opaque') {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();

  let mimeType = blob.type;
  let extension = getExtensionFromMimeType(mimeType);

  if (!mimeType || mimeType === 'application/octet-stream') {
    const urlExtension = getExtensionFromUrl(url);
    if (urlExtension) {
      extension = urlExtension;
      mimeType = getMimeTypeFromExtension(extension);
    }
  }

  if (!extension) {
    extension = 'png';
    mimeType = 'image/png';
  }

  return { blob, mimeType, extension };
}

/**
 * Generate a filename from the page URL domain and datetime
 * @param {string} pageUrl - The browser page URL (used for domain)
 * @param {string} imageUrl - The image URL (fallback for domain)
 * @param {string} extension - File extension
 * @param {Date} datetime - Save datetime
 */
function generateFilename(pageUrl, imageUrl, extension, datetime = new Date()) {
  // Get domain from page URL
  let domain = 'unknown';
  try {
    const pageUrlObj = new URL(pageUrl);
    domain = pageUrlObj.hostname
      .replace(/^www\./, '')
      .replace(/\./g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
  } catch {
    // Use image URL domain as fallback
    try {
      const imageUrlObj = new URL(imageUrl);
      domain = imageUrlObj.hostname
        .replace(/^www\./, '')
        .replace(/\./g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
    } catch {
      domain = 'unknown';
    }
  }

  const timestamp = datetime.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '');

  return `${domain}_${timestamp}.${extension}`;
}

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

function getExtensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
    if (match) {
      const ext = match[1].toLowerCase();
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

async function getNotificationSettings() {
  const result = await chrome.storage.sync.get('notificationSettings');
  return result.notificationSettings || { enabled: true, mode: 'all' };
}

function showNotification(title, message, type = 'info', _forceShow = false) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: `SaveMe: ${title}`,
    message: message,
    priority: type === 'error' ? 2 : 1
  });
}

function openOptionsPage() {
  chrome.runtime.openOptionsPage();
}

// ==================== Message Handling ====================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'checkAuth') {
    isAuthenticated().then(result => {
      sendResponse({ authenticated: result });
    });
    return true;
  }

  if (message.type === 'retryPendingSave') {
    retryPendingSave().then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'rebuildContextMenu') {
    rebuildContextMenu().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// ==================== Duplicate Detection ====================

// Modes: 'global' (once ever), 'per-destination' (once per destination), 'disabled' (allow all)
async function getDuplicateMode() {
  const result = await chrome.storage.sync.get('duplicateMode');
  return result.duplicateMode || 'global';
}

async function calculateImageHash(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkDuplicate(hash, destinationId = null) {
  const mode = await getDuplicateMode();

  // Disabled mode - never a duplicate
  if (mode === 'disabled') {
    return { isDuplicate: false };
  }

  const result = await chrome.storage.local.get('imageHashes');
  const hashes = result.imageHashes || {};

  if (!(hash in hashes)) {
    return { isDuplicate: false };
  }

  const hashData = hashes[hash];

  // Global mode - any existing hash is a duplicate
  if (mode === 'global') {
    // Try to get destination name if we have destinations array
    let savedTo = null;
    if (hashData.destinations && hashData.destinations.length > 0) {
      const dest = await getDestinationById(hashData.destinations[0]);
      savedTo = dest?.name || null;
    }
    return { isDuplicate: true, mode: 'global', savedTo };
  }

  // Per-destination mode
  if (mode === 'per-destination') {
    // Legacy hashes without destinations array are treated as global (block everywhere)
    if (!hashData.destinations) {
      return { isDuplicate: true, mode: 'legacy' };
    }
    // Check if saved to same destination
    if (hashData.destinations.includes(destinationId)) {
      const dest = await getDestinationById(destinationId);
      return { isDuplicate: true, mode: 'per-destination', savedTo: dest?.name || null };
    }
  }

  return { isDuplicate: false };
}

async function storeImageHash(hash, url, destinationId = null) {
  const mode = await getDuplicateMode();

  // Don't store hashes if duplicate detection is disabled
  if (mode === 'disabled') {
    return;
  }

  const result = await chrome.storage.local.get('imageHashes');
  const hashes = result.imageHashes || {};

  // Get existing hash data or create new
  const existingData = hashes[hash] || {};

  const hashData = {
    timestamp: Date.now(),
    url: url.substring(0, 200)
  };

  // Store destinations array for per-destination mode
  if (mode === 'per-destination' && destinationId) {
    // Preserve existing destinations and add new one
    const existingDestinations = existingData.destinations || [];
    if (!existingDestinations.includes(destinationId)) {
      hashData.destinations = [...existingDestinations, destinationId];
    } else {
      hashData.destinations = existingDestinations;
    }
  }

  hashes[hash] = hashData;

  await chrome.storage.local.set({ imageHashes: hashes });
  await cleanupOldHashes();
}

async function cleanupOldHashes(forceCleanup = false) {
  const result = await chrome.storage.local.get(['imageHashes', 'lastHashCleanup']);
  const hashes = result.imageHashes || {};
  const lastCleanup = result.lastHashCleanup || 0;

  if (!forceCleanup && Date.now() - lastCleanup < HASH_CLEANUP_INTERVAL) {
    return;
  }

  const cutoffTime = Date.now() - (HASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let cleanedCount = 0;

  for (const hash in hashes) {
    if (hashes[hash].timestamp < cutoffTime) {
      delete hashes[hash];
      cleanedCount++;
    }
  }

  const hashCount = Object.keys(hashes).length;
  if (hashCount > MAX_STORED_HASHES) {
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
