/**
 * SaveMe Options Page
 * Handles OneDrive authentication, destination management, and settings
 */

import {
  authenticate,
  isAuthenticated,
  getUserInfo,
  clearTokens,
  listFolders as onedriveListFolders
} from './lib/onedrive-api.js';

import {
  getDestinations,
  getDestinationsSorted,
  addDestination,
  updateDestination,
  removeDestination,
  reorderDestinations,
  getMaxDestinations
} from './lib/storage-schema.js';

// ==================== DOM Elements ====================

// Connection section
const notConnectedEl = document.getElementById('not-connected');
const connectedEl = document.getElementById('connected');
const userNameEl = document.getElementById('user-name');
const userEmailEl = document.getElementById('user-email');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');

// Destinations section
const destinationsListEl = document.getElementById('destinations-list');
const noDestinationsEl = document.getElementById('no-destinations');
const addDestinationBtn = document.getElementById('add-destination-btn');
const destinationCountEl = document.getElementById('destination-count');

// Modal elements
const modalEl = document.getElementById('destination-modal');
const modalTitleEl = document.getElementById('modal-title');
const modalErrorEl = document.getElementById('modal-error');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalSaveBtn = document.getElementById('modal-save-btn');
const providerOptions = document.querySelectorAll('.provider-option');
const destNameInput = document.getElementById('dest-name');
const destSubfolderInput = document.getElementById('dest-subfolder');

// OneDrive folder picker in modal
const onedriveAuthRequired = document.getElementById('onedrive-auth-required');
const destFolderDisplay = document.getElementById('dest-folder-display');
const destFolderNameEl = document.getElementById('dest-folder-name');
const destChangeFolderBtn = document.getElementById('dest-change-folder-btn');
const destFolderPicker = document.getElementById('dest-folder-picker');
const destBreadcrumbEl = document.getElementById('dest-breadcrumb');
const destFolderListEl = document.getElementById('dest-folder-list');
const destSelectFolderBtn = document.getElementById('dest-select-folder-btn');
const destCancelFolderBtn = document.getElementById('dest-cancel-folder-btn');

// Notification settings
const notificationsEnabledEl = document.getElementById('notifications-enabled');
const notificationOptionsEl = document.getElementById('notification-options');
const notificationModeRadios = document.querySelectorAll('input[name="notification-mode"]');

// Duplicate detection settings
const duplicateModeRadios = document.querySelectorAll('input[name="duplicate-mode"]');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const hashCountHintEl = document.getElementById('hash-count-hint');

// Confirm modal elements
const confirmModalEl = document.getElementById('confirm-modal');
const confirmModalCloseBtn = document.getElementById('confirm-modal-close-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const confirmClearBtn = document.getElementById('confirm-clear-btn');

// Status message
const statusMessageEl = document.getElementById('status-message');

// ==================== State ====================

let isOneDriveConnected = false;
let editingDestinationId = null;
let selectedProviderType = null;
let selectedFolderId = null;
let selectedFolderName = null;
let currentBrowseFolderId = 'root';
let currentBrowseFolderName = 'OneDrive';
let breadcrumbPath = [{ id: 'root', name: 'OneDrive' }];
let draggedItem = null;

// ==================== Initialization ====================

async function init() {
  try {
    // Check OneDrive connection
    isOneDriveConnected = await isAuthenticated();
    if (isOneDriveConnected) {
      await showConnectedState();
    } else {
      showDisconnectedState();
    }

    // Load destinations
    await loadDestinations();

    // Load notification settings
    await loadNotificationSettings();

    // Load duplicate detection settings
    await loadDuplicateSettings();

    // Load hash count
    await loadHashCount();

    // Set up event listeners
    setupEventListeners();

    // Check for pending save
    await retryPendingSaveIfExists();
  } catch (error) {
    console.error('Init error:', error);
    showMessage('Error loading settings: ' + error.message, 'error');
  }
}

function setupEventListeners() {
  // Connection
  connectBtn.addEventListener('click', handleConnect);
  disconnectBtn.addEventListener('click', handleDisconnect);

  // Destinations
  addDestinationBtn.addEventListener('click', () => openModal());
  initDragAndDrop();

  // Modal
  modalCloseBtn.addEventListener('click', closeModal);
  modalCancelBtn.addEventListener('click', closeModal);
  modalSaveBtn.addEventListener('click', handleSaveDestination);
  providerOptions.forEach(btn => {
    btn.addEventListener('click', () => selectProvider(btn.dataset.type));
  });

  // OneDrive folder picker in modal
  destChangeFolderBtn.addEventListener('click', showFolderPicker);
  destSelectFolderBtn.addEventListener('click', handleSelectFolder);
  destCancelFolderBtn.addEventListener('click', hideFolderPicker);

  // Notification settings
  notificationsEnabledEl.addEventListener('change', handleNotificationToggle);
  notificationModeRadios.forEach(radio => {
    radio.addEventListener('change', handleNotificationModeChange);
  });

  // Duplicate detection settings
  duplicateModeRadios.forEach(radio => {
    radio.addEventListener('change', handleDuplicateModeChange);
  });

  // Clear history button
  clearHistoryBtn.addEventListener('click', openConfirmModal);
  confirmModalCloseBtn.addEventListener('click', closeConfirmModal);
  confirmCancelBtn.addEventListener('click', closeConfirmModal);
  confirmClearBtn.addEventListener('click', handleClearHistory);

  // Close confirm modal on backdrop click
  confirmModalEl.addEventListener('click', (e) => {
    if (e.target === confirmModalEl) closeConfirmModal();
  });

  // Close modal on backdrop click
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.classList.contains('hidden')) {
      closeModal();
    }
  });
}

