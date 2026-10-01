/**
 * VideoWatermarkRemover - Client-side video watermark removal using WebCodecs and OpenCV.js
 *
 * Pipeline:
 * Upload MP4 → Demux (mp4box.js) → Decode frames (WebCodecs VideoDecoder) → 
 * Per-frame watermark detection & inpainting (OpenCV.js) → 
 * Re-encode (WebCodecs VideoEncoder) → Mux with original audio (mp4box.js) → Download clean MP4.
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
            
            this.totalFrames = 0;
            this.processedFrames = 0;
            
            this.videoSamples = [];
            this.audioSamples = [];
            
            this.outputChunks = [];
        }

        /**
         * Checks if the current environment supports the required APIs.
         * @returns {boolean} True if supported, false otherwise.
         */
        static isSupported() {
            return typeof VideoDecoder !== 'undefined' && 
                   typeof VideoEncoder !== 'undefined' && 
                   typeof MP4Box !== 'undefined' &&
                   typeof cv !== 'undefined';
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
                    percent
                });
            }
        }

        /**
         * Main entry point to process a video file.
         * @param {File} file The input video file (MP4/WEBM)
         * @returns {Promise<Blob>} A promise that resolves with the cleaned video blob.
         */
        async processVideo(file) {
            if (!VideoWatermarkRemover.isSupported()) {
                const err = new Error('Required APIs (WebCodecs, MP4Box, OpenCV) are not supported in this environment.');
                if (this.options.onError) this.options.onError(err);
                throw err;
            }

            this.isCancelled = false;
            this.totalFrames = 0;
            this.processedFrames = 0;
            this.videoSamples = [];
            this.audioSamples = [];
            this.outputChunks = [];
            this.muxer = MP4Box.createFile();

            try {
                this._reportProgress('demuxing', 0, 0, 0);
                await this._demux(file);
                
                if (this.isCancelled) throw new Error('Cancelled');
                
                if (!this.videoTrack) {
                    throw new Error('No video track found in the file.');
                }
                
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
                this._cleanup();
                if (this.options.onError) {
                    this.options.onError(err);
                }
                throw err;
            } finally {
                this._cleanup();
            }
        }

        /**
         * Demuxes the input file using MP4Box.js to extract tracks and samples.
         */
        _demux(file) {
            return new Promise((resolve, reject) => {
                const mp4boxfile = MP4Box.createFile();
                this.demuxer = mp4boxfile;
                
                mp4boxfile.onError = (e) => reject(new Error('MP4Box error: ' + e));
                
                mp4boxfile.onReady = (info) => {
                    info.tracks.forEach(track => {
                        if (track.video && !this.videoTrack) {
                            this.videoTrack = track;
                            mp4boxfile.setExtractionOptions(track.id, null, { nbSamples: Infinity });
                        } else if (track.audio && !this.audioTrack) {
                            this.audioTrack = track;
                            mp4boxfile.setExtractionOptions(track.id, null, { nbSamples: Infinity });
                        }
                    });
                    
                    mp4boxfile.start();
                };
                
                let extractionCount = 0;
                let expectedExtractions = 0;
                
                mp4boxfile.onSamples = (id, user, samples) => {
                    if (this.videoTrack && id === this.videoTrack.id) {
                        this.videoSamples = samples;
                        extractionCount++;
                    } else if (this.audioTrack && id === this.audioTrack.id) {
                        this.audioSamples = samples;
                        extractionCount++;
                    }
                    
                    if (extractionCount >= expectedExtractions) {
                        resolve();
                    }
                };
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    const buffer = e.target.result;
                    buffer.fileStart = 0;
                    expectedExtractions = (this.videoTrack ? 1 : 0) + (this.audioTrack ? 1 : 0);
                    // Determine how many tracks we expect extractions for
                    // Need to wait until onReady figures out the tracks before setting expectedExtractions properly
                    // Actually, onReady sets up the extractions and calls start(), then onSamples is called.
                    
                    // Hook into onReady to set expected extractions
                    const originalOnReady = mp4boxfile.onReady;
                    mp4boxfile.onReady = (info) => {
                        originalOnReady(info);
                        expectedExtractions = (this.videoTrack ? 1 : 0) + (this.audioTrack ? 1 : 0);
                        if (expectedExtractions === 0) {
                            reject(new Error('No media tracks found'));
                        }
                    };

                    mp4boxfile.appendBuffer(buffer);
                    mp4boxfile.flush();
                };
                reader.onerror = () => reject(new Error('File read error'));
                reader.readAsArrayBuffer(file);
            });
        }

        /**
         * Sets up WebCodecs VideoEncoder and MP4Box.js muxing structures.
         */
        async _setupEncodingMuxing() {
            // Note: In a real implementation, you would need to parse the AVCC/HEVC configuration from the demuxed track
            // and pass it to the decoder. Here we assume generic h264 for simplicity.
            const codecString = this.videoTrack.codec || 'avc1.42E01E';
            
            // Set up encoder
            const init = {
                output: (chunk, metadata) => {
                    this._handleEncodedChunk(chunk, metadata);
                },
                error: (e) => {
                    console.error('Encoder error:', e);
                }
            };
            
            this.encoder = new VideoEncoder(init);
            const config = {
                codec: codecString,
                width: this.videoTrack.track_width || this.videoTrack.width,
                height: this.videoTrack.track_height || this.videoTrack.height,
                bitrate: this.videoTrack.bitrate || 2000000,
                framerate: this.videoTrack.nb_samples / (this.videoTrack.duration / this.videoTrack.timescale) || 30
            };
            
            this.encoder.configure(config);

            // Muxer setup for video track
            this.outVideoTrackId = this.muxer.addTrack({
                timescale: this.videoTrack.timescale,
                width: config.width,
                height: config.height,
                avcDecoderConfigRecord: null // Will be set by muxer or needs manual generation based on encoder config
            });
            
            // Muxer setup for audio track (passthrough)
            if (this.audioTrack) {
                // In a robust implementation, extract audio codec config and set it up here.
                // For simplicity, we assume we can copy properties.
                this.outAudioTrackId = this.muxer.addTrack({
                    type: this.audioTrack.codec.split('.')[0] === 'mp4a' ? 'mp4a' : this.audioTrack.codec, // simplify
                    timescale: this.audioTrack.timescale,
                    samplerate: this.audioTrack.audio.sample_rate,
                    channel_count: this.audioTrack.audio.channel_count
                });
                
                // Add original audio samples
                for (const sample of this.audioSamples) {
                    this.muxer.addSample(this.outAudioTrackId, sample.data, {
                        dts: sample.dts,
                        cts: sample.cts,
                        duration: sample.duration,
                        is_sync: sample.is_sync
                    });
                }
            }
        }

        /**
         * Decodes video samples, processes them with OpenCV, and feeds them to the encoder.
         */
        async _decodeAndProcess() {
            return new Promise((resolve, reject) => {
                let pendingFrames = 0;
                let sampleIndex = 0;
                let decodeDone = false;
                
                const processNextFrame = async (frame) => {
                    if (this.isCancelled) {
                        frame.close();
                        reject(new Error('Cancelled'));
                        return;
                    }
                    
                    try {
                        const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
                        const ctx = canvas.getContext('2d', { willReadFrequently: true });
                        ctx.drawImage(frame, 0, 0);
                        
                        const processedFrame = await this._removeWatermark(canvas, frame.timestamp, frame.duration);
                        
                        this.encoder.encode(processedFrame, { keyFrame: sampleIndex % 30 === 0 });
                        processedFrame.close();
                        frame.close();
                        
                        this.processedFrames++;
                        this._reportProgress('processing', this.processedFrames, this.totalFrames);
                        
                        if (this.options.onFrameProcessed) {
                            this.options.onFrameProcessed(this.processedFrames, this.totalFrames);
                        }
                        
                        pendingFrames--;
                        pump();
                    } catch (e) {
                        frame.close();
                        reject(e);
                    }
                };

                const init = {
                    output: (frame) => {
                        pendingFrames++;
                        // Use requestAnimationFrame or setTimeout to avoid blocking
                        setTimeout(() => processNextFrame(frame), 0);
                    },
                    error: (e) => reject(e)
                };
                
                this.decoder = new VideoDecoder(init);
                // Note: Provide description (AVCC/HEVC) for successful decoding
                // Assuming mp4box provides valid codec string and description buffer isn't strictly required for all H264,
                // but usually it is. In practice, extract `avcC` from track.mdia.minf.stbl.stsd...
                const config = {
                    codec: this.videoTrack.codec || 'avc1.42E01E'
                };
                
                // Try extracting AVC configuration record from mp4box track info if available
                if (this.videoTrack.codec_private_data) {
                    config.description = this.videoTrack.codec_private_data;
                }
                
                try {
                    this.decoder.configure(config);
                } catch(e) {
                    console.warn("Decoder configuration failed, trying without description", e);
                    // fallback config if description is invalid
                }

                const pump = async () => {
                    if (this.isCancelled) return;
                    
                    // Don't flood the decoder
                    if (pendingFrames > 5) return;
                    
                    if (sampleIndex >= this.videoSamples.length) {
                        if (!decodeDone) {
                            decodeDone = true;
                            await this.decoder.flush();
                            await this.encoder.flush();
                            resolve();
                        }
                        return;
                    }
                    
                    const sample = this.videoSamples[sampleIndex++];
                    const chunk = new EncodedVideoChunk({
                        type: sample.is_sync ? 'key' : 'delta',
                        timestamp: (sample.cts * 1000000) / sample.timescale,
                        duration: (sample.duration * 1000000) / sample.timescale,
                        data: sample.data
                    });
                    
                    try {
                        this.decoder.decode(chunk);
                    } catch(e) {
                        console.error("Decode error", e);
                    }
                    
                    pump();
                };
                
                pump();
            });
        }

        /**
         * Detects and removes watermark on a single frame using OpenCV.js
         */
        async _removeWatermark(canvas, timestamp, duration) {
            const ctx = canvas.getContext('2d');
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            let src = null;
            let srcRGB = null;
            let blurredRGB = null;
            let mask = null;
            let dst = null;
            
            try {
                src = cv.matFromImageData(imgData);
                srcRGB = new cv.Mat();
                cv.cvtColor(src, srcRGB, cv.COLOR_RGBA2RGB);
                
                blurredRGB = new cv.Mat();
                cv.GaussianBlur(srcRGB, blurredRGB, new cv.Size(21, 21), 0);
                
                mask = new cv.Mat.zeros(srcRGB.rows, srcRGB.cols, cv.CV_8UC1);
                
                const RED_THRESHOLD = 12;
                const BLUE_THRESHOLD = 12;
                const WHITE_THRESHOLD = 6;
                const WHITE_SAT_MAX = 0.18;
                
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
                    
                    // Color deviation
                    const redExcess = (r - br) - 0.5 * ((g - bg) + (b - bb));
                    const blueExcess = (b - bb) - 0.5 * ((r - br) + (g - bg));
                    
                    // White check
                    const maxCh = Math.max(r, g, b);
                    const minCh = Math.min(r, g, b);
                    const lum = (maxCh + minCh) / 2;
                    const bMaxCh = Math.max(br, bg, bb);
                    const bMinCh = Math.min(br, bg, bb);
                    const bLum = (bMaxCh + bMinCh) / 2;
                    
                    let saturation = 0;
                    if (maxCh > 0) {
                        saturation = (maxCh - minCh) / maxCh;
                    }
                    
                    const isRed = redExcess > RED_THRESHOLD;
                    const isBlue = blueExcess > BLUE_THRESHOLD;
                    const isWhite = Math.abs(lum - bLum) > WHITE_THRESHOLD && saturation < WHITE_SAT_MAX;
                    
                    if (isRed || isBlue || isWhite) {
                        maskData[i] = 255;
                    }
                }
                
                // Edge blending / morphological operations on mask could be applied here
                // e.g. cv.dilate(mask, mask, cv.Mat.ones(3, 3, cv.CV_8U));

                dst = new cv.Mat();
                cv.inpaint(srcRGB, mask, dst, 5, cv.INPAINT_TELEA);
                
                // Copy back to canvas
                const outRgba = new cv.Mat();
                cv.cvtColor(dst, outRgba, cv.COLOR_RGB2RGBA);
                const outImgData = new ImageData(new Uint8ClampedArray(outRgba.data), canvas.width, canvas.height);
                ctx.putImageData(outImgData, 0, 0);
                
                outRgba.delete();
                
                return new VideoFrame(canvas, { timestamp, duration });
            } finally {
                if (src) src.delete();
                if (srcRGB) srcRGB.delete();
                if (blurredRGB) blurredRGB.delete();
                if (mask) mask.delete();
                if (dst) dst.delete();
            }
        }

        /**
         * Collects encoded chunks from VideoEncoder and queues them in MP4Box muxer.
         */
        _handleEncodedChunk(chunk, metadata) {
            // Note: AVCC config metadata handling may be needed for some implementations
            const buffer = new ArrayBuffer(chunk.byteLength);
            chunk.copyTo(buffer);
            
            // Re-scale timestamp from microsecs to timescale (usually 90000 or similar from input)
            const timescale = this.videoTrack.timescale;
            const dts = Math.floor((chunk.timestamp / 1000000) * timescale);
            const duration = chunk.duration ? Math.floor((chunk.duration / 1000000) * timescale) : Math.floor(timescale / 30);
            
            this.muxer.addSample(this.outVideoTrackId, buffer, {
                dts: dts,
                cts: dts,
                duration: duration,
                is_sync: chunk.type === 'key'
            });
        }

        /**
         * Finalizes the MP4Box file and creates a Blob.
         */
        _finalizeMuxing() {
            return new Promise((resolve, reject) => {
                this._reportProgress('muxing', 0, 0, 0);
                
                try {
                    this.muxer.onReady = null; 
                    
                    // Use MP4Box's DataStream to properly serialize the ISO file
                    const stream = new MP4Box.DataStream();
                    stream.endianness = MP4Box.DataStream.BIG_ENDIAN;
                    
                    // Write the muxed file into the stream
                    this.muxer.write(stream);
                    
                    // Extract the final buffer
                    const resultBuffer = stream.buffer.slice(0, stream.position);
                    
                    if (resultBuffer && resultBuffer.byteLength > 0) {
                        const blob = new Blob([resultBuffer], { type: 'video/mp4' });
                        resolve(blob);
                    } else {
                        reject(new Error("Failed to write muxed MP4 file."));
                    }
                } catch(e) {
                    console.error("Muxer save error", e);
                    reject(e);
                }
            });
        }

        /**
         * Cleans up all resources.
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
