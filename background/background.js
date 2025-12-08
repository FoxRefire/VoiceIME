import { transcribe } from "/utils/transcribe.js";
import { toFlac } from "/utils/toFlac.js";

// Helper function to ensure offscreen document exists
async function ensureOffscreenDocument() {
    // Check if offscreen document already exists
    const clients = await self.clients.matchAll();
    const offscreenClient = clients.find(client => client.url === chrome.runtime.getURL('/background/offscreen.html'));
    
    if (offscreenClient) {
        return true;
    }
    
    // Create offscreen document
    try {
        await chrome.offscreen.createDocument({
            url: '/background/offscreen.html',
            reasons: ['DOM_SCRAPING'],
            justification: 'Processing audio to FLAC format requires DOM APIs'
        });
        return true;
    } catch (error) {
        console.error("Failed to create offscreen document:", error);
        return false;
    }
}

// Helper function to convert FLAC array back to Blob
function arrayToBlob(array) {
    return new Blob([new Uint8Array(array)], { type: 'audio/flac' });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "transcribe") {
        console.log(message.audio)
        
        const processToFlac = async () => {
            if (chrome.offscreen) {
                // Use offscreen document for toFlac processing
                const offscreenReady = await ensureOffscreenDocument();
                if (offscreenReady) {
                    const response = await chrome.runtime.sendMessage({
                        action: "toFlac",
                        audio: message.audio,
                        sampleRate: 16000,
                        channels: 1
                    });
                    
                    if (response && response.success) {
                        const flacBlob = arrayToBlob(response.flac);
                        return flacBlob;
                    } else {
                        throw new Error(response?.error || 'toFlac conversion failed in offscreen');
                    }
                }
            } else {
                // Use direct execution if chrome.offscreen is not available
                return toFlac(new Uint8Array(message.audio).buffer, 16000);
            }
        };
        
        processToFlac().then(flac => {
            transcribe(flac)
            .then(result => {
                console.log("result", result)
                sendResponse({ success: true, result: result })
            })
            .catch(error => {
                console.error("Transcription error:", error)
                sendResponse({ success: false, error: error.message || 'Transcription failed' })
            })
        }).catch(error => {
            console.error("toFlac error:", error)
            sendResponse({ success: false, error: error.message || 'toFlac conversion failed' })
        })
    }
    return true
})
