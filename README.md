# SaveMe - Chrome Extension

A Chrome extension that lets you right-click any image and save it directly to your OneDrive folder with the URL and datetime in the filename.

## Features

- Right-click context menu on any image
- Direct upload to OneDrive (no local download)
- Automatic filename with source URL and timestamp
- Supports PNG, JPG, GIF, SVG, WebP, and more
- Secure OAuth 2.0 authentication
- Persistent login (stay connected)
- Success/error notifications

## Setup Instructions

### Step 1: Register Azure Application

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure the app:
   - **Name**: `SaveMe Chrome Extension`
   - **Supported account types**: Select **Personal Microsoft accounts only** (for consumer OneDrive)
   - **Redirect URI**: Leave blank for now (we'll add it after loading the extension)
5. Click **Register**
6. Copy the **Application (client) ID** - you'll need this

### Step 2: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Add these permissions:
   - `Files.ReadWrite`
   - `User.Read`
   - `offline_access` (for refresh tokens)
4. Click **Add permissions**

### Step 3: Load the Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `saveme` folder
5. Note the **Extension ID** shown under the extension (a long string like `abcdefghijklmnopabcdefghijklmnop`)

### Step 4: Add Redirect URI to Azure App

1. Go back to your Azure app registration
2. Go to **Authentication** → **Add a platform** → **Web**
3. Add this Redirect URI (replace `YOUR_EXTENSION_ID` with your actual extension ID):
   ```
   https://YOUR_EXTENSION_ID.chromiumapp.org/
   ```
4. Click **Configure**

### Step 5: Configure the Extension

1. Open `manifest.json` in the extension folder
2. Replace `YOUR_AZURE_CLIENT_ID` with your Application (client) ID:
   ```json
   "oauth2": {
     "client_id": "your-actual-client-id-here",
     ...
   }
   ```
3. Save the file
4. Go back to `chrome://extensions/` and click the refresh icon on the SaveMe extension

### Step 6: Connect to OneDrive

1. Click the extension icon or go to the extension options
2. Click **Connect to OneDrive**
3. Sign in with your Microsoft account
4. Select a folder to save images to

## Usage

1. Right-click on any image on any website
2. Select **SaveMe** from the context menu
3. The image will be uploaded to your selected OneDrive folder
4. A notification will confirm the save

## Filename Format

Images are saved with the following filename format:

```
{domain}_{image-name}_{YYYY-MM-DD_HH-mm-ss}.{extension}
```

Example: `example-com_photo_2025-12-16_14-30-45.jpg`

## Troubleshooting

### "Not Connected" error
- Open extension settings and connect to OneDrive
- Make sure you're signed in with a personal Microsoft account (not work/school)

### "No Folder Selected" error
- Open extension settings and select a save folder

### Image fails to save
- Some images are protected from downloading (CORS restrictions)
- Try right-clicking and "Open image in new tab", then save from there

### Authentication fails
- Verify your Azure Client ID is correct in manifest.json
- Check that the redirect URI matches your extension ID exactly
- Make sure API permissions include `Files.ReadWrite`, `User.Read`, and `offline_access`

## Files

```
saveme/
├── manifest.json          # Extension configuration
├── background.js          # Context menu & upload logic
├── options.html           # Settings page
├── options.js             # Settings page logic
├── options.css            # Settings page styles
├── lib/
│   └── onedrive-api.js    # OneDrive API wrapper
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Privacy

- Your OneDrive credentials are stored locally in Chrome's secure storage
- No data is sent to any third-party servers
- The extension only accesses the specific OneDrive folder you select
