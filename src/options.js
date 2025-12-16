/**
 * SaveMe Options Page - Handles OneDrive authentication and folder selection
 */

import {
  authenticate,
  isAuthenticated,
  getUserInfo,
  clearTokens,
  listFolders,
  getFolderInfo,
  saveSelectedFolder,
  getSelectedFolder
} from './lib/onedrive-api.js';

// DOM Elements
const notConnectedEl = document.getElementById('not-connected');
const connectedEl = document.getElementById('connected');
const userNameEl = document.getElementById('user-name');
const userEmailEl = document.getElementById('user-email');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');

const folderSection = document.getElementById('folder-section');
const folderNotSelectedEl = document.getElementById('folder-not-selected');
const folderSelectedEl = document.getElementById('folder-selected');
const selectedFolderNameEl = document.getElementById('selected-folder-name');
const selectFolderBtn = document.getElementById('select-folder-btn');
const changeFolderBtn = document.getElementById('change-folder-btn');
const folderPicker = document.getElementById('folder-picker');
const breadcrumbEl = document.getElementById('breadcrumb');
const folderListEl = document.getElementById('folder-list');
const selectCurrentBtn = document.getElementById('select-current-btn');
const cancelPickerBtn = document.getElementById('cancel-picker-btn');
const statusMessageEl = document.getElementById('status-message');

const notificationsEnabledEl = document.getElementById('notifications-enabled');
const notificationOptionsEl = document.getElementById('notification-options');
const notificationModeRadios = document.querySelectorAll('input[name="notification-mode"]');

// State
let currentFolderId = 'root';
let currentFolderName = 'OneDrive';
let breadcrumbPath = [{ id: 'root', name: 'OneDrive' }];

/**
 * Initialize the options page
 */
async function init() {
  try {
    const authenticated = await isAuthenticated();

    if (authenticated) {
      await showConnectedState();
    } else {
      showDisconnectedState();
    }
  } catch (error) {
    showDisconnectedState();
    showMessage('Error loading settings: ' + error.message, 'error');
  }

  // Event listeners
  connectBtn.addEventListener('click', handleConnect);
  disconnectBtn.addEventListener('click', handleDisconnect);
  selectFolderBtn.addEventListener('click', showFolderPicker);
  changeFolderBtn.addEventListener('click', showFolderPicker);
  selectCurrentBtn.addEventListener('click', handleSelectFolder);
  cancelPickerBtn.addEventListener('click', hideFolderPicker);

  // Notification settings listeners
  notificationsEnabledEl.addEventListener('change', handleNotificationToggle);
  notificationModeRadios.forEach(radio => {
    radio.addEventListener('change', handleNotificationModeChange);
  });

  // Load notification settings
  await loadNotificationSettings();
}

/**
 * Show the connected state UI
 */
async function showConnectedState() {
  try {
    const userInfo = await getUserInfo();

    userNameEl.textContent = userInfo.displayName || 'Unknown User';
    userEmailEl.textContent = userInfo.mail || userInfo.userPrincipalName || '';

    notConnectedEl.classList.add('hidden');
    connectedEl.classList.remove('hidden');
    folderSection.classList.remove('disabled');

    // Load selected folder
    const selectedFolder = await getSelectedFolder();
    if (selectedFolder) {
      folderNotSelectedEl.classList.add('hidden');
      folderSelectedEl.classList.remove('hidden');
      selectedFolderNameEl.textContent = selectedFolder.name;
    } else {
      folderNotSelectedEl.classList.remove('hidden');
      folderSelectedEl.classList.add('hidden');
    }
  } catch (error) {
    // Token might be invalid
    showDisconnectedState();
    showMessage('Session expired. Please reconnect to OneDrive.', 'error');
  }
}

/**
 * Show the disconnected state UI
 */
function showDisconnectedState() {
  notConnectedEl.classList.remove('hidden');
  connectedEl.classList.add('hidden');
  folderSection.classList.add('disabled');
  folderNotSelectedEl.classList.remove('hidden');
  folderSelectedEl.classList.add('hidden');
  hideFolderPicker();
}

/**
 * Handle connect button click
 */
