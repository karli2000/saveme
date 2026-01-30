/**
 * OneDrive API wrapper for SaveMe Chrome Extension
 * Handles OAuth 2.0 authentication and file operations via Microsoft Graph API
 */

const TENANT = 'common'; // Supports both personal and work/school accounts
const AUTH_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
const GRAPH_URL = 'https://graph.microsoft.com/v1.0';

// Scopes required for the extension
const SCOPES = [
  'Files.ReadWrite',
  'User.Read',
  'offline_access'
].join(' ');

/**
 * Get the OAuth2 client ID from manifest
 */
async function getClientId() {
  const manifest = chrome.runtime.getManifest();
  return manifest.oauth2?.client_id;
}

/**
 * Get the redirect URL for OAuth
 */
function getRedirectUrl() {
  return chrome.identity.getRedirectURL();
}

/**
 * Generate a random string for PKCE and state
 */
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

/**
 * Generate PKCE code challenge from verifier
 */
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Initiate OAuth flow and get authorization code
 */
export async function authenticate() {
  const clientId = await getClientId();
  if (!clientId || clientId === 'YOUR_AZURE_CLIENT_ID') {
    throw new Error('Please configure your Azure Client ID in manifest.json');
  }

  const redirectUrl = getRedirectUrl();
  const state = generateRandomString(32);
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store code verifier for token exchange
  await chrome.storage.local.set({ codeVerifier, state });

  const authParams = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUrl,
    scope: SCOPES,
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    response_mode: 'query'
  });

  const authUrl = `${AUTH_URL}?${authParams.toString()}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true
      },
      async (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!responseUrl) {
          reject(new Error('No response URL received'));
          return;
        }

        try {
          const url = new URL(responseUrl);
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          const errorDescription = url.searchParams.get('error_description');

          if (error) {
            reject(new Error(errorDescription || error));
            return;
          }

          // Verify state
          const stored = await chrome.storage.local.get(['state', 'codeVerifier']);
          if (returnedState !== stored.state) {
            reject(new Error('State mismatch - possible CSRF attack'));
            return;
          }

          // Exchange code for tokens
          const tokens = await exchangeCodeForTokens(code, stored.codeVerifier);
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * Exchange authorization code for access and refresh tokens
 */
async function exchangeCodeForTokens(code, codeVerifier) {
  const clientId = await getClientId();
  const redirectUrl = getRedirectUrl();

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUrl,
      code_verifier: codeVerifier
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || 'Failed to exchange code for tokens');
  }

  const tokens = await response.json();

  console.log('SaveMe: Initial auth successful', {
    hasAccessToken: !!tokens.access_token,
    hasRefreshToken: !!tokens.refresh_token,
    refreshTokenLength: tokens.refresh_token?.length,
    expiresIn: tokens.expires_in
  });

  // Verify we got a refresh token
  if (!tokens.refresh_token) {
    console.error('SaveMe: WARNING - No refresh token received from initial auth!');
  }

  // Store tokens
  await storeTokens(tokens, false);

  return tokens;
}

/**
 * Store tokens securely in chrome.storage.local
 */
async function storeTokens(tokens, isRefresh = false) {
  // Get existing tokens to preserve refresh token if needed
  const existing = await getTokens();

  const tokenData = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || existing?.refreshToken,
    expiresAt: Date.now() + (tokens.expires_in * 1000),
    lastRefresh: Date.now(),
    refreshCount: (existing?.refreshCount || 0) + (isRefresh ? 1 : 0),
    originalAuth: existing?.originalAuth || Date.now()
  };

  // Verify we have a refresh token before saving
  if (!tokenData.refreshToken) {
    console.error('SaveMe: WARNING - No refresh token to store!');
  }

  await chrome.storage.local.set({ tokens: tokenData });
  console.log('SaveMe: Tokens stored', {
    hasRefreshToken: !!tokenData.refreshToken,
    refreshTokenLength: tokenData.refreshToken?.length,
    expiresIn: tokens.expires_in,
    refreshCount: tokenData.refreshCount,
    isRefresh
  });
}

/**
 * Get stored tokens
 */
export async function getTokens() {
  const result = await chrome.storage.local.get('tokens');
  return result.tokens;
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshAccessToken() {
  const tokens = await getTokens();
  if (!tokens?.refreshToken) {
    console.error('SaveMe: No refresh token found in storage');
    throw new Error('No refresh token available');
  }

  const now = Date.now();
  const hoursSinceLastRefresh = tokens.lastRefresh
    ? Math.round((now - tokens.lastRefresh) / 1000 / 60 / 60 * 10) / 10
    : 'unknown';

  console.log('SaveMe: Attempting token refresh...', {
    refreshTokenLength: tokens.refreshToken?.length,
    lastRefresh: tokens.lastRefresh ? new Date(tokens.lastRefresh).toISOString() : 'never',
    hoursSinceLastRefresh,
    refreshCount: tokens.refreshCount || 0,
    originalAuth: tokens.originalAuth ? new Date(tokens.originalAuth).toISOString() : 'unknown'
  });

  const clientId = await getClientId();
  const redirectUrl = getRedirectUrl();

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      redirect_uri: redirectUrl,
      scope: SCOPES
    })
  });

  if (!response.ok) {
    let error;
    try {
      error = await response.json();
    } catch {
      error = { error: 'unknown', error_description: `HTTP ${response.status}: ${response.statusText}` };
    }
    console.error(`SaveMe: Token refresh failed - ${error.error}: ${error.error_description || 'Unknown error'}`, {
      status: response.status,
      hoursSinceLastRefresh,
      refreshCount: tokens.refreshCount || 0
    });
    // If refresh token is invalid, clear tokens and signal re-auth needed
    if (error.error === 'invalid_grant' || error.error === 'invalid_request') {
      await clearTokens();
      const authError = new Error('Session expired. Please reconnect to OneDrive.');
      authError.requiresReauth = true;
      throw authError;
    }
    throw new Error(error.error_description || 'Failed to refresh token');
  }

  const newTokens = await response.json();

  console.log('SaveMe: Token refresh successful', {
    gotNewRefreshToken: !!newTokens.refresh_token,
    newRefreshTokenLength: newTokens.refresh_token?.length,
    oldRefreshTokenLength: tokens.refreshToken?.length,
    refreshTokenChanged: newTokens.refresh_token && newTokens.refresh_token !== tokens.refreshToken,
    accessTokenExpiresIn: newTokens.expires_in
  });

  // IMPORTANT: Microsoft may return a new refresh token - we MUST use it
  if (!newTokens.refresh_token) {
    console.warn('SaveMe: No new refresh token received, preserving existing (this may cause issues)');
    newTokens.refresh_token = tokens.refreshToken;
  } else if (newTokens.refresh_token !== tokens.refreshToken) {
    console.log('SaveMe: Received new refresh token from Microsoft - updating stored token');
  }

  await storeTokens(newTokens, true);

  return newTokens.access_token;
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken() {
  const tokens = await getTokens();

  if (!tokens) {
    throw new Error('Not authenticated. Please connect to OneDrive in settings.');
  }

  const now = Date.now();
  const expiresIn = Math.round((tokens.expiresAt - now) / 1000);

  // Check if token is expired or will expire in the next minute
  if (tokens.expiresAt < now + 60000) {
    console.log('SaveMe: Access token expired or expiring soon, refreshing...', {
      expiredSecondsAgo: -expiresIn
    });
    return await refreshAccessToken();
  }

  console.log('SaveMe: Using existing access token', {
    expiresInSeconds: expiresIn,
    expiresInMinutes: Math.round(expiresIn / 60)
  });

  return tokens.accessToken;
}

/**
 * Clear all stored tokens (logout)
 */
export async function clearTokens() {
  await chrome.storage.local.remove(['tokens', 'codeVerifier', 'state']);
}

/**
 * Check if user is authenticated (has valid tokens)
 */
export async function isAuthenticated() {
  const tokens = await getTokens();
  // Must have both access token AND refresh token
  return !!tokens?.accessToken && !!tokens?.refreshToken;
}

/**
 * Get current user info
 */
export async function getUserInfo() {
  const accessToken = await getValidAccessToken();

  const response = await fetch(`${GRAPH_URL}/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return await response.json();
}