// ==================== OneDrive Connection ====================

async function showConnectedState() {
  try {
    const userInfo = await getUserInfo();
    userNameEl.textContent = userInfo.displayName || 'Unknown User';
    userEmailEl.textContent = userInfo.mail || userInfo.userPrincipalName || '';
    notConnectedEl.classList.add('hidden');
    connectedEl.classList.remove('hidden');
    isOneDriveConnected = true;
  } catch (error) {
    showDisconnectedState();
    showMessage('Session expired. Please reconnect to OneDrive.', 'error');
  }
}

function showDisconnectedState() {
  notConnectedEl.classList.remove('hidden');
  connectedEl.classList.add('hidden');
  isOneDriveConnected = false;
}

async function handleConnect() {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';

  try {
    await authenticate();
    await showConnectedState();
    showMessage('Successfully connected to OneDrive!', 'success');
    await retryPendingSaveIfExists();
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

async function handleDisconnect() {
  try {
    await clearTokens();
    showDisconnectedState();
    showMessage('Disconnected from OneDrive', 'info');
  } catch (error) {
    showMessage('Error disconnecting: ' + error.message, 'error');
  }
}

// ==================== Destinations ====================

async function loadDestinations() {
  const destinations = await getDestinationsSorted();
  renderDestinations(destinations);
  updateDestinationCount(destinations.length);
}

function renderDestinations(destinations) {
  destinationsListEl.innerHTML = '';

  if (destinations.length === 0) {
    noDestinationsEl.classList.remove('hidden');
    return;
  }

  noDestinationsEl.classList.add('hidden');

  destinations.forEach(dest => {
    const card = createDestinationCard(dest);
    destinationsListEl.appendChild(card);
  });
}

function createDestinationCard(dest) {
  const card = document.createElement('div');
  card.className = 'destination-card';
  card.dataset.id = dest.id;
  card.draggable = true;

  const path = dest.type === 'onedrive'
    ? dest.folderName || 'OneDrive'
    : `Downloads/${dest.subfolder || 'SaveMe'}`;

  card.innerHTML = `
    <div class="drag-handle">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="destination-icon ${dest.type}">
      ${dest.type === 'onedrive'
    ? '<img src="icons/onedrive.svg" width="20" height="20" alt="OneDrive">'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>'
}
    </div>
    <div class="destination-info">
      <span class="destination-name">${escapeHtml(dest.name)}</span>
      <span class="destination-path">${escapeHtml(path)}</span>
    </div>
    <div class="destination-card-actions">
      <button class="btn-icon edit-btn" title="Edit">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
      </button>
      <button class="btn-icon delete-btn" title="Delete">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
    </div>
  `;

  // Event listeners
  card.querySelector('.edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openModal(dest);
  });

  card.querySelector('.delete-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteDestination(dest.id, dest.name);
  });

  return card;
}

