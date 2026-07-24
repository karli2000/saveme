# Chrome Web Store Description

## Downloads Permission Justification

SaveMe requires the downloads permission to save images to the user's local Downloads folder. When users choose "Local Folder" as a destination, the extension uses chrome.downloads.download() to save images with embedded metadata to their Downloads folder or a subfolder within it. This is a core feature that allows users to save images locally without requiring cloud storage.

---

## declarativeNetRequestWithHostAccess Permission Justification

SaveMe uses this permission for a single, narrowly scoped purpose: it installs one dynamic rule that removes the `Origin` header on the extension's own OAuth token requests to `login.microsoftonline.com/*/oauth2/v2.0/token`. Chrome automatically attaches an `Origin: chrome-extension://...` header to fetch requests from the extension's service worker. Microsoft's identity platform rejects OAuth token redemption for native/public client applications when an Origin header is present (error AADSTS9002326), and the only alternative (registering as a Single-Page Application) limits refresh tokens to 24 hours, forcing users to re-authenticate to OneDrive every day. The rule is restricted by `initiatorDomains` to requests originating from this extension only — it never modifies, blocks, or observes requests made by web pages or other extensions, and it affects no domain other than Microsoft's OAuth token endpoint. No browsing data is read or collected through this permission.

### Short version (for character-limited form fields)

Used to remove the Origin header on this extension's own OAuth token requests to login.microsoftonline.com. Chrome adds `Origin: chrome-extension://...` to service worker fetches, which Microsoft rejects for native OAuth clients (AADSTS9002326); without this, OneDrive sessions expire every 24 hours. The single dynamic rule is scoped via initiatorDomains to the extension's own requests and only matches Microsoft's token endpoint. It never touches web page traffic and collects no data.

---

## Short Description (132 characters max)

Save images to OneDrive or local folder with one click. Embeds source URL in metadata. Duplicate detection. No tracking.

---

## Detailed Description

Save any image from any website with a single right-click. SaveMe lets you save images directly to Microsoft OneDrive or your local Downloads folder - no extra steps needed.

**KEY FEATURES**

- One-click saving - Right-click any image, select destination, done
- Multiple destinations - Save to OneDrive folders, local folders, or both (up to 10)
- Smart filenames - Automatically includes website domain and timestamp
- Embedded metadata - Source URL and image URL written into the image file
- Duplicate detection - Prevents saving the same image twice
- No tracking - Your data stays on your device

**SUPPORTED DESTINATIONS**

- Microsoft OneDrive (personal and work/school accounts)
- Local Downloads folder (with custom subfolders)

**METADATA SUPPORT**

SaveMe embeds the source webpage URL and image URL directly into your saved images:
- JPEG: EXIF metadata
- PNG: tEXt chunks
- WebP: XMP metadata

View this metadata anytime in file properties or with tools like ExifTool.

**DUPLICATE DETECTION**

Three modes to choose from:
- Block globally: Save each image only once
- Block per destination: Same image allowed in different destinations
- Disabled: No restrictions

You can view how many images are tracked and clear the history anytime in settings.

**PRIVACY FIRST**

- No data collection or analytics
- No third-party servers
- Authentication tokens stored locally
- Images sent only to your chosen destinations

**HOW TO USE**

1. Install the extension
2. Add a destination (OneDrive folder or local folder)
3. Right-click any image and select "SaveMe"
4. Your image is saved with full metadata

---

**DOCUMENTATION**

- FAQ: https://github.com/karli2000/saveme/blob/main/FAQ.md
- Privacy Policy: https://github.com/karli2000/saveme/blob/main/PRIVACY.md
- Terms of Service: https://github.com/karli2000/saveme/blob/main/TERMS.md
- Changelog: https://github.com/karli2000/saveme/blob/main/CHANGELOG.md

---

**OPEN SOURCE**

SaveMe is open source. View the code, report issues, or contribute:
https://github.com/karli2000/saveme

---

This extension is provided "as is" without warranty. By using SaveMe, you agree to the Terms of Service.
