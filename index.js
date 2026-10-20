/*
 * 花蝶小径 0.6 · 生长式花蝶导航（SillyTavern 1.x / Android）
 * 独立私人测试插件。不改主题、原生按钮、角色闪屏或播放器。
 * 闭合：淡花枝与可点击的花蝶簇。展开：花蝶飞散，并揭示原生顶栏作容错。
 * 不创建任何大菜单、九宫格或全屏遮罩。
 */

/* ===============================================================
 * v0.9 TT port: 一次选择、设备本地持久化的上图东观体加载器。
 * FontFace 直接读 ArrayBuffer，避开 Android WebView 的 /fonts/ 目录限制；
 * 本扩展不随包携带字体，字体只保留在使用者当前设备的 IndexedDB。
 * =============================================================== */
const XYC_FONT_FAMILY = 'XYC_TT_DongGuan';
const XYC_FONT_DB = 'xyc-floral-nav-font-v1';
let xycFontFace = null;
let xycFontStatus = '未导入';
let xycFontPicker = null;
let xycFontButton = null;
let xycFontRestoreStarted = false;

function xycOpenFontDb() {
    return new Promise((resolve, reject) => {
        if (!globalThis.indexedDB) { reject(new Error('此 WebView 不支持 IndexedDB')); return; }
        const req = indexedDB.open(XYC_FONT_DB, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains('fonts')) req.result.createObjectStore('fonts');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('字体资料库无法开启'));
    });
}
function xycFontRecord(mode, value) {
    return xycOpenFontDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('fonts', mode === 'get' ? 'readonly' : 'readwrite');
        const req = mode === 'get' ? tx.objectStore('fonts').get('preferred') : tx.objectStore('fonts').put(value, 'preferred');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('字体存储失败'));
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
    }));
}
async function xycApplyFontBuffer(buffer, name) {
    if (!globalThis.FontFace || !document.fonts) throw new Error('此 WebView 不支持 FontFace');
    const face = new FontFace(XYC_FONT_FAMILY, buffer, { style:'normal', weight:'400' });
    await face.load();
    if (xycFontFace) document.fonts.delete(xycFontFace);
    document.fonts.add(face);
    xycFontFace = face;
    xycFontStatus = name || '上图东观体';
    if (xycFontButton) xycFontButton.title = `当前字体：${xycFontStatus}（点按更换）`;
    // Tauri WebView 在字体加载成功后会自动按 CSS family 重绘正文。
}
async function xycRestoreFontOnce() {
    if (xycFontRestoreStarted) return;
    xycFontRestoreStarted = true;
    try {
        const saved = await xycFontRecord('get');
        if (saved?.buffer) await xycApplyFontBuffer(saved.buffer, saved.name);
    } catch (e) { console.info('[花蝶小径] 保存的字体不可用，仍可手动导入', e); }
}
function xycMakeFontImporter() {
    if (xycFontPicker) return;
    // 放在普通文档而非动态 ShadowRoot 内，部分旧 Android WebView 只会
    // 从文档树内的 input[type=file] 启动原生文件选择器。
    xycFontPicker = document.createElement('input');
    xycFontPicker.type = 'file';
    xycFontPicker.accept = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,application/x-font-ttf';
    xycFontPicker.setAttribute('aria-label', '选择上图东观体字体文件');
    Object.assign(xycFontPicker.style, {
        position:'fixed', left:'-9999px', top:'-9999px', width:'1px', height:'1px', opacity:'0'
    });
    document.body.append(xycFontPicker);
    xycFontPicker.addEventListener('change', async () => {
        const file = xycFontPicker.files?.[0];
        if (!file) return;
        try {
            if (file.size > 40 * 1024 * 1024) throw new Error('字体文件超过 40 MB');
            const buffer = await file.arrayBuffer();
            await xycApplyFontBuffer(buffer, file.name);
            try { await xycFontRecord('put', { name:file.name, buffer }); }
            catch (e) { console.warn('[花蝶小径] 字体已加载，但不能持久保存', e); }
            toast('已启用上图东观体 · 本机保存');
        } catch (e) {
            console.warn('[花蝶小径] 字体导入失败', e);
            toast('字体导入失败：' + (e?.message || String(e)));
        } finally { xycFontPicker.value = ''; }
    });
}
function xycBindFontButton() {
    if (!scene || xycFontButton) return;
    xycMakeFontImporter();
    xycFontButton = make('button', 'xyc-tt-font-import', '字体');
    xycFontButton.type = 'button';
    xycFontButton.title = `当前字体：${xycFontStatus}；点按导入／更换上图东观体`;
    xycFontButton.setAttribute('aria-label', '选择上图东观体字体文件');
    xycFontButton.addEventListener('click', () => {
        try { xycFontPicker?.click(); }
        catch(e) { console.warn('[花蝶小径] 此 WebView 未能唤起文件选择器',e); toast('文件选择器未能打开'); }
    });
    scene.append(xycFontButton);
}

