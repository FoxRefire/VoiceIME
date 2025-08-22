// 対象とする入力要素のセレクタ（必要に応じて追加/調整）
const INPUT_SELECTOR = `input[type="text"], input[type="search"], textarea, [contenteditable="true"]:not([type="password"])`

// ボタンを載せる最上位レイヤ
let layer = document.getElementById('tbi-layer');
if (!layer) {
    layer = document.createElement('div');
    layer.id = 'tbi-layer';
    document.documentElement.appendChild(layer);
}

// 要素 -> ボタン の対応を管理
const map = new WeakMap();

// 対象要素をスキャンしてボタンを追加
function scanAndAttach(root = document) {
    const els = root.querySelectorAll(INPUT_SELECTOR);
    els.forEach(attachButtonIfNeeded);
}

function attachButtonIfNeeded(el) {
    if (map.has(el)) return;

    // ボタン生成
    const btn = Object.assign(document.createElement('button'), {
        title: 'VoiceIME',
        className: 'tbi-btn tbi-hidden'
    })
    const img = Object.assign(new Image, {
        src: chrome.runtime.getURL("icon.png")
    })
    btn.appendChild(img);

    // クリックで処理
    btn.addEventListener('click', onButtonClick);

    // ホバーで表示/非表示
    let hoverTimer = null;
    function show() { btn.classList.remove('tbi-hidden'); btn.classList.add('tbi-visible'); }
    function hide() { btn.classList.remove('tbi-visible'); btn.classList.add('tbi-hidden'); }

    el.addEventListener('mouseenter', () => { clearTimeout(hoverTimer); show(); });
    el.addEventListener('mouseleave', () => { hoverTimer = setTimeout(hide, 120); });
    btn.addEventListener('mouseenter', () => { clearTimeout(hoverTimer); show(); });
    btn.addEventListener('mouseleave', () => { hoverTimer = setTimeout(hide, 120); });

    // フォーカス中は常に表示
    el.addEventListener('focus', show);
    el.addEventListener('blur', hide);

    // レイヤに追加
    layer.appendChild(btn);
    map.set(el, btn);

    // 初回配置
    positionButton(el);

    // 要素のサイズ・位置変化に追従
    const ro = new ResizeObserver(() => positionButton(el));
    ro.observe(el);
    // ビューポートスクロール/リサイズ時も追従
    const reposition = () => positionButton(el);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition, true);

    // 要素が DOM から消えたらクリーンアップ
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

// ボタン位置を計算（入力の右端・中央に重ねる）
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
    const offsetX = 6; // 入力の内側に入り込み過ぎないよう外側へ
    const x = Math.min(rect.right - paddingRight - 6, rect.right) + offsetX;
    const y = rect.top + rect.height / 2;

    // 中心合わせ
    btn.style.left = `${x}px`;
    btn.style.top = `${y}px`;
    btn.style.transform = 'translate(-100%, -50%)'; // 右外側に寄せる
}

// 初期スキャン
scanAndAttach();

// 動的追加に対応
const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
        m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) {
                const el = /** @type {Element} */(n);
                if (el.matches && el.matches(INPUT_SELECTOR)) {
                    attachButtonIfNeeded(el);
                }
                // 配下もスキャン
                el.querySelectorAll?.(INPUT_SELECTOR).forEach(attachButtonIfNeeded);
            }
        });
    }
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// ページの visibility 変化で位置をリフレッシュ
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        map.forEach((_, el) => positionButton(el));
    }
});
