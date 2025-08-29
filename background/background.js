import { transcribe } from "./transcribe.js";
let sessions = []
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "transcribe") {
        console.log(message.audio)
        transcribe(message.audio).then(result => {
            console.log(result)
        })
    }
})
