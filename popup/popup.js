import { startRecording } from "/utils/recorder.js"
import { VoiceCommandMatcher } from "/utils/voiceCommands.js"

class VoiceIMEPopup {
    constructor() {
        this.isRecording = false;
        this.currentResult = '';
        this.voiceCommandMatcher = new VoiceCommandMatcher();
        this.searchEngines = {
            duckduckgo: 'https://duckduckgo.com/?t=ffab&q=',
            google: 'https://www.google.com/search?q=',
            bing: 'https://www.bing.com/search?q=',
            yahoo: 'https://search.yahoo.com/search?p='
        };
        
        this.init();
    }
    
    async init() {
        await this.checkMicrophonePermission();
        await this.voiceCommandMatcher.loadCommands();
        this.setupEventListeners();
        
        // Auto-start recording if permission is granted
        if (this.hasPermission) {
            setTimeout(() => {
                this.startVoiceRecognition();
            }, 500); // Small delay for UI to settle
        }
    }
    
    async checkMicrophonePermission() {
        try {
            const status = await navigator.permissions.query({ name: 'microphone' });
            this.hasPermission = status.state === "granted";
            
            if (this.hasPermission) {
                this.showMainInterface();
            } else {
                this.showErrorState('Microphone permission required');
            }
        } catch (error) {
            console.error('Permission check failed:', error);
            this.showErrorState('Unable to check microphone permission');
        }
    }
    