function updateDestinationCount(count) {
  const max = getMaxDestinations();
  if (count >= max) {
    addDestinationBtn.disabled = true;
    destinationCountEl.textContent = `${count}/${max} (limit reached)`;
  } else {
    addDestinationBtn.disabled = false;
    destinationCountEl.textContent = count > 0 ? `${count}/${max}` : '';
  }
}

async function handleDeleteDestination(id, name) {
  if (!confirm(`Delete destination "${name}"?`)) return;

  try {
    await removeDestination(id);
    await loadDestinations();
    showMessage(`Deleted "${name}"`, 'info');
  } catch (error) {
    showMessage('Error deleting: ' + error.message, 'error');
  }
}

// ==================== Drag & Drop ====================

function initDragAndDrop() {
  destinationsListEl.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.destination-card');
    if (!card) return;
    draggedItem = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  destinationsListEl.addEventListener('dragend', async (e) => {
    const card = e.target.closest('.destination-card');
    if (!card) return;
    card.classList.remove('dragging');

    // Get new order and save
    const cards = destinationsListEl.querySelectorAll('.destination-card');
    const orderedIds = Array.from(cards).map(c => c.dataset.id);

    try {
      await reorderDestinations(orderedIds);
    } catch (error) {
      console.error('Reorder error:', error);
      await loadDestinations(); // Reload on error
    }

    draggedItem = null;
  });

  destinationsListEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    const card = e.target.closest('.destination-card');
    if (!card || card === draggedItem) return;

    const rect = card.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (e.clientY < midY) {
      destinationsListEl.insertBefore(draggedItem, card);
    } else {
      destinationsListEl.insertBefore(draggedItem, card.nextSibling);
    }
  });

  destinationsListEl.addEventListener('dragenter', (e) => {
    const card = e.target.closest('.destination-card');
    if (card && card !== draggedItem) {
      card.classList.add('drag-over');
    }
  });

  destinationsListEl.addEventListener('dragleave', (e) => {
    const card = e.target.closest('.destination-card');
    if (card) {
      card.classList.remove('drag-over');
    }
  });

  destinationsListEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const cards = destinationsListEl.querySelectorAll('.destination-card');
    cards.forEach(c => c.classList.remove('drag-over'));
  });
}

// ==================== Modal ====================

function openModal(destination = null) {
  editingDestinationId = destination?.id || null;
  modalTitleEl.textContent = destination ? 'Edit Destination' : 'Add Destination';

  // Clear any previous error
  hideModalError();

  // Reset form
  destNameInput.value = destination?.name || '';
  destSubfolderInput.value = destination?.subfolder || 'SaveMe';
  selectedFolderId = destination?.folderId || null;
  selectedFolderName = destination?.folderName || null;

  // Reset provider selection
  providerOptions.forEach(btn => btn.classList.remove('selected'));
  document.querySelectorAll('.provider-config').forEach(el => el.classList.remove('active'));

  // Set provider type
  const type = destination?.type || null;
  if (type) {
    selectProvider(type);
  }

  // Update folder display
  updateFolderDisplay();

  // Show modal
  modalEl.classList.remove('hidden');
  destNameInput.focus();
}

function closeModal() {
  modalEl.classList.add('hidden');
  editingDestinationId = null;
  selectedProviderType = null;
  selectedFolderId = null;
  selectedFolderName = null;
  hideFolderPicker();
}

function selectProvider(type) {
  selectedProviderType = type;

  // Update button states
  providerOptions.forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === type);
  });

  // Show relevant config
  document.querySelectorAll('.provider-config').forEach(el => {
    el.classList.toggle('active', el.dataset.provider === type);
  });

  // Update OneDrive auth state
  if (type === 'onedrive') {
    updateOneDriveAuthState();
  }
}

function updateOneDriveAuthState() {
  if (isOneDriveConnected) {
    onedriveAuthRequired.classList.add('hidden');
    destFolderDisplay.classList.remove('hidden');
    updateFolderDisplay();
  } else {
    onedriveAuthRequired.classList.remove('hidden');
    destFolderDisplay.classList.add('hidden');
  }
}

