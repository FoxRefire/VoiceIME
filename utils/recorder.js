export async function startRecording() {
    return new Promise(async resolve => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
      
        const mediaRecorder = new MediaRecorder(stream);
        let chunks = [];
        let speaking = false;
        let initialized = false;
        let silenceTimeout;
      
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        mediaRecorder.onstop = async () => {
          const blob = new Blob(chunks, { type: "audio/webm" });
          resolve(new Uint8Array(await blob.arrayBuffer()))
          stream.getTracks().forEach(track => track.stop())
        };
      
        function checkVolume() {
          const data = new Uint8Array(analyser.fftSize);
          analyser.getByteTimeDomainData(data);
          const rms = Math.sqrt(data.reduce((s, v) => s + (v - 128) ** 2, 0) / data.length);
          
          if (rms > 0.05) {
            if (!initialized) {

              new Audio(chrome.runtime.getURL("rec.mp3")).play()
              initialized = true
            }
          }
      
          if (rms > 5) { // 閾値調整
            if (!speaking) {
              console.log("🎤 start");
              chunks = [];
              mediaRecorder.start();
              speaking = true;
            }
            clearTimeout(silenceTimeout);
            silenceTimeout = setTimeout(() => {
              if (speaking) {
                console.log("🛑 stop");
                mediaRecorder.stop();
                speaking = false;
              }
            }, 1000); // 1秒無音で停止
          }
      
          requestAnimationFrame(checkVolume);
        }
        checkVolume();
    })
}