    setupEventListeners() {
        // Settings button
        document.getElementById('settingsButton').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('/popup/settings.html') });
        });
        
        // Grant permission button
        document.getElementById('grantMic').addEventListener('click', () => {
            this.requestMicrophonePermission();
        });
        
        // Start recording button
        document.getElementById('startRecording').addEventListener('click', () => {
            this.startVoiceRecognition();
        });
        
        // Search button
        document.getElementById('searchButton').addEventListener('click', () => {
            this.searchResult();
        });
        
        // Copy button
        document.getElementById('copyButton').addEventListener('click', () => {
            this.copyResult();
        });
    }
    
    showMainInterface() {
        document.getElementById('errorState').classList.remove('active');
        document.getElementById('actionButtons').style.display = 'flex';
        this.updateStatus('Ready to listen', 'Click to start voice recognition');
    }
    
    showErrorState(message) {
        document.getElementById('errorState').classList.add('active');
        document.getElementById('actionButtons').style.display = 'none';
        document.getElementById('errorMessage').textContent = message;
    }
    
    async requestMicrophonePermission() {
        try {
            if (chrome.windows) {
                chrome.windows.create({
                    url: chrome.runtime.getURL("/popup/grantMicrophone.html"),
                    type: "popup",
                    width: 600,
                    height: 450
                });
            } else {
                chrome.tabs.create({ url: chrome.runtime.getURL("/popup/grantMicrophone.html") });
            }
        } catch (error) {
            console.error('Failed to open permission request:', error);
            this.showErrorState('Failed to request permission');
        }
    }
    
    async startVoiceRecognition() {
        if (this.isRecording) return;
        
        let recordingController = null;
        let isCancelled = false;
        
        try {
            this.isRecording = true;
            
            // Set up modal interface for recorder.js to update status
            window.voiceimeModal = {
                updateStatus: (status, className = '') => {
                    this.updateStatus(status, this.getSubtitleForStatus(status));
                    
                    // Show recording indicator when recording starts
                    if (status === 'Recording...') {
                        this.showRecordingState();
                    }
                },
                updateSubtitle: (subtitle) => {
                    const subtitleEl = document.getElementById('subtitleText');
                    if (subtitleEl) {
                        subtitleEl.textContent = subtitle;
                    }
                }
            };
            
            // Show preparing state
            this.updateStatus('Preparing', 'Preparing microphone...');
            
            recordingController = startRecording();
            const audio = await recordingController.promise;
            
            if (isCancelled) {
                return;
            }
            
            // Clear modal reference after recording
            window.voiceimeModal = null;
            
            this.updateStatus('Processing...', 'Converting speech to text');
            this.showProcessingState();
            
            const response = await chrome.runtime.sendMessage({
                action: "transcribe",
                audio: Array.from(audio)
            });
            
            if (isCancelled) {
                return;
            }
            
            // Check if response indicates success
            if (response && response.success === false) {
                throw new Error(response.error || 'Transcription failed');
            }
            
            const result = response && response.result !== undefined ? response.result : response;
            if (!result) {
                throw new Error('No transcription result received');
            }
            
            this.currentResult = result;
            
            // Check for voice command match
            await this.voiceCommandMatcher.loadCommands(); // Reload commands in case they were updated
            const commandMatch = this.voiceCommandMatcher.findMatch(result);
            
            if (commandMatch) {
                // Execute voice command
                this.updateStatus('Executing command...', 'Running voice command');
                const executionResult = await this.voiceCommandMatcher.executeCommand(commandMatch);
                
                if (executionResult.success) {
                    this.updateStatus('Command executed', executionResult.message || 'Voice command executed successfully');
                    // Don't show result, just show success message
                    setTimeout(() => {
                        this.showMainInterface();
                    }, 1500);
                } else {
                    throw new Error(executionResult.error || 'Failed to execute voice command');
                }
            } else {
                // No command match, show result as usual
                this.showResult(result);
            }
            
        } catch (error) {
            if (isCancelled) {
                return;
            }
            console.error('Voice recognition failed:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            window.voiceimeModal = null;
            
            // Show more specific error message if available
            let errorMessage = 'Voice recognition failed. Please try again.';
            if (error.message) {
                if (error.message.includes('cancelled')) {
                    return; // Don't show error for user cancellation
                }
                errorMessage = `Error: ${error.message}`;
            }
            this.showErrorState(errorMessage);
        } finally {
            this.isRecording = false;
        }
    }
    
    getSubtitleForStatus(status) {
        const statusMap = {
            'Preparing': 'Preparing microphone...',
            'Ready': 'Microphone ready. Start speaking...',
            'Recording...': 'Recording audio...',
            'Recording completed': 'Converting speech to text...',
            'Processing...': 'Converting speech to text',
            'Completed': 'Text has been entered',
            'Error occurred': 'Please try again'
        };
        return statusMap[status] || '';
    }
    
    showRecordingState() {
        document.getElementById('recordingIndicator').classList.add('active');
        document.getElementById('resultDisplay').classList.remove('active');
        // Status will be updated by recorder.js via window.voiceimeModal
    }
    
    showProcessingState() {
        document.getElementById('recordingIndicator').classList.remove('active');
        document.getElementById('resultDisplay').classList.remove('active');
        this.updateStatus('Processing...', 'Converting speech to text');
    }
    
    async showResult(result) {
        document.getElementById('recordingIndicator').classList.remove('active');
        document.getElementById('resultDisplay').classList.add('active');
        document.getElementById('resultText').textContent = result;
        this.updateStatus('Recognition complete', 'Text recognized successfully');
        
        // Auto-search if enabled
        const autoSearchEnabled = await this.isAutoSearchEnabled();
        if (autoSearchEnabled) {
            // Small delay to show the result before searching
            setTimeout(() => {
                this.searchResult();
            }, 1000);
        }
    }
    
    updateStatus(status, subtitle) {
        document.getElementById('statusText').textContent = status;
        document.getElementById('subtitleText').textContent = subtitle;
    }
    
    async searchResult() {
        if (!this.currentResult) return;
        
        try {
            // Get selected search engine from storage
            const result = await chrome.storage.local.get('searchEngine');
            const searchEngine = result.searchEngine || 'duckduckgo';
            const searchUrl = this.searchEngines[searchEngine] + encodeURIComponent(this.currentResult);
            
            // Get current tab to open new tab next to it
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.create({ 
                url: searchUrl,
                index: currentTab.index + 1
            });
        } catch (error) {
            console.error('Search failed:', error);
        }
    }
    
    async copyResult() {
        if (!this.currentResult) return;
        
        try {
            await navigator.clipboard.writeText(this.currentResult);
            
            // Show temporary feedback
            const copyButton = document.getElementById('copyButton');
            const originalText = copyButton.innerHTML;
            copyButton.innerHTML = '<i class="material-icons">check</i>Copied!';
            copyButton.style.background = 'rgba(76, 175, 80, 0.9)';
            
            setTimeout(() => {
                copyButton.innerHTML = originalText;
                copyButton.style.background = '';
            }, 2000);
            
        } catch (error) {
            console.error('Copy failed:', error);
        }
    }
    
    async isAutoSearchEnabled() {
        try {
            const result = await chrome.storage.local.get('autoSearch');
            return result.autoSearch !== false; // Default to true if not set
        } catch (error) {
            console.error('Failed to check auto-search setting:', error);
            return true; // Default to enabled
        }
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new VoiceIMEPopup();
});