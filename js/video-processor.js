/**
 * VideoWatermarkRemover - Client-side video watermark removal using WebCodecs, MP4Box.js, and GeminiEngine
 *
 * Pipeline:
 * Upload MP4 → Demux (mp4box.js) → Decode frames (WebCodecs VideoDecoder) → 
 * Per-frame watermark detection & removal (GeminiEngine Reverse Alpha Blending) → 
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
                const err = new Error('WebCodecs or MP4Box is not supported in this browser. Please use Chrome 94+ or Edge 94+.');
                if (this.options.onError) this.options.onError(err);
                throw err;
            }

            this.isCancelled = false;
            this.totalFrames = 0;
            this.processedFrames = 0;
            this.videoSamples = [];
            this.audioSamples = [];
            this.outVideoTrackId = null;
            this.outAudioTrackId = null;
            this.muxer = MP4Box.createFile();

            try {
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
                this._cleanup();
                if (this.options.onError) this.options.onError(err);
                throw err;
            } finally {
                this._cleanup();
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
                
                mp4boxfile.onError = (e) => reject(new Error('MP4Box parse error: ' + e));
                
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
                    
                    if (expectedExtractions > 0 && extractionCount >= expectedExtractions) {
                        resolve();
                    }
                };
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    const buffer = e.target.result;
                    buffer.fileStart = 0;
                    
                    const originalOnReady = mp4boxfile.onReady;
                    mp4boxfile.onReady = (info) => {
                        originalOnReady(info);
                        expectedExtractions = (this.videoTrack ? 1 : 0) + (this.audioTrack ? 1 : 0);
                        if (expectedExtractions === 0) {
                            reject(new Error('No media tracks found in video'));
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
         * Sets up WebCodecs VideoEncoder and creates MP4Box tracks.
         * Ensures Video Track is Track 1 and Audio Track is Track 2.
         */
        async _setupEncodingMuxing() {
            const codecString = this.videoTrack.codec || 'avc1.42E01E';
            this.videoAvcc = this._extractAvcc(this.videoTrack.id);

            const durationSec = (this.videoTrack.duration / this.videoTrack.timescale) || 1;
            const calculatedFps = Math.round(this.videoTrack.nb_samples / durationSec) || 30;
            this.videoFramerate = Math.max(1, Math.min(60, calculatedFps));

            const width = this.videoTrack.track_width || this.videoTrack.video?.width || this.videoTrack.width || 1280;
            const height = this.videoTrack.track_height || this.videoTrack.video?.height || this.videoTrack.height || 720;

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
                bitrate: this.videoTrack.bitrate || 3000000,
                framerate: this.videoFramerate,
                avc: { format: 'avc' }
            };
            
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
                const audioCodec = this.audioTrack.codec.split('.')[0] === 'mp4a' ? 'mp4a' : this.audioTrack.codec;
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

                            const cleanFrame = new VideoFrame(cleanCanvas, { timestamp, duration });
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
            
            const timescale = this.videoTrack.timescale || 90000;
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
                    
                    const stream = new DataStream();
                    stream.endianness = DataStream.BIG_ENDIAN;
                    this.muxer.write(stream);
                    
                    const resultBuffer = stream.buffer.slice(0, stream.position);
                    
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