function updateFolderDisplay() {
  if (selectedFolderId && selectedFolderName) {
    destFolderNameEl.textContent = selectedFolderName;
  } else {
    destFolderNameEl.textContent = 'Select a folder';
  }
}

async function handleSaveDestination() {
  // Clear previous error
  hideModalError();

  // Validate
  const name = destNameInput.value.trim();
  if (!name) {
    showModalError('Please enter a destination name');
    destNameInput.focus();
    return;
  }

  if (!selectedProviderType) {
    showModalError('Please select a destination type');
    return;
  }

  // Build destination config
  const config = {
    name,
    type: selectedProviderType
  };

  if (selectedProviderType === 'onedrive') {
    if (!isOneDriveConnected) {
      showModalError('Please connect to OneDrive first');
      return;
    }
    if (!selectedFolderId) {
      showModalError('Please select a OneDrive folder');
      return;
    }
    config.folderId = selectedFolderId;
    config.folderName = selectedFolderName;
  } else if (selectedProviderType === 'local') {
    config.subfolder = destSubfolderInput.value.trim() || 'SaveMe';
  }

  try {
    if (editingDestinationId) {
      await updateDestination(editingDestinationId, config);
      showMessage(`Updated "${name}"`, 'success');
    } else {
      await addDestination(config);
      showMessage(`Added "${name}"`, 'success');
    }

    closeModal();
    await loadDestinations();
  } catch (error) {
    showModalError('Error saving: ' + error.message);
  }
}

function showModalError(message) {
  modalErrorEl.textContent = message;
  modalErrorEl.classList.remove('hidden');
}

function hideModalError() {
  modalErrorEl.textContent = '';
  modalErrorEl.classList.add('hidden');
}

// ==================== Folder Picker (Modal) ====================

async function showFolderPicker() {
  destFolderPicker.classList.remove('hidden');
  destFolderDisplay.classList.add('hidden');
  currentBrowseFolderId = 'root';
  currentBrowseFolderName = 'OneDrive';
  breadcrumbPath = [{ id: 'root', name: 'OneDrive' }];
  updateBreadcrumb();
  await loadFolders('root');
}

function hideFolderPicker() {
  destFolderPicker.classList.add('hidden');
  if (isOneDriveConnected) {
    destFolderDisplay.classList.remove('hidden');
  }
}

async function loadFolders(folderId) {
  destFolderListEl.innerHTML = '<div class="loading">Loading folders...</div>';

  try {
    const folders = await onedriveListFolders(folderId);

    if (folders.length === 0) {
      destFolderListEl.innerHTML = '<div class="empty-folder">No subfolders in this location</div>';
    } else {
      destFolderListEl.innerHTML = '';
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
        destFolderListEl.appendChild(item);
      });
    }
  } catch (error) {
    destFolderListEl.innerHTML = `<div class="empty-folder">Error loading folders: ${escapeHtml(error.message)}</div>`;
  }
}

async function navigateToFolder(folderId, folderName) {
  currentBrowseFolderId = folderId;
  currentBrowseFolderName = folderName;
  breadcrumbPath.push({ id: folderId, name: folderName });
  updateBreadcrumb();
  await loadFolders(folderId);
}

async function navigateToBreadcrumb(index) {
  const item = breadcrumbPath[index];
  currentBrowseFolderId = item.id;
  currentBrowseFolderName = item.name;
  breadcrumbPath = breadcrumbPath.slice(0, index + 1);
  updateBreadcrumb();
  await loadFolders(currentBrowseFolderId);
}

function updateBreadcrumb() {
  destBreadcrumbEl.innerHTML = '';
  breadcrumbPath.forEach((item, index) => {
    const btn = document.createElement('button');
    btn.className = 'breadcrumb-item';
    btn.textContent = item.name;
    btn.addEventListener('click', () => navigateToBreadcrumb(index));
    destBreadcrumbEl.appendChild(btn);
  });
}

function handleSelectFolder() {
  selectedFolderId = currentBrowseFolderId;
  selectedFolderName = currentBrowseFolderName;
  updateFolderDisplay();
  hideFolderPicker();
}

