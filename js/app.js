/**
 * Watermark Remover — Main Application Logic
 * Handles: Upload, Watermark Removal (colored + white), Manual Brush, Before/After Slider, FAQ, Animations
 */

(function () {
  'use strict';

  // ============================================
  // DOM REFERENCES
  // ============================================
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  // Header
  const hamburger = $('#hamburger');
  const mobileNav = $('#mobileNav');
  const header = $('#header');

  // Upload
  const uploadArea = $('#uploadArea');
  const uploadZone = $('#uploadZone');
  const uploadBtn = $('#uploadBtn');
  const fileInput = $('#fileInput');

  // States
  const processingState = $('#processingState');
  const progressFill = $('#progressFill');
  const resultState = $('#resultState');

  // Result
  const resultBefore = $('#resultBefore');
  const resultAfter = $('#resultAfter');
  const resultSlider = $('#resultSlider');
  const resultComparison = $('#resultComparison');
  const downloadBtn = $('#downloadBtn');
  const resetBtn = $('#resetBtn');

  // Demo slider
  const demoSlider = $('#demoSlider');
  const demoAfter = $('#demoAfter');
  const demoDivider = $('#demoDivider');
  const demoHandle = $('#demoHandle');

  // Tabs
  const tabBtns = $$('.tabs__btn');

  // ============================================
  // MOBILE NAVIGATION
  // ============================================
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileNav.classList.toggle('active');
    document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
  });

  // Close mobile nav on link click
  $$('.mobile-nav__link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileNav.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  // Header scroll effect
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;
    if (currentScroll > 50) {
      header.style.borderBottomColor = 'rgba(255,255,255,0.08)';
    } else {
      header.style.borderBottomColor = 'rgba(255,255,255,0.1)';
    }
    lastScroll = currentScroll;
  }, { passive: true });

  // ============================================
  // TABS
  // ============================================
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab !== 'image') {
        showToast(`${tab.charAt(0).toUpperCase() + tab.slice(1)} watermark removal coming soon!`);
        return;
      }
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ============================================
  // TOAST NOTIFICATION
  // ============================================
  function showToast(message, duration = 3000) {
    const existing = $('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: rgba(30, 32, 38, 0.95);
      backdrop-filter: blur(12px);
      color: rgba(255,255,255,0.9);
      padding: 14px 28px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      opacity: 0;
      transition: opacity 0.3s ease, transform 0.3s ease;
      font-family: 'Inter', sans-serif;
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ============================================
  // FILE UPLOAD — DRAG & DROP + CLICK
  // ============================================
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  ['dragenter', 'dragover'].forEach(evt => {
    uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove('dragover');
    });
  });

  uploadZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
  });

  // ============================================
  // FILE HANDLING & PROCESSING
  // ============================================
  let originalImageData = null;
  let processedCanvas = null;
  let sourceImage = null;

  function handleFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Please upload a JPG, PNG, or WEBP image.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      showToast('Image size must be under 20MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        originalImageData = e.target.result;
        sourceImage = img;
        startProcessing(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function startProcessing(img) {
    uploadArea.style.display = 'none';
    resultState.classList.remove('active');
    processingState.classList.add('active');
    progressFill.style.width = '0%';

    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 8;
      if (progress > 90) progress = 90;
      progressFill.style.width = progress + '%';
    }, 150);

    // Use setTimeout to allow UI to render, then process
    setTimeout(() => {
      processedCanvas = processImage(img);

      clearInterval(progressInterval);
      progressFill.style.width = '100%';

      setTimeout(() => {
        showResult(img);
      }, 400);
    }, 800);
  }

  // ============================================
  // ADVANCED CLIENT-SIDE WATERMARK REMOVAL
  // Handles: White/gray, colored (red/blue/etc), semi-transparent overlays
  // ============================================
  function processImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const maxDim = 1600;
    let w = img.naturalWidth;
    let h = img.naturalHeight;

    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // ---- STEP 1: Compute local median color for each pixel using block sampling ----
    const blockSize = 12;
    const medianR = new Float32Array(w * h);
    const medianG = new Float32Array(w * h);
    const medianB = new Float32Array(w * h);

    computeLocalMedian(data, w, h, blockSize, medianR, medianG, medianB);

    // ---- STEP 2: Detect watermark pixels (multi-strategy) ----
    const watermarkMask = new Float32Array(w * h); // 0..1 confidence

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const i = idx * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const mr = medianR[idx], mg = medianG[idx], mb = medianB[idx];

        let score = 0;

        // Strategy 1: White/gray watermark detection (bright, low-sat, contrast with neighbors)
        const brightness = (r + g + b) / 3;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

        if (brightness > 180 && saturation < 0.15) {
          const medBrightness = (mr + mg + mb) / 3;
          const contrast = brightness - medBrightness;
          if (contrast > 30) {
            score = Math.max(score, Math.min(contrast / 80, 1.0));
          }
        }

        // Strategy 2: Colored watermark detection (abnormal hue shift from local median)
        const pixHue = rgbToHue(r, g, b);
        const medHue = rgbToHue(mr, mg, mb);
        const hueDiff = hueDistance(pixHue, medHue);
        const colorDiff = Math.sqrt(
          Math.pow(r - mr, 2) + Math.pow(g - mg, 2) + Math.pow(b - mb, 2)
        );

        // Detect if this pixel has a different hue than its neighborhood
        if (hueDiff > 15 && colorDiff > 25) {
          const colorScore = Math.min((hueDiff / 60) * (colorDiff / 60), 1.0);
          score = Math.max(score, colorScore);
        }

        // Strategy 3: Semi-transparent overlay detection
        // An overlay shifts pixel towards overlay color uniformly
        // Detect by checking if pixel is "pulled" away from median in a consistent direction
        const dr = r - mr, dg = g - mg, db = b - mb;
        const pullMagnitude = Math.sqrt(dr * dr + dg * dg + db * db);

        if (pullMagnitude > 20) {
          // Check if the pull direction is consistent with a colored overlay
          const maxPull = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
          const directionality = maxPull / (pullMagnitude + 1); // How directional the shift is
          if (directionality > 0.5) {
            const overlayScore = Math.min(pullMagnitude / 80, 1.0) * directionality;
            score = Math.max(score, overlayScore);
          }
        }

        watermarkMask[idx] = score;
      }
    }

    // ---- STEP 3: Refine mask - threshold, dilate, smooth ----
    const binaryMask = new Uint8Array(w * h);
    const threshold = 0.25;

    for (let i = 0; i < w * h; i++) {
      binaryMask[i] = watermarkMask[i] > threshold ? 1 : 0;
    }

    // Remove small isolated detections (noise)
    cleanMask(binaryMask, w, h, 3, 4);

    // Dilate to cover edges of watermark
    const dilatedMask = dilateMask(binaryMask, w, h, 3);

    // ---- STEP 4: Inpaint - replace watermark pixels ----
    // Use multi-radius neighbor interpolation from clean pixels
    const outputData = new Uint8ClampedArray(data);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (dilatedMask[idx]) {
          const i = idx * 4;
          const confidence = watermarkMask[idx];

          // Get clean neighbor average with expanding radius
          const clean = getCleanNeighborWeighted(data, dilatedMask, x, y, w, h);

          if (confidence > 0.6) {
            // Strong watermark — fully replace
            outputData[i] = clean.r;
            outputData[i + 1] = clean.g;
            outputData[i + 2] = clean.b;
          } else {
            // Partial watermark — blend with original
            const blend = Math.min(confidence * 2, 1.0);
            outputData[i] = Math.round(data[i] * (1 - blend) + clean.r * blend);
            outputData[i + 1] = Math.round(data[i + 1] * (1 - blend) + clean.g * blend);
            outputData[i + 2] = Math.round(data[i + 2] * (1 - blend) + clean.b * blend);
          }
        }
      }
    }

    // ---- STEP 5: Smoothing pass on inpainted regions ----
    const finalData = new Uint8ClampedArray(outputData);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 2; y < h - 2; y++) {
        for (let x = 2; x < w - 2; x++) {
          const idx = y * w + x;
          if (dilatedMask[idx]) {
            const i = idx * 4;
            // 5x5 weighted average (Gaussian-like)
            let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                const ni = ((y + dy) * w + (x + dx)) * 4;
                const dist = Math.abs(dx) + Math.abs(dy);
                const weight = dist === 0 ? 6 : dist === 1 ? 4 : dist === 2 ? 2 : 1;
                rSum += outputData[ni] * weight;
                gSum += outputData[ni + 1] * weight;
                bSum += outputData[ni + 2] * weight;
                wSum += weight;
              }
            }
            finalData[i] = rSum / wSum;
            finalData[i + 1] = gSum / wSum;
            finalData[i + 2] = bSum / wSum;
          }
        }
      }
      // Copy back for next pass
      for (let i = 0; i < finalData.length; i++) {
        outputData[i] = finalData[i];
      }
    }

    const newImageData = new ImageData(finalData, w, h);
    ctx.putImageData(newImageData, 0, 0);

    return canvas;
  }

  // ---- Helper: Compute local median using block sampling ----
  function computeLocalMedian(data, w, h, blockSize, medR, medG, medB) {
    // Use block averages as proxy for local median (much faster)
    const halfBlock = Math.floor(blockSize / 2);

    // Precompute integral image for fast area sums
    const integralR = new Float64Array((w + 1) * (h + 1));
    const integralG = new Float64Array((w + 1) * (h + 1));
    const integralB = new Float64Array((w + 1) * (h + 1));

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const idx = (y + 1) * (w + 1) + (x + 1);
        integralR[idx] = data[i] + integralR[idx - 1] + integralR[idx - (w + 1)] - integralR[idx - (w + 1) - 1];
        integralG[idx] = data[i + 1] + integralG[idx - 1] + integralG[idx - (w + 1)] - integralG[idx - (w + 1) - 1];
        integralB[idx] = data[i + 2] + integralB[idx - 1] + integralB[idx - (w + 1)] - integralB[idx - (w + 1) - 1];
      }
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const x1 = Math.max(0, x - halfBlock);
        const y1 = Math.max(0, y - halfBlock);
        const x2 = Math.min(w - 1, x + halfBlock);
        const y2 = Math.min(h - 1, y + halfBlock);
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);

        const tl = y1 * (w + 1) + x1;
        const tr = y1 * (w + 1) + (x2 + 1);
        const bl = (y2 + 1) * (w + 1) + x1;
        const br = (y2 + 1) * (w + 1) + (x2 + 1);

        const idx = y * w + x;
        medR[idx] = (integralR[br] - integralR[tr] - integralR[bl] + integralR[tl]) / count;
        medG[idx] = (integralG[br] - integralG[tr] - integralG[bl] + integralG[tl]) / count;
        medB[idx] = (integralB[br] - integralB[tr] - integralB[bl] + integralB[tl]) / count;
      }
    }
  }

  // ---- Helper: RGB to Hue (0-360) ----
  function rgbToHue(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 0;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    return h;
  }

  // ---- Helper: Hue distance (circular) ----
  function hueDistance(h1, h2) {
    const d = Math.abs(h1 - h2);
    return Math.min(d, 360 - d);
  }

  // ---- Helper: Clean mask - remove isolated pixels ----
  function cleanMask(mask, w, h, radius, minNeighbors) {
    const copy = new Uint8Array(mask);
    for (let y = radius; y < h - radius; y++) {
      for (let x = radius; x < w - radius; x++) {
        if (copy[y * w + x]) {
          let count = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (copy[(y + dy) * w + (x + dx)]) count++;
            }
          }
          if (count < minNeighbors) {
            mask[y * w + x] = 0;
          }
        }
      }
    }
  }

  // ---- Helper: Get clean neighbor weighted average ----
  function getCleanNeighborWeighted(data, mask, x, y, w, h) {
    // Try expanding radii until we find enough clean pixels
    const radii = [5, 10, 16, 24];
    for (const radius of radii) {
      let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
      // Sample in a spiral pattern for speed
      for (let dy = -radius; dy <= radius; dy += (radius > 10 ? 2 : 1)) {
        for (let dx = -radius; dx <= radius; dx += (radius > 10 ? 2 : 1)) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            if (!mask[ny * w + nx]) {
              const ni = (ny * w + nx) * 4;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const weight = 1 / (dist * dist + 1);
              rSum += data[ni] * weight;
              gSum += data[ni + 1] * weight;
              bSum += data[ni + 2] * weight;
              wSum += weight;
            }
          }
        }
      }
      if (wSum > 0.5) {
        return {
          r: Math.round(rSum / wSum),
          g: Math.round(gSum / wSum),
          b: Math.round(bSum / wSum)
        };
      }
    }
    // Fallback: return original pixel
    const i = (y * w + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  }

  function dilateMask(mask, w, h, radius) {
    const dilated = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x]) {
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                if (dx * dx + dy * dy <= radius * radius) {
                  dilated[ny * w + nx] = 1;
                }
              }
            }
          }
        }
      }
    }
    return dilated;
  }

  // ============================================
  // SHOW RESULT — with Manual Touch-up Brush
  // ============================================
  function showResult(originalImg) {
    processingState.classList.remove('active');
    resultState.classList.add('active');

    resultBefore.src = originalImageData;
    resultAfter.src = processedCanvas.toDataURL('image/png');

    updateResultSlider(50);
    resultState.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Show tip about manual brush
    setTimeout(() => {
      showToast('💡 Still see watermarks? Click "🖌️ Touch Up" to manually paint over them!', 5000);
    }, 1500);
  }

  // ============================================
  // MANUAL BRUSH TOUCH-UP TOOL
  // ============================================
  let brushCanvas = null;
  let brushCtx = null;
  let isBrushing = false;
  let brushMode = false;
  let brushSize = 20;
  let brushOverlay = null;

  function initBrushMode() {
    if (brushMode) {
      exitBrushMode();
      return;
    }
    brushMode = true;

    // Create overlay canvas on top of result
    brushOverlay = document.createElement('div');
    brushOverlay.id = 'brushOverlay';
    brushOverlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 9999;
      background: rgba(0,0,0,0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    `;

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      background: rgba(255,255,255,0.08);
      padding: 12px 24px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      flex-wrap: wrap;
      justify-content: center;
    `;

    toolbar.innerHTML = `
      <span style="color: rgba(255,255,255,0.9); font-weight: 600; font-size: 14px;">🖌️ Paint over watermarks</span>
      <label style="color: rgba(255,255,255,0.7); font-size: 13px; display: flex; align-items: center; gap: 8px;">
        Size: <input type="range" min="5" max="60" value="${brushSize}" id="brushSizeSlider" 
        style="width: 100px; accent-color: #F9D423;">
        <span id="brushSizeLabel">${brushSize}px</span>
      </label>
      <button id="brushApplyBtn" style="background: linear-gradient(132.2deg, #F9D423 7.64%, #FF4E50 97.11%); color: #0a0d12; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px;">Apply & Remove</button>
      <button id="brushCancelBtn" style="background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.15); padding: 10px 24px; border-radius: 8px; cursor: pointer; font-size: 14px;">Cancel</button>
    `;

    // Canvas wrapper
    const canvasWrapper = document.createElement('div');
    canvasWrapper.style.cssText = `
      position: relative;
      max-width: 90vw;
      max-height: 70vh;
      overflow: hidden;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.15);
    `;

    // Display canvas (shows the current processed image)
    brushCanvas = document.createElement('canvas');
    brushCanvas.width = processedCanvas.width;
    brushCanvas.height = processedCanvas.height;
    brushCanvas.style.cssText = `
      max-width: 90vw;
      max-height: 70vh;
      display: block;
      cursor: crosshair;
    `;
    brushCtx = brushCanvas.getContext('2d', { willReadFrequently: true });
    brushCtx.drawImage(processedCanvas, 0, 0);

    // Mask canvas (invisible, tracks where user painted)
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = processedCanvas.width;
    maskCanvas.height = processedCanvas.height;
    const maskCtx = maskCanvas.getContext('2d');

    // Paint overlay (visible red tint)
    const paintCanvas = document.createElement('canvas');
    paintCanvas.width = processedCanvas.width;
    paintCanvas.height = processedCanvas.height;
    paintCanvas.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      max-width: 90vw;
      max-height: 70vh;
      pointer-events: none;
      opacity: 0.4;
    `;
    const paintCtx = paintCanvas.getContext('2d');

    canvasWrapper.appendChild(brushCanvas);
    canvasWrapper.appendChild(paintCanvas);
    brushOverlay.appendChild(toolbar);
    brushOverlay.appendChild(canvasWrapper);
    document.body.appendChild(brushOverlay);

    // Brush size slider
    const sizeSlider = $('#brushSizeSlider');
    const sizeLabel = $('#brushSizeLabel');
    sizeSlider.addEventListener('input', () => {
      brushSize = parseInt(sizeSlider.value);
      sizeLabel.textContent = brushSize + 'px';
    });

    // Brush drawing
    function getCanvasCoords(e) {
      const rect = brushCanvas.getBoundingClientRect();
      const scaleX = brushCanvas.width / rect.width;
      const scaleY = brushCanvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    function paintAt(x, y) {
      // Draw on mask
      maskCtx.fillStyle = 'white';
      maskCtx.beginPath();
      maskCtx.arc(x, y, brushSize, 0, Math.PI * 2);
      maskCtx.fill();

      // Draw visible indicator
      paintCtx.fillStyle = '#FF4E50';
      paintCtx.beginPath();
      paintCtx.arc(x, y, brushSize, 0, Math.PI * 2);
      paintCtx.fill();
    }

    let lastX = null, lastY = null;

    brushCanvas.addEventListener('mousedown', (e) => {
      isBrushing = true;
      const coords = getCanvasCoords(e);
      lastX = coords.x;
      lastY = coords.y;
      paintAt(coords.x, coords.y);
    });

    brushCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      isBrushing = true;
      const coords = getCanvasCoords(e);
      lastX = coords.x;
      lastY = coords.y;
      paintAt(coords.x, coords.y);
    });

    const onMove = (e) => {
      if (!isBrushing) return;
      const coords = getCanvasCoords(e);
      // Interpolate between last and current position for smooth strokes
      if (lastX !== null) {
        const dx = coords.x - lastX;
        const dy = coords.y - lastY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.max(1, Math.floor(dist / (brushSize * 0.3)));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          paintAt(lastX + dx * t, lastY + dy * t);
        }
      }
      lastX = coords.x;
      lastY = coords.y;
    };

    brushCanvas.addEventListener('mousemove', onMove);
    brushCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e); });

    const onEnd = () => { isBrushing = false; lastX = null; lastY = null; };
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);

    // Apply button — inpaint the painted areas
    $('#brushApplyBtn').addEventListener('click', () => {
      showToast('Processing painted areas...', 2000);

      setTimeout(() => {
        // Get the mask
        const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
        const srcData = brushCtx.getImageData(0, 0, brushCanvas.width, brushCanvas.height);
        const pixels = srcData.data;
        const bw = brushCanvas.width, bh = brushCanvas.height;

        // Build binary mask from paint
        const paintMask = new Uint8Array(bw * bh);
        for (let i = 0; i < bw * bh; i++) {
          paintMask[i] = maskData[i * 4] > 128 ? 1 : 0;
        }

        // Get original image data for reference
        const origCanvas = document.createElement('canvas');
        origCanvas.width = bw;
        origCanvas.height = bh;
        const origCtx = origCanvas.getContext('2d');
        origCtx.drawImage(sourceImage, 0, 0, bw, bh);
        const origData = origCtx.getImageData(0, 0, bw, bh).data;

        // Inpaint painted areas using clean neighbors
        const dilatedPaint = dilateMask(paintMask, bw, bh, 2);

        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            if (dilatedPaint[y * bw + x]) {
              const i = (y * bw + x) * 4;
              const clean = getCleanNeighborWeighted(pixels, dilatedPaint, x, y, bw, bh);
              pixels[i] = clean.r;
              pixels[i + 1] = clean.g;
              pixels[i + 2] = clean.b;
            }
          }
        }

        // Smooth inpainted region
        const smoothed = new Uint8ClampedArray(pixels);
        for (let y = 2; y < bh - 2; y++) {
          for (let x = 2; x < bw - 2; x++) {
            if (dilatedPaint[y * bw + x]) {
              const i = (y * bw + x) * 4;
              let rS = 0, gS = 0, bS = 0, wS = 0;
              for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                  const ni = ((y + dy) * bw + (x + dx)) * 4;
                  const d = Math.abs(dx) + Math.abs(dy);
                  const wt = d === 0 ? 6 : d <= 1 ? 4 : d <= 2 ? 2 : 1;
                  rS += pixels[ni] * wt;
                  gS += pixels[ni + 1] * wt;
                  bS += pixels[ni + 2] * wt;
                  wS += wt;
                }
              }
              smoothed[i] = rS / wS;
              smoothed[i + 1] = gS / wS;
              smoothed[i + 2] = bS / wS;
            }
          }
        }

        brushCtx.putImageData(new ImageData(smoothed, bw, bh), 0, 0);

        // Update processed canvas
        const pCtx = processedCanvas.getContext('2d');
        pCtx.drawImage(brushCanvas, 0, 0);

        // Update result image
        resultAfter.src = processedCanvas.toDataURL('image/png');

        // Clear paint overlay
        paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

        showToast('✅ Touch-up applied! Paint more or click Apply again.', 3000);
      }, 100);
    });

    // Cancel
    $('#brushCancelBtn').addEventListener('click', () => {
      exitBrushMode();
    });
  }

  function exitBrushMode() {
    brushMode = false;
    if (brushOverlay) {
      brushOverlay.remove();
      brushOverlay = null;
    }
    // Update result with latest processed canvas
    resultAfter.src = processedCanvas.toDataURL('image/png');
  }

  // ============================================
  // RESULT BEFORE/AFTER SLIDER
  // ============================================
  function updateResultSlider(percent) {
    percent = Math.max(0, Math.min(100, percent));
    resultSlider.style.left = percent + '%';
    resultAfter.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
  }

  let isResultDragging = false;

  resultComparison.addEventListener('mousedown', (e) => {
    isResultDragging = true;
    updateResultSliderFromEvent(e);
  });

  resultComparison.addEventListener('touchstart', (e) => {
    isResultDragging = true;
    updateResultSliderFromEvent(e.touches[0]);
  }, { passive: true });

  document.addEventListener('mousemove', (e) => {
    if (isResultDragging) updateResultSliderFromEvent(e);
  });

  document.addEventListener('touchmove', (e) => {
    if (isResultDragging) updateResultSliderFromEvent(e.touches[0]);
  }, { passive: true });

  document.addEventListener('mouseup', () => isResultDragging = false);
  document.addEventListener('touchend', () => isResultDragging = false);

  function updateResultSliderFromEvent(e) {
    const rect = resultComparison.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    updateResultSlider(percent);
  }

  // ============================================
  // DOWNLOAD
  // ============================================
  downloadBtn.addEventListener('click', () => {
    if (!processedCanvas) return;
    const link = document.createElement('a');
    link.download = 'watermark-removed.png';
    link.href = processedCanvas.toDataURL('image/png');
    link.click();
    showToast('Image downloaded successfully! 🎉');
  });

  // ============================================
  // RESET / PROCESS ANOTHER
  // ============================================
  resetBtn.addEventListener('click', () => {
    exitBrushMode();
    resultState.classList.remove('active');
    processingState.classList.remove('active');
    uploadArea.style.display = '';
    fileInput.value = '';
    originalImageData = null;
    processedCanvas = null;
    sourceImage = null;
    progressFill.style.width = '0%';
    uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // ============================================
  // DEMO BEFORE/AFTER SLIDER
  // ============================================
  function updateDemoSlider(percent) {
    percent = Math.max(0, Math.min(100, percent));
    demoAfter.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    demoDivider.style.left = percent + '%';
    demoHandle.style.left = percent + '%';
  }

  let isDemoDragging = false;

  demoSlider.addEventListener('mousedown', (e) => {
    isDemoDragging = true;
    updateDemoSliderFromEvent(e);
  });

  demoSlider.addEventListener('touchstart', (e) => {
    isDemoDragging = true;
    updateDemoSliderFromEvent(e.touches[0]);
  }, { passive: true });

  document.addEventListener('mousemove', (e) => {
    if (isDemoDragging) updateDemoSliderFromEvent(e);
  });

  document.addEventListener('touchmove', (e) => {
    if (isDemoDragging) updateDemoSliderFromEvent(e.touches[0]);
  }, { passive: true });

  document.addEventListener('mouseup', () => isDemoDragging = false);
  document.addEventListener('touchend', () => isDemoDragging = false);

  function updateDemoSliderFromEvent(e) {
    const rect = demoSlider.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    updateDemoSlider(percent);
  }

  updateDemoSlider(50);

  // ============================================
  // FAQ ACCORDION
  // ============================================
  $$('.faq__question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq__item');
      const isActive = item.classList.contains('active');

      $$('.faq__item').forEach(i => i.classList.remove('active'));
      $$('.faq__question').forEach(q => q.setAttribute('aria-expanded', 'false'));

      if (!isActive) {
        item.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ============================================
  // SCROLL REVEAL ANIMATION
  // ============================================
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  $$('.reveal').forEach(el => revealObserver.observe(el));

  // ============================================
  // SMOOTH SCROLL FOR NAV LINKS
  // ============================================
  $$('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId === '#') return;
      const target = $(targetId);
      if (target) {
        e.preventDefault();
        const offset = header.offsetHeight + 20;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ============================================
  // AUTO-SCROLL REVIEWS CAROUSEL
  // ============================================
  const carousel = $('#reviewsCarousel');
  let scrollDirection = 1;
  let autoScrollPaused = false;

  carousel.addEventListener('mouseenter', () => autoScrollPaused = true);
  carousel.addEventListener('mouseleave', () => autoScrollPaused = false);
  carousel.addEventListener('touchstart', () => autoScrollPaused = true, { passive: true });
  carousel.addEventListener('touchend', () => {
    setTimeout(() => autoScrollPaused = false, 3000);
  });

  setInterval(() => {
    if (autoScrollPaused) return;
    const maxScroll = carousel.scrollWidth - carousel.clientWidth;
    if (carousel.scrollLeft >= maxScroll - 5) scrollDirection = -1;
    if (carousel.scrollLeft <= 5) scrollDirection = 1;
    carousel.scrollBy({ left: scrollDirection * 1, behavior: 'auto' });
  }, 30);

  // ============================================
  // EXPOSE BRUSH TOOL FOR BUTTON
  // ============================================
  window.openBrushTool = initBrushMode;

  console.log('✨ WatermarkRemover v2 initialized — with colored watermark support');

})();
