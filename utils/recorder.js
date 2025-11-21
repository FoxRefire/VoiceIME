export function startRecording() {
    let stream = null;
    let mediaRecorder = null;
    let audioContext = null;
    let source = null;
    let analyser = null;
    let silenceTimeout = null;
    let animationFrameId = null;
    let isCancelled = false;
    
    const controller = {
        promise: new Promise(async (resolve, reject) => {
            // Load RMS threshold from settings
            let rmsThreshold = 5; // Default value
            let playStartSound = true; // Default value
            try {
                const result = await chrome.storage.local.get(['rmsThreshold', 'playStartSound']);
                if (result.rmsThreshold !== undefined) {
                    rmsThreshold = result.rmsThreshold;
                }
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
                analyser = audioContext.createAnalyser();
                source.connect(analyser);
              
                mediaRecorder = new MediaRecorder(stream);
                let chunks = [];
                let speaking = false;
                let initialized = false;
              
                mediaRecorder.ondataavailable = e => chunks.push(e.data);
                mediaRecorder.onstop = async () => {
                    if (isCancelled) {
                        return;
                    }
                    const blob = new Blob(chunks, { type: "audio/webm" });
                    resolve(new Uint8Array(await blob.arrayBuffer()));
                    cleanup();
                };
              
                function checkVolume() {
                    if (isCancelled) {
                        cleanup();
                        return;
                    }
                    
                    const data = new Uint8Array(analyser.fftSize);
                    analyser.getByteTimeDomainData(data);
                    const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) ** 2, 0) / data.length);
                    
                    if (rms > 0.05) {
                        if (!initialized) {
                            // Play start sound if enabled
                            if (playStartSound) {
                                new Audio(chrome.runtime.getURL("rec.mp3")).play()
                            }
                            initialized = true
                            
                            // Notify modal that microphone is ready
                            if (window.voiceimeModal) {
                                window.voiceimeModal.updateStatus('Ready', 'ready');
                                window.voiceimeModal.updateSubtitle('Microphone ready. Start speaking...');
                            }
                        }
                    }
                
                    if (rms > rmsThreshold) { // Use configurable threshold
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
                
                    if (!isCancelled) {
                        animationFrameId = requestAnimationFrame(checkVolume);
                    }
                }
                
                function cleanup() {
                    isCancelled = true;
                    if (silenceTimeout) {
                        clearTimeout(silenceTimeout);
                    }
                    if (animationFrameId) {
                        cancelAnimationFrame(animationFrameId);
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
                
                checkVolume();
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