/**
 * List folders in a OneDrive path
 * @param {string} folderId - Folder ID or 'root' for root folder
 */
export async function listFolders(folderId = 'root') {
  const accessToken = await getValidAccessToken();

  const path = folderId === 'root'
    ? '/me/drive/root/children'
    : `/me/drive/items/${folderId}/children`;

  const response = await fetch(`${GRAPH_URL}${path}?$filter=folder ne null&$select=id,name,folder`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to list folders');
  }

  const data = await response.json();
  return data.value;
}

/**
 * Get folder info by ID
 */
export async function getFolderInfo(folderId) {
  const accessToken = await getValidAccessToken();

  const path = folderId === 'root'
    ? '/me/drive/root'
    : `/me/drive/items/${folderId}`;

  const response = await fetch(`${GRAPH_URL}${path}?$select=id,name,parentReference`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get folder info');
  }

  return await response.json();
}

/**
 * Upload a file to OneDrive
 * @param {Blob} blob - File content as Blob
 * @param {string} filename - Name for the file
 * @param {string} folderId - Target folder ID
 */
export async function uploadFile(blob, filename, folderId) {
  const accessToken = await getValidAccessToken();

  // Sanitize filename
  const safeName = filename.replace(/[<>:"/\\|?*]/g, '_');

  // Use simple upload for files under 4MB
  const path = folderId === 'root'
    ? `/me/drive/root:/${safeName}:/content`
    : `/me/drive/items/${folderId}:/${safeName}:/content`;

  const response = await fetch(`${GRAPH_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': blob.type || 'application/octet-stream'
    },
    body: blob
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || 'Failed to upload file');
  }

  return await response.json();
}

/**
 * Save selected folder to sync storage
 */
export async function saveSelectedFolder(folderId, folderName) {
  await chrome.storage.sync.set({
    selectedFolder: {
      id: folderId,
      name: folderName
    }
  });
}

/**
 * Get selected folder from sync storage
 */
export async function getSelectedFolder() {
  const result = await chrome.storage.sync.get('selectedFolder');
  return result.selectedFolder;
}

/**
 * Diagnostic function to check token status
 * Call from console: (await import('./lib/onedrive-api.js')).diagnoseTokens()
 */
export async function diagnoseTokens() {
  const tokens = await getTokens();
  const now = Date.now();

  if (!tokens) {
    return { status: 'NOT_AUTHENTICATED', message: 'No tokens found' };
  }

  const diagnosis = {
    status: 'OK',
    hasAccessToken: !!tokens.accessToken,
    hasRefreshToken: !!tokens.refreshToken,
    refreshTokenLength: tokens.refreshToken?.length || 0,
    accessTokenExpired: tokens.expiresAt < now,
    accessTokenExpiresIn: Math.round((tokens.expiresAt - now) / 1000 / 60) + ' minutes',
    lastRefresh: tokens.lastRefresh ? new Date(tokens.lastRefresh).toISOString() : 'never',
    timeSinceLastRefresh: tokens.lastRefresh
      ? Math.round((now - tokens.lastRefresh) / 1000 / 60 / 60) + ' hours ago'
      : 'unknown',
    originalAuth: tokens.originalAuth ? new Date(tokens.originalAuth).toISOString() : 'unknown',
    refreshCount: tokens.refreshCount || 0
  };

  if (!tokens.refreshToken) {
    diagnosis.status = 'ERROR';
    diagnosis.message = 'No refresh token - will expire soon!';
  } else if (tokens.refreshToken.length < 100) {
    diagnosis.status = 'WARNING';
    diagnosis.message = 'Refresh token seems too short';
  }

  console.log('SaveMe Token Diagnosis:', diagnosis);
  return diagnosis;
}
