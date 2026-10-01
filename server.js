const http = require('http');
const fs = require('fs');
const path = require('path');

loadEnvFile(path.join(__dirname, '.env'));

if (process.env.OPENAI_ALLOW_INSECURE_TLS === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('OPENAI_ALLOW_INSECURE_TLS is enabled. Use this only for local testing on trusted networks.');
}

const PORT = Number(process.env.PORT || 8765);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const MAX_JSON_BYTES = 32 * 1024 * 1024;
let lastAiError = null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.mjs': 'text/javascript; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

const MASKED_WATERMARK_REPAIR_PROMPT = [
  'Remove only the visible watermark, logo, proof text, date stamp, or overlay inside the masked/transparent areas.',
  'Reconstruct the covered background, skin, texture, textural detail, lighting, and edges naturally.',
  'Do not change identity, pose, composition, colors, or any unmasked part of the image.',
  'Return a clean photorealistic PNG.'
].join(' ');

const FULL_IMAGE_WATERMARK_REPAIR_PROMPT = [
  'Inspect the entire image and remove all visible watermarks, repeated proof marks, logo stamps, date stamps, and overlay text.',
  'Preserve the original subject, composition, text labels that are part of the actual image, colors, lighting, and layout.',
  'Only repair watermark/overlay artifacts and reconstruct the covered pixels naturally.',
  'Return a clean photorealistic PNG.'
].join(' ');

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/inpaint') {
      await handleInpaint(req, res);
      return;
    }

    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        hasOpenAIKey: Boolean(OPENAI_API_KEY),
        model: OPENAI_IMAGE_MODEL,
        insecureTls: process.env.OPENAI_ALLOW_INSECURE_TLS === 'true',
        lastAiError
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/openai-status') {
      await handleOpenAIStatus(res);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    serveStatic(req, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Watermark Remover running at http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY is not set. AI repair will fall back to the browser engine.');
  }
});

async function handleInpaint(req, res) {
  try {
    if (!OPENAI_API_KEY) {
      sendJson(res, 503, { error: 'OPENAI_API_KEY is not configured' });
      return;
    }

    const body = await readJsonBody(req);
    const imageDataUrl = body.imageDataUrl;
    const maskDataUrl = body.maskDataUrl;
    const basePrompt = maskDataUrl ? MASKED_WATERMARK_REPAIR_PROMPT : FULL_IMAGE_WATERMARK_REPAIR_PROMPT;
    const prompt = [basePrompt, body.prompt || ''].filter(Boolean).join('\n');

    if (!isPngDataUrl(imageDataUrl)) {
      sendJson(res, 400, { error: 'imageDataUrl must be a PNG data URL' });
      return;
    }

    if (maskDataUrl && !isPngDataUrl(maskDataUrl)) {
      sendJson(res, 400, { error: 'maskDataUrl must be a PNG data URL when provided' });
      return;
    }

    const imageBlob = dataUrlToBlob(imageDataUrl, 'input.png');

    const form = new FormData();
    form.append('model', OPENAI_IMAGE_MODEL);
    form.append('prompt', prompt);
    form.append('image[]', imageBlob.blob, imageBlob.fileName);
    if (maskDataUrl) {
      const maskBlob = dataUrlToBlob(maskDataUrl, 'mask.png');
      form.append('mask', maskBlob.blob, maskBlob.fileName);
    }
    form.append('quality', process.env.OPENAI_IMAGE_QUALITY || 'high');
    form.append('size', process.env.OPENAI_IMAGE_SIZE || 'auto');
    form.append('output_format', 'png');

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: form
    });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { error: text };
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || 'OpenAI image edit failed';
    lastAiError = {
      status: response.status,
      message,
      at: new Date().toISOString()
    };
    console.error(`OpenAI image edit failed (${response.status}): ${message}`);
    sendJson(res, response.status, { error: message });
    return;
  }

  const b64 = payload?.data?.[0]?.b64_json;
  if (!b64) {
    lastAiError = {
      status: 502,
      message: 'OpenAI response did not include image data',
      at: new Date().toISOString()
    };
    sendJson(res, 502, { error: 'OpenAI response did not include image data' });
    return;
  }

  lastAiError = null;

  sendJson(res, 200, {
    imageDataUrl: `data:image/png;base64,${b64}`,
    model: OPENAI_IMAGE_MODEL,
    usage: payload.usage || null
  });
  } catch (err) {
    lastAiError = {
      status: 502,
      message: err.message || 'OpenAI request failed',
      code: err.code || err.cause?.code || null,
      at: new Date().toISOString()
    };
    console.error('OpenAI request failed:', lastAiError);
    sendJson(res, 502, { error: lastAiError.message, code: lastAiError.code });
  }
}

async function handleOpenAIStatus(res) {
  if (!OPENAI_API_KEY) {
    sendJson(res, 503, { ok: false, error: 'OPENAI_API_KEY is not configured' });
    return;
  }

  try {
    const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(OPENAI_IMAGE_MODEL)}`, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`
      }
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }

    if (!response.ok) {
      const message = payload?.error?.message || payload?.error || 'OpenAI status check failed';
      lastAiError = {
        status: response.status,
        message,
        at: new Date().toISOString()
      };
      sendJson(res, response.status, { ok: false, error: message });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      model: payload.id || OPENAI_IMAGE_MODEL
    });
  } catch (err) {
    lastAiError = {
      status: 502,
      message: err.message || 'OpenAI status check failed',
      code: err.code || err.cause?.code || null,
      at: new Date().toISOString()
    };
    sendJson(res, 502, { ok: false, error: lastAiError.message, code: lastAiError.code });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  const safePath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.normalize(path.join(__dirname, safePath));

  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let received = 0;
    const chunks = [];

    req.on('data', chunk => {
      received += chunk.length;
      if (received > MAX_JSON_BYTES) {
        reject(new Error('Request too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function dataUrlToBlob(dataUrl, fileName) {
  const [, meta, base64] = dataUrl.match(/^data:([^;]+);base64,(.+)$/) || [];
  const bytes = Buffer.from(base64, 'base64');
  return {
    blob: new Blob([bytes], { type: meta || 'image/png' }),
    fileName
  };
}

function isPngDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/png;base64,');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
    }
  }
}
