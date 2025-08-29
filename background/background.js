import { transcribe } from "/utils/transcribe.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "transcribe") {
        console.log(message.audio)
        transcribe(message.audio).then(result => {
            console.log("result", result)
            sendResponse(result)
        })
    }
    return true
})

browser.pageAction.onClicked.addListener((tab) => {
    browser.tabs.executeScript(tab.id, {
      code: `alert('PageAction clicked!')`
    });
});
browser.pageAction.show(tabId)