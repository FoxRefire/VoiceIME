// Selector for target input elements (add/adjust as needed)
const INPUT_SELECTOR = `input[type="text"], input[type="search"], textarea, [contenteditable="true"]:not([type="password"])`

// Top layer to place buttons
let layer = document.getElementById('tbi-layer');
if(document instanceof HTMLDocument) {
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'tbi-layer';
        document.documentElement.appendChild(layer);
    }
}

// Manage element -> button mapping
const map = new Map();

// Scan target elements and add buttons
function scanAndAttach(root = document) {
    const els = root.querySelectorAll(INPUT_SELECTOR);
    els.forEach(attachButtonIfNeeded);
}

function attachButtonIfNeeded(el) {
    if (map.has(el)) return;

    // Generate button
    const btn = Object.assign(document.createElement('button'), {
        title: 'VoiceIME',
        className: 'tbi-btn tbi-hidden'
    })
    const img = Object.assign(new Image, {
        src: chrome.runtime.getURL("icon.png")
    })
    btn.appendChild(img);

    // Handle click
    btn.addEventListener('click', () => onButtonClick(el));

    // Show/hide on hover
    let hoverTimer = null;
    function show() { btn.classList.remove('tbi-hidden'); btn.classList.add('tbi-visible'); }
    function hide() { btn.classList.remove('tbi-visible'); btn.classList.add('tbi-hidden'); }

    el.addEventListener('mouseenter', () => { clearTimeout(hoverTimer); show(); });
    el.addEventListener('mouseleave', () => { hoverTimer = setTimeout(hide, 120); });
    btn.addEventListener('mouseenter', () => { clearTimeout(hoverTimer); show(); });
    btn.addEventListener('mouseleave', () => { hoverTimer = setTimeout(hide, 120); });

    // Always show when focused
    el.addEventListener('focus', show);
    el.addEventListener('blur', hide);

    // Add to layer
    layer.appendChild(btn);
    map.set(el, btn);

    // Initial positioning
    positionButton(el);

    // Follow element size/position changes
    const ro = new ResizeObserver(() => positionButton(el));
    ro.observe(el);
    // Also follow viewport scroll/resize
    const reposition = () => positionButton(el);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition, true);

    // Clean up when element is removed from DOM
    const mo = new MutationObserver(() => {
        if (!document.contains(el)) {
            try {
                ro.disconnect();
                mo.disconnect();
                btn.remove();
                window.removeEventListener('scroll', reposition, true);
                window.removeEventListener('resize', reposition, true);
                map.delete(el);
            } catch { /* noop */ }
        }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
}

// Calculate button position (overlay on right edge, center of input)
function positionButton(el) {
    const btn = map.get(el);
    if (!btn) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
        btn.style.display = 'none';
        return;
    }
    btn.style.display = 'inline-flex';

    const paddingRight = parseFloat(getComputedStyle(el).paddingRight || '0');
    const offsetX = 6; // Move outward to avoid overlapping too much inside input
    const x = Math.min(rect.right - paddingRight - 6, rect.right) + offsetX;
    const y = rect.top + rect.height / 2;

    // Center alignment
    btn.style.left = `${x}px`;
    btn.style.top = `${y}px`;
    btn.style.transform = 'translate(-100%, -50%)'; // Align to right outer edge
}

// Initial scan
scanAndAttach();

// Support dynamic addition
const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
        m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) {
                const el = /** @type {Element} */(n);
                if (el.matches && el.matches(INPUT_SELECTOR)) {
                    attachButtonIfNeeded(el);
                }
                // Also scan children
                el.querySelectorAll?.(INPUT_SELECTOR).forEach(attachButtonIfNeeded);
            }
        });
    }
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// Refresh position on page visibility change
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        map.forEach((_, el) => positionButton(el));
    }
});
