/**
 * Storage Schema for Multi-Destination Feature
 *
 * chrome.storage.sync.destinations - Array of destination configurations
 * chrome.storage.sync.storageVersion - Schema version for migration
 * chrome.storage.local.tokens - OneDrive OAuth tokens (unchanged)
 * chrome.storage.local.imageHashes - Duplicate detection (unchanged)
 */

const STORAGE_VERSION = 2;
const MAX_DESTINATIONS = 10;

/**
 * Generate a unique destination ID
 * @returns {string}
 */
function generateId() {
  return 'dest_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Get all destinations
 * @returns {Promise<Array>}
 */
export async function getDestinations() {
  const result = await chrome.storage.sync.get('destinations');
  return result.destinations || [];
}

/**
 * Save all destinations
 * @param {Array} destinations
 */
export async function saveDestinations(destinations) {
  if (destinations.length > MAX_DESTINATIONS) {
    throw new Error(`Maximum ${MAX_DESTINATIONS} destinations allowed`);
  }
  await chrome.storage.sync.set({ destinations });
}

/**
 * Add a new destination
 * @param {Object} destination - Destination configuration
 * @returns {Promise<Object>} - The added destination with ID
 */
export async function addDestination(destination) {
  const destinations = await getDestinations();
  if (destinations.length >= MAX_DESTINATIONS) {
    throw new Error(`Maximum ${MAX_DESTINATIONS} destinations allowed`);
  }

  destination.id = destination.id || generateId();
  destination.order = destinations.length;
  destination.createdAt = Date.now();

  destinations.push(destination);
  await saveDestinations(destinations);
  return destination;
}

/**
 * Update an existing destination
 * @param {string} id - Destination ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - The updated destination
 */
export async function updateDestination(id, updates) {
  const destinations = await getDestinations();
  const index = destinations.findIndex(d => d.id === id);
  if (index === -1) throw new Error('Destination not found');

  destinations[index] = { ...destinations[index], ...updates };
  await saveDestinations(destinations);
  return destinations[index];
}

/**
 * Remove a destination
 * @param {string} id - Destination ID
 */
export async function removeDestination(id) {
  const destinations = await getDestinations();
  const filtered = destinations.filter(d => d.id !== id);
  // Reorder remaining
  filtered.forEach((d, i) => d.order = i);
  await saveDestinations(filtered);
}

/**
 * Reorder destinations
 * @param {Array<string>} orderedIds - Array of destination IDs in new order
 */
export async function reorderDestinations(orderedIds) {
  const destinations = await getDestinations();
  const reordered = orderedIds.map((id, index) => {
    const dest = destinations.find(d => d.id === id);
    if (dest) dest.order = index;
    return dest;
  }).filter(Boolean);
  await saveDestinations(reordered);
}

/**
 * Get a destination by ID
 * @param {string} id - Destination ID
 * @returns {Promise<Object|undefined>}
 */
export async function getDestinationById(id) {
  const destinations = await getDestinations();
  return destinations.find(d => d.id === id);
}

/**
 * Get destinations sorted by order
 * @returns {Promise<Array>}
 */
export async function getDestinationsSorted() {
  const destinations = await getDestinations();
  return [...destinations].sort((a, b) => a.order - b.order);
}

/**
 * Get the current storage version
 * @returns {Promise<number>}
 */
export async function getStorageVersion() {
  const result = await chrome.storage.sync.get('storageVersion');
  return result.storageVersion || 1;
}

/**
 * Get maximum number of destinations allowed
 * @returns {number}
 */
export function getMaxDestinations() {
  return MAX_DESTINATIONS;
}

/**
 * Migrate from legacy single-folder schema to multi-destination
 * @returns {Promise<{migrated: boolean, reason?: string, destination?: Object}>}
 */
export async function migrateFromLegacy() {
  const result = await chrome.storage.sync.get(['selectedFolder', 'storageVersion', 'destinations']);

  // Already migrated
  if (result.storageVersion >= STORAGE_VERSION) {
    return { migrated: false, reason: 'Already at current version' };
  }

  // Already has destinations (partial migration?)
  if (result.destinations && result.destinations.length > 0) {
    await chrome.storage.sync.set({ storageVersion: STORAGE_VERSION });
    return { migrated: false, reason: 'Destinations already exist' };
  }

  // No legacy data to migrate
  if (!result.selectedFolder) {
    await chrome.storage.sync.set({ storageVersion: STORAGE_VERSION });
    return { migrated: false, reason: 'No legacy data found' };
  }

  // Migrate legacy single folder to destinations array
  const legacyFolder = result.selectedFolder;
  const destination = {
    id: generateId(),
    name: 'OneDrive', // Default name for migrated destination
    type: 'onedrive',
    order: 0,
    createdAt: Date.now(),
    folderId: legacyFolder.id,
    folderName: legacyFolder.name
  };

  await chrome.storage.sync.set({
    destinations: [destination],
    storageVersion: STORAGE_VERSION
  });

  console.log('SaveMe: Migrated legacy folder to destinations', destination);

  return {
    migrated: true,
    destination: destination
  };
}

/**
 * Check if migration is needed
 * @returns {Promise<boolean>}
 */
export async function needsMigration() {
  const version = await getStorageVersion();
  return version < STORAGE_VERSION;
}
