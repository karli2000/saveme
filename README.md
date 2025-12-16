# SaveMe - Chrome Extension

A Chrome extension that lets you right-click any image on any website and save it directly to your OneDrive folder. The source URL and datetime are embedded in both the filename and the image metadata.

## Features

- **One-click saving** - Right-click any image → "SaveMe" → Done
- **Direct OneDrive upload** - No local download, uploads straight to your chosen folder
- **Smart filenames** - Includes source domain, image name, and timestamp
- **Embedded metadata** - URL and datetime written to EXIF (JPEG), tEXt (PNG), or XMP (WebP)
- **Duplicate detection** - Prevents saving the same image twice (remembers for 3 months)
- **Configurable notifications** - Show all progress, only results, or disable entirely
- **Secure authentication** - OAuth 2.0 with Microsoft, tokens stored locally
- **Persistent login** - Stay connected until you manually disconnect

## Supported Image Formats

| Format | Metadata Support |
|--------|------------------|
| JPEG/JPG | EXIF (DateTimeOriginal, ImageDescription, UserComment) |
| PNG | tEXt chunks (Source, Creation Time, Comment) |
| WebP | XMP (dc:source, xmp:CreateDate) |
| GIF | Filename only |
| SVG | Filename only |
| BMP/TIFF/ICO | Filename only |

## Installation

### Step 1: Register Azure Application

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: `SaveMe Chrome Extension`
   - **Supported account types**: **Personal Microsoft accounts only**
   - **Redirect URI**: Leave blank for now
5. Click **Register**
6. Copy the **Application (client) ID**

### Step 2: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Add these permissions:
   - `Files.ReadWrite`
   - `User.Read`
   - `offline_access`
4. Click **Add permissions**

### Step 3: Load Extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → Select the `saveme` folder
4. Copy the **Extension ID** (shown under the extension name)

### Step 4: Add Redirect URI to Azure

1. Back in Azure → your app → **Authentication**
2. Click **Add a platform** → **Web**
3. Add Redirect URI:
   ```
   https://YOUR_EXTENSION_ID.chromiumapp.org/
   ```
4. Click **Configure**

### Step 5: Configure Extension

1. Edit `manifest.json`
2. Replace `YOUR_AZURE_CLIENT_ID` with your Application ID:
   ```json
   "oauth2": {
     "client_id": "your-actual-client-id-here",
     ...
   }
   ```
3. Save and reload the extension in `chrome://extensions/`

### Step 6: Connect to OneDrive

1. The settings page opens automatically on install
2. Click **Connect to OneDrive**
3. Sign in with your Microsoft account
4. Click **Select Folder** and choose where to save images

## Usage

1. Browse to any website with images
2. Right-click on an image
3. Select **SaveMe** from the context menu
4. Done! The image is uploaded to your OneDrive folder

## Settings

Access settings by clicking the extension icon or right-click → Options.

### OneDrive Connection
- Connect/disconnect your Microsoft account
- Select the target folder for saved images

### Notifications
- **Enable/disable** - Turn notifications on or off
- **Show all** - See progress updates (downloading, uploading, saved)
- **Show only result** - See only the final success/error message

## Filename Format

```
{domain}_{image-name}_{YYYY-MM-DD_HH-mm-ss}.{extension}
```

**Example:**
```
reddit-com_funny-cat_2025-12-16_14-30-45.jpg
```

## Duplicate Detection

SaveMe remembers images you've saved (using content hashes) for 3 months:
- Same image from different URLs = detected as duplicate
- Different images from same URL = saved normally
- Duplicates show a notification and are skipped
- Hashes are stored locally, never uploaded

**Limits:**
- Maximum 10,000 hashes stored
- Oldest hashes removed when limit reached
- Automatic cleanup runs daily

## Troubleshooting

### "Not Connected" error
- Open settings and click **Connect to OneDrive**
- Use a personal Microsoft account (not work/school)

### "No Folder Selected" error
- Open settings and click **Select Folder**

### "Duplicate" notification
- You've already saved this image within the last 3 months

### Image fails to save
- Some sites block image downloads (CORS)
- Try: Right-click → "Open image in new tab" → Then use SaveMe

### Authentication fails
- Verify Azure Client ID in `manifest.json`
- Check redirect URI matches: `https://{extension-id}.chromiumapp.org/`
- Ensure all 3 API permissions are added

### Metadata not showing
- Some image viewers don't display all metadata fields
- Use ExifTool or online metadata viewers to verify
- WebP requires extended format (VP8X) for metadata

## Project Structure

```
saveme/
├── manifest.json           # Extension configuration
├── background.js           # Service worker (context menu, upload, hashing)
├── options.html            # Settings page UI
├── options.js              # Settings page logic
├── options.css             # Settings page styles
├── lib/
│   ├── onedrive-api.js     # OneDrive OAuth & Graph API
│   └── image-metadata.js   # EXIF/PNG/WebP metadata handling
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Privacy

- **Local storage only** - Credentials and hashes stored in Chrome's secure local storage
- **No third parties** - Data only sent to Microsoft Graph API (OneDrive)
- **Minimal permissions** - Only accesses the specific folder you select
- **No tracking** - No analytics or telemetry

## License

MIT License - Feel free to modify and distribute.
