# Privacy Policy for SaveMe Chrome Extension

**Last updated:** December 2025

## Overview

SaveMe is a browser extension that allows users to save images from websites directly to their Microsoft OneDrive account. This privacy policy explains what data the extension collects, how it's used, and how it's protected.

## Data Collection

### Data We Store Locally

The following data is stored locally in your browser using Chrome's secure storage APIs:

1. **OAuth Tokens** - Access and refresh tokens from Microsoft to authenticate with OneDrive. These are stored in `chrome.storage.local` and never transmitted except to Microsoft's servers.

2. **Image Hashes** - SHA-256 hashes of saved images (for duplicate detection). Only the hash is stored, not the image itself. Hashes are automatically deleted after 90 days.

3. **User Preferences** - Your settings (selected OneDrive folder, notification preferences). Stored in `chrome.storage.sync`.

### Data We Do NOT Collect

- We do NOT collect personal information
- We do NOT track your browsing history
- We do NOT store the images you save (only hashes for duplicate detection)
- We do NOT use analytics or tracking services
- We do NOT sell or share any data with third parties

## Data Transmission

The extension only communicates with:

1. **Microsoft Identity Platform** (`login.microsoftonline.com`) - For OAuth authentication
2. **Microsoft Graph API** (`graph.microsoft.com`) - To upload images to your OneDrive

No data is ever sent to the extension developer or any other third party.

## Permissions Explained

| Permission                     | Why It's Needed                                             |
| ------------------------------ | ----------------------------------------------------------- |
| `contextMenus`                 | To add "SaveMe" to the right-click menu                     |
| `storage`                      | To save your settings and authentication tokens locally     |
| `notifications`                | To show save confirmations and errors                       |
| `identity`                     | To authenticate with Microsoft OneDrive via OAuth           |
| `alarms`                       | To periodically refresh authentication tokens in background |
| `host_permissions: <all_urls>` | To download images from any website you choose to save from |

## Data Security

- OAuth tokens are stored in Chrome's encrypted local storage
- We use PKCE (Proof Key for Code Exchange) for secure OAuth authentication
- No sensitive data is ever logged or transmitted to external servers
- All communication with Microsoft uses HTTPS

## Your Rights

You can:

- **Disconnect** your OneDrive account at any time via the extension settings
- **Clear all data** by removing the extension from Chrome
- **View stored data** via Chrome's developer tools (Application → Storage)

## Data Retention

- **OAuth tokens**: Stored until you disconnect or they expire
- **Image hashes**: Automatically deleted after 90 days
- **Settings**: Stored until you remove the extension

## Children's Privacy

This extension is not intended for use by children under 13 years of age.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last updated" date.

## Contact

If you have questions about this privacy policy, please open an issue on our GitHub repository.

## Open Source

This extension is open source. You can review the complete source code to verify our privacy practices.
