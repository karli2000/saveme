# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SaveMe is a Chrome Extension (Manifest V3) that saves images to multiple destinations (OneDrive, local folder) via right-click context menu. It embeds source URL (page URL) and image URL into metadata, and uses a simplified filename format: `domain_datetime.extension`.

## Development

### Loading the Extension

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked" → select `src/` folder
4. After code changes, click the refresh icon on the extension card

### Testing Changes

No build step required. After editing files:
- For background.js changes: Reload extension in chrome://extensions/
- For options page changes: Refresh the options page
- For manifest.json changes: Reload extension

### Linting

```bash
npm run lint        # Check for issues
npm run lint:fix    # Auto-fix issues
```

### Azure App Registration (OneDrive)

The extension requires an Azure AD app registration with:
- Redirect URI: `https://{extension-id}.chromiumapp.org/`
- API permissions: `Files.ReadWrite`, `User.Read`, `offline_access`
- Client ID configured in `src/manifest.json` under `oauth2.client_id`

## Architecture

### File Structure

```
src/
├── background.js              # Service worker: context menu, save routing
├── options.html/css/js        # Settings page UI
├── manifest.json              # Extension manifest
├── lib/
│   ├── onedrive-api.js        # OneDrive OAuth & API
│   ├── image-metadata.js      # EXIF/PNG/WebP metadata embedding
│   ├── storage-schema.js      # Multi-destination storage & migration
│   └── providers/
│       ├── base-provider.js       # Abstract provider interface
│       ├── onedrive-provider.js   # OneDrive implementation
│       ├── local-folder-provider.js # Downloads API implementation
│       └── provider-registry.js   # Provider factory
└── icons/
    └── onedrive.svg           # OneDrive logo
```

### Provider Architecture

The extension uses a provider pattern for extensibility:

```javascript
// BaseProvider defines the interface
class BaseProvider {
  static type = 'provider-type';
  static displayName = 'Display Name';
  static requiresAuth = true/false;

  async isReady() { }      // Check if provider is configured
  async saveFile() { }     // Save image to destination
  async listFolders() { }  // Browse folders (if applicable)
  async getDisplayInfo() { } // Get display name/path
}
```

**Available Providers:**
- `OneDriveProvider` - Saves to Microsoft OneDrive via Graph API
- `LocalFolderProvider` - Saves to Downloads folder via chrome.downloads API

### Core Flow

1. **Context Menu Click** → `background.js` receives image URL and page URL
2. **Fetch Image** → Download image, calculate SHA-256 hash
3. **Duplicate Check** → Check hash against stored hashes (respects duplicate mode)
4. **Add Metadata** → Embed both source URL (page) and image URL into image
5. **Generate Filename** → Format: `domain_datetime.extension` (domain from page URL)
6. **Save via Provider** → Route to appropriate provider based on destination type
7. **Store Hash** → Record hash to prevent future duplicates

### Filename Format

`{domain}_{datetime}.{extension}`
- **domain**: From page URL (browser URL), dots replaced with underscores (e.g., `example_com`)
- **datetime**: ISO format with underscores/dashes (e.g., `2026-01-09_14-30-45`)
- **Example**: `reddit_com_2026-01-09_14-30-45.jpg`

### Metadata Embedding

Both the page URL (Source) and image URL (Image) are embedded:
- **JPEG (EXIF)**: ImageDescription = `Source: {pageUrl} | Image: {imageUrl}`
- **PNG**: Separate tEXt chunks for `Source` and `Image`
- **WebP (XMP)**: `dc:source` = pageUrl, `dc:description` = combined

### Storage Schema

```javascript
// chrome.storage.sync
{
  destinations: [
    {
      id: "dest_xxx",
      name: "Work Photos",
      type: "onedrive",
      order: 0,
      folderId: "abc123",
      folderName: "Photos"
    },
    {
      id: "dest_yyy",
      name: "Downloads",
      type: "local",
      order: 1,
      subfolder: "SaveMe"
    }
  ],
  storageVersion: 2,
  duplicateMode: "global",  // "global" | "per-destination" | "disabled"
  notificationSettings: { enabled: true, mode: "all" }
}

// chrome.storage.local
{
  tokens: { accessToken, refreshToken, expiresAt, ... },
  imageHashes: {
    "sha256hash": {
      timestamp: 1234567890,
      url: "https://...",
      destinations: ["dest_xxx", "dest_yyy"]  // For per-destination mode
    }
  },
  pendingSave: { destinationId, imageUrl, timestamp }  // Retry after re-auth
}
```

### Key Implementation Details

- **Token refresh**: Multiple layers ensure reliable token refresh:
  - Service worker initialization checks tokens on every wake-up
  - Tokens expiring within 30 minutes are refreshed immediately
  - Chrome Alarms API runs refresh every 30 minutes (survives worker termination)
  - Browser startup triggers immediate refresh via alarm (not setTimeout)
  - Refreshes if last refresh was >1 hour ago (keeps refresh token active)
  - Includes `redirect_uri` in refresh requests for Microsoft compatibility
- **Duplicate detection**: Three modes - global (block everywhere), per-destination (allow in different destinations), disabled
- **Re-auth handling**: Pending save stored before opening auth page, retried after successful authentication
- **Local folder saving**: Uses data URL conversion since `URL.createObjectURL` unavailable in service workers

### Context Menu Behavior

- **0 destinations**: "SaveMe - Setup Required"
- **1 destination**: "SaveMe to {name}" (flat menu item)
- **2+ destinations**: "SaveMe" parent with submenu of destination names

### Migration

The extension automatically migrates from v1 (single OneDrive folder) to v2 (multi-destination) schema on install/update. Legacy `selectedFolder` is converted to first destination.

## Adding New Providers

1. Create `src/lib/providers/newprovider-provider.js` extending `BaseProvider`
2. Implement required methods: `isReady()`, `saveFile()`, `getDisplayInfo()`
3. Register in `provider-registry.js`
4. Add UI handling in `options.js` for provider-specific configuration
5. Update `options.html` with provider option in modal

## Debugging

### Check Token Status
In service worker console (`chrome://extensions/` → "Service worker"):
```javascript
chrome.storage.local.get('tokens', console.log);
```

### Check Destinations
```javascript
chrome.storage.sync.get('destinations', console.log);
```

### Check Alarms
```javascript
chrome.alarms.getAll(console.log);
```

### Force Token Refresh
```javascript
// In service worker console
proactiveTokenRefresh();
```
