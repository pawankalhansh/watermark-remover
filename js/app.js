/**
 * Watermark Remover — Main Application Logic
 * Handles: Upload, Watermark Removal, Before/After Slider, FAQ, Animations
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
        // Show "coming soon" toast
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

  // Drag events
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

  function handleFile(file) {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Please upload a JPG, PNG, or WEBP image.');
      return;
    }

    // Validate size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      showToast('Image size must be under 20MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        originalImageData = e.target.result;
        startProcessing(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function startProcessing(img) {
    // Show processing state
    uploadArea.style.display = 'none';
    resultState.classList.remove('active');
    processingState.classList.add('active');
    progressFill.style.width = '0%';

    // Animate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90;
      progressFill.style.width = progress + '%';
    }, 200);

    // Process image (simulate AI processing time)
    setTimeout(() => {
      processedCanvas = processImage(img);

      // Complete progress
      clearInterval(progressInterval);
      progressFill.style.width = '100%';

      setTimeout(() => {
        showResult(img);
      }, 400);
    }, 1500 + Math.random() * 1000);
  }

  // ============================================
  // CLIENT-SIDE WATERMARK REMOVAL
  // Uses inpainting algorithm on Canvas
  // ============================================
  function processImage(img) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Limit canvas size for performance
    const maxDim = 2048;
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

    // Watermark detection & removal algorithm:
    // 1. Detect semi-transparent bright regions (common watermark pattern)
    // 2. Apply neighborhood averaging to replace those pixels

    // Pass 1: Detect potential watermark pixels
    const watermarkMask = new Uint8Array(w * h);
    const brightnessThreshold = 200;
    const saturationThreshold = 30;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];

        // Calculate brightness and saturation
        const brightness = (r + g + b) / 3;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const saturation = maxC === 0 ? 0 : ((maxC - minC) / maxC) * 255;

        // Detect bright, low-saturation pixels (typical of white/gray watermarks)
        if (brightness > brightnessThreshold && saturation < saturationThreshold) {
          // Check if this pixel region has high contrast with neighbors
          const neighbors = getNeighborAvg(data, x, y, w, h, 3);
          const contrast = Math.abs(brightness - neighbors.brightness);

          if (contrast > 40) {
            watermarkMask[y * w + x] = 1;
          }
        }
      }
    }

    // Dilate the mask slightly
    const dilatedMask = dilateMask(watermarkMask, w, h, 2);

    // Pass 2: Inpaint masked pixels using neighbor interpolation
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (dilatedMask[y * w + x]) {
          const i = (y * w + x) * 4;
          const avg = getCleanNeighborAvg(data, dilatedMask, x, y, w, h, 8);
          data[i] = avg.r;
          data[i + 1] = avg.g;
          data[i + 2] = avg.b;
        }
      }
    }

    // Apply subtle smoothing pass on modified regions
    const smoothedData = new Uint8ClampedArray(data);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (dilatedMask[y * w + x]) {
          const i = (y * w + x) * 4;
          // 3x3 Gaussian-like blur
          let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const ni = ((y + dy) * w + (x + dx)) * 4;
              const weight = (dx === 0 && dy === 0) ? 4 : (Math.abs(dx) + Math.abs(dy) === 1 ? 2 : 1);
              rSum += data[ni] * weight;
              gSum += data[ni + 1] * weight;
              bSum += data[ni + 2] * weight;
              wSum += weight;
            }
          }
          smoothedData[i] = rSum / wSum;
          smoothedData[i + 1] = gSum / wSum;
          smoothedData[i + 2] = bSum / wSum;
        }
      }
    }

    const newImageData = new ImageData(smoothedData, w, h);
    ctx.putImageData(newImageData, 0, 0);

    return canvas;
  }

  function getNeighborAvg(data, x, y, w, h, radius) {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const ni = (ny * w + nx) * 4;
          rSum += data[ni];
          gSum += data[ni + 1];
          bSum += data[ni + 2];
          count++;
        }
      }
    }
    return {
      r: rSum / count,
      g: gSum / count,
      b: bSum / count,
      brightness: (rSum + gSum + bSum) / (count * 3)
    };
  }

  function getCleanNeighborAvg(data, mask, x, y, w, h, radius) {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          // Only use non-watermark pixels
          if (!mask[ny * w + nx]) {
            const ni = (ny * w + nx) * 4;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const weight = 1 / (dist + 0.5);
            rSum += data[ni] * weight;
            gSum += data[ni + 1] * weight;
            bSum += data[ni + 2] * weight;
            count += weight;
          }
        }
      }
    }
    if (count === 0) {
      const i = (y * w + x) * 4;
      return { r: data[i], g: data[i + 1], b: data[i + 2] };
    }
    return {
      r: Math.round(rSum / count),
      g: Math.round(gSum / count),
      b: Math.round(bSum / count)
    };
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
                dilated[ny * w + nx] = 1;
              }
            }
          }
        }
      }
    }
    return dilated;
  }

  // ============================================
  // SHOW RESULT
  // ============================================
  function showResult(originalImg) {
    processingState.classList.remove('active');
    resultState.classList.add('active');

    // Set images
    resultBefore.src = originalImageData;
    resultAfter.src = processedCanvas.toDataURL('image/png');

    // Reset slider to center
    updateResultSlider(50);

    // Scroll to result
    resultState.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    resultState.classList.remove('active');
    processingState.classList.remove('active');
    uploadArea.style.display = '';
    fileInput.value = '';
    originalImageData = null;
    processedCanvas = null;
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

  // Initialize demo slider at 50%
  updateDemoSlider(50);

  // ============================================
  // FAQ ACCORDION
  // ============================================
  $$('.faq__question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq__item');
      const isActive = item.classList.contains('active');

      // Close all
      $$('.faq__item').forEach(i => i.classList.remove('active'));
      $$('.faq__question').forEach(q => q.setAttribute('aria-expanded', 'false'));

      // Toggle current
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
  // INITIAL SETUP
  // ============================================
  console.log('✨ WatermarkRemover initialized');

})();
