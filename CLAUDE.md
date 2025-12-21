# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SaveMe is a Chrome Extension (Manifest V3) that saves images directly to OneDrive via right-click context menu. It embeds source URL and datetime into image metadata and filenames.

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

### Azure App Registration

The extension requires an Azure AD app registration with:
- Redirect URI: `https://{extension-id}.chromiumapp.org/`
- API permissions: `Files.ReadWrite`, `User.Read`, `offline_access`
- Client ID configured in `src/manifest.json` under `oauth2.client_id`

## Architecture

### Core Flow

1. **background.js** (service worker) - Handles context menu clicks, fetches images, adds metadata, computes hashes for deduplication, uploads to OneDrive
2. **lib/onedrive-api.js** - OAuth 2.0 with PKCE flow, token storage/refresh, Microsoft Graph API calls
3. **lib/image-metadata.js** - Embeds URL/datetime into JPEG (EXIF), PNG (tEXt chunks), WebP (XMP)

### Key Implementation Details

- **Token refresh**: Runs every 3 hours via Chrome alarms API, plus on browser startup
- **Duplicate detection**: SHA-256 hash of image content, stored in chrome.storage.local for 90 days (max 10,000 hashes)
- **Metadata embedding**: Binary manipulation of image formats - EXIF uses big-endian with IFD0+EXIF sub-IFD structure, PNG uses tEXt chunks with CRC-32, WebP converts to VP8X extended format
- **Re-auth handling**: If refresh token fails (`invalid_grant`), error has `requiresReauth=true` flag which triggers options page to open

### Storage

- `chrome.storage.local`: OAuth tokens, image hashes, notification settings
- `chrome.storage.sync`: Selected OneDrive folder (synced across devices)

### Tenant Configuration

Uses `common` tenant (`login.microsoftonline.com/common`) to support both personal and work/school Microsoft accounts. Work accounts may have shorter token lifetimes due to organizational policies.
