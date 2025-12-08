export function startRecording() {
    let stream = null;
    let mediaRecorder = null;
    let audioContext = null;
    let source = null;
    let vadNode = null;
    let silenceTimeout = null;
    let isCancelled = false;
    
    const controller = {
        promise: new Promise(async (resolve, reject) => {
            // Load settings
            let playStartSound = true; // Default value
            try {
                const result = await chrome.storage.local.get(['playStartSound']);
                if (result.playStartSound !== undefined) {
                    playStartSound = result.playStartSound;
                }
            } catch (error) {
                console.warn('Failed to load settings, using defaults:', error);
            }
            
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioContext = new AudioContext();
                source = audioContext.createMediaStreamSource(stream);
              
                // Create analyser for RMS-based initialization check
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 2048;
                source.connect(analyser);
              
                // Load VAD AudioWorkletProcessor
                const vadWorkletUrl = chrome.runtime.getURL("/libs/vad-audio-worklet/vad-audio-worklet.js");
                await audioContext.audioWorklet.addModule(vadWorkletUrl);
              
                // Create VAD node
                vadNode = new AudioWorkletNode(audioContext, "vad", {
                    processorOptions: {
                        sampleRate: audioContext.sampleRate,
                        fftSize: 128,
                        debug: false
                    }
                });
              
                source.connect(vadNode);
              
                mediaRecorder = new MediaRecorder(stream);
                let chunks = [];
                let speaking = false;
                let initialized = false;
                let animationFrameId = null;
              
                mediaRecorder.ondataavailable = e => chunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    if (isCancelled) {
                        return;
                    }
                    const blob = new Blob(chunks, { type: "audio/webm" });
                    resolve(new Uint8Array(await blob.arrayBuffer()));
                    cleanup();
                };
              
                // Check RMS for initialization (microphone ready detection)
                function checkInitialization() {
                    if (isCancelled || initialized) {
                        if (animationFrameId) {
                            cancelAnimationFrame(animationFrameId);
                            animationFrameId = null;
                        }
                        return;
                    }
                    
                    const data = new Uint8Array(analyser.fftSize);
                    analyser.getByteTimeDomainData(data);
                    const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) ** 2, 0) / data.length);
                    
                    if (rms > 0.5) {
                        // Play start sound if enabled
                        if (playStartSound) {
                            new Audio(chrome.runtime.getURL("rec.mp3")).play()
                        }
                        initialized = true;
                        
                        // Notify modal that microphone is ready
                        if (window.voiceimeModal) {
                            window.voiceimeModal.updateStatus('Ready', 'ready');
                            window.voiceimeModal.updateSubtitle('Microphone ready. Start speaking...');
                        }
                        
                        // Stop checking once initialized
                        if (animationFrameId) {
                            cancelAnimationFrame(animationFrameId);
                            animationFrameId = null;
                        }
                    } else {
                        animationFrameId = requestAnimationFrame(checkInitialization);
                    }
                }
              
                // Handle VAD events for speech detection
                vadNode.port.onmessage = (event) => {
                    if (isCancelled || !initialized) {
                        return;
                    }
                    
                    const { cmd, data } = event.data;
                    
                    if (cmd === "speech") {
                        if (!speaking) {
                            console.log("🎤 start");
                            chunks = [];
                            mediaRecorder.start();
                            speaking = true;
                            
                            // Notify modal that recording has started
                            if (window.voiceimeModal) {
                                window.voiceimeModal.updateStatus('Recording...', 'recording');
                                window.voiceimeModal.updateSubtitle('Recording audio...');
                            }
                        }
                        
                        // Clear silence timeout when speech is detected
                        clearTimeout(silenceTimeout);
                    } else if (cmd === "silence") {
                        if (speaking) {
                            // Set timeout to stop recording after silence
                            clearTimeout(silenceTimeout);
                            silenceTimeout = setTimeout(() => {
                                if (speaking && !isCancelled) {
                                    console.log("🛑 stop");
                                    mediaRecorder.stop();
                                    speaking = false;
                                    
                                    // Notify modal that recording has stopped
                                    if (window.voiceimeModal) {
                                        window.voiceimeModal.updateStatus('Recording completed', 'completed');
                                        window.voiceimeModal.updateSubtitle('Converting speech to text...');
                                    }
                                }
                            }, 1000); // 1秒無音で停止
                        }
                    }
                };
                
                // Start checking for initialization
                checkInitialization();
                
                function cleanup() {
                    isCancelled = true;
                    if (silenceTimeout) {
                        clearTimeout(silenceTimeout);
                    }
                    if (animationFrameId) {
                        cancelAnimationFrame(animationFrameId);
                    }
                    if (vadNode) {
                        try {
                            vadNode.disconnect();
                        } catch (e) {
                            // Ignore errors when disconnecting
                        }
                    }
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                        try {
                            mediaRecorder.stop();
                        } catch (e) {
                            // Ignore errors when stopping
                        }
                    }
                    if (stream) {
                        stream.getTracks().forEach(track => track.stop());
                    }
                    if (audioContext && audioContext.state !== 'closed') {
                        audioContext.close();
                    }
                }
                
                controller.cancel = () => {
                    cleanup();
                    reject(new Error('Recording cancelled by user'));
                };
            } catch (error) {
                cleanup();
                reject(error);
            }
        }),
        cancel: () => {
            // Will be set after stream is initialized
        }
    };
    
    return controller;
}