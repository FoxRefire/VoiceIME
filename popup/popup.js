import { startRecording } from "/utils/recorder.js"

const status = await navigator.permissions.query({ name: 'microphone' })
if(status.state == "granted") {
    document.querySelector("#granted").style.display = "block"
    document.querySelector("#not-granted").style.display = "none"
} else {
    document.querySelector("#not-granted").style.display = "block"
    document.querySelector("#granted").style.display = "none"
}

document.querySelector("#grantMic").addEventListener("click", () => {
    if(chrome.windows){
        chrome.windows.create({
            url: "/popup/grantMicrophone.html",
            type: "popup",
            width: 600,
            height: 450
        })
    } else {
        chrome.tabs.create({url: "popup/manager.html"})
    }
})

document.querySelector("#startRecording").addEventListener("click", async () => {
    let audio = await startRecording()
    let result = await chrome.runtime.sendMessage({
        action: "transcribe",
        audio: audio
    })
    chrome.tabs.create({url: "https://duckduckgo.com/?t=ffab&q=" + result})
})

let languages = await fetch("/languages.json").then(r => r.json())
let currentLanguage = await chrome.storage.local.get("language").then(r => r.language)
let languageSelect = document.querySelector("#language")
for(let lang in languages) {
    let option = document.createElement("option")
    option.value = lang
    option.textContent = languages[lang]
    if(lang == currentLanguage) {
        option.selected = true
    }
    languageSelect.appendChild(option)
}

languageSelect.addEventListener("change", (e) => {
    chrome.storage.local.set({language: e.target.value})
})