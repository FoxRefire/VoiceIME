import { startRecording } from "/utils/recorder.js"

class VoiceIMEPopup {
    constructor() {
        this.isRecording = false;
        this.currentResult = '';
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
        
        try {
            this.isRecording = true;
            this.showRecordingState();
            
            const audio = await startRecording();
            
            this.updateStatus('Processing...', 'Converting speech to text');
            this.showProcessingState();
            
            const result = await chrome.runtime.sendMessage({
                action: "transcribe",
                audio: audio
            });
            
            this.currentResult = result;
            this.showResult(result);
            
        } catch (error) {
            console.error('Voice recognition failed:', error);
            this.showErrorState('Voice recognition failed. Please try again.');
        } finally {
            this.isRecording = false;
        }
    }
    
    showRecordingState() {
        document.getElementById('recordingIndicator').classList.add('active');
        document.getElementById('resultDisplay').classList.remove('active');
        this.updateStatus('Listening...', 'Speak now');
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
            
            chrome.tabs.create({ url: searchUrl });
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