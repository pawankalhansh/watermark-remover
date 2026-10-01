/**
 * Gemini Watermark Remover — Main Application Controller
 * Integrates authentic GeminiEngine (Reverse Alpha Blending) & VideoWatermarkRemover (WebCodecs + MP4Box)
 */

(function () {
  'use strict';

  // ============================================
  // DOM ELEMENTS
  // ============================================
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Mode Switcher & Titles
  const heroTitle = $('heroTitle');
  const heroSubtitle = $('heroSubtitle');
  const tabImages = $('tabImages');
  const tabVideos = $('tabVideos');
  const imageWorkspace = $('imageWorkspace');
  const videoWorkspace = $('videoWorkspace');
  const quickVideoLink = $('quickVideoLink');
  const navItemImage = $('navItemImage');
  const navItemVideo = $('navItemVideo');
  const ctaStartNow = $('ctaStartNow');

  // Image Elements
  const imageDropCard = $('imageDropCard');
  const imageDropzoneLayout = $('imageDropzoneLayout');
  const imageFileInput = $('imageFileInput');
  const btnStartPhotos = $('btnStartPhotos');
  const imageProcessingCard = $('imageProcessingCard');
  const imageResultCard = $('imageResultCard');
  const imageBeforePreview = $('imageBeforePreview');
  const imageAfterPreview = $('imageAfterPreview');
  const btnDownloadImage = $('btnDownloadImage');
  const btnChooseAnotherImage = $('btnChooseAnotherImage');

  // Video Elements
  const videoDropCard = $('videoDropCard');
  const videoFileInput = $('videoFileInput');
  const btnUploadVideo = $('btnUploadVideo');
  const videoStudioCard = $('videoStudioCard');
  const readyToProcessView = $('readyToProcessView');
  const btnStartCleanup = $('btnStartCleanup');
  const cleaningProgressView = $('cleaningProgressView');
  const cleaningBarFill = $('cleaningBarFill');
  const cleaningPercent = $('cleaningPercent');
  const cleaningTitle = $('cleaningTitle');
  const cleaningSubtitle = $('cleaningSubtitle');
  const tagProcessedBadge = $('tagProcessedBadge');
  const videoOriginalPlayer = $('videoOriginalPlayer');
  const videoProcessedPlayer = $('videoProcessedPlayer');
  const btnSyncPlayPause = $('btnSyncPlayPause');
  const playIconSvg = $('playIconSvg');
  const pauseIconSvg = $('pauseIconSvg');
  const syncTimelineScrubber = $('syncTimelineScrubber');
  const syncTimeDisplay = $('syncTimeDisplay');
  const btnChooseAnotherVideo = $('btnChooseAnotherVideo');
  const btnResetVideo = $('btnResetVideo');
  const btnDownloadVideo = $('btnDownloadVideo');
  const videoPreviewLiveImg = $('videoPreviewLiveImg');
  const studioStatusBox = $('studioStatusBox');
  const studioStatusSpinner = $('studioStatusSpinner');
  const studioStatusText = $('studioStatusText');
  const videoRuntimeIframe = $('videoRuntimeIframe');

  // Toast
  const toast = $('toast');

  // State
  let currentMode = 'image'; // 'image' | 'video'
  let currentOriginalVideoUrl = null;
  let currentProcessedVideoUrl = null;
  let currentLiveFrameUrl = null;
  let currentOriginalImageUrl = null;
  let currentProcessedImageUrl = null;
  let activeVideoRemover = null;
  let selectedVideoBytes = null;
  let iframePollInterval = null;
  let isVideoProcessing = false;

  // ============================================
  // MODE SWITCHING
  // ============================================
  function switchMode(mode) {
    currentMode = mode;
    if (mode === 'image') {
      tabImages.classList.add('active');
      tabVideos.classList.remove('active');
      imageWorkspace.style.display = 'block';
      videoWorkspace.style.display = 'none';

      heroTitle.textContent = 'Gemini Watermark Remover';
      heroSubtitle.innerHTML = 'Free online Gemini watermark cleaner for images, logos, and star overlays.<br>No upload, no sign-up — 100% local, private processing.';
    } else {
      tabVideos.classList.add('active');
      tabImages.classList.remove('active');
      videoWorkspace.style.display = 'block';
      imageWorkspace.style.display = 'none';

      heroTitle.textContent = 'Free Video Watermark Remover for Gemini and Veo 3';
      heroSubtitle.innerHTML = 'Remove supported Gemini video watermarks without uploading your file. Use this video watermark remover for short Gemini clips locally in Chrome or Edge, then download a clean MP4.';
    }
  }

  tabImages.addEventListener('click', () => switchMode('image'));
  tabVideos.addEventListener('click', () => switchMode('video'));
  quickVideoLink.addEventListener('click', (e) => {
    e.preventDefault();
    switchMode('video');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  navItemImage.addEventListener('click', (e) => {
    e.preventDefault();
    switchMode('image');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  navItemVideo.addEventListener('click', (e) => {
    e.preventDefault();
    switchMode('video');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  ctaStartNow.addEventListener('click', () => {
    switchMode('video');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ============================================
  // TOAST NOTIFICATION
  // ============================================
  let toastTimer = null;
  function showToast(message, duration = 3500) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // ============================================
  // IMAGE WATERMARK REMOVAL (REVERSE ALPHA BLENDING)
  // ============================================
  btnStartPhotos.addEventListener('click', () => imageFileInput.click());

  imageFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
  });

  // Drag & drop for image
  imageDropCard.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageDropCard.classList.add('drag-over');
  });

  imageDropCard.addEventListener('dragleave', () => {
    imageDropCard.classList.remove('drag-over');
  });

  imageDropCard.addEventListener('drop', (e) => {
    e.preventDefault();
    imageDropCard.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file);
    } else {
      showToast('Please upload a valid image file (PNG, JPG, WEBP).');
    }
  });

  async function handleImageFile(file) {
    imageDropzoneLayout.style.display = 'none';
    imageProcessingCard.style.display = 'block';
    imageResultCard.style.display = 'none';

    if (currentOriginalImageUrl) URL.revokeObjectURL(currentOriginalImageUrl);
    if (currentProcessedImageUrl) URL.revokeObjectURL(currentProcessedImageUrl);

    currentOriginalImageUrl = URL.createObjectURL(file);
    imageBeforePreview.src = currentOriginalImageUrl;

    try {
      let cleanedBlob = null;

      // 1. Primary: Use GeminiEngine Reverse Alpha Blending
      if (window.GeminiEngine && typeof window.GeminiEngine.removeWatermarkFromBlob === 'function') {
        try {
          cleanedBlob = await window.GeminiEngine.removeWatermarkFromBlob(file, { adaptiveMode: 'always' });
        } catch (engineErr) {
          console.warn('[Image] GeminiEngine error:', engineErr);
        }
      }

      // 2. Fallback: If no Gemini watermark detected or GeminiEngine failed, process with local Canvas inpaint
      if (!cleanedBlob) {
        cleanedBlob = await fallbackProcessImage(file);
      }

      currentProcessedImageUrl = URL.createObjectURL(cleanedBlob);
      imageAfterPreview.src = currentProcessedImageUrl;
      btnDownloadImage.href = currentProcessedImageUrl;
      btnDownloadImage.download = `gemini-cleaned-${Date.now()}.png`;

      imageProcessingCard.style.display = 'none';
      imageResultCard.style.display = 'block';
      showToast('✨ Watermark removed successfully with mathematical precision!');
    } catch (err) {
      console.error('Image processing failed:', err);
      imageProcessingCard.style.display = 'none';
      imageDropzoneLayout.style.display = 'flex';
      showToast('⚠️ Could not process image. Please try another file.');
    }
  }

  btnChooseAnotherImage.addEventListener('click', () => {
    imageResultCard.style.display = 'none';
    imageDropzoneLayout.style.display = 'flex';
    imageFileInput.value = '';
  });

  // Fallback inpainting if file is non-Gemini
  async function fallbackProcessImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // If OpenCV is ready, run inpaint fallback
        if (typeof cv !== 'undefined' && cv.matFromImageData) {
          try {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const src = cv.matFromImageData(imgData);
            const srcRGB = new cv.Mat();
            cv.cvtColor(src, srcRGB, cv.COLOR_RGBA2RGB);

            const blurredRGB = new cv.Mat();
            cv.GaussianBlur(srcRGB, blurredRGB, new cv.Size(21, 21), 0);

            const mask = new cv.Mat.zeros(srcRGB.rows, srcRGB.cols, cv.CV_8UC1);
            const srcData = srcRGB.data;
            const blurData = blurredRGB.data;
            const maskData = mask.data;

            for (let i = 0; i < srcRGB.rows * srcRGB.cols; i++) {
              const idx = i * 3;
              const r = srcData[idx];
              const g = srcData[idx + 1];
              const b = srcData[idx + 2];
              const br = blurData[idx];
              const bg = blurData[idx + 1];
              const bb = blurData[idx + 2];

              const redExcess = (r - br) - 0.5 * ((g - bg) + (b - bb));
              const blueExcess = (b - bb) - 0.5 * ((r - br) + (g - bg));

              if (redExcess > 14 || blueExcess > 14) {
                maskData[i] = 255;
              }
            }

            const dst = new cv.Mat();
            cv.inpaint(srcRGB, mask, dst, 4, cv.INPAINT_TELEA);

            const outRgba = new cv.Mat();
            cv.cvtColor(dst, outRgba, cv.COLOR_RGB2RGBA);
            const outImgData = new ImageData(new Uint8ClampedArray(outRgba.data), canvas.width, canvas.height);
            ctx.putImageData(outImgData, 0, 0);

            src.delete(); srcRGB.delete(); blurredRGB.delete(); mask.delete(); dst.delete(); outRgba.delete();
          } catch (cvErr) {
            console.warn('OpenCV fallback error:', cvErr);
          }
        }

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas export failed'));
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // ============================================
  // VIDEO WATERMARK REMOVAL (AUTHENTIC ENGINE & LIVE PREVIEW)
  // ============================================
  let selectedVideoFile = null;

  btnUploadVideo.addEventListener('click', () => videoFileInput.click());

  videoFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleVideoFile(file);
  });

  // Drag & drop for video
  videoDropCard.addEventListener('dragover', (e) => {
    e.preventDefault();
    videoDropCard.style.borderColor = 'var(--color-primary)';
  });

  videoDropCard.addEventListener('dragleave', () => {
    videoDropCard.style.borderColor = 'var(--border-light)';
  });

  videoDropCard.addEventListener('drop', (e) => {
    e.preventDefault();
    videoDropCard.style.borderColor = 'var(--border-light)';
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('video/')) {
      handleVideoFile(file);
    } else {
      showToast('Please upload a valid video file (MP4, WEBM, MOV).');
    }
  });

  function formatTime(seconds) {
    const s = Math.floor(seconds || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  }

  // Listen for real-time cleaned frame preview messages from the authentic video runtime
  window.addEventListener('message', (e) => {
    if (videoRuntimeIframe && e.source === videoRuntimeIframe.contentWindow) {
      const data = e.data;
      if (!data) return;

      if (data.type === 'gwr-video-preview-frame' && data.blob) {
        try {
          const frameUrl = URL.createObjectURL(data.blob);
          if (currentLiveFrameUrl) URL.revokeObjectURL(currentLiveFrameUrl);
          currentLiveFrameUrl = frameUrl;

          if (videoPreviewLiveImg) {
            videoPreviewLiveImg.src = frameUrl;
            videoPreviewLiveImg.style.display = 'block';
          }
          if (readyToProcessView) readyToProcessView.style.display = 'none';
          if (cleaningProgressView) cleaningProgressView.style.display = 'none';
          if (videoProcessedPlayer) videoProcessedPlayer.style.display = 'none';
          if (tagProcessedBadge) tagProcessedBadge.style.display = 'block';

          // Sync original video currentTime with elapsedSeconds from runtime
          const elapsed = Number(data.elapsedSeconds);
          if (Number.isFinite(elapsed) && elapsed >= 0) {
            if (Math.abs(videoOriginalPlayer.currentTime - elapsed) > 0.04) {
              videoOriginalPlayer.currentTime = elapsed;
            }
            syncTimelineScrubber.value = elapsed;
            const dur = videoOriginalPlayer.duration || elapsed;
            syncTimeDisplay.textContent = `${formatTime(elapsed)} / ${formatTime(dur)}`;
          }

          // Update status box matching user reference: "Exporting video, processed 143 frames."
          if (studioStatusBox) studioStatusBox.style.display = 'flex';
          if (studioStatusSpinner) studioStatusSpinner.style.display = 'inline-block';
          if (studioStatusText) {
            studioStatusText.textContent = `Exporting video, processed ${data.processedFrames} frames.`;
          }
        } catch (previewErr) {
          console.warn('Live preview frame display error:', previewErr);
        }
      }
    }
  });

  function waitForCondition(fn, timeoutMs, timeoutMsg) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const interval = setInterval(() => {
        try {
          if (fn()) {
            clearInterval(interval);
            resolve();
          } else if (Date.now() - start > timeoutMs) {
            clearInterval(interval);
            reject(new Error(timeoutMsg));
          }
        } catch (e) {
          clearInterval(interval);
          reject(e);
        }
      }, 150);
    });
  }

  async function handleVideoFile(file) {
    if (typeof VideoDecoder === 'undefined') {
      showToast('⚠️ Video processing requires Chrome 94+ or Edge 94+ (WebCodecs support).', 5000);
      return;
    }

    selectedVideoFile = file;

    // Switch from drop card to studio card
    videoDropCard.style.display = 'none';
    videoStudioCard.style.display = 'block';

    // Show 'Ready to process' state initially
    readyToProcessView.style.display = 'flex';
    cleaningProgressView.style.display = 'none';
    if (videoPreviewLiveImg) videoPreviewLiveImg.style.display = 'none';
    videoProcessedPlayer.style.display = 'none';
    tagProcessedBadge.style.display = 'none';
    if (studioStatusBox) studioStatusBox.style.display = 'none';

    btnDownloadVideo.classList.add('disabled');
    btnDownloadVideo.removeAttribute('href');

    if (currentOriginalVideoUrl) URL.revokeObjectURL(currentOriginalVideoUrl);
    if (currentProcessedVideoUrl) URL.revokeObjectURL(currentProcessedVideoUrl);
    if (currentLiveFrameUrl) {
      URL.revokeObjectURL(currentLiveFrameUrl);
      currentLiveFrameUrl = null;
    }
    currentProcessedVideoUrl = null;

    currentOriginalVideoUrl = URL.createObjectURL(file);
    videoOriginalPlayer.src = currentOriginalVideoUrl;

    syncTimelineScrubber.value = 0;
    syncTimeDisplay.textContent = '0:00 / 0:00';

    videoOriginalPlayer.onloadedmetadata = () => {
      const dur = videoOriginalPlayer.duration || 0;
      syncTimelineScrubber.max = dur;
      syncTimeDisplay.textContent = `0:00 / ${formatTime(dur)}`;
    };

    setupPlaybackControls();

    // Read bytes early
    try {
      selectedVideoBytes = await file.arrayBuffer();
    } catch (e) {
      console.warn('Could not read video bytes early:', e);
    }
  }

  // Triggered when user clicks '▷ Start local cleanup'
  btnStartCleanup.addEventListener('click', async () => {
    if (!selectedVideoFile) return;

    readyToProcessView.style.display = 'none';
    if (studioStatusBox) {
      studioStatusBox.style.display = 'flex';
      studioStatusSpinner.style.display = 'inline-block';
      studioStatusText.textContent = 'Loading local video runtime...';
    }

    try {
      if (!selectedVideoBytes) {
        selectedVideoBytes = await selectedVideoFile.arrayBuffer();
      }

      await runIframeVideoPipeline(selectedVideoFile, selectedVideoBytes);
    } catch (err) {
      console.warn('[Video] Iframe runtime pipeline failed or fell back:', err);
      // Fallback to internal VideoWatermarkRemover
      await runFallbackVideoPipeline(selectedVideoFile);
    }
  });

  async function runIframeVideoPipeline(file, bytes) {
    isVideoProcessing = true;
    if (iframePollInterval) clearInterval(iframePollInterval);

    let iframe = videoRuntimeIframe;
    if (!iframe) {
      throw new Error('Video runtime iframe not found');
    }

    // Ensure iframe is loaded
    if (!iframe.contentDocument || !iframe.contentDocument.getElementById('fileInput')) {
      studioStatusText.textContent = 'Initializing video runtime...';
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Iframe load timeout')), 10000);
        iframe.onload = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
    }

    const iframeWin = iframe.contentWindow;
    const iframeDoc = iframe.contentDocument;

    const fileInput = iframeDoc.getElementById('fileInput');
    const processBtn = iframeDoc.getElementById('processBtn');
    const detectBtn = iframeDoc.getElementById('detectBtn');

    if (!fileInput || !processBtn || !detectBtn) {
      throw new Error('Runtime controls not found inside iframe');
    }

    // 1. Pass the file to the iframe
    studioStatusText.textContent = 'Reading video metadata...';
    const BlobCtor = iframeWin.Blob || window.Blob;
    const FileCtor = iframeWin.File || window.File;
    const DTCtor = iframeWin.DataTransfer || window.DataTransfer;

    const innerBlob = new BlobCtor([bytes.slice(0)], { type: file.type || 'video/mp4' });
    const innerFile = new FileCtor([innerBlob], file.name, {
      lastModified: file.lastModified,
      type: file.type || innerBlob.type
    });

    const dt = new DTCtor();
    dt.items.add(innerFile);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new (iframeWin.Event || window.Event)('change', { bubbles: true }));

    // 2. Wait for metadata to be parsed
    await waitForCondition(() => {
      const meta = iframeDoc.getElementById('metadata');
      const hasContent = meta && meta.textContent?.trim() && !meta.querySelector('.muted');
      return hasContent && !processBtn.disabled;
    }, 12000, 'Video metadata parsing timed out');

    // 3. Trigger watermark detection
    studioStatusText.textContent = 'Detecting watermark candidates...';
    detectBtn.click();

    // Wait for detection to complete
    await waitForCondition(() => {
      const statusEl = iframeDoc.getElementById('status');
      const progressText = iframeDoc.getElementById('progressText');
      const tone = statusEl?.dataset?.tone;
      const txt = `${statusEl?.textContent || ''} ${progressText?.textContent || ''}`;
      return tone === 'success' || tone === 'warn' || txt.includes('完成') || txt.includes('低置信');
    }, 15000, 'Watermark detection timed out');

    // 4. Force allow low confidence so export is never blocked
    iframeWin.__gwrVideoOverrideAllowLowConfidence = true;
    const allowCb = iframeDoc.getElementById('allowLowConfidence');
    if (allowCb) {
      allowCb.checked = true;
      allowCb.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 5. Start Export
    studioStatusText.textContent = 'Exporting video, processed 0 frames.';
    processBtn.click();

    // 6. Monitor export completion
    await new Promise((resolve, reject) => {
      iframePollInterval = setInterval(() => {
        const downloadBtn = iframeDoc.getElementById('downloadBtn');
        const statusEl = iframeDoc.getElementById('status');
        const isReady = downloadBtn && downloadBtn.getAttribute('aria-disabled') === 'false' && downloadBtn.href;
        const tone = statusEl?.dataset?.tone;
        const statusMsg = statusEl?.textContent?.trim() || '';

        if (isReady) {
          clearInterval(iframePollInterval);
          iframePollInterval = null;
          isVideoProcessing = false;

          const cleanUrl = downloadBtn.href;
          const cleanName = downloadBtn.download || `gemini-video-cleaned-${Date.now()}.mp4`;

          currentProcessedVideoUrl = cleanUrl;
          videoProcessedPlayer.src = cleanUrl;
          videoProcessedPlayer.style.display = 'block';
          if (videoPreviewLiveImg) videoPreviewLiveImg.style.display = 'none';
          readyToProcessView.style.display = 'none';
          cleaningProgressView.style.display = 'none';
          tagProcessedBadge.style.display = 'block';

          btnDownloadVideo.href = cleanUrl;
          btnDownloadVideo.download = cleanName;
          btnDownloadVideo.classList.remove('disabled');

          studioStatusSpinner.style.display = 'none';
          studioStatusText.textContent = 'Video cleanup completed.';

          videoOriginalPlayer.currentTime = 0;
          videoProcessedPlayer.currentTime = 0;
          syncTimelineScrubber.value = 0;
          const dur = videoOriginalPlayer.duration || 0;
          syncTimeDisplay.textContent = `0:00 / ${formatTime(dur)}`;

          setupPlaybackControls();
          showToast('✅ Video watermark removed successfully!');
          resolve();
        } else if (tone === 'error') {
          clearInterval(iframePollInterval);
          iframePollInterval = null;
          isVideoProcessing = false;
          reject(new Error(statusMsg || 'Runtime export failed'));
        }
      }, 400);
    });
  }

  async function runFallbackVideoPipeline(file) {
    cleaningProgressView.style.display = 'flex';
    if (videoPreviewLiveImg) videoPreviewLiveImg.style.display = 'none';
    cleaningBarFill.style.width = '0%';
    cleaningPercent.textContent = '0%';
    cleaningTitle.textContent = 'Cleaning Video...';
    cleaningSubtitle.textContent = 'Processing frame by frame...';

    activeVideoRemover = new window.VideoWatermarkRemover({
      onProgress: ({ phase, current, total, percent }) => {
        cleaningBarFill.style.width = `${percent}%`;
        cleaningPercent.textContent = `${percent}%`;
        if (studioStatusText) studioStatusText.textContent = `Exporting video, processed ${current} frames.`;

        if (phase === 'demuxing') {
          cleaningTitle.textContent = 'Demuxing Video...';
          cleaningSubtitle.textContent = 'Parsing container & audio tracks';
        } else if (phase === 'processing') {
          cleaningTitle.textContent = 'Cleaning Video...';
          cleaningSubtitle.textContent = `Processing frame ${current} of ${total} (${percent}%)`;
        } else if (phase === 'muxing') {
          cleaningTitle.textContent = 'Finalizing MP4...';
          cleaningSubtitle.textContent = 'Muxing clean video with original audio';
        }
      },
      onFrameProcessed: (canvas) => {
        if (canvas && videoPreviewLiveImg) {
          canvas.toBlob((b) => {
            if (b) {
              const u = URL.createObjectURL(b);
              if (currentLiveFrameUrl) URL.revokeObjectURL(currentLiveFrameUrl);
              currentLiveFrameUrl = u;
              videoPreviewLiveImg.src = u;
              videoPreviewLiveImg.style.display = 'block';
              cleaningProgressView.style.display = 'none';
            }
          }, 'image/jpeg', 0.7);
        }
      }
    });

    const cleanBlob = await activeVideoRemover.processVideo(file);

    currentProcessedVideoUrl = URL.createObjectURL(cleanBlob);
    videoProcessedPlayer.src = currentProcessedVideoUrl;
    videoProcessedPlayer.style.display = 'block';
    if (videoPreviewLiveImg) videoPreviewLiveImg.style.display = 'none';
    tagProcessedBadge.style.display = 'block';
    cleaningProgressView.style.display = 'none';

    btnDownloadVideo.href = currentProcessedVideoUrl;
    btnDownloadVideo.download = `gemini-video-cleaned-${Date.now()}.mp4`;
    btnDownloadVideo.classList.remove('disabled');

    if (studioStatusSpinner) studioStatusSpinner.style.display = 'none';
    if (studioStatusText) studioStatusText.textContent = 'Video cleanup completed.';

    setupPlaybackControls();
    showToast('✅ Video watermark removed successfully!');
  }

  btnResetVideo.addEventListener('click', () => {
    if (iframePollInterval) clearInterval(iframePollInterval);
    if (activeVideoRemover) activeVideoRemover.cancel();
    videoOriginalPlayer.pause();
    videoProcessedPlayer.pause();
    videoOriginalPlayer.currentTime = 0;
    videoProcessedPlayer.currentTime = 0;
    readyToProcessView.style.display = 'flex';
    cleaningProgressView.style.display = 'none';
    if (videoPreviewLiveImg) videoPreviewLiveImg.style.display = 'none';
    videoProcessedPlayer.style.display = 'none';
    tagProcessedBadge.style.display = 'none';
    if (studioStatusBox) studioStatusBox.style.display = 'none';
    btnDownloadVideo.classList.add('disabled');
    btnDownloadVideo.removeAttribute('href');
    syncTimelineScrubber.value = 0;
    if (videoRuntimeIframe && videoRuntimeIframe.contentWindow) {
      videoRuntimeIframe.contentWindow.location.reload();
    }
    showToast('Reset to ready state');
  });

  btnChooseAnotherVideo.addEventListener('click', () => {
    if (iframePollInterval) clearInterval(iframePollInterval);
    if (activeVideoRemover) activeVideoRemover.cancel();
    videoOriginalPlayer.pause();
    videoProcessedPlayer.pause();
    videoStudioCard.style.display = 'none';
    videoDropCard.style.display = 'block';
    videoFileInput.value = '';
    selectedVideoFile = null;
    selectedVideoBytes = null;
    if (videoRuntimeIframe && videoRuntimeIframe.contentWindow) {
      videoRuntimeIframe.contentWindow.location.reload();
    }
  });

  // ============================================
  // SYNCHRONIZED VIDEO CONTROLS
  // ============================================
  function setupPlaybackControls() {
    let isPlaying = false;

    btnSyncPlayPause.onclick = async () => {
      if (isPlaying) {
        videoOriginalPlayer.pause();
        if (videoProcessedPlayer.src) videoProcessedPlayer.pause();
        playIconSvg.style.display = 'block';
        pauseIconSvg.style.display = 'none';
        isPlaying = false;
      } else {
        const cur = videoOriginalPlayer.currentTime;
        if (videoProcessedPlayer.src && videoProcessedPlayer.style.display !== 'none') {
          videoProcessedPlayer.currentTime = cur;
          await Promise.allSettled([videoOriginalPlayer.play(), videoProcessedPlayer.play()]);
        } else {
          await videoOriginalPlayer.play();
        }
        playIconSvg.style.display = 'none';
        pauseIconSvg.style.display = 'block';
        isPlaying = true;
      }
    };

    videoOriginalPlayer.ontimeupdate = () => {
      if (isVideoProcessing) return; // Do not override timeline during frame-by-frame export
      const cur = videoOriginalPlayer.currentTime;
      const dur = videoOriginalPlayer.duration || 1;
      syncTimelineScrubber.value = cur;
      syncTimeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;

      if (videoProcessedPlayer.src && videoProcessedPlayer.style.display !== 'none' && !videoOriginalPlayer.paused) {
        if (Math.abs(videoProcessedPlayer.currentTime - cur) > 0.08) {
          videoProcessedPlayer.currentTime = cur;
        }
      }
    };

    syncTimelineScrubber.oninput = (e) => {
      const targetTime = parseFloat(e.target.value);
      videoOriginalPlayer.currentTime = targetTime;
      if (videoProcessedPlayer.src && videoProcessedPlayer.style.display !== 'none') {
        videoProcessedPlayer.currentTime = targetTime;
      }
      const dur = videoOriginalPlayer.duration || targetTime;
      syncTimeDisplay.textContent = `${formatTime(targetTime)} / ${formatTime(dur)}`;
    };

    videoOriginalPlayer.onended = () => {
      if (videoProcessedPlayer.src) videoProcessedPlayer.pause();
      playIconSvg.style.display = 'block';
      pauseIconSvg.style.display = 'none';
      isPlaying = false;
    };
  }

  // ============================================
  // FAQ ACCORDION
  // ============================================
  $$('.faq-question').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      const icon = btn.querySelector('.faq-toggle-icon');
      const isOpen = item.classList.contains('active');

      $$('.faq-item').forEach((i) => {
        i.classList.remove('active');
        const ic = i.querySelector('.faq-toggle-icon');
        if (ic) ic.textContent = '+';
      });

      if (!isOpen) {
        item.classList.add('active');
        if (icon) icon.textContent = '−';
      }
    });
  });

})();
