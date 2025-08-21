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
