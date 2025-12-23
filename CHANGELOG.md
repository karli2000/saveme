# Changelog

All notable changes to SaveMe Chrome Extension.

## [1.0.0] - 2025-12-21

### Added
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
