    // --- ffmpeg.wasm ---
    import { FFmpeg } from "/libs/ffmpeg/ffmpeg/dist/esm/index.js"

    // --- Constants (unofficial endpoint/key) ---
    const SERVICE_URL = 'https://www.google.com/speech-api/full-duplex/v1';
    const BUILT_IN_API_KEY = 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw'; // Chromium built-in (unofficial use)

    // --- UI helpers ---
    const $ = (id) => document.getElementById(id);
    const log = (...args) => { const s = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        const el = $('log'); el.textContent += s + '\n'; el.scrollTop = el.scrollHeight; };
        const setStatus = (t) => $('status').textContent = t;
        const setPhase  = (t) => $('phase').textContent  = t;

        // --- State ---
        let mediaRecorder = null;
        let recordedChunks = [];
        let mediaStream = null;
        let downAbort = null;

        // --- Utilities ---
        function generatePair() {
            const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            let s = ''; for (let i=0;i<16;i++) s += chars[Math.floor(Math.random()*chars.length)];
            return s;
        }

        function buildUrl(direction, opts) {
            const u = new URL(`${SERVICE_URL}/${direction}`);
            u.searchParams.set('key', opts.key || BUILT_IN_API_KEY);
            if (opts.pair) u.searchParams.set('pair', opts.pair);
            u.searchParams.set('output', 'json');
            if (direction === 'up') {
                u.searchParams.set('app', 'chromium');
                if (opts.interim)    u.searchParams.set('interim', '');
                if (opts.continuous) u.searchParams.set('continuous', '');
                if (opts.maxAlts)    u.searchParams.set('maxAlternatives', String(opts.maxAlts));
                if (opts.pfilter !== undefined && opts.pfilter !== '') u.searchParams.set('pFilter', String(opts.pfilter));
                if (opts.lang)       u.searchParams.set('lang', String(opts.lang));
            }
            return u.toString();
        }

        // Streaming JSON object parser (handles chunked JSON stream)
        function createStreamingJsonObjectParser(onObject) {
            let buf = '';
            let depth = 0;
            let inStr = false;
            let esc = false;
            let start = -1;
            return function onChunkText(txt) {
                buf += txt;
                for (let i=0;i<buf.length;i++) {
                    const ch = buf[i];
                    if (inStr) {
                        if (esc) { esc = false; continue; }
                        if (ch === '\\') { esc = true; continue; }
                        if (ch === '"') { inStr = false; continue; }
                        continue;
                    }
                    if (ch === '"') { inStr = true; continue; }
                    if (ch === '{' || ch === '[') {
                        if (depth === 0) start = i;
                        depth++;
                        continue;
                    }
                    if (ch === '}' || ch === ']') {
                        depth--;
                        if (depth === 0 && start !== -1) {
                            const jsonStr = buf.slice(start, i+1);
                            try { onObject(JSON.parse(jsonStr)); } catch {}
                            buf = buf.slice(i+1);
                            i = -1; start = -1;
                        }
                    }
                }
            };
        }

        async function openDownStream(opts, onObject) {
            const url = buildUrl('down', opts);
            setPhase('down:connecting');
            log('DOWN', url);
            const ctrl = new AbortController();
            downAbort = () => ctrl.abort();
            const res = await fetch(url, { method:'GET', signal: ctrl.signal });
            setPhase('down:open');
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            const parse = createStreamingJsonObjectParser(onObject);
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                parse(decoder.decode(value, { stream:true }));
            }
            setPhase('down:ended');
        }

        async function postAudioUp(opts, flacBlob) {
            const url = buildUrl('up', opts);
            setPhase('up:posting');
            log('UP', url);
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': `audio/x-flac; rate=${opts.sampleRate||16000}` },
                body: flacBlob,
            });
            const text = await res.text();
            log('UP response body:', text.slice(0, 500) + (text.length>500?'…':''));
            setPhase('up:done');
        }

        async function toFlacWithFfmpegWasm(webmBlob, sampleRate=16000) {
            setPhase('ffmpeg:loading');
            let ffmpeg = new FFmpeg()
            await ffmpeg.load({
                coreURL: "/libs/ffmpeg/core/dist/esm/ffmpeg-core.js",
            })
            setPhase('ffmpeg:writing');
            ffmpeg.writeFile("audio.webm", new Uint8Array(await webmBlob.arrayBuffer()));
            setPhase('ffmpeg:running');
            // -ac 1 mono, -ar sampleRate, -compression_level 5 (reasonable), format flac
            await ffmpeg.exec(['-i', "audio.webm", '-ac', '1', '-ar', String(sampleRate), '-compression_level', '5', '-f', 'flac', "out.flac"]);
            setPhase('ffmpeg:reading');
            const out = await ffmpeg.readFile("out.flac");
            const flacBlob = new Blob([out.buffer], { type:'audio/x-flac' });
            return flacBlob;
        }

        // Subtitle-like display helper
        async function renderTranscript(text, subtitleMode) {
            const area = $('transcript');
            if (!subtitleMode) {
                area.textContent += (text + '\n');
                return;
            }
            area.textContent = text;
            const words = (text.trim().split(/\s+/).filter(Boolean).length) || 1;
            await new Promise(r=>setTimeout(r, Math.round(words * 260)));
            area.textContent = '';
        }

        function handleSpeechObject(obj, opts) {
            if (!obj || !obj.result) return;
            for (const result of obj.result) {
                const isFinal = !!result.final;
                for (const alt of (result.alternative||[])) {
                    const transcript = String(alt.transcript||'').trim();
                    if (!transcript) continue;
                    if (!isFinal && !opts.interim) continue; // show interim only if requested
                    renderTranscript(transcript, opts.subtitleMode);
                }
            }
        }

        async function startRecording() {
            try {
                setStatus('requesting mic');
                mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                setStatus('recording');

                // Choose a supported mimeType
                let mime = '';
                const candidates = [ 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg' ];
                for (const c of candidates) { if (MediaRecorder.isTypeSupported(c)) { mime = c; break; } }
                if (!mime) throw new Error('No supported MediaRecorder mimeType (webm/ogg)');

                recordedChunks = [];
                mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime, audioBitsPerSecond: 128000 });
                mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data); };
                mediaRecorder.onstop = onStopped;
                mediaRecorder.start();
                $('btnStart').disabled = true;
                $('btnStop').disabled = false;
            } catch (e) {
                log('ERROR startRecording:', e.message||e);
                setStatus('error');
            }
        }

        function stopRecording() {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                setStatus('stopping');
                mediaRecorder.stop();
                mediaStream.getTracks().forEach(t => t.stop());
                $('btnStop').disabled = true;
            }
        }

        async function onStopped() {
            try {
                setStatus('processing');
                const blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || 'audio/webm' });
                log('recorded blob:', blob.type, Math.round(blob.size/1024), 'KB');

                const sampleRate = Number($('sampleRate').value)||16000;
                const flac = await toFlacWithFfmpegWasm(blob, sampleRate);
                log('flac blob:', Math.round(flac.size/1024), 'KB');

                // Expose download
                const url = URL.createObjectURL(flac);
                const a = $('downloadFlac'); a.href = url; a.hidden = false;

                // Build opts
                const opts = {
                    key: $('apiKey').value.trim() || undefined,
                    pair: generatePair(),
                    interim: $('optInterim').checked,
                    continuous: $('optContinuous').checked,
                    subtitleMode: $('optSubtitle').checked,
                    maxAlts: Number($('maxAlts').value)||1,
                    pfilter: $('pfilter').value,
                    lang: $('lang').value.trim()||'ja-JP',
                    sampleRate,
                };

                // Start DOWN first, then UP
                setStatus('recognizing');
                const downPromise = openDownStream(opts, (obj)=>handleSpeechObject(obj, opts)).catch(e=>log('DOWN error', e?.message||e));
                await postAudioUp(opts, flac);
                await downPromise;
                setStatus('done');
            } catch (e) {
                log('ERROR onStopped:', e.message||e);
                setStatus('error');
            } finally {
                $('btnStart').disabled = false;
                $('btnStop').disabled = true;
                setPhase('ready');
            }
        }

        // --- Bind UI ---
        $('btnStart').addEventListener('click', startRecording);
        $('btnStop').addEventListener('click', stopRecording);
        $('btnClear').addEventListener('click', ()=>{ $('transcript').textContent=''; $('log').textContent=''; });

        // Abort DOWN stream if leaving page
        window.addEventListener('beforeunload', ()=>{ if (downAbort) downAbort(); });

        // FYI: This uses an unofficial/legacy endpoint. For production use, prefer Google Cloud Speech-to-Text official API.
