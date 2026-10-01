# Watermark Remover

A free browser-based watermark removal tool built with vanilla HTML, CSS, JavaScript, Canvas, and OpenCV.js. It runs locally in the browser, so no paid API key is required for the normal app flow.

![Free](https://img.shields.io/badge/100%25-Free-4ADE80?style=for-the-badge)
![No Signup](https://img.shields.io/badge/No-Signup-FF4E50?style=for-the-badge)
![Browser Based](https://img.shields.io/badge/Browser-Based-F9D423?style=for-the-badge)

## Features

- Free browser repair with no paid API calls
- Local watermark detection and inpainting
- Privacy first: images stay in the browser
- Drag and drop upload
- Batch image processing
- Download single images or all processed images
- Manual touch-up brush for difficult areas
- Before/after comparison slider
- Supports JPG, PNG, WEBP, and browser-supported HEIC/HEIF

## Tech Stack

- HTML5
- CSS3
- JavaScript
- Canvas API
- OpenCV.js
- Node.js static server

## Project Structure

```text
watermark-remover/
|-- index.html
|-- css/
|   `-- style.css
|-- js/
|   `-- app.js
|-- assets/
|   `-- images/
|-- server.js
|-- package.json
`-- README.md
```

## Run Locally

No OpenAI key is needed for the free browser mode.

```bash
npm start
```

Then open:

```text
http://localhost:8765
```

If the browser shows an old result, press `Ctrl+F5`, click `Process Another`, and upload the image again.

## Optional Cloud Repair

The project still contains an optional OpenAI image repair endpoint in `server.js`, but the frontend is set to free browser mode by default:

```js
const USE_CLOUD_AI = false;
```

Changing that to `true` requires a paid OpenAI API key with billing enabled. Free mode does not use it.

## How It Works

1. Upload a watermarked image.
2. The browser detects likely watermark-colored regions.
3. OpenCV.js inpaints those regions.
4. Use Touch Up for any remaining marks.
5. Download the repaired image.

## Disclaimer

Use this tool only on images you own or have permission to edit. Respect copyright and intellectual property laws.
