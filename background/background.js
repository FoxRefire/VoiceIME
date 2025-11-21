import { transcribe } from "/utils/transcribe.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "transcribe") {
        console.log(message.audio)
        transcribe(message.audio)
            .then(result => {
                console.log("result", result)
                sendResponse({ success: true, result: result })
            })
            .catch(error => {
                console.error("Transcription error:", error)
                sendResponse({ success: false, error: error.message || 'Transcription failed' })
            })
        return true; // Keep the message channel open for async response
    }
    return false
})