async function handleConnect() {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';

  try {
    await authenticate();
    await showConnectedState();
    showMessage('Successfully connected to OneDrive!', 'success');
  } catch (error) {
    showMessage('Connection failed: ' + error.message, 'error');
  } finally {
    connectBtn.disabled = false;
    connectBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
      </svg>
      Connect to OneDrive
    `;
  }
}

/**
 * Handle disconnect button click
 */
async function handleDisconnect() {
  try {
    await clearTokens();
    await chrome.storage.sync.remove('selectedFolder');
    showDisconnectedState();
    showMessage('Disconnected from OneDrive', 'info');
  } catch (error) {
    showMessage('Error disconnecting: ' + error.message, 'error');
  }
}

/**
 * Show the folder picker
 */
async function showFolderPicker() {
  folderPicker.classList.remove('hidden');
  currentFolderId = 'root';
  currentFolderName = 'OneDrive';
  breadcrumbPath = [{ id: 'root', name: 'OneDrive' }];
  updateBreadcrumb();
  await loadFolders('root');
}

/**
 * Hide the folder picker
 */
function hideFolderPicker() {
  folderPicker.classList.add('hidden');
}

/**
 * Load folders for the current path
 */
async function loadFolders(folderId) {
  folderListEl.innerHTML = '<div class="loading">Loading folders...</div>';

  try {
    const folders = await listFolders(folderId);

    if (folders.length === 0) {
      folderListEl.innerHTML = '<div class="empty-folder">No subfolders in this location</div>';
    } else {
      folderListEl.innerHTML = '';
      folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'folder-item';
        item.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
          <span>${escapeHtml(folder.name)}</span>
          <svg class="arrow" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        `;
        item.addEventListener('click', () => navigateToFolder(folder.id, folder.name));
        folderListEl.appendChild(item);
      });
    }
  } catch (error) {
    folderListEl.innerHTML = `<div class="empty-folder">Error loading folders: ${escapeHtml(error.message)}</div>`;
  }
}

/**
 * Navigate to a folder
 */
async function navigateToFolder(folderId, folderName) {
  currentFolderId = folderId;
  currentFolderName = folderName;
  breadcrumbPath.push({ id: folderId, name: folderName });
  updateBreadcrumb();
  await loadFolders(folderId);
}

/**
 * Navigate to a breadcrumb item
 */
async function navigateToBreadcrumb(index) {
  const item = breadcrumbPath[index];
  currentFolderId = item.id;
  currentFolderName = item.name;
  breadcrumbPath = breadcrumbPath.slice(0, index + 1);
  updateBreadcrumb();
  await loadFolders(currentFolderId);
}

/**
 * Update the breadcrumb display
 */
function updateBreadcrumb() {
  breadcrumbEl.innerHTML = '';
  breadcrumbPath.forEach((item, index) => {
    const btn = document.createElement('button');
    btn.className = 'breadcrumb-item';
    btn.textContent = item.name;
    btn.dataset.id = item.id;
    btn.addEventListener('click', () => navigateToBreadcrumb(index));
    breadcrumbEl.appendChild(btn);
  });
}

/**
 * Handle folder selection
 */
async function handleSelectFolder() {
  try {
    await saveSelectedFolder(currentFolderId, currentFolderName);

    folderNotSelectedEl.classList.add('hidden');
    folderSelectedEl.classList.remove('hidden');
    selectedFolderNameEl.textContent = currentFolderName;

    hideFolderPicker();
    showMessage(`Folder "${currentFolderName}" selected`, 'success');
  } catch (error) {
    showMessage('Error saving folder: ' + error.message, 'error');
  }
}

/**
 * Show a status message
 */
function showMessage(message, type = 'info') {
  statusMessageEl.textContent = message;
  statusMessageEl.className = `status-message ${type}`;
  statusMessageEl.classList.remove('hidden');

  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusMessageEl.classList.add('hidden');
  }, 5000);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Load notification settings from storage
 */
async function loadNotificationSettings() {
  const result = await chrome.storage.sync.get('notificationSettings');
  const settings = result.notificationSettings || {
    enabled: true,
    mode: 'all' // 'all' or 'result'
  };

  notificationsEnabledEl.checked = settings.enabled;
  updateNotificationOptionsVisibility(settings.enabled);

  // Set the correct radio button
  notificationModeRadios.forEach(radio => {
    radio.checked = radio.value === settings.mode;
  });
}

/**
 * Handle notification toggle change
 */
async function handleNotificationToggle() {
  const enabled = notificationsEnabledEl.checked;
  updateNotificationOptionsVisibility(enabled);
  await saveNotificationSettings();
}

/**
 * Handle notification mode change
 */
async function handleNotificationModeChange() {
  await saveNotificationSettings();
}

/**
 * Update visibility of notification options based on enabled state
 */
function updateNotificationOptionsVisibility(enabled) {
  if (enabled) {
    notificationOptionsEl.classList.remove('disabled');
  } else {
    notificationOptionsEl.classList.add('disabled');
  }
}

/**
 * Save notification settings to storage
 */
async function saveNotificationSettings() {
  const enabled = notificationsEnabledEl.checked;
  let mode = 'all';

  notificationModeRadios.forEach(radio => {
    if (radio.checked) {
      mode = radio.value;
    }
  });

  await chrome.storage.sync.set({
    notificationSettings: { enabled, mode }
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
