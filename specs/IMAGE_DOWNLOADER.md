# Blood on the Clocktower - Token Image Downloader

## Usage

```bash
node scripts/download-images.js
```

## Features

- Downloads character token images from the official wiki
- Uses `.cache/html/` directory for faster page fetching (reuses cache from scraper)
- Extracts image URLs from infobox
- Downloads images to `assets/tokens/`
- Updates character JSON files with image paths
- Skips characters that already have images

## Progress

- Total characters: 138
- Images downloaded: 47/138 (first run)
- Remaining to download: 91

## Notes

- Images are named `{character_id}.png`
- Image paths are saved relative to workspace root: `assets/tokens/{character_id}.png`
- Script checks if character JSON already has an image field and skips if present