const ID = 'xyc-floral-nav-host';
const STORAGE = 'xyc-floral-nav-types-v1'; // 延续 0.1/0.2 的入口类别选择
const TOOLBAR_CLASS = 'xyc-floral-native-visible';
const ACTIVE_CLASS = 'xyc-floral-installed';
const MOBILE = '(max-width: 768px)';
const FLORA = {
    branch: 'https://xland.eu.org/autoupload/tbsu6/20260812/5jPt/1038X1162/IMG_1351.png',
    butterflies: [
        'https://xland.eu.org/autoupload/tbsu6/20260812/1PcU/604X614/IMG_1350.png',
        'https://img.tofaka.com/autoupload/tbsu6/20260812/jszL/572X598/IMG_1347.png/webp',
        'https://xland.eu.org/autoupload/tbsu6/20260812/lyD8/518X552/IMG_1348.png',
        'https://xland.eu.org/autoupload/tbsu6/20260812/HKQy/614X602/IMG_1349.png',
    ],
};
// Native header IDs observed in the current ST mobile theme.
// Label + priority are only defaults; long-press an entry to change butterfly/flower.
const KNOWN = {
    'ai-config-button':             {label:'预设', kind:'butterfly', sprite:0},
    'sys-settings-button':          {label:'API', kind:'butterfly', sprite:1},
    'WI-SP-button':                 {label:'世界书', kind:'butterfly', sprite:3},
    'extensions-settings-button':   {label:'扩展', kind:'butterfly', sprite:3},
    'rightNavHolder':               {label:'角色／聊天', kind:'butterfly', sprite:3},
    'persona-management-button':    {label:'用户人设', kind:'butterfly', sprite:0},
    'user-settings-button':         {label:'用户设置', kind:'flower', sprite:1},
    'advanced-formatting-button':   {label:'高级格式', kind:'flower', sprite:2},
    'backgrounds-button':           {label:'背景', kind:'flower', sprite:2},
};
// These are genuinely irregular scatter coordinates, not grid columns.
// x in % of viewport, y in [0..1] of the available flight zone.
const SCATTER = [
    [.23,.13,-12], [.69,.02,9], [.42,.35,-7],
    [.81,.51,13], [.15,.62,-13], [.57,.77,6],
    [.77,.94,-9], [.29,.91,11], [.81,.26,-5],
];
const media = window.matchMedia(MOBILE);
let host, shadow, scene, cluster, branch, topOrnament, nodeBox, hint, pager, nativeStyle;
let open = false, page = 0, entries = [], prefs = {}, observer, refreshTimer, resizeTimer;
let dismissListenerBound = false;
let keepNativeVisible = false;
function revealNative(on) {
    keepNativeVisible = !!on;
    document.body.classList.toggle(TOOLBAR_CLASS, keepNativeVisible);
}
function ensureNativeStyle(){
    if (nativeStyle) return;
    nativeStyle = make('style');
    nativeStyle.id = 'xyc-floral-nav-native-style';
    nativeStyle.textContent = `
      @media(max-width:768px) {
        /* Dissolve the bar background while collapsed, without affecting its panels. */
        body.${ACTIVE_CLASS}:not(.${TOOLBAR_CLASS}) #top-settings-holder {
          background-color:transparent !important;
          background-image:none !important;
          box-shadow:none !important;
          border-color:transparent !important;
        }
        /* Only conceal native top triggers, NEVER drawer contents / panels. */
        body.${ACTIVE_CLASS}:not(.${TOOLBAR_CLASS}) #top-settings-holder .drawer > .drawer-toggle,
        body.${ACTIVE_CLASS}:not(.${TOOLBAR_CLASS}) #top-settings-holder .drawer > .drawer-header,
        body.${ACTIVE_CLASS}:not(.${TOOLBAR_CLASS}) #top-settings-holder > button,
        body.${ACTIVE_CLASS}:not(.${TOOLBAR_CLASS}) #top-settings-holder > [role="button"] {
          opacity:0 !important;
          pointer-events:none !important;
        }
      }
    `;
    document.head.append(nativeStyle);
}

