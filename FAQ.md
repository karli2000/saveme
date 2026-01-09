# Frequently Asked Questions

## General

### What is SaveMe?

SaveMe is a Chrome extension that lets you save images from any website to multiple destinations (OneDrive, local folder) with a single right-click. It automatically embeds the source URL (page URL) and image URL into the image metadata, with a clean filename format.

### What destinations are supported?

- **OneDrive** - Microsoft cloud storage (requires Microsoft account)
- **Local Folder** - Saves to your Downloads folder (or a subfolder)

### How many destinations can I add?

You can add up to 10 destinations. Each can be a different OneDrive folder or local folder.

### Is my data safe?

Yes. SaveMe:
- Never sends your images to any third-party servers
- Stores authentication tokens locally in your browser
- Only communicates with Microsoft's servers (for OneDrive) or saves locally
- Does not collect any analytics or tracking data

---

## OneDrive

### How do I connect to OneDrive?

1. Open the SaveMe settings page (right-click extension icon → Options)
2. Click "Connect to OneDrive"
3. Sign in with your Microsoft account
4. Grant the requested permissions

### Which Microsoft accounts are supported?

Both personal Microsoft accounts (outlook.com, hotmail.com, live.com) and work/school accounts (Microsoft 365) are supported.

### Why do I need to reconnect to OneDrive?

OneDrive tokens expire periodically for security. SaveMe automatically refreshes tokens every 3 hours, but if:
- You haven't used the extension for a long time
- Your organization has strict token policies
- You changed your Microsoft password

...you may need to reconnect. The extension will notify you and open the settings page automatically.

### My work account keeps disconnecting. Why?

Work/school Microsoft 365 accounts often have shorter token lifetimes set by IT administrators. SaveMe refreshes tokens every 3 hours, but some organizations set even shorter policies. Contact your IT administrator if this is a frequent issue.

### Can I save to multiple OneDrive folders?

Yes! Add multiple destinations, each pointing to a different OneDrive folder. They'll appear as separate options in the right-click menu.

---

## Local Folder

### Where do local saves go?

Images are saved to your Downloads folder. You can specify a subfolder (e.g., "SaveMe") which will be created automatically if it doesn't exist.

### Can I choose any folder on my computer?

No. For security reasons, Chrome extensions can only save to the Downloads folder. However, you can create subfolders within Downloads.

### Why do some filenames have numbers added?

If a file with the same name already exists, Chrome automatically adds a number (e.g., `image(1).jpg`) to avoid overwriting. This is Chrome's built-in behavior.

---

## Duplicate Detection

### What is duplicate detection?

SaveMe tracks which images you've saved using SHA-256 hashes. When you try to save the same image again, it will notify you that it's a duplicate.

### What are the duplicate detection modes?

- **Block duplicates globally** (default) - An image can only be saved once, regardless of destination
- **Block duplicates per destination** - The same image can be saved to different destinations, but not twice to the same one
- **Allow all duplicates** - No checking; save the same image as many times as you want

### How long are duplicates remembered?

Image hashes are stored for 90 days, then automatically cleaned up. A maximum of 10,000 hashes are kept.

### Can I reset the duplicate history?

Yes! In the settings page under "Duplicate Detection", click the "Clear History" button. You'll see how many images are currently tracked, and a confirmation dialog before clearing.

### I changed the duplicate mode. What happens to existing hashes?

Existing hashes are preserved. When switching from "global" to "per-destination" mode, old hashes (without destination info) will continue to block everywhere until they expire after 90 days.

---

## Context Menu

### Why don't I see the SaveMe option when I right-click?

Make sure you're right-clicking directly on an image. SaveMe only appears in the context menu for images.

### Why does it say "Setup Required"?

You haven't added any destinations yet. Open the settings page and add at least one destination.

### I have multiple destinations. How do I choose which one to use?

When you have 2 or more destinations, right-clicking an image shows a "SaveMe" submenu with all your destinations listed. Click the one you want.

---

## Filenames

### What filename format is used?

Saved images use the format: `domain_datetime.extension`

Example: `reddit_com_2026-01-09_14-30-45.jpg`

- **domain** - The website domain you were browsing (not the image host), with dots replaced by underscores
- **datetime** - When you saved the image in ISO format

### Why use the page domain instead of image domain?

Images are often hosted on CDNs (like `i.redd.it` or `pbs.twimg.com`), which aren't meaningful. The page URL tells you where you found the image.

---

## Image Metadata

### What metadata is embedded?

- **Source URL** - The webpage where you found the image (browser URL)
- **Image URL** - The direct URL to the image file
- **Save Date/Time** - When you saved the image

### Which image formats support metadata?

- **JPEG** - Uses EXIF metadata (ImageDescription field)
- **PNG** - Uses tEXt chunks (separate Source and Image fields)
- **WebP** - Uses XMP metadata

### Does embedding metadata change the image quality?

No. The image data itself is not modified. Metadata is stored in a separate section of the file.

### How do I view the embedded metadata?

- **Windows**: Right-click file → Properties → Details
- **macOS**: Open with Preview → Tools → Show Inspector
- **Any OS**: Use tools like ExifTool or online EXIF viewers

---

## Notifications

### Can I disable notifications?

Yes. In settings, you can:
- Disable all notifications
- Show only the final result (success/error)
- Show all progress notifications

### What do the notifications mean?

- **"Saving..."** - Image is being downloaded and processed
- **"Saved!"** - Image was saved successfully
- **"Duplicate"** - Image was already saved before
- **"Error"** - Something went wrong (see message for details)

---

## Troubleshooting

### The extension isn't working at all

1. Make sure the extension is enabled in `chrome://extensions/`
2. Try reloading the extension (click the refresh icon)
3. Check if you have at least one destination configured

### Images aren't saving

1. Check if you're connected to OneDrive (if using OneDrive destination)
2. Check your internet connection
3. Look for error notifications
4. Check the service worker console for errors (`chrome://extensions/` → Service worker)

### I get "Not Ready" error

For OneDrive: Your session may have expired. Click the notification or open settings to reconnect.

### Saved images don't have metadata

Some image formats or sources may not support metadata embedding. The image will still be saved, just without embedded metadata.

### How do I report a bug?

Open an issue on the GitHub repository with:
- What you were trying to do
- What happened instead
- Browser version
- Any error messages

---

## Privacy

### What permissions does SaveMe need?

- **contextMenus** - To add the right-click menu option
- **storage** - To save settings and token data locally
- **notifications** - To show save progress/status
- **identity** - For OneDrive authentication
- **downloads** - For local folder saving
- **alarms** - For periodic token refresh
- **host permissions (all URLs)** - To fetch images from any website

### Does SaveMe access my browsing history?

No. SaveMe only accesses the specific image URL when you right-click and choose to save it.

### Is my OneDrive password stored?

No. SaveMe uses OAuth 2.0, which means it never sees your password. Microsoft handles the authentication and gives SaveMe a limited-access token.

### Can SaveMe read or modify other files in my OneDrive?

No. SaveMe only requests permission to create new files. It cannot read, modify, or delete existing files.