// ==================== Notification Settings ====================

async function loadNotificationSettings() {
  const result = await chrome.storage.sync.get('notificationSettings');
  const settings = result.notificationSettings || { enabled: true, mode: 'all' };

  notificationsEnabledEl.checked = settings.enabled;
  updateNotificationOptionsVisibility(settings.enabled);

  notificationModeRadios.forEach(radio => {
    radio.checked = radio.value === settings.mode;
  });
}

async function handleNotificationToggle() {
  const enabled = notificationsEnabledEl.checked;
  updateNotificationOptionsVisibility(enabled);
  await saveNotificationSettings();
}

async function handleNotificationModeChange() {
  await saveNotificationSettings();
}

function updateNotificationOptionsVisibility(enabled) {
  notificationOptionsEl.classList.toggle('disabled', !enabled);
}

async function saveNotificationSettings() {
  const enabled = notificationsEnabledEl.checked;
  let mode = 'all';
  notificationModeRadios.forEach(radio => {
    if (radio.checked) mode = radio.value;
  });
  await chrome.storage.sync.set({ notificationSettings: { enabled, mode } });
}

// ==================== Duplicate Detection Settings ====================

async function loadDuplicateSettings() {
  const result = await chrome.storage.sync.get('duplicateMode');
  const mode = result.duplicateMode || 'global';

  duplicateModeRadios.forEach(radio => {
    radio.checked = radio.value === mode;
  });
}

async function handleDuplicateModeChange() {
  let mode = 'global';
  duplicateModeRadios.forEach(radio => {
    if (radio.checked) mode = radio.value;
  });
  await chrome.storage.sync.set({ duplicateMode: mode });
}

async function loadHashCount() {
  try {
    const result = await chrome.storage.local.get('imageHashes');
    const hashes = result.imageHashes || {};
    const count = Object.keys(hashes).length;

    if (count === 0) {
      hashCountHintEl.textContent = 'No images tracked';
      clearHistoryBtn.disabled = true;
    } else {
      hashCountHintEl.textContent = `${count} image${count === 1 ? '' : 's'} tracked`;
      clearHistoryBtn.disabled = false;
    }
  } catch (error) {
    hashCountHintEl.textContent = 'Unable to load count';
  }
}

function openConfirmModal() {
  confirmModalEl.classList.remove('hidden');
}

function closeConfirmModal() {
  confirmModalEl.classList.add('hidden');
}

async function handleClearHistory() {
  try {
    await chrome.storage.local.set({ imageHashes: {} });
    closeConfirmModal();
    await loadHashCount();
    showMessage('Duplicate history cleared', 'success');
  } catch (error) {
    showMessage('Error clearing history: ' + error.message, 'error');
  }
}

// ==================== Pending Save Retry ====================

async function retryPendingSaveIfExists() {
  try {
    const result = await chrome.storage.local.get('pendingSave');
    if (!result.pendingSave) return;

    const destinations = await getDestinations();
    if (destinations.length === 0) {
      showMessage('Please add a destination to save the pending image', 'info');
      return;
    }

    showMessage('Retrying pending image save...', 'info');

    chrome.runtime.sendMessage({ type: 'retryPendingSave' }, (response) => {
      if (response?.success) {
        if (response.reason === 'duplicate') {
          showMessage('Pending image was already saved', 'info');
        } else {
          showMessage('Pending image saved successfully!', 'success');
        }
      } else if (response?.reason === 'expired') {
        showMessage('Pending save expired (over 10 minutes old)', 'info');
      } else if (response?.reason === 'no_destination') {
        showMessage('Please add a destination first', 'error');
      } else if (response?.message) {
        showMessage('Failed to save: ' + response.message, 'error');
      }
    });
  } catch (error) {
    console.error('Error retrying pending save:', error);
  }
}

// ==================== Utilities ====================

function showMessage(message, type = 'info') {
  statusMessageEl.textContent = message;
  statusMessageEl.className = `status-message ${type}`;
  statusMessageEl.classList.remove('hidden');

  setTimeout(() => {
    statusMessageEl.classList.add('hidden');
  }, 5000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== Initialize ====================

document.addEventListener('DOMContentLoaded', init);