try {
    const val = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    if (val && typeof val === 'object' && !Array.isArray(val)) prefs = val;
} catch { /* local storage disabled */ }
const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
};
const header = () => document.getElementById('top-settings-holder');
function realToggle(drawer) {
    if (!drawer) return null;
    const toggle = drawer.querySelector(':scope > .drawer-toggle, :scope > .drawer-header');
    if (toggle) return toggle.querySelector('button, [role="button"]') || toggle;
    if (drawer.matches('button, a, [role="button"]')) return drawer;
    return drawer.querySelector(':scope > .drawer-icon, :scope > button');
}
function discover() {
    const bar = header();
    if (!bar) return [];
    const direct = Array.from(bar.children).filter(el => el.matches('.drawer, button, [role="button"], a') || el.querySelector(':scope > .drawer-toggle, :scope > .drawer-header'));
    const drawers = direct.length ? direct : [...bar.querySelectorAll('.drawer')].filter(el => el.parentElement === bar);
    const used = new Set();
    return drawers.map((el, i) => {
        const toggle = realToggle(el);
        const style = getComputedStyle(el);
        if (!toggle || style.display === 'none' || style.visibility === 'hidden') return null;
        const id = el.id || `extra-${i}`;
        if (used.has(id)) return null;
        used.add(id);
        const known = KNOWN[id];
        const title = toggle.getAttribute('title') || el.getAttribute('title') || el.querySelector('[title]')?.getAttribute('title') || '';
        const label = (known?.label || title.trim() || el.getAttribute('aria-label') || id.replace(/[-_]/g,' ')).slice(0,26);
        const kind = prefs[id] === 'butterfly' || prefs[id] === 'flower' ? prefs[id] : (known?.kind || 'flower');
        let sprite = FLORA.butterflies[known?.sprite ?? (i % 4)];
        try {
            // Match the actual v23 theme, which renders butterflies via ::after.
            const icon = el.querySelector('.drawer-icon');
            const css = icon && getComputedStyle(icon,'::after').backgroundImage;
            const match = css && css.match(/url\(["']?(.*?)["']?\)/);
            if (match && match[1]) sprite = match[1];
        } catch { /* fall back to bundled URL list */ }
        return {id,label,kind,el,toggle,sprite};
    }).filter(Boolean);
}
function toast(message) {
    if (!hint) return;
    hint.textContent = message;
    hint.classList.add('show');
    clearTimeout(hint._timer);
    hint._timer = setTimeout(()=>hint.classList.remove('show'),1850);
}
function closeNav({keepToolbar=false} = {}) {
    if (!scene) return;
    open = false;
    scene.classList.remove('open');
    cluster?.setAttribute('aria-expanded','false');
    nodeBox?.setAttribute('aria-hidden','true');
    page = 0;
    revealNative(keepToolbar);
}
function openNav() {
    if (!scene || open) return;
    entries = discover();
    page = 0;
    render();
    open = true;
    scene.classList.add('open');
    cluster?.setAttribute('aria-expanded','true');
    nodeBox?.setAttribute('aria-hidden','false');
    /* Native toolbar becomes visible as a genuinely operable fallback. */
    revealNative(true);
    requestAnimationFrame(position);
}
function nativeClick(entry) {
    const native = entry.el.isConnected ? entry.el : document.getElementById(entry.id);
    const toggle = realToggle(native);
    if (!toggle) return toast(`未找到「${entry.label}」，请使用原生顶栏`);
    // The real toolbar remains visible after a mapped click as an escape route.
    closeNav({keepToolbar:true}); // no backdrop to steal taps / conceal native drawers
    requestAnimationFrame(() => {
        try { toggle.click(); }
        catch (error) { console.warn('[花蝶小径]', entry.id,error); toast('未能打开，请使用原生顶栏'); }
    });
}
function typeSwitch(entry) {
    const next = entry.kind === 'flower' ? 'butterfly' : 'flower';
    prefs[entry.id] = next;
    try { localStorage.setItem(STORAGE,JSON.stringify(prefs)); } catch { }
    entries = discover();
    render();
    toast(`${entry.label} → ${next === 'flower' ? '花朵' : '蝴蝶'}（本机保存）`);
}
function render() {
    if (!nodeBox) return;
    nodeBox.replaceChildren();
    const start = page * SCATTER.length;
    const view = entries.slice(start, start + SCATTER.length);
    view.forEach((item, i) => {
        const btn = make('button',`xyc-floral-node ${item.kind}`);
        btn.type='button';
        btn.setAttribute('aria-label',`打开${item.label}；长按更换花蝶`);
        btn.title = item.label;
        btn.dataset.slot = String(i);
        btn.dataset.entry = item.id;
        btn.style.setProperty('--i',String(i));
        btn.style.setProperty('--angle',`${SCATTER[i][2]}deg`);
        const art = make('span','xyc-floral-art');
        if (item.kind === 'butterfly') {
            art.style.backgroundImage = `url(${JSON.stringify(item.sprite)})`;
        } else {
            const pic=make('img','xyc-flower-img');
            pic.alt=''; pic.draggable=false;
            pic.src=new URL('./flower.svg',import.meta.url).href;
            art.append(pic);
        }
        const label=make('span','xyc-floral-label',item.label);
        btn.append(art,label);
        // Long-press (~700ms) changes the icon WITHOUT opening its panel.
        let timer, held=false, downX=0,downY=0;
        btn.addEventListener('pointerdown', e => {
            if(e.button !== 0) return;
            held = false; downX=e.clientX;downY=e.clientY;
            clearTimeout(timer);
            timer=setTimeout(() => {held=true; typeSwitch(item);},700);
        });
        btn.addEventListener('pointermove', e=>{
            if(Math.abs(e.clientX-downX)>10 || Math.abs(e.clientY-downY)>10) clearTimeout(timer);
        });
        for(const name of ['pointerup','pointercancel','pointerleave']) btn.addEventListener(name,()=>clearTimeout(timer));
        btn.addEventListener('click',e=>{
            if(held){e.preventDefault();e.stopPropagation();held=false;return;}
            nativeClick(item);
        });
        nodeBox.append(btn);
    });
    if (pager) {
        const count=Math.ceil(entries.length/SCATTER.length);
        pager.hidden = count < 2;
        pager.setAttribute('aria-label',`下一簇花蝶，第 ${page + 1} / ${count} 簇`);
        pager.title = `下一簇（${page + 1}/${count}）`;
    }
    position();
}
function position() {
    if (!nodeBox || !cluster) return;
    const w=window.innerWidth;
    const h=window.visualViewport?.height || window.innerHeight;
    // Reserved: 40px status / header, and 75px lower compose/player zone.
    const base = Math.max(148,Math.min(190,h*.22));
    const reach = Math.min(430, Math.max(240, h*.55));
    const origin={x:Math.min(w*.35,155), y:Math.max(136,Math.min(194,h*.24))};
    // The closed cluster is a fixed piece of scenery, not a single bright hub.
    if(cluster) cluster.style.setProperty('--cluster-scale', `${Math.max(.82,Math.min(1.06,w/370))}`);
    const buttons=[...nodeBox.querySelectorAll('.xyc-floral-node')];
    buttons.forEach((btn,i)=>{
        const [px,py] = SCATTER[i];
        const x=Math.max(43,Math.min(w-46,w*px));
        const y=Math.max(135,Math.min(h-120,base+reach*py));
        btn.style.left=`${x}px`; btn.style.top=`${y}px`;
        btn.style.setProperty('--from-x',`${origin.x-x}px`);
        btn.style.setProperty('--from-y',`${origin.y-y}px`);
    });
    if(pager){pager.style.left=`${Math.min(w-49,w*.83)}px`;pager.style.top=`${Math.min(h-92,base+reach*.98)}px`;}
}
function observeTopbar() {
    if (observer) observer.disconnect();
    observer=new MutationObserver(() => {
        clearTimeout(refreshTimer);
        refreshTimer=setTimeout(() => {
            const next=discover();
            const oldSig=entries.map(e=>`${e.id}/${e.kind}`).join('|');
            const newSig=next.map(e=>`${e.id}/${e.kind}`).join('|');
            if(oldSig!==newSig){entries=next;if(open)render();}
        },350);
    });
    observer.observe(header(),{childList:true,subtree:true,attributes:true,attributeFilter:['id','title','style','class']});
}
function build(){
    if(host||!media.matches||!header())return;
    host=make('div'); host.id=ID;document.body.append(host);
    shadow=host.attachShadow({mode:'open'});
    const style=make('link');style.rel='stylesheet';style.href=new URL('./style.css',import.meta.url).href;shadow.append(style);
    scene=make('div','xyc-floral-scene');
    branch=make('div','xyc-floral-branch');
    branch.style.backgroundImage=`url(${JSON.stringify(FLORA.branch)})`;
    // Decorative vine fills the collapsed header gap; separate and never clickable.
    topOrnament=make('div','xyc-floral-top-ornament');
    topOrnament.setAttribute('aria-hidden','true');
    // Multiple soft butterflies and an independent blossom form ONE interactive cluster.
    // They are actual click targets, not a second UI panel or a lone glowing button.
    cluster=make('div','xyc-floral-cluster');
    cluster.setAttribute('role','group');
    cluster.setAttribute('aria-label','点按花枝上的任意花蝶以展开或收起菜单');
    cluster.setAttribute('aria-expanded','false');
    const restItems=[
      {type:'butterfly',sprite:0,cls:'rest-a'},
      {type:'butterfly',sprite:2,cls:'rest-b'},
      {type:'butterfly',sprite:3,cls:'rest-c'},
      {type:'flower',cls:'rest-flower'},
    ];
    restItems.forEach(item=>{
       const btn=make('button',`xyc-rest-petal ${item.cls}`);
       btn.type='button';
       btn.setAttribute('aria-label','展开或收起花蝶导航');
       btn.title='花蝶导航：点任一只花蝶展开';
       if(item.type==='butterfly'){
          btn.style.backgroundImage=`url(${JSON.stringify(FLORA.butterflies[item.sprite])})`;
       } else {
          const icon=make('img');icon.src=new URL('./flower.svg',import.meta.url).href;
          icon.alt='';icon.draggable=false;btn.append(icon);
       }
       btn.addEventListener('click',()=>open?closeNav():openNav());
       cluster.append(btn);
    });
    nodeBox=make('div','xyc-floral-nodes');nodeBox.setAttribute('aria-hidden','true');
    pager=make('button','xyc-floral-pager');pager.type='button';pager.hidden=true;
    const pageArt=make('img');pageArt.alt='';pageArt.src=new URL('./flower.svg',import.meta.url).href;
    pager.append(pageArt,make('span','xyc-floral-label','下一簇'));
    pager.addEventListener('click',()=>{page=(page+1)%Math.ceil(entries.length/SCATTER.length);render();});
    hint=make('div','xyc-floral-hint');hint.setAttribute('role','status');
    scene.append(branch,topOrnament,nodeBox,pager,cluster,hint);shadow.append(scene);
    xycBindFontButton();
    ensureNativeStyle();
    document.body.classList.add(ACTIVE_CLASS);
    revealNative(false);
    entries=discover();position();observeTopbar();
    console.info('[花蝶小径 v0.8] 仅在原版徐引翠 v29 主题启用。');
}
function destroy(){
    clearTimeout(refreshTimer);clearTimeout(resizeTimer);
    observer?.disconnect();observer=undefined;
    xycFontButton=undefined;
    host?.remove();
    nativeStyle?.remove();nativeStyle=undefined;
    document.body.classList.remove(ACTIVE_CLASS, TOOLBAR_CLASS);
    keepNativeVisible=false;
    host=shadow=scene=cluster=nodeBox=branch=topOrnament=pager=hint=undefined;
    open=false;page=0;
}
/* v0.8 v29-only safety lock.
 * Strict POSITIVE allowlist: only the *exact*, already-tested Xu Yincui v29
 * theme may install / display the floral overlay. All other themes -> destroy.
 * Uses the live ST power-user theme name and falls back to the theme selector.
 * Never infer a match from names like "徐引翠", v28/v30, or lack of Wang CSS.
 */
const ALLOWED_THEME = '提携玉龙为君 · v29（移动端双阶段血幕闪屏恢复｜基于v28）';
function readSelectedThemeName() {
    try {
        const val = globalThis.SillyTavern?.getContext?.()?.powerUserSettings?.theme;
        if (typeof val === 'string' && val.trim()) return val.trim().normalize('NFC');
    } catch (e) { /* ST may still be loading. Fail closed. */ }
    try {
        const picker = document.getElementById('themes');
        const value = picker && picker.value;
        if (typeof value === 'string' && value.trim()) return value.trim().normalize('NFC');
    } catch (e) { /* No theme selector yet. Fail closed. */ }
    return '';
}
function exactV29ThemeActive() {
    // TT may dynamically bind themes per chat/character without a #themes change.
    // The marker only exists while our modified v29 custom_css is really applied.
    const marker = getComputedStyle(document.documentElement)
        .getPropertyValue('--xyc-tt-v29-theme-active').trim();
    if (marker === 'xyc-tt-v29-20261020') return true;
    // Backward compatibility: the original untouched ST v29 still works.
    return readSelectedThemeName() === ALLOWED_THEME;
}
function sync() {
    const mayShow = media.matches && exactV29ThemeActive();
    if (mayShow) build();
    else if (host || nativeStyle || document.body.classList.contains(ACTIVE_CLASS) || document.body.classList.contains(TOOLBAR_CLASS)) destroy();
}
function start(){
    xycRestoreFontOnce();
    sync();
    media.addEventListener('change',sync);
    const retry=setInterval(()=>{if(!media.matches||host){clearInterval(retry);return;}sync();},500);
    setTimeout(()=>clearInterval(retry),18000);
    // Theme CSS changes in-place, so ST theme switches do not fire matchMedia.
    // Fast, cheap CSS-variable check; build/destroy only when needed.
    setInterval(sync, 350);
    // Theme changed from the UI: remove old floral UI promptly.
    document.addEventListener('change', e => {
        if (e.target?.id === 'themes') { sync(); setTimeout(sync, 100); }
    }, {passive:true});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
    if(!dismissListenerBound){
        dismissListenerBound=true;
        document.addEventListener('pointerdown',e=>{
            if(!open||!host)return;
            if(!e.composedPath().includes(host))closeNav({keepToolbar:!!e.target.closest?.('#top-settings-holder')});
        },{passive:true});
        document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNav();});
        window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(position,100);},{passive:true});
        window.visualViewport?.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(position,100);},{passive:true});
    }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
