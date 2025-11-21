// VoiceIME Modal Management
class VoiceIMEModal {
    constructor() {
        this.modal = null;
        this.isVisible = false;
        this.createModal();
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'voiceime-modal';
        this.modal.innerHTML = `
            <div class="voiceime-modal-content">
                <div class="voiceime-modal-icon">
                    <img src="${chrome.runtime.getURL('icon.png')}" alt="VoiceIME">
                </div>
                <div class="voiceime-modal-title">VoiceIME</div>
                <div class="voiceime-modal-subtitle">Starting voice input...</div>
                <div class="voiceime-modal-status">Preparing</div>
            </div>
        `;
        document.body.appendChild(this.modal);
    }

    show(status = 'Preparing') {
        if (!this.isVisible) {
            this.updateStatus(status);
            this.modal.classList.add('show');
            this.isVisible = true;
        }
    }

    hide() {
        if (this.isVisible) {
            this.modal.classList.remove('show');
            this.isVisible = false;
        }
    }

    updateStatus(status, className = '') {
        const statusEl = this.modal.querySelector('.voiceime-modal-status');
        statusEl.textContent = status;
        statusEl.className = `voiceime-modal-status ${className}`;
    }

    updateSubtitle(subtitle) {
        const subtitleEl = this.modal.querySelector('.voiceime-modal-subtitle');
        subtitleEl.textContent = subtitle;
    }
}

// Global modal instance
let voiceimeModal = null;

// Make modal accessible globally for recorder.js
window.voiceimeModal = null;

async function onButtonClick(targetEl) {
  // Initialize modal if not exists
  if (!voiceimeModal) {
    voiceimeModal = new VoiceIMEModal();
    window.voiceimeModal = voiceimeModal;
  }

  try {
    // Show modal with initial status
    voiceimeModal.show('Preparing');
    voiceimeModal.updateSubtitle('Preparing microphone...');

    // Start recording with modal updates
    let {startRecording} = await import(chrome.runtime.getURL("/utils/recorder.js"))
    
    // Don't update to "Recording..." yet - wait for RMS > 0.05 in recorder.js
    // The modal will be updated by recorder.js when microphone is ready
    
    let audio = await startRecording()
    
    voiceimeModal.updateStatus('Processing...', 'processing');
    voiceimeModal.updateSubtitle('Converting speech to text...');
    
    let result = await chrome.runtime.sendMessage({
      action: "transcribe",
      audio: audio
    })
    
    voiceimeModal.updateStatus('Completed', 'completed');
    voiceimeModal.updateSubtitle('Text has been entered');
    
    // Update target element
    targetEl.value = result
    
    // Hide modal after a short delay
    setTimeout(() => {
      voiceimeModal.hide();
    }, 1000);
    
  } catch (error) {
    console.error('VoiceIME Error:', error);
    voiceimeModal.updateStatus('Error occurred', 'error');
    voiceimeModal.updateSubtitle('Please try again');
    
    // Hide modal after error
    setTimeout(() => {
      voiceimeModal.hide();
    }, 2000);
  }
}