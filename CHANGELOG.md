# Changelog

All notable changes to SaveMe Chrome Extension.

## [2.2.0] - 2026-01-30

### Fixed

- **Token refresh reliability**: Complete overhaul of token refresh to prevent daily re-authentication
  - Changed refresh interval from 3 hours to 30 minutes (Microsoft refresh tokens need regular use)
  - Added `redirect_uri` to refresh token requests (required by some Microsoft endpoints)
  - Service worker now refreshes if last refresh was >1 hour ago (keepalive for refresh token)
  - Auto-upgrades old 3-hour alarms to new 30-minute interval
  - Added notification when session expires prompting user to reconnect
- **Error logging**: Fixed `[object Object]` appearing in token refresh error messages

### Changed

- **Improved logging**: Comprehensive diagnostic logging for token refresh including:
  - Hours since last refresh
  - Refresh token length changes (detects when Microsoft issues new refresh token)
  - Original authentication timestamp
  - Detailed error context on failure

## [2.1.0] - 2026-01-09

### Added

- **Clear duplicate history**: New button in settings to clear all tracked image hashes with confirmation modal
- **Hash count display**: Shows number of tracked images in the Duplicate Detection settings

### Changed

- **Filename format**: Simplified to `domain_datetime.extension` (e.g., `example_com_2026-01-09_14-30-45.jpg`)
- **Domain source**: Now uses the browser page URL domain instead of image URL domain
- **Metadata structure**: Now embeds both Source (page URL) and Image (image URL) separately
  - JPEG: Description field contains `Source: {pageUrl} | Image: {imageUrl}`
  - PNG: Separate `Source` and `Image` tEXt chunks
  - WebP: XMP with `dc:source` for page URL and combined description

## [2.0.0] - 2026-01-09

### Added

- **Multi-destination support**: Save images to up to 10 different destinations
- **Local folder destination**: Save images directly to Downloads folder (or subfolder) using Chrome Downloads API
- **Dynamic context menu**:
  - "SaveMe - Setup Required" when no destinations configured
  - "SaveMe to {name}" for single destination
  - Submenu with destination names for multiple destinations
- **Destination management UI**: Add, edit, and delete destinations from settings page
- **Drag & drop reordering**: Reorder destinations by dragging in the settings page
- **Provider architecture**: Modular provider system for easy addition of new storage backends
- **Duplicate detection modes**:
  - Global: Block duplicates across all destinations (default)
  - Per-destination: Allow same image in different destinations
  - Disabled: No duplicate checking
- **Enhanced duplicate notifications**: Shows which destination the image was already saved to
- **OneDrive official logo**: Uses official Microsoft OneDrive icon in settings

### Changed

- Complete rewrite of options page with new destinations-based UI
- Migrated storage schema from single folder to multi-destination array
- Updated manifest to version 2.0.0
- Added `downloads` permission for local folder saving
- Modal validation errors now display inside the modal instead of behind it
- Improved pending save handling: now stores pending save when provider is not ready

### Fixed

- Pending save not being stored when `isReady()` check fails (now saves before opening auth page)
- Duplicate check overwriting hash entries in per-destination mode (now tracks array of destinations)
- `URL.createObjectURL` not available in service workers (converted to data URL for Downloads API)
- Token refresh alarm not recreated if cleared (now verified and recreated on browser startup)

### Technical Details

- New provider pattern with `BaseProvider` abstract class
- `OneDriveProvider` wraps existing OneDrive API
- `LocalFolderProvider` uses Chrome Downloads API with data URL conversion
- `ProviderRegistry` factory for creating provider instances
- Storage schema version 2 with automatic migration from v1
- Context menu rebuilds automatically when destinations change
- Hash storage updated to track multiple destinations per image

### Migration

- Existing OneDrive folder configuration is automatically migrated to first destination
- Legacy `selectedFolder` storage key preserved for rollback compatibility
- Legacy hashes without destination IDs are treated as global blockers until expiry

## [1.2.0] - 2025-12-23

### Added

- Pending save recovery: when re-authentication is required, the image save request is stored and automatically retried after successful reconnection
- Pending saves expire after 10 minutes for security
- ESLint configuration with `npm run lint` and `npm run lint:fix` scripts

### Changed

- Token refresh interval reduced from 24 hours to 3 hours for better reliability with work/school accounts

### Fixed

- Context menu duplicate ID error on extension update (now clears existing menus before recreating)

## [1.0.0] - 2025-12-21

### Features

- Right-click context menu to save images directly to OneDrive
- OAuth 2.0 authentication with PKCE flow for Microsoft accounts
- Support for both personal and work/school Microsoft accounts (common tenant)
- Metadata embedding for JPEG (EXIF), PNG (tEXt chunks), and WebP (XMP)
- Duplicate image detection using SHA-256 hashes (90-day retention, max 10,000 hashes)
- Configurable notifications (all progress, result only, or disabled)
- Automatic folder selection UI with breadcrumb navigation
- Settings page auto-opens on first install
- Re-authentication prompt when refresh token expires

### Token Management

- Periodic token refresh every 3 hours via Chrome alarms API
- Token refresh on browser startup
- Preserve existing refresh token if new one not returned
- Diagnostic function for debugging token status (`diagnoseTokens()`)
- Auto-open options page when re-authentication is required

### Technical Details

- Chrome Extension Manifest V3 with service worker
- Microsoft Graph API for OneDrive file operations
- RFC 1123 date format for PNG metadata
- VP8X extended format support for WebP metadata
- Big-endian EXIF with IFD0 + EXIF sub-IFD structure
- CRC-32 checksums for PNG tEXt chunks

### Documentation

- README with installation and usage instructions
- Privacy policy
- CLAUDE.md for AI assistant guidance
