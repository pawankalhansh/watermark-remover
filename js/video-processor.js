/**
 * VideoWatermarkRemover - Client-side video watermark removal using WebCodecs, MP4Box.js, and GeminiEngine
 *
 * Pipeline:
 * Upload MP4 → Demux (mp4box.js) → Decode frames (WebCodecs VideoDecoder) → 
 * Per-frame watermark detection & removal (GeminiEngine Reverse Alpha Blending) → 
 * Re-encode (WebCodecs VideoEncoder) → Mux with original audio (mp4box.js) → Download clean MP4.
 *
 * Includes an automatic fallback to HTMLVideoElement + MediaRecorder for WebM, MOV, and non-standard containers.
 */
(function(global) {
    'use strict';

    class VideoWatermarkRemover {
        /**
         * @param {Object} options Configuration options
         * @param {Function} [options.onProgress] Callback for progress updates ({ phase, current, total, percent })
         * @param {Function} [options.onFrameProcessed] Callback when a frame is processed
         * @param {Function} [options.onComplete] Callback when finished, receives output Blob
         * @param {Function} [options.onError] Callback when an error occurs
         */
        constructor(options = {}) {
            this.options = options;
            this.isCancelled = false;
            
            this.demuxer = null;
            this.decoder = null;
            this.encoder = null;
            this.muxer = null;
            
            this.videoTrack = null;
            this.audioTrack = null;
            this.videoAvcc = null;
            
            this.outVideoTrackId = null;
            this.outAudioTrackId = null;
            
            this.totalFrames = 0;
            this.processedFrames = 0;
            
            this.videoSamples = [];
            this.audioSamples = [];
        }

        /**
         * Checks if the current environment supports the required APIs.
         * @returns {boolean} True if supported, false otherwise.
         */
        static isSupported() {
            return typeof VideoDecoder !== 'undefined' && 
                   typeof VideoEncoder !== 'undefined' && 
                   typeof MP4Box !== 'undefined';
        }

        /**
         * Cancels the current processing task.
         */
        cancel() {
            this.isCancelled = true;
            this._cleanup();
        }

        /**
         * Reports progress to the registered callback.
         */
        _reportProgress(phase, current = 0, total = 0, overridePercent = null) {
            if (this.options.onProgress) {
                let percent = 0;
                if (overridePercent !== null) {
                    percent = overridePercent;
                } else if (total > 0) {
                    percent = Math.round((current / total) * 100);
                }
                
                this.options.onProgress({
                    phase,
                    current,
                    total,
                    percent: Math.min(100, Math.max(0, percent))
                });
            }
        }

        /**
         * Main entry point to process a video file.
         * @param {File} file The input video file (MP4/WEBM/MOV)
         * @returns {Promise<Blob>} A promise that resolves with the cleaned video blob.
         */
        async processVideo(file) {
            this.isCancelled = false;
            this.totalFrames = 0;
            this.processedFrames = 0;
            this.videoSamples = [];
            this.audioSamples = [];
            this.outVideoTrackId = null;
            this.outAudioTrackId = null;

            // Check if native WebCodecs + MP4Box can be used
            const isMp4 = file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');

            if (VideoWatermarkRemover.isSupported() && isMp4) {
                try {
                    this.muxer = MP4Box.createFile();
                    this._reportProgress('demuxing', 0, 0, 0);
                    await this._demux(file);
                    
                    if (this.isCancelled) throw new Error('Cancelled');
                    if (!this.videoTrack) throw new Error('No video track found in the input file.');
                    
                    this.totalFrames = this.videoSamples.length;
                    this._reportProgress('processing', 0, this.totalFrames, 0);
                    
                    await this._setupEncodingMuxing();
                    if (this.isCancelled) throw new Error('Cancelled');
                    
                    await this._decodeAndProcess();
                    if (this.isCancelled) throw new Error('Cancelled');
                    
                    const finalBlob = await this._finalizeMuxing();
                    if (this.options.onComplete) {
                        this.options.onComplete(finalBlob);
                    }
                    
                    return finalBlob;
                } catch (err) {
                    if (this.isCancelled) throw err;
                    console.warn('[VideoProcessor] MP4Box/WebCodecs pipeline failed, falling back to video element decoder:', err);
                    this._cleanup();
                    // Fall back to universal video playback pipeline
                    return await this._processViaVideoElement(file);
                } finally {
                    this._cleanup();
                }
            } else {
                // Non-MP4 video format or WebCodecs unsupported: run universal playback pipeline
                return await this._processViaVideoElement(file);
            }
        }

        /**
         * Extracts AVCDecoderConfigurationRecord / avcC buffer from demuxed track.
         */
        _extractAvcc(trackId) {
            try {
                const trak = this.demuxer.getTrackById(trackId);
                if (!trak || !trak.mdia?.minf?.stbl?.stsd?.entries) return null;
                for (const entry of trak.mdia.minf.stbl.stsd.entries) {
                    const box = entry.avcC || entry.hvcC || entry.vpcC;
                    if (box) {
                        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
                        box.write(stream);
                        // Slice off the 8-byte box header [4-byte size + 4-byte box type]
                        return new Uint8Array(stream.buffer.slice(8, stream.position));
                    }
                }
            } catch (e) {
                console.warn('[VideoProcessor] Could not extract avcC box:', e);
            }
            return null;
        }

        /**
         * Demuxes the input file using MP4Box.js to extract tracks and samples.
         */
        _demux(file) {
            return new Promise((resolve, reject) => {
                const mp4boxfile = MP4Box.createFile();
                this.demuxer = mp4boxfile;
                
                let isResolved = false;
                let expectedExtractions = 0;
                let extractionFinishedCount = 0;

                const finishDemux = () => {
                    if (!isResolved) {
                        isResolved = true;
                        if (!this.videoTrack || this.videoSamples.length === 0) {
                            reject(new Error('No video frames could be extracted from this MP4 file.'));
                        } else {
                            resolve();
                        }
                    }
                };
                
                mp4boxfile.onError = (e) => {
                    console.error('[VideoProcessor] MP4Box error:', e);
                    if (!isResolved) {
                        isResolved = true;
                        reject(new Error('MP4Box parse error: ' + (e?.message || e)));
                    }
                };

                const checkComplete = () => {
                    if (expectedExtractions > 0 && extractionFinishedCount >= expectedExtractions) {
                        finishDemux();
                    }
                };
                
                mp4boxfile.onReady = (info) => {
                    // 1. Video track
                    if (info.videoTracks && info.videoTracks.length > 0) {
                        this.videoTrack = info.videoTracks[0];
                    } else if (info.tracks) {
                        this.videoTrack = info.tracks.find(t => t.video || t.type === 'video');
                    }

                    // 2. Audio track (optional)
                    if (info.audioTracks && info.audioTracks.length > 0) {
                        this.audioTrack = info.audioTracks[0];
                    } else if (info.tracks) {
                        this.audioTrack = info.tracks.find(t => t.audio || t.type === 'audio');
                    }

                    if (!this.videoTrack) {
                        if (!isResolved) {
                            isResolved = true;
                            reject(new Error('No video track found in input file.'));
                        }
                        return;
                    }

                    expectedExtractions = 1 + (this.audioTrack ? 1 : 0);
                    
                    // Request sample extraction in standard chunks of 1000
                    mp4boxfile.setExtractionOptions(this.videoTrack.id, null, { nbSamples: 1000 });
                    if (this.audioTrack) {
                        mp4boxfile.setExtractionOptions(this.audioTrack.id, null, { nbSamples: 1000 });
                    }

                    mp4boxfile.start();
                    checkComplete();
                };
                
                mp4boxfile.onSamples = (id, user, samples) => {
                    if (this.videoTrack && id === this.videoTrack.id) {
                        this.videoSamples.push(...samples);
                        if (this.videoTrack.nb_samples && this.videoSamples.length >= this.videoTrack.nb_samples) {
                            extractionFinishedCount++;
                        }
                    } else if (this.audioTrack && id === this.audioTrack.id) {
                        this.audioSamples.push(...samples);
                        if (this.audioTrack.nb_samples && this.audioSamples.length >= this.audioTrack.nb_samples) {
                            extractionFinishedCount++;
                        }
                    }
                    
                    checkComplete();
                };
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const buffer = e.target.result;
                        buffer.fileStart = 0;
                        mp4boxfile.appendBuffer(buffer);
                        mp4boxfile.flush();
                        
                        // If all samples were already extracted or flush completed
                        if (this.videoSamples.length > 0) {
                            finishDemux();
                        } else {
                            setTimeout(() => {
                                if (this.videoSamples.length > 0) {
                                    finishDemux();
                                } else if (!isResolved) {
                                    finishDemux();
                                }
                            }, 350);
                        }
                    } catch (parseErr) {
                        if (!isResolved) {
                            isResolved = true;
                            reject(parseErr);
                        }
                    }
                };
                reader.onerror = () => {
                    if (!isResolved) {
                        isResolved = true;
                        reject(new Error('File read error'));
                    }
                };
                reader.readAsArrayBuffer(file);
            });
        }

        /**
         * Sets up WebCodecs VideoEncoder and creates MP4Box tracks.
         * Ensures Video Track is Track 1 and Audio Track is Track 2.
         */
        async _setupEncodingMuxing() {
            let codecString = this.videoTrack.codec || 'avc1.42E01E';
            this.videoAvcc = this._extractAvcc(this.videoTrack.id);

            const durationSec = (this.videoTrack.duration / this.videoTrack.timescale) || 1;
            const calculatedFps = Math.round(this.videoTrack.nb_samples / durationSec) || 30;
            this.videoFramerate = Math.max(1, Math.min(60, calculatedFps));

            const width = this.videoTrack.track_width || this.videoTrack.video?.width || this.videoTrack.width || 1280;
            const height = this.videoTrack.track_height || this.videoTrack.video?.height || this.videoTrack.height || 720;

            // Normalize codec string for VideoEncoder
            if (!codecString.startsWith('avc1')) {
                codecString = 'avc1.4d002a';
            }

            // Configure VideoEncoder
            const encoderInit = {
                output: (chunk, metadata) => {
                    this._handleEncodedChunk(chunk, metadata);
                },
                error: (e) => {
                    console.error('[VideoProcessor] VideoEncoder error:', e);
                }
            };
            
            this.encoder = new VideoEncoder(encoderInit);
            const encoderConfig = {
                codec: codecString,
                width: width,
                height: height,
                bitrate: this.videoTrack.bitrate || 3500000,
                framerate: this.videoFramerate,
                avc: { format: 'avc' }
            };

            if (typeof VideoEncoder.isConfigSupported === 'function') {
                try {
                    const support = await VideoEncoder.isConfigSupported(encoderConfig);
                    if (!support || !support.supported) {
                        encoderConfig.codec = 'avc1.42001f';
                    }
                } catch (supErr) {
                    console.warn('[VideoProcessor] isConfigSupported check warning:', supErr);
                }
            }
            
            this.encoder.configure(encoderConfig);

            // Add Track 1: VIDEO
            this.outVideoTrackId = this.muxer.addTrack({
                type: 'avc1',
                timescale: this.videoTrack.timescale || 90000,
                width: width,
                height: height,
                avcDecoderConfigRecord: this.videoAvcc ? this.videoAvcc.buffer : null
            });

            // Add Track 2: AUDIO (if present)
            if (this.audioTrack) {
                const audioCodec = (this.audioTrack.codec && this.audioTrack.codec.split('.')[0] === 'mp4a') 
                    ? 'mp4a' 
                    : (this.audioTrack.codec || 'mp4a');
                this.outAudioTrackId = this.muxer.addTrack({
                    type: audioCodec,
                    timescale: this.audioTrack.timescale || 44100,
                    samplerate: this.audioTrack.audio?.sample_rate || 44100,
                    channel_count: this.audioTrack.audio?.channel_count || 2
                });
            }
        }

        /**
         * Decodes video samples sequentially, applies GeminiEngine Reverse Alpha Blending,
         * feeds cleaned frames to VideoEncoder, and waits for all frames to finish.
         */
        async _decodeAndProcess() {
            return new Promise((resolve, reject) => {
                let frameQueue = [];
                let isDecodingDone = false;
                let isProcessingQueue = false;

                const processQueue = async () => {
                    if (isProcessingQueue) return;
                    isProcessingQueue = true;

                    while (frameQueue.length > 0) {
                        if (this.isCancelled) {
                            frameQueue.forEach(f => f.close());
                            frameQueue = [];
                            isProcessingQueue = false;
                            reject(new Error('Cancelled'));
                            return;
                        }

                        const frame = frameQueue.shift();
                        try {
                            const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
                            const ctx = canvas.getContext('2d', { willReadFrequently: true });
                            ctx.drawImage(frame, 0, 0);

                            const timestamp = frame.timestamp;
                            const duration = frame.duration;
                            frame.close(); // Close raw frame immediately to preserve GPU memory

                            let cleanCanvas = canvas;
                            if (global.GeminiEngine && typeof global.GeminiEngine.processRenderableToCanvas === 'function') {
                                try {
                                    cleanCanvas = await global.GeminiEngine.processRenderableToCanvas(canvas, { adaptiveMode: "always" });
                                } catch (cleanErr) {
                                    console.warn('[VideoProcessor] GeminiEngine frame process error:', cleanErr);
                                }
                            }

                            const frameInit = { timestamp };
                            if (typeof duration === 'number' && duration > 0) {
                                frameInit.duration = Math.round(duration);
                            }
                            const cleanFrame = new VideoFrame(cleanCanvas, frameInit);
                            const isKey = (this.processedFrames % 30 === 0);
                            this.encoder.encode(cleanFrame, { keyFrame: isKey });
                            cleanFrame.close();

                            this.processedFrames++;
                            this._reportProgress('processing', this.processedFrames, this.totalFrames);
                            if (this.options.onFrameProcessed) {
                                this.options.onFrameProcessed(this.processedFrames, this.totalFrames);
                            }
                        } catch (frameErr) {
                            console.error('[VideoProcessor] Frame handling error:', frameErr);
                        }
                    }

                    isProcessingQueue = false;

                    // If decoder is flushed and all frames in queue have finished encoding
                    if (isDecodingDone && frameQueue.length === 0) {
                        try {
                            await this.encoder.flush();
                            resolve();
                        } catch (flushErr) {
                            reject(flushErr);
                        }
                    }
                };

                const decoderInit = {
                    output: (frame) => {
                        frameQueue.push(frame);
                        processQueue();
                    },
                    error: (e) => {
                        console.error('[VideoProcessor] VideoDecoder error:', e);
                        reject(e);
                    }
                };

                this.decoder = new VideoDecoder(decoderInit);

                const decoderConfig = {
                    codec: this.videoTrack.codec || 'avc1.42E01E'
                };
                if (this.videoAvcc) {
                    decoderConfig.description = this.videoAvcc;
                }

                try {
                    this.decoder.configure(decoderConfig);
                } catch (configErr) {
                    console.warn('[VideoProcessor] Decoder configure with avcC failed, trying fallback:', configErr);
                    delete decoderConfig.description;
                    this.decoder.configure(decoderConfig);
                }

                // Feed samples into decoder
                (async () => {
                    try {
                        for (let i = 0; i < this.videoSamples.length; i++) {
                            if (this.isCancelled) return;

                            const sample = this.videoSamples[i];
                            const chunk = new EncodedVideoChunk({
                                type: sample.is_sync ? 'key' : 'delta',
                                timestamp: (sample.cts * 1000000) / sample.timescale,
                                duration: (sample.duration * 1000000) / sample.timescale,
                                data: sample.data
                            });

                            this.decoder.decode(chunk);

                            // Control queue pressure if decoding much faster than processing
                            if (frameQueue.length > 8) {
                                await new Promise(r => setTimeout(r, 20));
                            }
                        }

                        await this.decoder.flush();
                        isDecodingDone = true;
                        processQueue();
                    } catch (decodeLoopErr) {
                        reject(decodeLoopErr);
                    }
                })();
            });
        }

        /**
         * Collects encoded chunks from VideoEncoder and queues them into MP4Box muxer.
         */
        _handleEncodedChunk(chunk, metadata) {
            // Update avcDecoderConfigRecord on video track if available from first keyframe metadata
            if (metadata && metadata.decoderConfig && metadata.decoderConfig.description) {
                const trak = this.muxer.getTrackById(this.outVideoTrackId);
                if (trak && (!trak.mdia?.minf?.stbl?.stsd?.entries[0]?.avcC)) {
                    trak.avcDecoderConfigRecord = metadata.decoderConfig.description;
                }
            }

            const buffer = new ArrayBuffer(chunk.byteLength);
            chunk.copyTo(buffer);
            
            const timescale = this.videoTrack?.timescale || 90000;
            const dts = Math.floor((chunk.timestamp / 1000000) * timescale);
            const duration = chunk.duration 
                ? Math.floor((chunk.duration / 1000000) * timescale) 
                : Math.floor(timescale / (this.videoFramerate || 30));
            
            this.muxer.addSample(this.outVideoTrackId, buffer, {
                dts: dts,
                cts: dts,
                duration: duration,
                is_sync: chunk.type === 'key'
            });
        }

        /**
         * Muxes original audio samples, flushes the container, and produces the final MP4 Blob.
         */
        _finalizeMuxing() {
            return new Promise((resolve, reject) => {
                this._reportProgress('muxing', 0, 0, 0);
                
                try {
                    // Add original audio samples to Track 2
                    if (this.audioTrack && this.outAudioTrackId && this.audioSamples.length > 0) {
                        for (const sample of this.audioSamples) {
                            const buffer = sample.data.buffer.slice(
                                sample.data.byteOffset, 
                                sample.data.byteOffset + sample.data.byteLength
                            );
                            this.muxer.addSample(this.outAudioTrackId, buffer, {
                                dts: sample.dts,
                                cts: sample.cts,
                                duration: sample.duration,
                                is_sync: sample.is_sync
                            });
                        }
                    }

                    this.muxer.flush();
                    this.muxer.onReady = null; 
                    
                    let resultBuffer = null;
                    try {
                        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
                        this.muxer.write(stream);
                        resultBuffer = stream.buffer.slice(0, stream.position);
                    } catch (streamErr) {
                        try {
                            resultBuffer = this.muxer.getBuffer();
                        } catch (bufErr) {
                            console.error('[VideoProcessor] Mux serialization error:', streamErr, bufErr);
                        }
                    }
                    
                    if (resultBuffer && resultBuffer.byteLength > 1000) {
                        const blob = new Blob([resultBuffer], { type: 'video/mp4' });
                        resolve(blob);
                    } else {
                        reject(new Error("Muxed MP4 output is empty or invalid."));
                    }
                } catch(e) {
                    console.error("[VideoProcessor] Muxer serialization error:", e);
                    reject(e);
                }
            });
        }

        /**
         * Universal fallback pipeline using HTMLVideoElement and MediaRecorder.
         * Handles WebM, MOV, QuickTime, and any MP4 that fails demuxing.
         */
        async _processViaVideoElement(file) {
            return new Promise(async (resolve, reject) => {
                this._reportProgress('demuxing', 0, 0, 10);
                
                const videoUrl = URL.createObjectURL(file);
                const video = document.createElement('video');
                video.muted = true;
                video.playsInline = true;
                video.preload = 'auto';
                video.src = videoUrl;

                const cleanup = () => {
                    URL.revokeObjectURL(videoUrl);
                    video.src = '';
                    video.load();
                };

                video.onerror = () => {
                    cleanup();
                    reject(new Error('Failed to load video in browser player.'));
                };

                await new Promise((res, rej) => {
                    video.onloadedmetadata = res;
                    video.onerror = rej;
                });

                const width = video.videoWidth || 1280;
                const height = video.videoHeight || 720;
                const duration = video.duration || 1;
                const fps = 30;
                const totalFrames = Math.max(1, Math.round(duration * fps));
                this.totalFrames = totalFrames;
                this.processedFrames = 0;

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });

                const stream = canvas.captureStream(fps);
                
                let mimeType = 'video/webm';
                if (typeof MediaRecorder !== 'undefined') {
                    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
                        mimeType = 'video/mp4;codecs=avc1';
                    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
                        mimeType = 'video/mp4';
                    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
                        mimeType = 'video/webm;codecs=vp9';
                    } else if (MediaRecorder.isTypeSupported('video/webm')) {
                        mimeType = 'video/webm';
                    }
                }

                const chunks = [];
                const recorder = new MediaRecorder(stream, { mimeType });
                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
                };

                recorder.onstop = () => {
                    cleanup();
                    const outputBlob = new Blob(chunks, { type: mimeType.split(';')[0] });
                    resolve(outputBlob);
                };

                recorder.start(100);

                // Step frame-by-frame
                for (let f = 0; f < totalFrames; f++) {
                    if (this.isCancelled) {
                        recorder.stop();
                        cleanup();
                        reject(new Error('Cancelled'));
                        return;
                    }

                    const targetTime = Math.min(duration, f / fps);
                    video.currentTime = targetTime;
                    await new Promise(r => {
                        const onSeeked = () => {
                            video.removeEventListener('seeked', onSeeked);
                            r();
                        };
                        video.addEventListener('seeked', onSeeked);
                    });

                    ctx.drawImage(video, 0, 0, width, height);

                    if (global.GeminiEngine && typeof global.GeminiEngine.processRenderableToCanvas === 'function') {
                        try {
                            const clean = await global.GeminiEngine.processRenderableToCanvas(canvas, { adaptiveMode: "always" });
                            ctx.drawImage(clean, 0, 0);
                        } catch (err) {
                            console.warn('[VideoFallback] Clean frame error:', err);
                        }
                    }

                    this.processedFrames++;
                    this._reportProgress('processing', this.processedFrames, this.totalFrames);
                    if (this.options.onFrameProcessed) {
                        this.options.onFrameProcessed(this.processedFrames, this.totalFrames);
                    }

                    await new Promise(r => setTimeout(r, 10));
                }

                recorder.stop();
            });
        }

        /**
         * Cleans up all decoder, encoder, and demuxer resources.
         */
        _cleanup() {
            if (this.decoder && this.decoder.state !== 'closed') {
                try { this.decoder.close(); } catch(e) {}
            }
            if (this.encoder && this.encoder.state !== 'closed') {
                try { this.encoder.close(); } catch(e) {}
            }
            this.demuxer = null;
            this.muxer = null;
        }
    }

    global.VideoWatermarkRemover = VideoWatermarkRemover;

})(window);
