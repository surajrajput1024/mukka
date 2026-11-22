// Mohalla Mukka: pure fight engine + AI. No DOM. Fixed 60 Hz ticks, deterministic given seeds. Runs in browser (window.MK) and node (module.exports).
(function (root) {
  'use strict';
  const FPS = 60, W = 1000, GRAV = 0.62, JUMP = 13.5, ROUND_T = 60 * FPS, INTRO = 70, OUTRO = 120;
  const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  // Original fictional archetypes. sp = special kind. ids index the text in i18n.js (T.ch[id]).
  const CHARS = [
    { id: 'baba', sp: 'speech', hp: 100, spd: 2.9, dmg: 1.0, col: '#ff9f1c', col2: '#f4e3c1', tune: [0, 2, 4, 2, 5, 4] },
    { id: 'devi', sp: 'sit', hp: 115, spd: 2.7, dmg: 0.95, col: '#d6336c', col2: '#ffd8a8', tune: [4, 4, 2, 0, 2, 0] },
    { id: 'cricket', sp: 'dash', hp: 100, spd: 3.3, dmg: 1.0, col: '#1c7ed6', col2: '#e7f5ff', tune: [0, 4, 7, 9, 7, 12] },
    { id: 'chai', sp: 'cup', hp: 95, spd: 3.0, dmg: 1.0, col: '#8d6e63', col2: '#ffe8cc', tune: [2, 0, 2, 4, 2, 0] },
    { id: 'auto', sp: 'rush', hp: 105, spd: 3.4, dmg: 1.0, col: '#f2c200', col2: '#2b2b2b', tune: [0, 0, 7, 7, 9, 7] },
    { id: 'aunty', sp: 'pull', hp: 100, spd: 3.0, dmg: 1.0, col: '#9c36b5', col2: '#ffc9c9', tune: [7, 9, 7, 4, 2, 4] },
    { id: 'forward', sp: 'fwd', hp: 90, spd: 3.1, dmg: 1.05, col: '#2f9e44', col2: '#d3f9d8', tune: [0, 7, 0, 7, 9, 12] },
    { id: 'jugaad', sp: 'jugaad', hp: 100, spd: 3.2, dmg: 1.0, col: '#e8590c', col2: '#dee2e6', tune: [4, 2, 4, 7, 4, 2] },
    { id: 'challan', sp: 'challan', hp: 150, spd: 2.8, dmg: 1.0, col: '#495057', col2: '#74c0fc', tune: [0, 0, 0, 5, 4, 0], boss: true }
  ];
  const PLAYABLE = CHARS.filter(c => !c.boss), BOSS = CHARS[8];
  const ATK = { light: { start: 5, active: 4, total: 17, dmg: 6, reach: 74, kb: 5, stun: 15 }, heavy: { start: 13, active: 5, total: 32, dmg: 14, reach: 96, kb: 13, stun: 24 } };
  const SPTOT = { speech: 28, sit: 74, dash: 36, cup: 30, rush: 38, pull: 34, fwd: 34, jugaad: 24, challan: 30 };
  const SPCD = 360;
  const DIFF = { easy: { react: 24, atk: .28, blk: .18, spec: .3, mis: .28 }, normal: { react: 13, atk: .45, blk: .45, spec: .6, mis: .1 }, hard: { react: 8, atk: .6, blk: .6, spec: .8, mis: .05 } };
  const blank = () => ({ l: 0, r: 0, up: 0, light: 0, heavy: 0, block: 0, special: 0 });
  const cid = (id) => CHARS.findIndex(c => c.id === id);
  function fighter(ch, x, face) {
    return { ch, id: ch.id, x, y: 0, vx: 0, vy: 0, face, hp: ch.hp, maxhp: ch.hp, st: 'idle', t: 0, done: false, cd: 0, stun: 0, cb: 0, block: false, buff: 0, slow: 0, sit: 0, stamps: 0, sp: '', say: 0 };
  }
  function newMatch(ch1, ch2, opts) {
    opts = opts || {};
    const f = { fs: [fighter(ch1, 300, 1), fighter(ch2, 700, -1)], ps: [], ev: [], wins: [0, 0], round: 1, phase: 'intro', pt: 0, time: ROUND_T, tick: 0, winner: -1, lost: [0, 0], rng: mulberry(opts.seed || 1), bestOf: opts.bestOf || 3, last: -1, over: false, hpSum: [0, 0] };
    return f;
  }
  function resetRound(f) {
    [300, 700].forEach((x, i) => { const o = f.fs[i]; Object.assign(o, fighter(o.ch, x, i ? -1 : 1)); });
    f.ps = []; f.time = ROUND_T; f.phase = 'intro'; f.pt = 0;
  }
  const grounded = (o) => o.y <= 0;
  const busy = (o) => o.st === 'light' || o.st === 'heavy' || o.st === 'special';
  function spawn(f, o, kind, vx, y, dmg, kb, extra) {
    f.ps.push(Object.assign({ kind, owner: o === f.fs[0] ? 0 : 1, x: o.x + o.face * 50, y, vx: vx * o.face, vy: 0, g: 0, dmg: dmg * o.ch.dmg * (o.buff ? 1.4 : 1), kb, life: 100 }, extra || {}));
  }
  function hurt(f, att, def, dmg, kb, stun, heavy, fx) {
    if (def.st === 'ko' || f.phase !== 'fight') return;
    dmg = Math.max(1, Math.round(dmg * att.ch.dmg * (att.buff ? 1.4 : 1)));
    const dir = att.x < def.x ? 1 : -1;
    if (def.sit > 0) { f.ev.push({ t: 'block', x: def.x, y: def.y + 60, big: 1 }); return; }
    const facing = def.face * (att.x - def.x) > 0 || fx === 'proj';
    if (def.block && grounded(def) && facing) {
      dmg = Math.max(1, Math.ceil(dmg * .2)); def.hp -= dmg; def.vx = dir * kb * .3; def.stun = 7; def.st = 'hit'; def.block = true; f.ev.push({ t: 'block', x: def.x, y: def.y + 60, big: heavy ? 1 : 0 });
    } else {
      def.hp -= dmg; def.stun = Math.max(8, stun - 4 * def.cb); def.cb++; def.vx = dir * kb; def.st = 'hit'; def.t = 0; def.block = false;
      if (def.y > 0) def.vy = Math.max(def.vy, 5);
      att.combo = (att.combo || 0) + 1; f.ev.push({ t: 'hit', x: def.x, y: def.y + 70, heavy: heavy ? 1 : 0, dmg, side: f.fs.indexOf(def), combo: def.cb });
      if (fx === 'slow') def.slow = 180;
      if (fx === 'stamp') { def.stamps++; f.ev.push({ t: 'stamp', n: def.stamps, side: f.fs.indexOf(def) }); if (def.stamps >= 3) { def.hp = 0; f.ev.push({ t: 'suspend', side: f.fs.indexOf(def) }); } }
      if (heavy && att.ch.boss === undefined && def.ch.boss && f.fs.indexOf(att) >= 0) { if (att.stamps > 0) { att.stamps--; f.ev.push({ t: 'clear', side: f.fs.indexOf(att) }); } }
    }
    if (def.hp <= 0) { def.hp = 0; def.st = 'ko'; def.vy = 7; def.vx = dir * 6; def.stun = 0; f.ev.push({ t: 'ko', side: f.fs.indexOf(def) }); }
  }
  function startSpecial(f, o) { o.st = 'special'; o.t = 0; o.done = false; o.sp = o.ch.sp; o.cd = SPCD * (o.ch.boss ? .85 : 1); o.say = 70; f.ev.push({ t: 'special', kind: o.sp, id: o.id, side: f.fs.indexOf(o) }); }
  function specialTick(f, o, p) {
    const t = o.t, k = o.sp;
    if (k === 'speech' && t === 10) spawn(f, o, 'bubble', 6.5, 70, 10, 9, { life: 110 });
    else if (k === 'sit') { if (t === 1) { o.sit = 64; o.hp = Math.min(o.maxhp, o.hp + 9); } o.vx = 0; if (t === 64) { o.sit = 0; if (Math.abs(p.x - o.x) < 170 && !p.sit) hurt(f, o, p, 5, 15, 20, 1); } }
    else if (k === 'dash' || k === 'rush') { if (t >= 6 && t <= 22) { o.vx = o.face * (k === 'dash' ? 11 : 9); if (!o.done && Math.abs(p.x - o.x) < 62 && p.y < 90) { o.done = true; hurt(f, o, p, k === 'dash' ? 12 : 9, k === 'dash' ? 14 : 24, 24, 1); } } else if (t > 22) o.vx *= .8; }
    else if (k === 'cup' && t === 12) spawn(f, o, 'cup', 5.5, 60, 7, 4, { vy: 4.5, g: .22, fx: 'slow', life: 120 });
    else if (k === 'pull' && t === 10) { if (Math.abs(p.x - o.x) < 280 && p.y < 90 && p.st !== 'ko') { p.x = Math.max(40, Math.min(W - 40, o.x + o.face * 62)); p.stun = 22; p.st = 'hit'; p.vx = 0; f.ev.push({ t: 'pull', x: p.x }); } }
    else if (k === 'pull' && t === 20) { if (Math.abs(p.x - o.x) < 90 && p.y < 90) hurt(f, o, p, 11, 6, 20, 1); }
    else if (k === 'fwd' && (t === 8 || t === 14 || t === 20)) spawn(f, o, 'msg', 7, [10, 45, 80][(t - 8) / 6], 5, 4, { life: 100 });
    else if (k === 'jugaad' && t === 6) { o.buff = 240; f.ev.push({ t: 'buff', side: f.fs.indexOf(o) }); }
    else if (k === 'challan' && t === 10) spawn(f, o, 'challan', 7, 55, 4, 3, { fx: 'stamp', life: 120 });
  }
  function updateFighter(f, o, p, inp, side) {
    if (o.cd > 0) o.cd--; if (o.buff > 0) o.buff--; if (o.slow > 0) o.slow--; if (o.say > 0) o.say--;
    const live = f.phase === 'fight' && o.st !== 'ko';
    o.block = false;
    if (o.st === 'ko') { /* physics only */ }
    else if (o.stun > 0) { o.stun--; if (o.stun === 0) { o.st = 'idle'; o.cb = 0; } }
    else if (busy(o)) {
      o.t++; const A = ATK[o.st];
      if (A) { if (o.t >= A.start && o.t < A.start + A.active && !o.done && p.st !== 'ko') { const dx = (p.x - o.x) * o.face; if (dx > -10 && dx < A.reach && p.y < 45 && o.y < 45) { o.done = true; hurt(f, o, p, A.dmg, A.kb, A.stun, o.st === 'heavy'); } } if (o.t === A.start) f.ev.push({ t: 'whoosh', heavy: o.st === 'heavy' ? 1 : 0, x: o.x }); if (o.t >= A.total) { o.st = 'idle'; o.t = 0; } }
      else { specialTick(f, o, p); if (o.t >= SPTOT[o.sp]) { o.st = 'idle'; o.t = 0; o.sit = 0; } }
    } else if (live) {
      const air = !grounded(o);
      if (!air) {
        if (inp.special && o.cd === 0) startSpecial(f, o);
        else if (inp.heavy) { o.st = 'heavy'; o.t = 0; o.done = false; }
        else if (inp.light) { o.st = 'light'; o.t = 0; o.done = false; }
        else if (inp.up) { o.vy = JUMP; o.st = 'jump'; f.ev.push({ t: 'jump', x: o.x }); }
        else if (inp.block) { o.block = true; o.vx = 0; o.st = 'block'; }
        else { const d = (inp.r ? 1 : 0) - (inp.l ? 1 : 0); o.vx = d * o.ch.spd * (o.buff ? 1.35 : 1) * (o.slow ? .5 : 1); o.st = d ? 'walk' : 'idle'; }
      }
    }
    if (o.st === 'block' && !o.block) o.st = 'idle';
    if (o.st === 'block') o.block = true;
    // physics
    o.x += o.vx; o.y += o.vy; if (o.y > 0 || o.vy > 0) o.vy -= GRAV;
    if (o.y <= 0) { if (o.vy < 0 && o.y < 0 && !(o.st === 'ko')) f.ev.push({ t: 'land', x: o.x }); o.y = 0; if (o.vy < 0) o.vy = 0; if (o.st === 'jump') o.st = 'idle'; if (o.st === 'ko') o.vy = 0; }
    if (o.y === 0 && (o.st === 'hit' || o.st === 'ko' || busy(o))) o.vx *= .86; else if (o.y === 0 && o.st !== 'walk') o.vx = 0;
    o.x = Math.max(40, Math.min(W - 40, o.x));
    if (!busy(o) && o.st !== 'ko' && o.stun === 0 && grounded(o)) o.face = p.x >= o.x ? 1 : -1;
  }
  function separate(a, b) { const d = b.x - a.x; if (Math.abs(d) < 46 && a.y < 40 && b.y < 40) { const push = (46 - Math.abs(d)) / 2, s = d >= 0 ? 1 : -1; a.x = Math.max(40, a.x - s * push); b.x = Math.min(W - 40, b.x + s * push); } }
  function projTick(f) {
    f.ps = f.ps.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy -= p.g; p.life--;
      if (p.life <= 0 || p.x < -20 || p.x > W + 20 || p.y < 0) return false;
      const d = f.fs[1 - p.owner], a = f.fs[p.owner];
      if (d.st !== 'ko' && Math.abs(p.x - d.x) < 34 && p.y > d.y - 10 && p.y < d.y + 110) { hurt(f, a, d, p.dmg / (a.ch.dmg * (a.buff ? 1.4 : 1)), p.kb, 16, false, p.fx || 'proj'); return false; }
      return true;
    });
  }
  // one tick. returns f.ev (events of this tick)
  function step(f, i1, i2) {
    f.ev = []; if (f.over) return f.ev; f.tick++; f.pt++;
    const [a, b] = f.fs;
    if (f.phase === 'intro') { updateFighter(f, a, b, blank(), 0); updateFighter(f, b, a, blank(), 1); if (f.pt === 1) f.ev.push({ t: 'round', n: f.round }); if (f.pt >= INTRO) { f.phase = 'fight'; f.pt = 0; f.ev.push({ t: 'fight' }); } return f.ev; }
    if (f.phase === 'fight') {
      updateFighter(f, a, b, i1 || blank(), 0); updateFighter(f, b, a, i2 || blank(), 1); separate(a, b); projTick(f); f.time--;
      if (a.st === 'ko' || b.st === 'ko' || f.time <= 0) {
        f.phase = 'roundend'; f.pt = 0; let w = -1;
        if (a.hp > b.hp) w = 0; else if (b.hp > a.hp) w = 1; else if (a.st === 'ko' && b.st === 'ko') w = -1;
        f.last = w; if (w >= 0) { f.wins[w]++; f.lost[1 - w]++; } f.hpSum[0] += a.hp; f.hpSum[1] += b.hp;
        f.ev.push({ t: 'roundend', w, timeout: f.time <= 0 ? 1 : 0 });
        const need = Math.ceil(f.bestOf / 2); if (f.wins[0] >= need || f.wins[1] >= need) { f.winner = f.wins[0] > f.wins[1] ? 0 : 1; f.ev.push({ t: 'match', w: f.winner }); }
      }
    } else if (f.phase === 'roundend') {
      updateFighter(f, a, b, blank(), 0); updateFighter(f, b, a, blank(), 1); projTick(f);
      if (f.pt >= OUTRO) { if (f.winner >= 0) { f.phase = 'matchend'; f.over = true; } else { f.round++; resetRound(f); } }
    }
    return f.ev;
  }
  // ---------- AI ----------
  function aiNew(diff, seed) { return { d: DIFF[diff] || DIFF.normal, rng: mulberry(seed || 7), timer: 0, inp: blank(), after: 0 }; }
  function spRange(k) { return { speech: [160, 520], sit: [0, 90], dash: [120, 330], cup: [150, 460], rush: [120, 330], pull: [90, 280], fwd: [160, 560], jugaad: [0, 1000], challan: [160, 560] }[k]; }
  function aiInput(f, side, m) {
    if (f.phase !== 'fight') return blank();
    if (m.timer > 0) { m.timer--; if (m.timer === 0 && m.after > 0) { m.inp = blank(); m.timer = m.after; m.after = 0; } return m.inp; }
    const me = f.fs[side], op = f.fs[1 - side], D = m.d, r = m.rng; let inp = blank(); const dx = op.x - me.x, dist = Math.abs(dx), dir = dx >= 0 ? 1 : -1;
    const toward = () => { if (dir > 0) inp.r = 1; else inp.l = 1; }, away = () => { if (dir > 0) inp.l = 1; else inp.r = 1; };
    let dur = D.react + Math.floor(r() * 6);
    const threat = (op.st === 'light' || op.st === 'heavy' || (op.st === 'special' && ['dash', 'rush', 'pull'].includes(op.sp))) && dist < 150;
    const proj = f.ps.find(p => p.owner !== side && Math.abs(p.x - me.x) < 240 && (p.vx > 0) === (me.x > p.x));
    if (me.st === 'ko' || op.st === 'ko' || me.stun > 0) { m.inp = inp; m.timer = 2; return inp; }
    if (r() < D.mis) { if (r() < .5) toward(); m.inp = inp; m.timer = dur; return inp; }
    if (threat && r() < D.blk) { inp.block = 1; if (r() < .25) away(); }
    else if (proj && r() < D.blk) { if (r() < .5) inp.up = 1; else inp.block = 1; }
    else {
      const sr = spRange(me.ch.sp); const sitNeed = me.ch.sp === 'sit' && me.hp < me.maxhp * .6;
      if (me.cd === 0 && r() < D.spec && ((dist >= sr[0] && dist <= sr[1] && me.ch.sp !== 'jugaad' && me.ch.sp !== 'sit') || (me.ch.sp === 'jugaad' && !me.buff && dist > 200) || (sitNeed && dist > 120 && r() < .5) || (me.ch.sp === 'sit' && dist < 90 && r() < .3))) { inp.special = 1; m.inp = inp; m.timer = 2; m.after = dur; return inp; }
      if (dist < 86) { if (r() < D.atk) { if (r() < .35) inp.heavy = 1; else inp.light = 1; m.inp = inp; m.timer = 2; m.after = dur; return inp; } else if (r() < .35) away(); else inp.block = 1; }
      else if (dist < 200) { if (r() < .75) toward(); else if (r() < .5) away(); else if (r() < .3) inp.up = 1; }
      else { toward(); if (r() < .06) inp.up = 1; }
    }
    m.inp = inp; m.timer = dur; return inp;
  }
  // ---------- daily boss rush ----------
  const dayNumber = (ms, tz) => Math.floor((ms + (tz === undefined ? 330 : tz) * 60000) / 86400000); // default IST
  function bossRush(day, playerId) {
    const r = mulberry(day * 7919 + 13), pool = PLAYABLE.filter(c => c.id !== playerId), out = [];
    for (let i = 0; i < 3; i++) { const k = Math.floor(r() * pool.length); out.push({ ch: pool.splice(k, 1)[0], diff: i === 0 ? 'easy' : i === 1 ? 'normal' : 'hard' }); }
    out.push({ ch: BOSS, diff: 'hard', boss: true }); return out;
  }
  function matchScore(f, side, diff) {
    if (f.winner !== side) return 0; const m = { easy: 1, normal: 1.5, hard: 2 }[diff] || 1;
    const hp = Math.round(f.hpSum[side]), perfect = f.lost[side] === 0 ? 150 : 0; return Math.round((300 + hp * 2 + perfect) * m);
  }
  const API = { FPS, W, ROUND_T, INTRO, OUTRO, CHARS, PLAYABLE, BOSS, ATK, DIFF, SPCD, mulberry, newMatch, step, aiNew, aiInput, blank, bossRush, dayNumber, matchScore, cid };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MK = API;
})(typeof window !== 'undefined' ? window : globalThis);
