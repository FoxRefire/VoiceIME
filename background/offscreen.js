import { toFlac } from "/utils/toFlac.js";

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toFlac") {
        const { audio, sampleRate, channels } = message;
        toFlac(new Uint8Array(audio).buffer, sampleRate || 16000, channels || 1)
            .then(flacBlob => {
                // Convert Blob to ArrayBuffer for sending via message
                flacBlob.arrayBuffer().then(buffer => {
                    sendResponse({ 
                        success: true, 
                        flac: Array.from(new Uint8Array(buffer))
                    });
                });
            })
            .catch(error => {
                console.error("toFlac error in offscreen:", error);
                sendResponse({ 
                    success: false, 
                    error: error.message || 'toFlac conversion failed' 
                });
            });
        return true; // Keep channel open for async response
    }
});

