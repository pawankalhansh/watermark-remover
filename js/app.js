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
  const processingTitle = $('.processing__title');
  const processingSubtitle = $('.processing__subtitle');
  const progressFill = $('#progressFill');
  const resultState = $('#resultState');
  const resultEngine = $('#resultEngine');

  // Result
  const resultBefore = $('#resultBefore');
  const resultAfter = $('#resultAfter');
  const resultSlider = $('#resultSlider');
  const resultComparison = $('#resultComparison');
  const downloadBtn = $('#downloadBtn');
  const downloadAllBtn = $('#downloadAllBtn');
  const touchUpBtn = $('#touchUpBtn');
  const resetBtn = $('#resetBtn');
  const batchResults = $('#batchResults');

  // Demo slider
  const demoSlider = $('#demoSlider');
  const demoAfter = $('#demoAfter');
  const demoDivider = $('#demoDivider');
  const demoHandle = $('#demoHandle');

  // Tabs
  const tabBtns = $$('.tabs__btn');

  // OpenCV.js State
  let openCvReady = false;
  const USE_CLOUD_AI = false;

  function waitForOpenCV() {
    return new Promise((resolve, reject) => {
      if (typeof cv !== 'undefined' && cv.Mat) {
        openCvReady = true;
        resolve();
        return;
      }
      showToast('Loading free browser repair engine... please wait a moment.');
      let secondsPassed = 0;
      const interval = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.Mat) {
          clearInterval(interval);
          openCvReady = true;
          resolve();
          return;
        }
        secondsPassed += 0.3;
        if (secondsPassed >= 30.0) {
          clearInterval(interval);
          reject(new Error('OpenCV.js load timeout'));
        }
      }, 300);
    });
  }

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
    if (files.length > 0) handleFiles(files);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFiles(e.target.files);
  });

  // ============================================
  // FILE HANDLING & PROCESSING
  // ============================================
  let originalImageData = null;
  let processedCanvas = null;
  let sourceImage = null;
  let processedItems = [];
  let activeItemIndex = -1;
  let currentEngineLabel = '';

  function isSupportedImageFile(file) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    return validTypes.includes(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read this image.'));
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve({ dataUrl: e.target.result, img });
        img.onerror = () => reject(new Error('This image format is not supported by your browser.'));
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(fileList) {
    const files = [...fileList];
    const validFiles = files.filter(file => isSupportedImageFile(file) && file.size <= 20 * 1024 * 1024);

    if (!validFiles.length) {
      showToast('Please upload JPG, PNG, WEBP, or browser-supported HEIC images under 20MB.');
      return;
    }

    if (validFiles.length !== files.length) {
      showToast('Some files were skipped because they are unsupported or over 20MB.', 4500);
    }

    exitBrushMode();
    uploadArea.style.display = 'none';
    resultState.classList.remove('active');
    processingState.classList.add('active');
    processedItems = [];
    activeItemIndex = -1;
    renderBatchResults();

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      processingTitle.textContent = `Removing watermark ${i + 1} of ${validFiles.length}...`;
      processingSubtitle.textContent = file.name;
      progressFill.style.width = '0%';

      try {
        const { dataUrl, img } = await readImageFile(file);
        const item = {
          id: `${Date.now()}-${i}`,
          name: file.name,
          originalData: dataUrl,
          sourceImage: img,
          processedCanvas: null,
          status: 'processing',
          engine: ''
        };
        processedItems.push(item);
        renderBatchResults();
        currentEngineLabel = '';
        item.processedCanvas = await startProcessing(img, i, validFiles.length);
        item.status = 'done';
        item.engine = currentEngineLabel;
        selectResult(processedItems.length - 1);
      } catch (err) {
        processedItems.push({
          id: `${Date.now()}-${i}`,
          name: file.name,
          originalData: '',
          sourceImage: null,
          processedCanvas: null,
          status: 'error',
          error: err.message || 'Could not process this image.'
        });
        showToast(`${file.name}: ${err.message || 'Could not process this image.'}`, 5000);
      }

      renderBatchResults();
    }

    processingState.classList.remove('active');
    const finished = processedItems.filter(item => item.status === 'done');
    if (finished.length) {
      resultState.classList.add('active');
      resultState.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast(`${finished.length} image${finished.length === 1 ? '' : 's'} ready for review.`, 3500);
    } else {
      uploadArea.style.display = '';
      showToast('No images could be processed. Try JPG, PNG, or WEBP.', 5000);
    }
  }

  async function startProcessing(img, batchIndex = 0, batchTotal = 1) {
    uploadArea.style.display = 'none';
    resultState.classList.remove('active');
    processingState.classList.add('active');
    progressFill.style.width = '0%';

    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 8;
      if (progress > 85) progress = 85;
      progressFill.style.width = progress + '%';
    }, 100);

    currentEngineLabel = 'Free browser repair';

    if (USE_CLOUD_AI) {
      try {
        const aiCanvas = await processImageWithBackendAI(img);
        progressFill.style.width = '100%';
        currentEngineLabel = 'Cloud AI repair';
        if (batchTotal === 1) showToast('Cloud repair complete. Review the result and use Touch Up if needed.');
        return aiCanvas;
      } catch (aiErr) {
        console.info('Backend repair unavailable, using browser engine:', aiErr);
        currentEngineLabel = `Free browser repair: ${aiErr.message || 'Cloud repair unavailable'}`;
        showToast(currentEngineLabel, 5000);
      }
    }

    try {
      await waitForOpenCV();
      progressFill.style.width = '90%';

      const canvas = processImageWithOpenCV(img);

      progressFill.style.width = '100%';
      if (!currentEngineLabel) currentEngineLabel = 'Free browser repair';
      if (batchTotal === 1) showToast('Watermark removed. Review the result and use Touch Up if needed.');
      return canvas;
    } catch (err) {
      console.error('OpenCV Inpainting failed, falling back to local interpolation:', err);
      console.error('Error details:', err.message, err.stack);
      currentEngineLabel = 'Browser fallback repair';
      showToast('Local repair mode used for one image.', 3000);
      return processImageLocal(img);
    } finally {
      clearInterval(progressInterval);
      progressFill.style.width = '100%';
    }
  }

  // ============================================
  // OPENCV.JS WATERMARK REPAIR ENGINE
  // Uses relative color deviation detection — not absolute HSV thresholds
  // ============================================
  function filterSmallComponents(maskData, w, h, minArea) {
    const parent = new Int32Array(w * h);
    const size = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      parent[i] = i;
      size[i] = 1;
    }

    function find(i) {
      let root = i;
      while (root !== parent[root]) {
        root = parent[root];
      }
      let curr = i;
      while (curr !== root) {
        let nxt = parent[curr];
        parent[curr] = root;
        curr = nxt;
      }
      return root;
    }

    function union(i, j) {
      let rootI = find(i);
      let rootJ = find(j);
      if (rootI !== rootJ) {
        if (size[rootI] < size[rootJ]) {
          parent[rootI] = rootJ;
          size[rootJ] += size[rootI];
        } else {
          parent[rootJ] = rootI;
          size[rootI] += size[rootJ];
        }
      }
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (maskData[idx]) {
          if (x > 0 && maskData[idx - 1]) union(idx, idx - 1);
          if (y > 0 && maskData[idx - w]) union(idx, idx - w);
        }
      }
    }

    let count = 0;
    for (let i = 0; i < w * h; i++) {
      if (maskData[i]) {
        if (size[find(i)] < minArea) {
          maskData[i] = 0;
        } else {
          count++;
        }
      }
    }
    return count;
  }

  function detectWatermarkMask(srcRGB, w, h, thresholds) {
    const { RED, BLUE, WHITE, WHITE_SAT_MAX } = thresholds;
    const blurred = new cv.Mat();
    cv.GaussianBlur(srcRGB, blurred, new cv.Size(21, 21), 0, 0, cv.BORDER_DEFAULT);
    
    const mask = cv.Mat.zeros(h, w, cv.CV_8UC1);
    const maskData = mask.data;
    const srcData = srcRGB.data;
    const blurData = blurred.data;

    for (let idx = 0; idx < w * h; idx++) {
      const i = idx * 3;
      const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2];
      const br = blurData[i], bg = blurData[i + 1], bb = blurData[i + 2];

      const rDiff = r - br;
      const gDiff = g - bg;
      const bDiff = b - bb;

      const redExcess = rDiff - 0.5 * (gDiff + bDiff);
      const blueExcess = bDiff - 0.5 * (rDiff + gDiff);
      
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const lumBlur = 0.299 * br + 0.587 * bg + 0.114 * bb;
      
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;

      const lightOverlay = Math.abs(lum - lumBlur) > WHITE && sat < WHITE_SAT_MAX;
      const darkOverlay = Math.abs(lumBlur - lum) > WHITE && sat < WHITE_SAT_MAX;

      if (redExcess > RED || blueExcess > BLUE || lightOverlay || darkOverlay) {
        maskData[idx] = 255;
      }
    }
    blurred.delete();
    return mask;
  }

  function processImageWithOpenCV(img) {
    const srcCanvas = createResizedCanvas(img, 4096);
    
    const srcMat = cv.imread(srcCanvas);
    const w = srcMat.cols;
    const h = srcMat.rows;
    const totalPixels = w * h;

    const srcRGB = new cv.Mat();
    cv.cvtColor(srcMat, srcRGB, cv.COLOR_RGBA2RGB);

    // ============================================
    // 1. Adaptive Detection
    // ============================================
    let thresholds = { RED: 12, BLUE: 12, WHITE: 6, WHITE_SAT_MAX: 0.18 };
    let combinedMask;
    let maskPixelCount = 0;
    let pct = 0;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (combinedMask) combinedMask.delete();
      combinedMask = detectWatermarkMask(srcRGB, w, h, thresholds);
      
      // Filter small noise blobs (connected components pure JS)
      maskPixelCount = filterSmallComponents(combinedMask.data, w, h, 20);
      pct = maskPixelCount / totalPixels;

      if (pct > 0.25) {
        if (attempt === 1) {
          thresholds.RED *= 2; thresholds.BLUE *= 2; thresholds.WHITE *= 2;
        } else if (attempt === 2) {
          thresholds.RED *= 2; thresholds.BLUE *= 2; thresholds.WHITE *= 2;
        } else {
          console.warn(`[WMR v3] Mask too large (${(pct*100).toFixed(2)}%), skipping inpainting to protect image`);
          showToast(`⚠️ Watermark detection captured too much (${(pct*100).toFixed(2)}%). Try Touch Up for manual removal.`, 5000);
          combinedMask.delete();
          srcRGB.delete();
          srcMat.delete();
          return srcCanvas;
        }
      } else {
        break;
      }
    }

    showToast(`🔍 Detected ${maskPixelCount} watermark pixels (${(pct*100).toFixed(2)}%)`, 4000);

    // ============================================
    // 2. Morphological processing: close gaps + dilate edges
    // ============================================
    let closeKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    let tempDilated = new cv.Mat();
    cv.dilate(combinedMask, tempDilated, closeKernel, new cv.Point(-1, -1), 1);
    let closedMask = new cv.Mat();
    cv.erode(tempDilated, closedMask, closeKernel, new cv.Point(-1, -1), 1);
    tempDilated.delete();
    combinedMask.delete();

    let dilateKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
    let dilatedMask = new cv.Mat();
    cv.dilate(closedMask, dilatedMask, dilateKernel, new cv.Point(-1, -1), 2);
    closedMask.delete();
    
    // ============================================
    // 3. Content-aware inpainting with better reconstruction
    // ============================================
    const dstRGB = new cv.Mat();
    cv.inpaint(srcRGB, dilatedMask, dstRGB, 5, cv.INPAINT_TELEA);

    // Better Edge Blending
    const softMask = new cv.Mat();
    cv.GaussianBlur(dilatedMask, softMask, new cv.Size(15, 15), 0, 0, cv.BORDER_DEFAULT);

    const finalResult = new cv.Mat();
    dstRGB.copyTo(finalResult);

    let finalData = finalResult.data;
    let srcData = srcRGB.data;
    let softData = softMask.data;

    for (let idx = 0; idx < w * h; idx++) {
      const alpha = softData[idx] / 255.0;
      if (alpha < 1.0 && alpha > 0) {
        const i = idx * 3;
        finalData[i]     = Math.round(alpha * finalData[i]     + (1 - alpha) * srcData[i]);
        finalData[i + 1] = Math.round(alpha * finalData[i + 1] + (1 - alpha) * srcData[i + 1]);
        finalData[i + 2] = Math.round(alpha * finalData[i + 2] + (1 - alpha) * srcData[i + 2]);
      } else if (alpha === 0) {
        const i = idx * 3;
        finalData[i]     = srcData[i];
        finalData[i + 1] = srcData[i + 1];
        finalData[i + 2] = srcData[i + 2];
      }
    }

    cv.imshow(srcCanvas, finalResult);

    // Deallocate ALL Wasm memory
    srcMat.delete();
    srcRGB.delete();
    closeKernel.delete();
    dilateKernel.delete();
    dilatedMask.delete();
    dstRGB.delete();
    softMask.delete();
    finalResult.delete();

    return srcCanvas;
  }
  function createResizedCanvas(img, maxDim) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
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
    return canvas;
  }

  async function processImageWithBackendAI(img) {
    const imageCanvas = createResizedCanvas(img, 1536);
    const mask = generateTransparentEditMaskCanvas(imageCanvas);
    const useMask = mask.coverage >= 0.001 && mask.coverage <= 0.35;
    const prompt = useMask
      ? `Detected watermark coverage is ${(mask.coverage * 100).toFixed(2)}%. Remove the watermark only from the transparent mask region.`
      : 'No reliable mask was detected. Inspect the entire image and remove all subtle repeated watermarks, logo stamps, proof marks, date stamps, and overlay text while preserving the original image content exactly.';

    const requestBody = {
      imageDataUrl: imageCanvas.toDataURL('image/png'),
      prompt
    };

    if (useMask) {
      requestBody.maskDataUrl = mask.canvas.toDataURL('image/png');
    }

    const response = await fetch('/api/inpaint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'AI backend failed');
    }

    return dataUrlToCanvas(payload.imageDataUrl);
  }

  function generateTransparentEditMaskCanvas(imageCanvas) {
    const w = imageCanvas.width;
    const h = imageCanvas.height;
    const srcCtx = imageCanvas.getContext('2d', { willReadFrequently: true });
    const source = srcCtx.getImageData(0, 0, w, h);
    const data = source.data;

    const blockSize = Math.max(15, Math.round(Math.min(w, h) / 45) | 1);
    const blurR = new Float32Array(w * h);
    const blurG = new Float32Array(w * h);
    const blurB = new Float32Array(w * h);
    computeLocalMedian(data, w, h, blockSize, blurR, blurG, blurB);

    const rawMask = new Uint8Array(w * h);
    const RED_THRESHOLD = 7;
    const BLUE_THRESHOLD = 7;
    const WHITE_THRESHOLD = 4;
    const DARK_THRESHOLD = 5;
    const WHITE_SAT_MAX = 0.35;
    let detectedCount = 0;

    for (let idx = 0; idx < w * h; idx++) {
      const i = idx * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const rDiff = r - blurR[idx];
      const gDiff = g - blurG[idx];
      const bDiff = b - blurB[idx];

      const redExcess = rDiff - 0.5 * (gDiff + bDiff);
      const blueExcess = bDiff - 0.5 * (rDiff + gDiff);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const lumBlur = 0.299 * blurR[idx] + 0.587 * blurG[idx] + 0.114 * blurB[idx];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;

      const darkOverlay = lumBlur - lum > DARK_THRESHOLD && sat < WHITE_SAT_MAX;
      const lightOverlay = Math.abs(lum - lumBlur) > WHITE_THRESHOLD && sat < WHITE_SAT_MAX;

      if (redExcess > RED_THRESHOLD || blueExcess > BLUE_THRESHOLD || lightOverlay || darkOverlay) {
        rawMask[idx] = 1;
        detectedCount++;
      }
    }

    const editMask = dilateMask(rawMask, w, h, 5);
    let editCount = 0;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImage = maskCtx.createImageData(w, h);

    for (let idx = 0; idx < w * h; idx++) {
      const i = idx * 4;
      maskImage.data[i] = 255;
      maskImage.data[i + 1] = 255;
      maskImage.data[i + 2] = 255;
      // OpenAI masks edit transparent areas, so detected watermark pixels get alpha 0.
      maskImage.data[i + 3] = editMask[idx] ? 0 : 255;
      if (editMask[idx]) editCount++;
    }

    maskCtx.putImageData(maskImage, 0, 0);
    return {
      canvas: maskCanvas,
      coverage: editCount / (w * h),
      rawCoverage: detectedCount / (w * h)
    };
  }

  function dataUrlToCanvas(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => reject(new Error('AI result could not be loaded.'));
      img.src = dataUrl;
    });
  }

  function generateDetectedMaskCanvas(img) {
    const canvas = createResizedCanvas(img, 4096);
    
    try {
      if (typeof cv !== 'undefined' && cv.Mat) {
        const srcMat = cv.imread(canvas);
        const w = srcMat.cols;
        const h = srcMat.rows;

        const srcRGB = new cv.Mat();
        cv.cvtColor(srcMat, srcRGB, cv.COLOR_RGBA2RGB);

        let thresholds = { RED: 12, BLUE: 12, WHITE: 6, WHITE_SAT_MAX: 0.18 };
        let combinedMask = detectWatermarkMask(srcRGB, w, h, thresholds);
        filterSmallComponents(combinedMask.data, w, h, 20);

        let closeKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
        let tempDilated = new cv.Mat();
        cv.dilate(combinedMask, tempDilated, closeKernel, new cv.Point(-1, -1), 1);
        let closedMask = new cv.Mat();
        cv.erode(tempDilated, closedMask, closeKernel, new cv.Point(-1, -1), 1);
        tempDilated.delete();
        combinedMask.delete();

        let dilateKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
        let dilatedMask = new cv.Mat();
        cv.dilate(closedMask, dilatedMask, dilateKernel, new cv.Point(-1, -1), 1);
        closedMask.delete();
        closeKernel.delete();
        dilateKernel.delete();

        cv.imshow(canvas, dilatedMask);

        srcMat.delete();
        srcRGB.delete();
        dilatedMask.delete();
      }
    } catch (e) {
      console.error("Mask canvas generation failed:", e);
    }
    return canvas;
  }

  // ============================================
  // ADVANCED CLIENT-SIDE WATERMARK REMOVAL (FALLBACK)
  // Pure inpainting approach — replaces watermark pixels with clean neighbor averages
  // ============================================
  function processImageLocal(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const maxDim = 4096;
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

    // ---- STEP 1: Compute local blurred background ----
    const blockSize = 21;
    const blurR = new Float32Array(w * h);
    const blurG = new Float32Array(w * h);
    const blurB = new Float32Array(w * h);

    computeLocalMedian(data, w, h, blockSize, blurR, blurG, blurB);

    // ---- STEP 2: Relative color deviation detection ----
    const watermarkMask = new Uint8Array(w * h);

    const RED_THRESHOLD = 8;
    const BLUE_THRESHOLD = 8;
    const WHITE_THRESHOLD = 5;
    const WHITE_SAT_MAX = 0.28;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const i = idx * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const rb = blurR[idx], gb = blurG[idx], bb = blurB[idx];
        const hsv = rgbToHsv(r, g, b);

        const rDiff = r - rb, gDiff = g - gb, bDiff = b - bb;

        // Red watermark: pixel redder than neighborhood
        const redExcess = rDiff - 0.5 * (gDiff + bDiff);
        const absoluteRedOverlay = ((hsv.h <= 15 || hsv.h >= 150) && hsv.s > 45 && hsv.v > 45) || (r > 70 && r > g * 1.18 && r > b * 1.18);
        if (redExcess > RED_THRESHOLD || absoluteRedOverlay) {
          watermarkMask[idx] = 1;
          continue;
        }

        // Blue watermark: pixel bluer than neighborhood
        const blueExcess = bDiff - 0.5 * (rDiff + gDiff);
        const absoluteBlueOverlay = (hsv.h >= 95 && hsv.h <= 140 && hsv.s > 45 && hsv.v > 45) || (b > 70 && b > r * 1.18 && b > g * 1.12);
        if (blueExcess > BLUE_THRESHOLD || absoluteBlueOverlay) {
          watermarkMask[idx] = 1;
          continue;
        }

        // White/gray watermark: brighter than neighborhood with low saturation
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const lumBlur = 0.299 * rb + 0.587 * gb + 0.114 * bb;
        const lumDiff = Math.abs(lum - lumBlur);
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC > 0 ? (maxC - minC) / maxC : 0;

        if (lumDiff > WHITE_THRESHOLD && sat < WHITE_SAT_MAX) {
          watermarkMask[idx] = 1;
        }
      }
    }

    // ---- STEP 3: Dilate mask by 2px ----
    const combinedDilated = dilateMask(watermarkMask, w, h, 4);

    // ---- STEP 4: Pure inpainting — replace ALL watermark pixels with clean neighbors ----
    const outputData = new Uint8ClampedArray(data);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (combinedDilated[idx]) {
          const i = idx * 4;
          const clean = getCleanNeighborWeighted(data, combinedDilated, x, y, w, h);
          outputData[i] = clean.r;
          outputData[i + 1] = clean.g;
          outputData[i + 2] = clean.b;
        }
      }
    }

    // ---- STEP 5: Smoothing pass on boundary pixels for natural blending ----
    const finalData = new Uint8ClampedArray(outputData);
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const idx = y * w + x;
        if (combinedDilated[idx]) {
          const i = idx * 4;
          let rS = 0, gS = 0, bS = 0, wS = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const ni = ((y + dy) * w + (x + dx)) * 4;
              const d = Math.abs(dx) + Math.abs(dy);
              const wt = d === 0 ? 6 : d <= 1 ? 4 : d <= 2 ? 2 : 1;
              rS += outputData[ni] * wt;
              gS += outputData[ni + 1] * wt;
              bS += outputData[ni + 2] * wt;
              wS += wt;
            }
          }
          finalData[i] = Math.round(rS / wS);
          finalData[i + 1] = Math.round(gS / wS);
          finalData[i + 2] = Math.round(bS / wS);
        }
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

  // ---- Helper: RGB to HSV (matches OpenCV HSV format: H 0-180, S 0-255, V 0-255) ----
  function rgbToHsv(r, g, b) {
    const rNorm = r / 255, gNorm = g / 255, bNorm = b / 255;
    const max = Math.max(rNorm, gNorm, bNorm), min = Math.min(rNorm, gNorm, bNorm);
    const d = max - min;
    const v = max;
    const s = max === 0 ? 0 : d / max;
    let h = 0;
    if (d !== 0) {
      if (max === rNorm) {
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
      } else if (max === gNorm) {
        h = (bNorm - rNorm) / d + 2;
      } else {
        h = (rNorm - gNorm) / d + 4;
      }
      h /= 6;
    }
    return {
      h: Math.round(h * 180),
      s: Math.round(s * 255),
      v: Math.round(v * 255)
    };
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
  function selectResult(index) {
    const item = processedItems[index];
    if (!item || item.status !== 'done' || !item.processedCanvas) return;

    activeItemIndex = index;
    originalImageData = item.originalData;
    processedCanvas = item.processedCanvas;
    sourceImage = item.sourceImage;

    resultBefore.src = item.originalData;
    resultAfter.src = item.processedCanvas.toDataURL('image/png');
    if (resultEngine) resultEngine.textContent = item.engine || '';
    updateResultSlider(50);
    renderBatchResults();
  }

  function renderBatchResults() {
    if (!batchResults) return;
    batchResults.innerHTML = '';

    processedItems.forEach((item, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `result__batch-item${index === activeItemIndex ? ' active' : ''} ${item.status}`;
      btn.disabled = item.status !== 'done';
      btn.title = item.error || item.name;

      const name = document.createElement('span');
      name.className = 'result__batch-name';
      name.textContent = item.name;

      const status = document.createElement('span');
      status.className = 'result__batch-status';
      status.textContent = item.status === 'done' ? 'Ready' : item.status === 'error' ? 'Failed' : 'Processing';

      btn.appendChild(name);
      btn.appendChild(status);
      btn.addEventListener('click', () => selectResult(index));
      batchResults.appendChild(btn);
    });

    if (downloadAllBtn) {
      const doneCount = processedItems.filter(item => item.status === 'done').length;
      downloadAllBtn.style.display = doneCount > 1 ? '' : 'none';
    }
  }

  function showResult(originalImg) {
    processingState.classList.remove('active');
    resultState.classList.add('active');

    resultBefore.src = originalImageData;
    resultAfter.src = processedCanvas.toDataURL('image/png');
    if (resultEngine) resultEngine.textContent = currentEngineLabel;

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
    $('#brushApplyBtn').addEventListener('click', async () => {
      showToast('Processing painted areas...', 2000);

      // Create a mask canvas with black background and white painted areas
      const brushMaskCanvas = document.createElement('canvas');
      brushMaskCanvas.width = brushCanvas.width;
      brushMaskCanvas.height = brushCanvas.height;
      const bmCtx = brushMaskCanvas.getContext('2d');
      bmCtx.fillStyle = 'black';
      bmCtx.fillRect(0, 0, brushCanvas.width, brushCanvas.height);
      bmCtx.drawImage(maskCanvas, 0, 0);

      try {
        await waitForOpenCV();

        // Convert canvases to OpenCV Mat
        const srcMat = cv.imread(brushCanvas); // 4 channels RGBA
        const maskMat = cv.imread(brushMaskCanvas);

        // 1. Convert source to 3 channels RGB (cv.inpaint requires 1 or 3 channels)
        const srcRGB = new cv.Mat();
        cv.cvtColor(srcMat, srcRGB, cv.COLOR_RGBA2RGB);

        // 2. Convert mask to grayscale (1 channel)
        const maskGray = new cv.Mat();
        cv.cvtColor(maskMat, maskGray, cv.COLOR_RGBA2GRAY);

        const dstRGB = new cv.Mat();
        // 3. Inpaint using Navier-Stokes (NS) algorithm (radius 2px) to preserve sharp textures
        cv.inpaint(srcRGB, maskGray, dstRGB, 2, cv.INPAINT_NS);

        // 4. Show back to brushCanvas
        cv.imshow(brushCanvas, dstRGB);

        // Clean up memory
        srcMat.delete();
        maskMat.delete();
        srcRGB.delete();
        maskGray.delete();
        dstRGB.delete();

        // Update processed canvas
        const pCtx = processedCanvas.getContext('2d');
        pCtx.drawImage(brushCanvas, 0, 0);

        // Update result image
        resultAfter.src = processedCanvas.toDataURL('image/png');

        // Clear paint overlays
        paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

        showToast('✅ Touch-up applied! Paint more or close when done.', 3000);
      } catch (err) {
        console.error('Local brush inpaint failed:', err);
        showToast('⚠️ Local engine warning. Using fallback.');
        runLocalBrushInpaint();
      }

      function runLocalBrushInpaint() {
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

        const dilatedPaint = dilateMask(paintMask, bw, bh, 1); // Tight 1px dilation for manual brush to prevent background distortion

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
      }
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
    if (processedCanvas) {
      resultAfter.src = processedCanvas.toDataURL('image/png');
    }
  }

  // ============================================
  // RESULT BEFORE/AFTER SLIDER
  // ============================================
  function updateResultSlider(percent) {
    percent = Math.max(0, Math.min(100, percent));
    resultSlider.style.left = percent + '%';
    resultAfter.style.clipPath = `inset(0 0 0 ${percent}%)`;
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
    const activeItem = processedItems[activeItemIndex];
    const link = document.createElement('a');
    link.download = `${activeItem ? activeItem.name.replace(/\.[^.]+$/, '') : 'image'}-watermark-removed.png`;
    link.href = processedCanvas.toDataURL('image/png');
    link.click();
    showToast('Image downloaded successfully! 🎉');
  });

  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', () => {
      const readyItems = processedItems.filter(item => item.status === 'done' && item.processedCanvas);
      readyItems.forEach((item, index) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.download = `${item.name.replace(/\.[^.]+$/, '')}-watermark-removed.png`;
          link.href = item.processedCanvas.toDataURL('image/png');
          link.click();
        }, index * 300);
      });
      showToast(`Downloading ${readyItems.length} images.`);
    });
  }

  // ============================================
  // TOUCH-UP BUTTON
  // ============================================
  if (touchUpBtn) {
    touchUpBtn.addEventListener('click', () => {
      if (!processedCanvas) return;
      initBrushMode();
    });
  }

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
    processedItems = [];
    activeItemIndex = -1;
    renderBatchResults();
    progressFill.style.width = '0%';
    uploadArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // ============================================
  // DEMO BEFORE/AFTER SLIDER
  // ============================================
  function updateDemoSlider(percent) {
    percent = Math.max(0, Math.min(100, percent));
    demoAfter.style.clipPath = `inset(0 0 0 ${percent}%)`;
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

  // ============================================
  // VIDEO WATERMARK REMOVER — UI INTEGRATION
  // ============================================

  // Mode tab switching
  const modeImageBtn = $('#modeImage');
  const modeVideoBtn = $('#modeVideo');
  const videoUploadArea = $('#videoUploadArea');
  const videoUploadZone = $('#videoUploadZone');
  const videoUploadBtn = $('#videoUploadBtn');
  const videoFileInput = $('#videoFileInput');
  const videoResultState = $('#videoResultState');
  const videoOriginal = $('#videoOriginal');
  const videoProcessed = $('#videoProcessed');
  const videoDownloadBtn = $('#videoDownloadBtn');
  const videoResetBtn = $('#videoResetBtn');
  const videoResultInfo = $('#videoResultInfo');
  const videoCompat = $('#videoCompat');

  let currentMode = 'image'; // 'image' or 'video'
  let videoProcessor = null;
  let processedVideoBlob = null;
  let originalVideoUrl = null;

  // Mode tab click handlers
  if (modeImageBtn && modeVideoBtn) {
    modeImageBtn.addEventListener('click', () => switchMode('image'));
    modeVideoBtn.addEventListener('click', () => switchMode('video'));
  }

  function switchMode(mode) {
    currentMode = mode;

    // Update tab appearance
    modeImageBtn.classList.toggle('mode-tabs__btn--active', mode === 'image');
    modeVideoBtn.classList.toggle('mode-tabs__btn--active', mode === 'video');

    // Show/hide upload zones
    if (uploadArea) uploadArea.style.display = mode === 'image' ? '' : 'none';
    if (videoUploadArea) videoUploadArea.style.display = mode === 'video' ? '' : 'none';

    // Hide results when switching
    if (resultState) resultState.classList.remove('active');
    if (videoResultState) videoResultState.classList.remove('active');
    if (processingState) processingState.classList.remove('active');

    // Check WebCodecs compatibility for video mode
    if (mode === 'video' && videoCompat) {
      const supported = typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined';
      videoCompat.style.display = supported ? 'none' : 'block';
      if (videoUploadBtn) videoUploadBtn.disabled = !supported;
    }
  }

  // Video upload handlers
  if (videoUploadBtn) {
    videoUploadBtn.addEventListener('click', () => videoFileInput.click());
  }

  if (videoFileInput) {
    videoFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleVideoFile(e.target.files[0]);
    });
  }

  if (videoUploadZone) {
    videoUploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      videoUploadZone.classList.add('dragover');
    });
    videoUploadZone.addEventListener('dragleave', () => {
      videoUploadZone.classList.remove('dragover');
    });
    videoUploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      videoUploadZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) handleVideoFile(e.dataTransfer.files[0]);
    });
    videoUploadZone.addEventListener('click', (e) => {
      if (e.target !== videoUploadBtn && !videoUploadBtn.contains(e.target)) {
        videoFileInput.click();
      }
    });
  }

  async function handleVideoFile(file) {
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!validTypes.includes(file.type) && !/\.(mp4|webm|mov)$/i.test(file.name)) {
      showToast('Please upload an MP4, WEBM, or MOV video file.');
      return;
    }

    if (file.size > 500 * 1024 * 1024) {
      showToast('Video file is too large. Maximum size is 500MB.');
      return;
    }

    // Check WebCodecs support
    if (typeof VideoDecoder === 'undefined') {
      showToast('Your browser does not support video processing. Use Chrome 94+ or Edge 94+.');
      return;
    }

    // Wait for OpenCV
    try {
      await waitForOpenCV();
    } catch (e) {
      showToast('OpenCV.js failed to load. Video processing requires OpenCV.');
      return;
    }

    // Show processing state
    videoUploadArea.style.display = 'none';
    if (videoResultState) videoResultState.classList.remove('active');
    processingState.classList.add('active');
    processingTitle.textContent = 'Processing video...';
    processingSubtitle.textContent = file.name;
    progressFill.style.width = '0%';

    // Store original video URL for before/after
    if (originalVideoUrl) URL.revokeObjectURL(originalVideoUrl);
    originalVideoUrl = URL.createObjectURL(file);

    try {
      videoProcessor = new window.VideoWatermarkRemover({
        onProgress: ({ phase, current, total, percent }) => {
          const phaseLabels = {
            demuxing: 'Analyzing video structure...',
            decoding: 'Decoding video frames...',
            processing: `Removing watermark — frame ${current}/${total}`,
            encoding: 'Re-encoding clean video...',
            muxing: 'Assembling final video...'
          };
          processingTitle.textContent = phaseLabels[phase] || 'Processing...';
          processingSubtitle.textContent = `${percent}% complete`;
          progressFill.style.width = `${percent}%`;
        },
        onError: (error) => {
          console.error('Video processing error:', error);
          showToast('⚠️ Video processing failed: ' + (error.message || error));
        }
      });

      processedVideoBlob = await videoProcessor.processVideo(file);

      // Show video result
      processingState.classList.remove('active');
      videoResultState.classList.add('active');

      videoOriginal.src = originalVideoUrl;
      const processedUrl = URL.createObjectURL(processedVideoBlob);
      videoProcessed.src = processedUrl;

      const sizeMB = (processedVideoBlob.size / (1024 * 1024)).toFixed(1);
      videoResultInfo.textContent = `Clean video ready — ${sizeMB} MB`;
      showToast('✅ Video watermark removed successfully!');

    } catch (err) {
      console.error('Video processing failed:', err);
      processingState.classList.remove('active');
      videoUploadArea.style.display = '';
      showToast('⚠️ ' + (err.message || 'Video processing failed'));
    }
  }

  // Video download
  if (videoDownloadBtn) {
    videoDownloadBtn.addEventListener('click', () => {
      if (!processedVideoBlob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(processedVideoBlob);
      a.download = 'watermark-removed.mp4';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      showToast('⬇️ Video downloaded!');
    });
  }

  // Video reset
  if (videoResetBtn) {
    videoResetBtn.addEventListener('click', () => {
      if (videoResultState) videoResultState.classList.remove('active');
      videoUploadArea.style.display = '';
      processedVideoBlob = null;
      if (originalVideoUrl) {
        URL.revokeObjectURL(originalVideoUrl);
        originalVideoUrl = null;
      }
      videoOriginal.src = '';
      videoProcessed.src = '';
      videoFileInput.value = '';
      switchMode('video');
    });
  }

  console.log('✨ WatermarkRemover v4 initialized — image + video support');

})();
