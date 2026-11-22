// Mohalla Mukka: canvas renderer, input, UI, modes. Rules + AI live in logic.js. All art is drawn here in code.
(function () {
  'use strict';
  const M = window.MK, A = window.MK_AUDIO, T = window.MK_T, $ = id => document.getElementById(id);
  const store = { get(k, d) { try { const v = localStorage.getItem('mk_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('mk_' + k, JSON.stringify(v)); } catch (e) { } } };
  const LANGS = ['hg', 'hi', 'en']; let lang = store.get('lang', /^hi/i.test(navigator.language || '') ? 'hi' : 'hg'); if (!T[lang]) lang = 'hg'; const t = () => T[lang];
  A.setOn(store.get('snd', true)); A.setMusic(store.get('mus', true)); A.setPack(store.get('pack', 'funny'));
  const today = M.dayNumber(Date.now()); const qs = new URLSearchParams(location.search); const beatT = Math.min(999999, parseInt(qs.get('b'), 10) || 0);
  let best = store.get('best', 0), streak = store.get('streak', 0), diff = store.get('diff', 'normal'), rushBest = store.get('rbest', { d: -1, s: 0 }); if (rushBest.d !== today) rushBest = { d: today, s: 0 };
  // ---- canvas ----
  const cv = $('c'), cx = cv.getContext('2d', { alpha: false }); let CW = 0, CH = 0, dpr = Math.min(window.devicePixelRatio || 1, 1.5), sc = 1, ox = 0, oy = 0, touch = false;
  const VW = 1000, VH = 520, GY = 440;
  let vw = 1000, camX = 0, portrait = false;
  function resize() { const w = innerWidth, h = innerHeight; CW = Math.round(w * dpr); CH = Math.round(h * dpr); cv.width = CW; cv.height = CH; portrait = w < h * .9; vw = portrait ? 620 : 1000;
    const padH = touch && portrait ? (mode === '2p' ? 130 : 150) : 0; if (portrait) { sc = CW / vw; ox = 0; const free = CH - (padH + 44) * dpr - VH * sc; oy = 44 * dpr + Math.max(0, free * .3); } else { sc = Math.min(CW / 1000, (CH - 24 * dpr) / VH); ox = (CW - 1000 * sc) / 2; oy = Math.max(0, (CH - VH * sc) / 2); } bgCache.c = null; }
  // ---- state ----
  let mode = 'cpu', sel = [0, 1], pickStep = 0, F = null, ai = null, rush = null, rushI = 0, rushScore = 0, state = 'menu', paused = false, fxs = [], pops = [], shake = 0, flash = 0, crowd = 0, banner = null, bannerT = 0, lastEnd = null, picks = 0;
  const calmMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const perf = { renderMs: [], steps: 0 };
  // ---- input ----
  const keys = {}, held = [{}, {}];
  const K1 = { KeyA: 'l', KeyD: 'r', KeyW: 'up', KeyS: 'block', KeyJ: 'light', KeyK: 'heavy', KeyL: 'special', KeyI: 'special' };
  const K2 = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'up', ArrowDown: 'block', Comma: 'light', Period: 'heavy', Slash: 'special', Space: 'special' };
  addEventListener('keydown', e => { if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); if (e.repeat) return; if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'fight') setPause(!paused); return; } keys[e.code] = 1; if (state === 'fight') { A.init(); A.resume(); } });
  addEventListener('keyup', e => { delete keys[e.code]; });
  function readInput(side) {
    const o = M.blank(), tp = held[side];
    const map = mode === '2p' ? (side ? K2 : K1) : Object.assign({}, K1, K2);
    if (mode !== '2p' || true) for (const k in keys) { const a = map[k]; if (a && (mode === '2p' || side === 0)) o[a] = 1; }
    for (const k in tp) if (tp[k]) o[k] = 1; return o;
  }
  // ---- touch pads ----
  function buildPads() {
    const P = $('pads'); P.innerHTML = ''; const mk = (side, cls, rows) => { const d = document.createElement('div'); d.className = 'pad ' + cls + (mode === '2p' ? ' small' : ''); d.style.gridTemplateColumns = 'repeat(' + rows[0].length + ',auto)'; rows.forEach(r => r.forEach(([a, em]) => { const b = document.createElement('button'); b.textContent = em; b.dataset.a = a; b.setAttribute('aria-label', a); if (a === 'special') { const i = document.createElement('i'); b.appendChild(i); b.id = 'sp' + side; } const on = e => { e.preventDefault(); held[side][a] = 1; b.classList.add('dn'); A.init(); A.resume(); try { b.setPointerCapture(e.pointerId); } catch (x) { } }, off = e => { held[side][a] = 0; b.classList.remove('dn'); }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off); b.addEventListener('contextmenu', e => e.preventDefault()); d.appendChild(b); })); P.appendChild(d); };
    if (mode === '2p') { mk(0, 'l', [[['l', '◀'], ['up', '▲'], ['r', '▶'], ['block', '🛡']], [['light', '👊'], ['heavy', '💥'], ['special', '⭐']]]); mk(1, 'r', [[['l', '◀'], ['up', '▲'], ['r', '▶'], ['block', '🛡']], [['light', '👊'], ['heavy', '💥'], ['special', '⭐']]]); }
    else { mk(0, 'l', [[['l', '◀'], ['r', '▶']], [['block', '🛡'], ['up', '▲']]]); mk(0, 'r', [[['light', '👊'], ['heavy', '💥']], [['special', '⭐']]]); }
  }
  addEventListener('touchstart', () => { if (!touch) { touch = true; resize(); } }, { passive: true, once: true });
  if (window.matchMedia && matchMedia('(pointer:coarse)').matches) touch = true;
  // ---- text / UI ----
  function applyText() {
    const l = t(); document.documentElement.lang = lang === 'hi' ? 'hi' : lang === 'en' ? 'en' : 'hi-Latn';
    $('m-name').textContent = l.name; $('m-sub').textContent = l.sub; $('b-cpu').textContent = '🥊 ' + l.vscpu; $('b-2p').textContent = '👥 ' + l.twop; $('b-rush').textContent = '👑 ' + l.rush; $('m-diff').textContent = l.diff;
    $('lv').innerHTML = ''; ['easy', 'normal', 'hard'].forEach(k => { const b = document.createElement('button'); b.className = 'sec lv' + (diff === k ? ' on' : ''); b.textContent = l[k]; b.onclick = () => { diff = k; store.set('diff', k); A.init(); A.resume(); A.ui(); applyText(); }; $('lv').appendChild(b); });
    $('m-best').textContent = l.best + ' ' + best + ' · ' + l.streak + ' ' + streak; $('m-how').textContent = l.how + ' · ' + l.how2; $('m-fic').textContent = l.fictional; $('priv').textContent = l.priv;
    $('lang').textContent = lang === 'hg' ? 'Hing' : lang === 'hi' ? 'हि' : 'EN'; $('pack').textContent = A.pack === 'funny' ? '🤪' : '😌'; $('snd').textContent = A.on ? '🔊' : '🔇'; $('mus').style.opacity = A.music ? 1 : .4;
    $('p-back').textContent = l.menu; $('again').textContent = l.again; $('e-menu').textContent = l.menu; $('e-share').textContent = l.share; $('pz').textContent = l.pause; $('resume').textContent = l.resume; $('pz-menu').textContent = l.menu;
    if (beatT) { $('m-friend').hidden = false; $('m-friend').textContent = ({ hg: 'Dost ne ' + beatT + ' score kiya. Tum beat karoge?', hi: 'दोस्त ने ' + beatT + ' स्कोर किया। तुम हराओगे?', en: 'A friend scored ' + beatT + '. Can you beat it?' })[lang]; }
    if (state === 'pick') renderPick();
  }
  function show(id) { ['menu', 'pick', 'end', 'paused'].forEach(k => $(k).hidden = k !== id); $('pause').hidden = state !== 'fight'; $('pads').hidden = !(touch && state === 'fight'); }
  // ---- character art ----
  const SKIN = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#d9a066', '#b97a4b', '#f0c9a0', '#a9703f', '#cfa57a'];
  function limb(c, x0, y0, x1, y1, w, col) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
  function rr(c, x, y, w, h, r, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill(); }
  function circ(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); }
  // draws one fighter at local origin (feet), facing +x. pose = {st,t,total,say,walk,air,hurt,ko,sit}
  function drawChar(c, ch, idx, pose, time) {
    const id = ch.id, skin = SKIN[idx % SKIN.length], dark = '#241437'; const st = pose.st, tt = pose.t, ph = pose.walk || 0;
    let crouch = 0, lean = 0, bob = st === 'idle' ? Math.sin(time * .006 + idx) * 2 : 0;
    if (st === 'block') crouch = 16; if (st === 'hit') lean = -12; if (pose.sit) crouch = 52; if (pose.air) crouch = -2;
    if (pose.ko) { c.rotate(pose.air ? -.6 : -1.5); c.translate(pose.air ? 0 : -10, pose.air ? 0 : 0); }
    const hip = [0, -62 + crouch + bob], sh = [lean + (st === 'heavy' ? 6 : 0), -112 + crouch * 1.1 + bob], hd = [sh[0] * 1.15 + 2, -134 + crouch * 1.1 + bob];
    // legs / skirt
    const sw = Math.sin(ph) * 20, lf = pose.air ? [-8, -22] : pose.sit ? [-26, -4] : [-14 + sw, 0], rf = pose.air ? [16, -30] : pose.sit ? [26, -4] : [14 - sw, 0];
    const skirt = id === 'devi' || id === 'aunty';
    if (skirt) { c.fillStyle = ch.col; c.beginPath(); c.moveTo(hip[0] - 16, hip[1]); c.lineTo(hip[0] + 16, hip[1]); c.lineTo(hip[0] + 30 + (pose.sit ? 14 : 0), -4); c.lineTo(hip[0] - 30 - (pose.sit ? 14 : 0), -4); c.fill(); limb(c, lf[0], lf[1], lf[0], lf[1] - 2, 9, skin); limb(c, rf[0], rf[1], rf[0], rf[1] - 2, 9, skin); }
    else { const pc = id === 'auto' ? '#6b705c' : id === 'cricket' ? '#e9ecef' : id === 'challan' ? '#343a40' : '#3b2f4a'; limb(c, hip[0] - 7, hip[1], lf[0], lf[1] - 4, 15, pc); limb(c, hip[0] + 7, hip[1], rf[0], rf[1] - 4, 15, pc); rr(c, lf[0] - 12, lf[1] - 6, 26, 9, 4, '#111'); rr(c, rf[0] - 12, rf[1] - 6, 26, 9, 4, '#111'); }
    // torso
    const wide = id === 'cricket' || id === 'baba' ? 42 : id === 'challan' ? 46 : 34; limb(c, hip[0], hip[1] - 4, sh[0], sh[1] + 6, wide, ch.col);
    if (id === 'cricket') circ(c, hip[0] + 8, hip[1] - 20, 20, ch.col); // paunch
    if (id === 'challan') { limb(c, sh[0] - 14, sh[1] + 2, hip[0] + 14, hip[1] - 14, 5, '#ffd43b'); } // belt strap
    if (id === 'chai') limb(c, sh[0] - 15, sh[1] + 4, hip[0] + 15, hip[1] - 20, 8, '#f8f9fa'); // gamchha
    if (id === 'devi') limb(c, sh[0] - 14, sh[1] + 2, hip[0] + 18, hip[1] + 10, 9, '#ffe066'); // saree pallu
    if (id === 'aunty') limb(c, sh[0] - 14, sh[1] + 2, hip[0] + 18, hip[1] + 10, 9, '#ffa8a8'); // dupatta
    if (id === 'jugaad') limb(c, hip[0] - 4, hip[1] - 20, hip[0] + 8, hip[1] - 30, 6, '#222'); // grease smudge
    // arms
    let fh = [sh[0] + 24, sh[1] + 28 + Math.sin(ph) * 4], bh = [sh[0] - 22, sh[1] + 30 - Math.sin(ph) * 4]; const total = pose.total || 1, p = Math.min(1, tt / total);
    if (st === 'light') { const e = Math.sin(Math.min(1, p * 1.8) * Math.PI); fh = [sh[0] + 20 + e * 66, sh[1] + 6]; }
    else if (st === 'heavy') { const e = p < .35 ? -p * 2 : Math.sin(((p - .35) / .65) * Math.PI); fh = [sh[0] + 20 + e * 88, sh[1] + 18 - e * 14]; bh = [sh[0] - 24 - (p < .35 ? 12 : 0), sh[1] + 20]; }
    else if (st === 'special') { const w = Math.sin(tt * .5) * 6; fh = [sh[0] + 22, sh[1] - 46 + w]; bh = [sh[0] - 22, sh[1] - 46 - w]; }
    else if (st === 'block') { fh = [sh[0] + 22, sh[1] - 8]; bh = [sh[0] + 14, sh[1] - 4]; }
    else if (st === 'hit') { fh = [sh[0] - 8, sh[1] + 40]; bh = [sh[0] - 26, sh[1] + 30]; }
    else if (pose.sit) { fh = [sh[0] + 26, sh[1] - 52]; bh = [sh[0] - 8, sh[1] + 24]; }
    limb(c, sh[0] - 4, sh[1] + 4, bh[0], bh[1], 12, ch.col); circ(c, bh[0], bh[1], 8, skin);
    // head
    circ(c, hd[0], hd[1], 19, skin);
    if (id === 'baba') { c.fillStyle = '#f1f3f5'; c.beginPath(); c.arc(hd[0] + 4, hd[1] + 6, 18, 0.1, 3.0); c.fill(); circ(c, hd[0] - 4, hd[1] - 12, 12, '#f1f3f5'); }
    else if (id === 'devi') { circ(c, hd[0] - 8, hd[1] - 16, 12, '#1c1c1c'); c.fillStyle = '#1c1c1c'; c.beginPath(); c.arc(hd[0], hd[1] - 4, 20, 3.3, 6.2); c.fill(); }
    else if (id === 'cricket') { c.fillStyle = '#e03131'; c.beginPath(); c.arc(hd[0], hd[1] - 6, 20, 3.3, 6.2); c.fill(); c.fillRect(hd[0], hd[1] - 8, 26, 6); rr(c, hd[0] - 6, hd[1] + 6, 22, 5, 2, '#222'); }
    else if (id === 'chai') { c.strokeStyle = '#222'; c.lineWidth = 3; c.strokeRect(hd[0] + 2, hd[1] - 6, 16, 11); circ(c, hd[0] - 2, hd[1] - 14, 10, '#444'); }
    else if (id === 'auto') { c.fillStyle = '#7d8a3a'; c.beginPath(); c.arc(hd[0], hd[1] - 4, 20, 3.3, 6.2); c.fill(); rr(c, hd[0] - 4, hd[1] + 5, 24, 5, 2, '#222'); }
    else if (id === 'aunty') { circ(c, hd[0] - 6, hd[1] - 20, 15, '#2b2b2b'); c.fillStyle = '#2b2b2b'; c.beginPath(); c.arc(hd[0], hd[1] - 2, 20, 3.4, 6.1); c.fill(); }
    else if (id === 'forward') { c.strokeStyle = '#222'; c.lineWidth = 3; c.beginPath(); c.arc(hd[0] + 6, hd[1] - 2, 8, 0, 6.3); c.stroke(); circ(c, hd[0] - 4, hd[1] - 13, 9, '#999'); }
    else if (id === 'jugaad') { c.fillStyle = '#e8590c'; c.beginPath(); c.arc(hd[0], hd[1] - 6, 20, 3.2, 6.2); c.fill(); circ(c, hd[0] + 8, hd[1] + 6, 4, '#222'); }
    else if (id === 'challan') { c.fillStyle = '#1c2530'; c.beginPath(); c.arc(hd[0], hd[1] - 6, 21, 3.2, 6.2); c.fill(); rr(c, hd[0] - 4, hd[1] - 12, 34, 8, 3, '#111'); rr(c, hd[0] + 4, hd[1] - 4, 16, 9, 3, '#111'); c.fillStyle = '#ffd43b'; c.fillRect(hd[0] - 2, hd[1] - 22, 10, 6); }
    // face
    const ex = hd[0] + 8, ey = hd[1] - 3; if (pose.ko || st === 'hit') { c.strokeStyle = dark; c.lineWidth = 2; limb(c, ex - 3, ey - 3, ex + 3, ey + 3, 2, dark); limb(c, ex + 3, ey - 3, ex - 3, ey + 3, 2, dark); } else { circ(c, ex, ey, 3, '#fff'); circ(c, ex + 1, ey, 1.6, dark); }
    if (pose.say > 0 || st === 'hit' || st === 'special' || pose.ko) { c.fillStyle = '#7a1d1d'; c.beginPath(); c.ellipse(hd[0] + 8, hd[1] + 9, 5, 4 + (Math.sin(time * .03) > 0 ? 2 : 0), 0, 0, 6.3); c.fill(); } else limb(c, hd[0] + 3, hd[1] + 9, hd[0] + 12, hd[1] + 9, 2, dark);
    if (id === 'baba' || id === 'cricket' || id === 'auto' || id === 'challan') limb(c, hd[0] + 4, hd[1] + 4, hd[0] + 16, hd[1] + 4, 3, '#222'); // moustache
    // front arm + props (drawn last = in front)
    limb(c, sh[0] + 4, sh[1] + 4, fh[0], fh[1], 13, ch.col); circ(c, fh[0], fh[1], 9, st === 'light' || st === 'heavy' || st === 'block' ? '#e8590c' : skin); if (st === 'light' || st === 'heavy' || st === 'block') circ(c, fh[0] + 1, fh[1] - 1, 3, '#ffd8a8');
    const px = fh[0], py = fh[1];
    if (id === 'baba') { rr(c, px - 3, py - 22, 7, 22, 3, '#333'); circ(c, px, py - 25, 7, '#adb5bd'); }
    else if (id === 'devi') { c.save(); c.translate(px, py - 6); rr(c, -22, -50, 44, 34, 4, '#fff9db'); c.fillStyle = '#c92a2a'; c.fillRect(-16, -42, 32, 5); c.fillRect(-16, -33, 24, 4); c.fillRect(-16, -26, 28, 4); limb(c, 0, -16, 0, 4, 4, '#8d6e63'); c.restore(); }
    else if (id === 'cricket') { c.save(); c.translate(px, py); c.rotate(st === 'special' || st === 'heavy' ? 1.2 : -.5); rr(c, -4, -62, 12, 50, 4, '#e9c46a'); rr(c, -2, -14, 8, 22, 3, '#444'); c.restore(); }
    else if (id === 'chai') { c.fillStyle = '#c1773b'; c.beginPath(); c.moveTo(px - 8, py - 18); c.lineTo(px + 8, py - 18); c.lineTo(px + 5, py); c.lineTo(px - 5, py); c.fill(); c.fillStyle = '#f5e6c8'; c.fillRect(px - 7, py - 18, 14, 3); }
    else if (id === 'auto') { circ(c, px, py - 8, 9, '#222'); circ(c, px, py - 8, 4, '#f2c200'); }
    else if (id === 'aunty') { rr(c, px - 12, py - 6, 24, 20, 4, '#ffd43b'); c.strokeStyle = '#7d5a00'; c.lineWidth = 3; c.beginPath(); c.arc(px, py - 6, 8, 3.14, 6.28); c.stroke(); }
    else if (id === 'forward') { c.save(); c.translate(px, py); rr(c, -9, -30, 18, 30, 3, '#222'); rr(c, -7, -27, 14, 22, 2, '#2f9e44'); c.fillStyle = '#fff'; c.fillRect(-5, -24, 8, 4); c.fillRect(-2, -17, 8, 4); c.restore(); }
    else if (id === 'jugaad') { c.save(); c.translate(px, py); c.rotate(-.6); rr(c, -3, -34, 7, 34, 3, '#adb5bd'); circ(c, 0, -36, 8, '#adb5bd'); circ(c, 0, -36, 3, '#2a0f4a'); c.restore(); }
    else if (id === 'challan') { rr(c, px - 10, py - 22, 20, 26, 3, '#f8f9fa'); c.fillStyle = '#c92a2a'; c.fillRect(px - 7, py - 16, 14, 3); c.fillRect(px - 7, py - 10, 10, 3); circ(c, hd[0] + 14, hd[1] + 22, 5, '#ced4da'); }
  }
  // ---- background ----
  const hash = n => { n = Math.imul(n ^ n >>> 15, 0x2c1b3c6d); n = Math.imul(n ^ n >>> 12, 0x297a2d39); return ((n ^ n >>> 15) >>> 0) / 4294967296; };
  const bgCache = { w: 0, c: null, k: '' };
  function drawBgStrip() {
    const c = document.createElement('canvas'); c.width = Math.ceil(1000 * sc); c.height = Math.ceil(VH * sc); const x = c.getContext('2d'); x.scale(sc, sc);
    for (let i = 0; i < 9; i++) { const bw = 120 + hash(i) * 80, bx = i * 125 - 30, bh = 150 + hash(i + 40) * 140; x.fillStyle = ['#5c2a7a', '#6b3a8a', '#4a2166'][i % 3]; x.fillRect(bx, GY - 110 - bh, bw, bh + 30); for (let r = 0; r < bh / 34; r++) for (let q = 0; q < bw / 30; q++) { x.fillStyle = hash(i * 99 + r * 7 + q) > .45 ? '#ffd166' : '#35184f'; x.fillRect(bx + 10 + q * 28, GY - 100 - bh + 10 + r * 34, 14, 18); } }
    x.fillStyle = '#7a4a2b'; x.fillRect(40, GY - 100, 150, 100); x.fillStyle = '#c92a2a'; x.beginPath(); x.moveTo(30, GY - 100); x.lineTo(200, GY - 100); x.lineTo(180, GY - 140); x.lineTo(50, GY - 140); x.fill(); x.fillStyle = '#fff'; x.font = '700 18px system-ui'; x.textAlign = 'center'; x.fillText('CHAI', 115, GY - 112);
    x.fillStyle = '#2a0f4a'; x.fillRect(760, GY - 250, 200, 70); x.fillStyle = '#ffd60a'; x.font = '800 26px system-ui'; x.fillText('MOHALLA MUKKA', 860, GY - 207);
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 40); x.quadraticCurveTo(500, 110, 1000, 40); x.stroke(); for (let i = 0; i < 20; i++) { const u = i / 19, bx = u * 1000, by = 40 + 35 * (1 - (2 * u - 1) ** 2); x.fillStyle = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2'][i % 5]; x.beginPath(); x.moveTo(bx - 10, by); x.lineTo(bx + 10, by); x.lineTo(bx, by + 24); x.fill(); }
    x.fillStyle = '#8d6e63'; x.fillRect(0, GY, 1000, 10); x.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 12; i++) x.fillRect(i * 100 + 20, GY + 60, 60, 6);
    bgCache.c = c;
  }
  let skyG = null, skyH = 0;
  function drawBg(time) {
    if (!bgCache.c) drawBgStrip(); if (!skyG || skyH !== CH) { skyG = cx.createLinearGradient(0, 0, 0, CH); skyG.addColorStop(0, '#3a1a6e'); skyG.addColorStop(.5, '#ff7e5f'); skyG.addColorStop(1, '#feb47b'); skyH = CH; }
    cx.fillStyle = skyG; cx.fillRect(0, 0, CW, CH); const gy = oy + GY * sc; cx.fillStyle = '#6d4c41'; cx.fillRect(0, gy, CW, CH - gy);
    cx.drawImage(bgCache.c, ox - camX * sc, oy);
    cx.save(); cx.translate(ox - camX * sc, oy); cx.scale(sc, sc);
    const up = crowd > 0 ? 18 * Math.min(1, crowd / 20) : 0; for (let i = 0; i < 22; i++) { const x = i * 48 + 12, b = Math.sin(time * .004 + i) * 3 - up * (i % 2 ? 1 : .7); cx.fillStyle = ['#2a0f4a', '#3a1a6e', '#1c0a36'][i % 3]; cx.beginPath(); cx.arc(x, GY + 98 + b, 22, 0, 6.3); cx.fill(); cx.fillRect(x - 22, GY + 98 + b, 44, 90); }
    cx.restore();
  }
  // ---- main draw ----
  function poseOf(o, f) { return { st: o.st === 'special' && o.sp === 'sit' ? 'idle' : o.st, t: o.t, total: o.st === 'light' || o.st === 'heavy' ? M.ATK[o.st].total : 30, say: o.say, walk: o.x * .12, air: o.y > 0, ko: o.st === 'ko', sit: o.sit > 0 || (o.st === 'special' && o.sp === 'sit') }; }
  function drawFighter(o, i, time) {
    cx.save(); cx.translate(ox + (o.x - camX) * sc, oy + (GY - o.y) * sc); cx.scale(sc * (o.ch.boss ? 1.18 : 1), sc * (o.ch.boss ? 1.18 : 1));
    cx.fillStyle = 'rgba(0,0,0,.3)'; cx.beginPath(); cx.ellipse(0, 4 + o.y * .02, 34 - o.y * .12, 7, 0, 0, 6.3); cx.fill();
    if (o.buff) { cx.globalAlpha = .35 + .2 * Math.sin(time * .02); circ(cx, 0, -70, 70, '#ffd60a'); cx.globalAlpha = 1; }
    cx.scale(o.face, 1); const idx = M.cid(o.id); drawChar(cx, o.ch, idx, poseOf(o), time); cx.restore();
  }
  function drawProj(p) {
    cx.save(); cx.translate(ox + (p.x - camX) * sc, oy + (GY - p.y) * sc); cx.scale(sc, sc); const dir = Math.sign(p.vx) || 1;
    if (p.kind === 'bubble') { rr(cx, -26, -18, 52, 34, 14, '#fff'); cx.fillStyle = '#333'; cx.font = '800 20px system-ui'; cx.textAlign = 'center'; cx.fillText('...', 0, 4); }
    else if (p.kind === 'cup') { cx.rotate(p.life * .2); cx.fillStyle = '#c1773b'; cx.beginPath(); cx.moveTo(-10, -12); cx.lineTo(10, -12); cx.lineTo(7, 10); cx.lineTo(-7, 10); cx.fill(); circ(cx, 0, 14, 5, '#8d5524'); }
    else if (p.kind === 'msg') { rr(cx, -22, -13, 44, 26, 8, '#2f9e44'); cx.fillStyle = '#fff'; cx.font = '800 14px system-ui'; cx.textAlign = 'center'; cx.fillText('FWD', 0, 5); }
    else if (p.kind === 'challan') { cx.rotate(p.life * .15); rr(cx, -14, -18, 28, 36, 3, '#f8f9fa'); cx.fillStyle = '#c92a2a'; cx.fillRect(-9, -10, 18, 4); cx.fillRect(-9, -2, 12, 4); circ(cx, 4, 10, 5, '#c92a2a'); }
    cx.restore();
  }
  function bar(x, y, w, h, frac, col, right) { cx.fillStyle = 'rgba(0,0,0,.55)'; cx.fillRect(x, y, w, h); cx.fillStyle = col; const ww = Math.max(0, w * frac); cx.fillRect(right ? x + w - ww : x, y, ww, h); cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.strokeRect(x, y, w, h); }
  function drawHud(f, time) {
    const l = t(), hw = vw; cx.save(); cx.translate(ox, oy); cx.scale(sc, sc); cx.textBaseline = 'middle'; const bw = hw / 2 - 36, fs = portrait ? 17 : 20;
    for (let i = 0; i < 2; i++) {
      const o = f.fs[i], right = i === 1, x = right ? hw / 2 + 16 : 20, name = (l.ch[o.id] || [o.id])[0]; const col = o.hp / o.maxhp > .5 ? '#69db7c' : o.hp / o.maxhp > .25 ? '#ffd43b' : '#ff6b6b';
      bar(x, 24, bw, 22, o.hp / o.maxhp, col, right); cx.fillStyle = '#fff'; cx.font = '800 ' + fs + 'px system-ui'; cx.textAlign = right ? 'right' : 'left'; const lbl = (i === 1 && mode !== '2p' ? '🤖' : '') + name + (o.ch.boss ? ' · ' + l.boss : ''); cx.fillText(lbl, right ? hw - 20 : 20, 64, bw);
      bar(x, 78, bw * .45, 8, 1 - o.cd / M.SPCD, o.cd === 0 ? '#ffd60a' : '#9775fa', right);
      for (let k = 0; k < Math.ceil(f.bestOf / 2); k++) { cx.fillStyle = k < f.wins[i] ? '#ffd60a' : 'rgba(255,255,255,.3)'; cx.beginPath(); cx.arc(right ? hw - 28 - k * 24 : 28 + k * 24, 102, 8, 0, 6.3); cx.fill(); }
      if (o.stamps) { cx.fillStyle = '#ff6b6b'; cx.font = '700 15px system-ui'; cx.fillText('🧾 ' + l.stamp(o.stamps), right ? hw - 20 : 20, 126); }
    }
    cx.fillStyle = '#fff'; cx.font = '900 32px system-ui'; cx.textAlign = 'center'; cx.fillText(Math.ceil(Math.max(0, f.time) / 60), hw / 2, 35); if (mode === 'rush' && rush) { cx.font = '700 13px system-ui'; cx.fillText(l.rushOf(rushI + 1, rush.length), hw / 2, 62); }
    if (banner && bannerT > 0) { const a = Math.min(1, bannerT / 14); cx.globalAlpha = a; const fsz = banner.big ? (portrait ? 48 : 64) : (portrait ? 20 : 26); cx.font = '800 ' + fsz + 'px system-ui'; cx.textAlign = 'center'; const w = Math.min(hw - 20, cx.measureText(banner.text).width + 40); if (!banner.big) { rr(cx, hw / 2 - w / 2, banner.y - 22, w, 44, 20, 'rgba(255,255,255,.92)'); cx.fillStyle = '#2a0f4a'; } else { cx.lineWidth = 8; cx.strokeStyle = '#2a0f4a'; cx.strokeText(banner.text, hw / 2, banner.y, hw - 20); cx.fillStyle = '#ffd60a'; } cx.fillText(banner.text, hw / 2, banner.y, hw - 40); cx.globalAlpha = 1; }
    cx.restore();
  }
  function draw(time) {
    const t0 = performance.now(); cx.setTransform(1, 0, 0, 1, 0, 0);
    if (shake > 0 && !calmMotion) cx.translate((Math.random() - .5) * shake * dpr, (Math.random() - .5) * shake * dpr);
    if (F) { const mid = (F.fs[0].x + F.fs[1].x) / 2, want = Math.max(0, Math.min(1000 - vw, mid - vw / 2)); camX += (want - camX) * .12; } else camX = (1000 - vw) / 2;
    drawBg(time);
    if (F) { F.fs.forEach((o, i) => drawFighter(o, i, time)); F.ps.forEach(drawProj); for (const q of fxs) { cx.save(); cx.translate(ox + (q.x - camX) * sc, oy + (GY - q.y) * sc); cx.globalAlpha = Math.max(0, q.l / q.m); circ(cx, 0, 0, q.r * sc, q.c); cx.restore(); } for (const p of pops) { cx.save(); cx.globalAlpha = Math.min(1, p.l / 12); cx.font = '900 ' + Math.round(p.s * sc) + 'px system-ui'; cx.textAlign = 'center'; cx.lineWidth = 5 * sc; cx.strokeStyle = '#2a0f4a'; cx.strokeText(p.text, ox + (p.x - camX) * sc, oy + (GY - p.y) * sc); cx.fillStyle = p.c; cx.fillText(p.text, ox + (p.x - camX) * sc, oy + (GY - p.y) * sc); cx.restore(); } drawHud(F, time); }
    if (flash > 0) { cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = 'rgba(255,255,255,' + flash * .5 + ')'; cx.fillRect(0, 0, CW, CH); }
    perf.renderMs.push(performance.now() - t0); if (perf.renderMs.length > 600) perf.renderMs.shift();
  }
  // ---- events -> sound + fx ----
  function say(text, y, big) { banner = { text, y: y || 175, big: !!big }; bannerT = big ? 60 : 100; }
  function burst(x, y, col, n) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = 2 + Math.random() * 6; fxs.push({ x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3 + Math.random() * 5, l: 18, m: 18, c: col }); } }
  function handle(ev) {
    const l = t(); for (const e of ev) {
      if (e.t === 'hit') { A.hit(e.heavy); burst(e.x, e.y, e.heavy ? '#ffd60a' : '#fff', e.heavy ? 12 : 6); pops.push({ x: e.x, y: e.y + 30, s: e.heavy ? 46 : 30, c: e.heavy ? '#ff6b35' : '#ffd60a', l: 26, text: e.heavy ? ['DHAAM!', 'BONK!', 'THWAK!'][e.dmg % 3] : ['THAP!', 'TAK!', 'PHAT!'][e.dmg % 3] }); shake = e.heavy ? 8 : 3; if (e.heavy || e.combo >= 3) { crowd = 40; if (e.heavy) A.ooh(); } if (e.combo >= 3) pops.push({ x: e.x, y: e.y + 80, s: 26, c: '#69db7c', l: 30, text: e.combo + ' HIT!' }); }
      else if (e.t === 'block') { A.block(e.big); burst(e.x, e.y, '#74c0fc', 4); }
      else if (e.t === 'whoosh') A.whoosh(e.heavy); else if (e.t === 'jump') A.jump(); else if (e.t === 'land') A.land();
      else if (e.t === 'special') { A.special(e.kind); const o = F.fs[e.side], idx = M.cid(e.id); A.catchphrase(o.ch.tune, idx); say((l.ch[e.id] || ['', ''])[1], 160); }
      else if (e.t === 'stamp') A.stamp(); else if (e.t === 'suspend') { A.suspend(); say(l.suspend, 240, true); } else if (e.t === 'clear') say(l.clear, 210); else if (e.t === 'buff') { burst(F.fs[e.side].x, 80, '#ffd60a', 10); }
      else if (e.t === 'pull') burst(e.x, 80, '#da77f2', 6);
      else if (e.t === 'round') { A.ding(); say(l.round(e.n), 230, true); } else if (e.t === 'fight') { A.fight(); say(l.fight, 230, true); }
      else if (e.t === 'ko') { A.ko(); flash = .6; crowd = 60; shake = 12; say(l.ko, 230, true); }
      else if (e.t === 'roundend') { if (!e.w || e.timeout) { say(e.w < 0 ? l.draw : l.time, 230, true); } }
      else if (e.t === 'match') { A.win(); }
    }
  }
  // ---- flow ----
  const rnd = (n) => Math.floor(Math.random() * n);
  function labelOf(i) { return (t().ch[M.CHARS[i].id] || [''])[0]; }
  function startMatch() {
    const a = M.PLAYABLE[sel[0]]; let b, d = diff, seed = (Math.random() * 1e9) | 0;
    if (mode === '2p') b = M.PLAYABLE[sel[1]];
    else if (mode === 'rush') { rush = rush || M.bossRush(today, a.id); const r = rush[rushI]; b = r.ch; d = r.diff; seed = today * 31 + rushI; }
    else { b = M.PLAYABLE[sel[1]]; }
    F = M.newMatch(a, b, { seed }); ai = mode === '2p' ? null : M.aiNew(d, seed); F.diff = d; fxs = []; pops = []; banner = null; state = 'fight'; paused = false; A.init(); A.resume(); show(null); buildPads(); resize(); acc = 0; last = 0;
  }
  function endMatch() {
    state = 'end'; const l = t(), w = F.winner; let score = 0, msg = '', info = ''; const human = 0;
    if (mode === '2p') { msg = l.wins(labelOf(M.cid(F.fs[w].id))); score = 0; info = F.wins.join(' - '); }
    else {
      score = M.matchScore(F, human, F.diff); const won = w === 0;
      if (mode === 'rush') {
        if (won) { rushScore += score; rushI++; if (rushI >= rush.length) { msg = l.rushWin; streak++; } else msg = l.wins(labelOf(M.cid(F.fs[0].id))); } else { msg = F.fs[1].ch.boss ? l.rushLose : l.ko; streak = 0; }
        if (rushScore > rushBest.s) { rushBest = { d: today, s: rushScore }; store.set('rbest', rushBest); } score = rushScore; info = l.rushOf(Math.min(rushI + (won ? 0 : 1), rush.length), rush.length) + ' · ' + l.best + ' ' + rushBest.s;
      } else { msg = won ? l.wins(labelOf(M.cid(F.fs[0].id))) : l.ko; if (won) streak++; else streak = 0; info = l.streak + ' ' + streak + ' · ' + l.best + ' ' + Math.max(best, score); }
      if (score > best && mode !== 'rush') { best = score; store.set('best', best); } store.set('streak', streak);
    }
    lastEnd = { score, win: w === 0, rushDone: mode === 'rush' && (rushI >= rush.length || w !== 0) };
    $('e-msg').textContent = msg; $('e-score').textContent = mode === '2p' ? F.wins.join(' - ') : score; $('e-info').textContent = info;
    $('again').textContent = (mode === 'rush' && w === 0 && rushI < rush.length) ? '▶ ' + (t().ch[rush[rushI].ch.id] || [''])[0] : l.again; $('e-share').hidden = mode === '2p'; show('end'); setTimeout(() => { try { $('again').focus(); } catch (e) { } }, 50);
  }
  function toMenu() { state = 'menu'; F = null; rush = null; rushI = 0; rushScore = 0; paused = false; applyText(); show('menu'); resize(); }
  function renderPick() {
    const l = t(); $('p-title').textContent = mode === '2p' ? (pickStep === 0 ? l.pick1 : l.pick2) : l.pick1; const g = $('grid'); g.innerHTML = '';
    M.PLAYABLE.forEach((c, i) => { const b = document.createElement('button'); b.className = 'ch' + (sel[pickStep] === i ? ' on' : ''); const cv2 = document.createElement('canvas'); cv2.width = 128; cv2.height = 152; const x = cv2.getContext('2d'); x.translate(64, 142); x.scale(.85, .85); drawChar(x, c, i, { st: 'idle', t: 0, say: 0, walk: 0 }, 0); b.appendChild(cv2); const s = document.createElement('span'); s.textContent = l.ch[c.id][0]; b.appendChild(s); b.onclick = () => { sel[pickStep] = i; A.init(); A.resume(); A.ui(); renderPick(); }; g.appendChild(b); });
    const c = M.PLAYABLE[sel[pickStep]]; $('p-dsc').textContent = '“' + l.ch[c.id][1] + '” — ' + l.ch[c.id][2]; $('p-go').textContent = mode === '2p' && pickStep === 0 ? '▶ ' + l.pick2 : '▶ ' + l.play;
  }
  function startPick(m) { mode = m; pickStep = 0; sel = [rnd(8), rnd(8)]; if (sel[1] === sel[0]) sel[1] = (sel[0] + 3) % 8; rush = null; rushI = 0; rushScore = 0; state = 'pick'; renderPick(); show('pick'); A.init(); A.resume(); A.ui(); }
  $('b-cpu').onclick = () => startPick('cpu'); $('b-2p').onclick = () => startPick('2p'); $('b-rush').onclick = () => startPick('rush');
  $('p-go').onclick = () => { A.ui(); if (mode === 'cpu') { let o = rnd(8); if (o === sel[0]) o = (o + 1) % 8; sel[1] = o; } if (mode === '2p' && pickStep === 0) { pickStep = 1; if (sel[1] === sel[0]) sel[1] = (sel[0] + 1) % 8; renderPick(); return; } startMatch(); };
  $('p-back').onclick = () => toMenu(); $('e-menu').onclick = toMenu; $('pz-menu').onclick = toMenu;
  $('again').onclick = () => { A.ui(); if (mode === 'rush') { if (lastEnd.win && rushI < rush.length) return startMatch(); rush = null; rushI = 0; rushScore = 0; return startMatch(); } startMatch(); }; // instant rematch: same fighters, same level
  function setPause(v) { if (state !== 'fight') return; paused = v; $('paused').hidden = !v; if (v) A.suspend(); else A.resume(); }
  $('pause').onclick = () => setPause(!paused); $('resume').onclick = () => setPause(false);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (state === 'fight') setPause(true); else A.suspend(); } else if (!paused) A.resume(); });
  addEventListener('blur', () => { if (state === 'fight') setPause(true); });
  $('lang').onclick = () => { lang = LANGS[(LANGS.indexOf(lang) + 1) % 3]; store.set('lang', lang); applyText(); };
  $('snd').onclick = () => { A.init(); A.resume(); A.setOn(!A.on); store.set('snd', A.on); applyText(); };
  $('pack').onclick = () => { A.init(); A.resume(); A.setPack(A.pack === 'funny' ? 'calm' : 'funny'); store.set('pack', A.pack); A.ui(); applyText(); };
  $('mus').onclick = () => { A.init(); A.resume(); A.setMusic(!A.music); store.set('mus', A.music); applyText(); };
  // ---- share ----
  function shareUrl(s) { const u = new URL(location.href.split('?')[0], location.href); u.searchParams.set('b', s); u.searchParams.set('r', 'share'); return u.toString(); }
  function cardBlob(cb, s) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, '#2a0f4a'); g.addColorStop(1, '#ff7e5f'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    x.textAlign = 'center'; x.fillStyle = '#ffd60a'; x.font = '900 100px system-ui,sans-serif'; x.fillText(t().name, 540, 180); x.fillStyle = '#fff'; x.font = '700 58px system-ui,sans-serif'; x.fillText(t().cardTitle, 540, 280);
    x.fillStyle = '#fff'; x.font = '900 280px system-ui,sans-serif'; x.fillText(s, 540, 620); x.font = '600 52px system-ui,sans-serif'; x.fillText('🔥 ' + streak + '   ' + (mode === 'rush' ? '👑 ' + t().rush : '🥊 ' + t()[diff]), 540, 720);
    if (F) { x.save(); x.translate(380, 1120); x.scale(2.2, 2.2); drawChar(x, F.fs[0].ch, M.cid(F.fs[0].id), { st: 'idle', t: 0, say: 0, walk: 0 }, 0); x.restore(); x.save(); x.translate(700, 1120); x.scale(-2.2, 2.2); drawChar(x, F.fs[1].ch, M.cid(F.fs[1].id), { st: 'hit', t: 0, say: 1, walk: 0 }, 0); x.restore(); }
    x.fillStyle = '#fff'; x.font = '700 44px system-ui,sans-serif'; x.fillText(location.host || 'mohalla-mukka', 540, 1300); c.toBlob(cb, 'image/png');
  }
  $('e-share').onclick = () => { const s = lastEnd ? lastEnd.score : 0, url = shareUrl(s), text = t().text(s, url);
    cardBlob(blob => { const file = blob && new File([blob], 'mohalla-mukka.png', { type: 'image/png' });
      if (navigator.canShare && file && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text }).catch(() => { });
      else if (navigator.share) navigator.share({ text, url }).catch(() => { });
      else { try { navigator.clipboard.writeText(text); $('e-msg').textContent = t().shared; } catch (e) { prompt('', text); } } }, s); };
  // ---- loop ----
  let acc = 0, last = 0; const STEP = 1000 / 60;
  function frame(now) {
    requestAnimationFrame(frame); if (!last) last = now; let dt = now - last; last = now; if (dt > 100) dt = STEP;
    if (state === 'fight' && !paused && F) { acc += dt; let n = 0; while (acc >= STEP && n++ < 5) { acc -= STEP; const i1 = readInput(0), i2 = ai ? M.aiInput(F, 1, ai) : readInput(1); const ev = M.step(F, i1, i2); perf.steps++; if (ev.length) handle(ev); if (F.over && state === 'fight') { endMatch(); break; } }
      if (bannerT > 0) bannerT--; if (shake > 0) shake *= .85; if (flash > 0) flash -= .03; if (crowd > 0) crowd--; for (const q of fxs) { q.x += q.vx; q.y += q.vy; q.vy -= .3; q.l--; } fxs = fxs.filter(q => q.l > 0); for (const p of pops) { p.y += 1.2; p.l--; } pops = pops.filter(p => p.l > 0);
      const p0 = $('sp0'); if (p0) p0.firstChild && (p0.lastChild.style.height = (F.fs[0].cd === 0 ? 0 : (F.fs[0].cd / M.SPCD) * 100) + '%'); const p1 = $('sp1'); if (p1) p1.lastChild.style.height = (F.fs[1].cd === 0 ? 0 : (F.fs[1].cd / M.SPCD) * 100) + '%'; }
    draw(now);
  }
  addEventListener('resize', resize);
  window.__mk = { get state() { return state; }, get F() { return F; }, get mode() { return mode; }, perf, held, keys, get ai() { return ai; }, get sel() { return sel; }, setPause };
  applyText(); show('menu'); resize(); requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  const gc = window.MK_CFG && window.MK_CFG.gc; if (gc) { const s = document.createElement('script'); s.async = true; s.src = 'https://gc.zgo.at/count.js'; s.dataset.goatcounter = 'https://' + gc + '.goatcounter.com/count'; document.head.appendChild(s); }
})();
