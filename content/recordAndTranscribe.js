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
                <button class="voiceime-modal-cancel-btn">Cancel</button>
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

    setCancelHandler(handler) {
        const cancelBtn = this.modal.querySelector('.voiceime-modal-cancel-btn');
        if (cancelBtn) {
            // Remove existing listeners
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            newCancelBtn.addEventListener('click', handler);
        }
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

  let recordingController = null;
  let isCancelled = false;

  try {
    // Show modal with initial status
    voiceimeModal.show('Preparing');
    voiceimeModal.updateSubtitle('Preparing microphone...');

    // Set up cancel handler
    voiceimeModal.setCancelHandler(() => {
      isCancelled = true;
      if (recordingController) {
        recordingController.cancel();
      }
      voiceimeModal.hide();
    });

    // Start recording with modal updates
    let {startRecording} = await import(chrome.runtime.getURL("/utils/recorder.js"))
    
    // Don't update to "Recording..." yet - wait for RMS > 0.05 in recorder.js
    // The modal will be updated by recorder.js when microphone is ready
    
    recordingController = startRecording();
    let audio = await recordingController.promise;
    
    if (isCancelled) {
      return;
    }
    
    voiceimeModal.updateStatus('Processing...', 'processing');
    voiceimeModal.updateSubtitle('Converting speech to text...');
    
    let result = await chrome.runtime.sendMessage({
      action: "transcribe",
      audio: audio
    })
    
    if (isCancelled) {
      return;
    }
    
    voiceimeModal.updateStatus('Completed', 'completed');
    voiceimeModal.updateSubtitle('Text has been entered');
    
    // Update target element
    targetEl.value = result
    
    // Hide modal after a short delay
    setTimeout(() => {
      voiceimeModal.hide();
    }, 1000);
    
  } catch (error) {
    if (isCancelled) {
      return;
    }
    console.error('VoiceIME Error:', error);
    voiceimeModal.updateStatus('Error occurred', 'error');
    voiceimeModal.updateSubtitle('Please try again');
    
    // Hide modal after error
    setTimeout(() => {
      voiceimeModal.hide();
    }, 2000);
  }
}