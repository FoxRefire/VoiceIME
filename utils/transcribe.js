    // --- Constants (unofficial endpoint/key) ---
    const SERVICE_URL = 'https://www.google.com/speech-api/full-duplex/v1';
    const BUILT_IN_API_KEY = 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw'; // Chromium built-in (unofficial use)

    // --- UI helpers ---
    const $ = (id) => document.getElementById(id);
    const log = (...args) => { console.log(args) };
        const setStatus = (t) => console.log(t)
        const setPhase  = (t) => console.log(t)

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

        function handleSpeechObject(obj, opts, resolve) {
            if (!obj || !obj.result) return;
            for (const result of obj.result) {
                const isFinal = !!result.final;
                for (const alt of (result.alternative||[])) {
                    const transcript = String(alt.transcript||'').trim();
                    if (!transcript) continue;
                    if (!isFinal && !opts.interim) continue; // show interim only if requested
                    resolve(transcript)
                }
            }
        }

        export async function transcribe(flac) {
            console.log(flac)
            const lang = await chrome.storage.local.get("language").then(r => r.language) || navigator.language || 'en-US'
            const pfilterResult = await chrome.storage.local.get("pfilter");
            const pfilter = pfilterResult.pfilter !== undefined ? pfilterResult.pfilter : 2; // Default to 2

            // Build opts
            const opts = {
                key: undefined,
                pair: generatePair(),
                interim: false,
                continuous: false,
                maxAlts: 1,
                pfilter: pfilter,
                lang: lang,
                sampleRate: 16000,
            };

            return new Promise(async (resolve, reject) => {
                let resolved = false;
                
                // Timeout after 30 seconds
                const timeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        reject(new Error('Transcription timeout: No response from speech recognition service'));
                    }
                }, 30000);
                
                const handleResolve = (result) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        resolve(result);
                    }
                };
                
                const handleReject = (error) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        reject(error);
                    }
                };
                
                try {
                    // Start DOWN first, then UP
                    setStatus('recognizing');
                    const downPromise = openDownStream(opts, (obj)=>handleSpeechObject(obj, opts, handleResolve)).catch(e => handleReject(e));
                    await postAudioUp(opts, flac);
                    await downPromise;
                    setStatus('done');
                    
                    // If we reach here without resolving, it means no result was received
                    if (!resolved) {
                        handleReject(new Error('No transcription result received'));
                    }
                } catch (error) {
                    handleReject(error);
                }
            })
        }
