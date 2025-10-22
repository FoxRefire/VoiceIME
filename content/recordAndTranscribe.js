async function onButtonClick(targetEl) {
  let {startRecording} = await import(chrome.runtime.getURL("/utils/recorder.js"))
  let audio = await startRecording()
  let result = await chrome.runtime.sendMessage({
    action: "transcribe",
    audio: audio
  })
  targetEl.value = result
}