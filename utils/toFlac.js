export async function toFlac(audio, sampleRate = 16000, channels = 1) {    
    window.FLAC_SCRIPT_LOCATION = '/libs/libflacjs/'  
    await import("/libs/libflacjs/libflac.min.wasm.js")  
    await new Promise((resolve) => {    
        if (Flac.isReady()) {    
            resolve();    
        } else {    
            Flac.onready = () => resolve();    
        }    
    });    
    
    // 1. Create AudioContext with specified sample rate  
    const audioContext = new AudioContext({ sampleRate: sampleRate });
    const audioBuffer = await audioContext.decodeAudioData(audio.buffer);    
    
    // 2. Extract PCM data from AudioBuffer (Float32Array)    
    const float32Data = audioBuffer.getChannelData(0);  
    
    // 3. Convert Float32Array to Int32Array (16-bit)  
    const bitsPerSample = 16;  
    const buffer_i32 = new Int32Array(float32Data.length);  
    for (let i = 0; i < float32Data.length; i++) {  
        // Normalize to 16-bit range and store as Int32  
        buffer_i32[i] = Math.max(-0x8000, Math.min(0x7FFF, Math.round(float32Data[i] * 0x7FFF)));  
    }  
    
    // 4. Encode to FLAC using libflac.js    
    const encBuffer = [];    
    let metaData;    
    
    const flac_encoder = Flac.create_libflac_encoder(    
    sampleRate,  // Use sample rate specified in arguments  
    channels,    // Use channel count specified in arguments  
    bitsPerSample,    
    5,  
    0,  
    false  
    );    
    
    const write_callback = (encodedData) => {    
        encBuffer.push(encodedData);    
    };    
    
    const metadata_callback = (data) => {    
        metaData = data;    
    };    
    
    Flac.init_encoder_stream(flac_encoder, write_callback, metadata_callback);    
    
    Flac.FLAC__stream_encoder_process_interleaved(    
    flac_encoder,     
    buffer_i32,     
    buffer_i32.length / channels  // Use channels from arguments  
    );    
    
    Flac.FLAC__stream_encoder_finish(flac_encoder);    
    Flac.FLAC__stream_encoder_delete(flac_encoder);    
    
    // Merge encoded buffers and create Blob    
    const totalLength = encBuffer.reduce((acc, buf) => acc + buf.byteLength, 0);    
    const mergedBuffer = new Uint8Array(totalLength);    
    let offset = 0;    
    for (const buffer of encBuffer) {    
        mergedBuffer.set(buffer, offset);    
        offset += buffer.byteLength;    
    }    
    
    return new Blob([mergedBuffer], { type: 'audio/flac' });  
}