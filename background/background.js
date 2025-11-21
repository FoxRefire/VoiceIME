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
    } else if (message.action === "executeScript") {
        // Execute JavaScript code in a safe context
        try {
            // Create a function from the code and execute it
            const func = new Function(message.code);
            const result = func();
            
            // If result is a promise, wait for it
            if (result && typeof result.then === 'function') {
                result
                    .then(res => sendResponse({ success: true, message: 'Script executed', result: res }))
                    .catch(err => sendResponse({ success: false, error: err.message || 'Script execution failed' }));
                return true;
            } else {
                sendResponse({ success: true, message: 'Script executed', result: result });
            }
        } catch (error) {
            console.error("Script execution error:", error);
            sendResponse({ success: false, error: error.message || 'Script execution failed' });
        }
        return true;
    }
    return false
})
