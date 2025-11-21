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

// Helper function to insert text into different types of elements
function insertTextIntoElement(element, text) {
  // Check if element is contenteditable
  if (element.isContentEditable || element.contentEditable === 'true') {
    // Focus the element first to ensure we can work with selection
    element.focus();
    
    const selection = window.getSelection();
    let range;
    
    // Try to get existing selection
    if (selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
    } else {
      // Create a new range at the end of the element
      range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false); // Collapse to end
    }
    
    // Delete any existing selection
    range.deleteContents();
    
    // Insert text node
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    
    // Move cursor after inserted text
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Trigger input event for compatibility with frameworks
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    // For input and textarea elements, use value property
    element.value = text;
    // Trigger input event for compatibility
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    // Fallback: try value property first, then textContent
    if ('value' in element) {
      element.value = text;
    } else {
      element.textContent = text;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

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
    
    const response = await chrome.runtime.sendMessage({
      action: "transcribe",
      audio: audio
    })
    
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
    
    voiceimeModal.updateStatus('Completed', 'completed');
    voiceimeModal.updateSubtitle('Text has been entered');
    
    // Update target element
    insertTextIntoElement(targetEl, result);
    
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