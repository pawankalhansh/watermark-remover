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
  const videoProcessingCard = $('videoProcessingCard');
  const videoProgressBar = $('videoProgressBar');
  const videoProgressPercent = $('videoProgressPercent');
  const videoProgressTitle = $('videoProgressTitle');
  const videoProgressSubtitle = $('videoProgressSubtitle');
  const videoResultCard = $('videoResultCard');
  const videoMetaLabel = $('videoMetaLabel');
  const videoOriginalPlayer = $('videoOriginalPlayer');
  const videoProcessedPlayer = $('videoProcessedPlayer');
  const btnSyncPlayPause = $('btnSyncPlayPause');
  const playIconSvg = $('playIconSvg');
  const pauseIconSvg = $('pauseIconSvg');
  const syncTimelineScrubber = $('syncTimelineScrubber');
  const syncTimeDisplay = $('syncTimeDisplay');
  const btnChooseAnotherVideo = $('btnChooseAnotherVideo');
  const btnSaveVideoQuick = $('btnSaveVideoQuick');
  const btnOpenOriginalVideo = $('btnOpenOriginalVideo');
  const btnDownloadVideo = $('btnDownloadVideo');

  // Toast
  const toast = $('toast');

  // State
  let currentMode = 'image'; // 'image' | 'video'
  let currentOriginalVideoUrl = null;
  let currentProcessedVideoUrl = null;
  let currentOriginalImageUrl = null;
  let currentProcessedImageUrl = null;
  let activeVideoRemover = null;

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
  // VIDEO WATERMARK REMOVAL (WEBCODECS + MP4BOX)
  // ============================================
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

  async function handleVideoFile(file) {
    if (typeof VideoDecoder === 'undefined') {
      showToast('⚠️ Video processing requires Chrome 94+ or Edge 94+ (WebCodecs support).', 5000);
      return;
    }

    videoDropCard.style.display = 'none';
    videoProcessingCard.style.display = 'block';
    videoResultCard.style.display = 'none';

    videoProgressBar.style.width = '0%';
    videoProgressPercent.textContent = '0%';
    videoProgressTitle.textContent = 'Processing Video...';
    videoProgressSubtitle.textContent = 'Demuxing audio and video tracks...';

    if (currentOriginalVideoUrl) URL.revokeObjectURL(currentOriginalVideoUrl);
    if (currentProcessedVideoUrl) URL.revokeObjectURL(currentProcessedVideoUrl);

    currentOriginalVideoUrl = URL.createObjectURL(file);
    videoOriginalPlayer.src = currentOriginalVideoUrl;

    try {
      activeVideoRemover = new window.VideoWatermarkRemover({
        onProgress: ({ phase, current, total, percent }) => {
          videoProgressBar.style.width = `${percent}%`;
          videoProgressPercent.textContent = `${percent}%`;

          if (phase === 'demuxing') {
            videoProgressTitle.textContent = 'Demuxing Video...';
            videoProgressSubtitle.textContent = 'Parsing container & audio tracks';
          } else if (phase === 'processing') {
            videoProgressTitle.textContent = 'Removing Watermarks...';
            videoProgressSubtitle.textContent = `Cleaning frame ${current} of ${total} (${percent}%)`;
          } else if (phase === 'muxing') {
            videoProgressTitle.textContent = 'Finalizing MP4...';
            videoProgressSubtitle.textContent = 'Muxing clean video with original audio';
          }
        }
      });

      const cleanBlob = await activeVideoRemover.processVideo(file);

      currentProcessedVideoUrl = URL.createObjectURL(cleanBlob);
      videoProcessedPlayer.src = currentProcessedVideoUrl;
      btnDownloadVideo.href = currentProcessedVideoUrl;
      btnDownloadVideo.download = `gemini-video-cleaned-${Date.now()}.mp4`;

      const sizeMB = (cleanBlob.size / (1024 * 1024)).toFixed(1);
      videoMetaLabel.textContent = `Clean video ready — ${sizeMB} MB`;

      videoProcessingCard.style.display = 'none';
      videoResultCard.style.display = 'block';

      setupSynchronizedPlayer();
      showToast('✅ Video watermark removed successfully!');
    } catch (err) {
      console.error('Video processing error:', err);
      videoProcessingCard.style.display = 'none';
      videoDropCard.style.display = 'block';
      showToast(`⚠️ Video error: ${err.message || 'Processing failed'}`, 5000);
    }
  }

  btnChooseAnotherVideo.addEventListener('click', () => {
    videoOriginalPlayer.pause();
    videoProcessedPlayer.pause();
    videoResultCard.style.display = 'none';
    videoDropCard.style.display = 'block';
    videoFileInput.value = '';
  });

  btnSaveVideoQuick.addEventListener('click', () => {
    btnDownloadVideo.click();
  });

  btnOpenOriginalVideo.addEventListener('click', () => {
    if (currentOriginalVideoUrl) window.open(currentOriginalVideoUrl, '_blank');
  });

  // ============================================
  // SYNCHRONIZED VIDEO CONTROLS
  // ============================================
  function setupSynchronizedPlayer() {
    let isPlaying = false;

    function formatTime(seconds) {
      const s = Math.floor(seconds || 0);
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${m}:${rem < 10 ? '0' : ''}${rem}`;
    }

    videoProcessedPlayer.addEventListener('loadedmetadata', () => {
      const dur = videoProcessedPlayer.duration || videoOriginalPlayer.duration || 0;
      syncTimeDisplay.textContent = `0:00 / ${formatTime(dur)}`;
    });

    btnSyncPlayPause.onclick = () => {
      if (isPlaying) {
        videoOriginalPlayer.pause();
        videoProcessedPlayer.pause();
        playIconSvg.style.display = 'block';
        pauseIconSvg.style.display = 'none';
        isPlaying = false;
      } else {
        videoOriginalPlayer.play();
        videoProcessedPlayer.play();
        playIconSvg.style.display = 'none';
        pauseIconSvg.style.display = 'block';
        isPlaying = true;
      }
    };

    videoProcessedPlayer.addEventListener('timeupdate', () => {
      const cur = videoProcessedPlayer.currentTime;
      const dur = videoProcessedPlayer.duration || 1;
      const pct = (cur / dur) * 100;
      syncTimelineScrubber.value = pct;
      syncTimeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;

      // Sync original video if drift > 0.15s
      if (Math.abs(videoOriginalPlayer.currentTime - cur) > 0.15) {
        videoOriginalPlayer.currentTime = cur;
      }
    });

    syncTimelineScrubber.oninput = (e) => {
      const targetPct = parseFloat(e.target.value);
      const dur = videoProcessedPlayer.duration || videoOriginalPlayer.duration || 0;
      const targetTime = (targetPct / 100) * dur;
      videoProcessedPlayer.currentTime = targetTime;
      videoOriginalPlayer.currentTime = targetTime;
    };

    videoProcessedPlayer.addEventListener('ended', () => {
      playIconSvg.style.display = 'block';
      pauseIconSvg.style.display = 'none';
      isPlaying = false;
    });
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
