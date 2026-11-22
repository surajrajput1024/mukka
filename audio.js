// WebAudio synthesis only. No audio files. Starts on first tap (browser rule).
// Packs: 'funny' (cartoon bonks, boings, comic stingers, dhol-style beat) and 'calm' (soft thuds, gentle loop).
// All sounds are original: oscillators, filtered noise, synthetic vowels (formant blips). No voices, no samples, nothing imitating an existing meme sound.
window.MK_AUDIO = (function () {
  let ctx, master, comp, noiseBuf, musicGain, on = true, music = true, pack = 'funny', started = false, nextT = 0, step = 0, timer = 0, lastHit = -1;
  const PENT = [0, 2, 4, 7, 9];
  const freq = (n, base) => (base || 523.25) * Math.pow(2, (PENT[((n % 5) + 5) % 5] + 12 * Math.floor(n / 5)) / 12);
  const MASTER = 0.7;
  function build(c) {
    ctx = c; comp = ctx.createDynamicsCompressor(); // limiter: fast and hard so stacked sounds never clip
    comp.threshold.value = -8; comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.002; comp.release.value = 0.1;
    master = ctx.createGain(); master.gain.value = on ? MASTER : 0; master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    musicGain = ctx.createGain(); musicGain.gain.value = music ? 0.08 : 0; musicGain.connect(master); started = true;
  }
  function init() { if (started) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; build(new AC()); nextT = ctx.currentTime + 0.1; timer = setInterval(sched, 90); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function tone(f, t, dur, type, vol, dest, f2, att) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const a = att || 0.008; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  function noise(t, dur, vol, f0, f1, type, q, dest) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; if (q) f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); g.connect(dest || master); s.start(t, Math.random(), dur + 0.05);
  }
  // synthetic vowel blip: sawtooth through two band-pass formants (not a voice, a "wah" synth)
  function formant(t, dur, f0, f1, vol, fa, fb, dest, type) {
    const o = ctx.createOscillator(); o.type = type || 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    [fa, fb].forEach((fr, i) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 6; b.frequency.setValueAtTime(fr[0], t); b.frequency.exponentialRampToValueAtTime(fr[1], t + dur); const gg = ctx.createGain(); gg.gain.value = i ? 0.6 : 1; o.connect(b); b.connect(gg); gg.connect(g); });
    g.connect(dest || master); o.start(t); o.stop(t + dur + 0.05);
  }
  const funny = () => pack === 'funny';
  // ---- sound library: every function takes an explicit start time t (so tests can render offline) ----
  const S = {
    hit(t, heavy) {
      if (!funny()) { tone(heavy ? 120 : 170, t, 0.2, 'sine', heavy ? 0.85 : 0.6, null, 45); noise(t, 0.1, 0.4, 1500, 200); return; }
      tone(heavy ? 150 : 210, t, heavy ? 0.16 : 0.1, 'triangle', heavy ? 0.9 : 0.65, null, 55); noise(t, 0.06, heavy ? 0.6 : 0.4, 3200, 700, 'bandpass', 1); // thud + slap
      if (heavy) { tone(900, t + 0.04, 0.2, 'square', 0.12, null, 220); formant(t + 0.05, 0.28, 480, 190, 0.5, [850, 380], [2100, 1000]); } else tone(1300, t + 0.03, 0.07, 'square', 0.1, null, 700); // bonk + little "oof"
    },
    block(t, heavy) { tone(900, t, 0.05, 'triangle', 0.4, null, 500); tone(110, t, 0.1, 'sine', 0.5, null, 70); noise(t, 0.05, 0.18, 2500, 600, 'bandpass', 2); },
    whoosh(t, heavy) { noise(t, heavy ? 0.26 : 0.15, heavy ? 0.28 : 0.2, 500, 3200, 'bandpass', 1.2); },
    jump(t) { tone(260, t, 0.14, 'sine', 0.22, null, 640); },
    land(t) { tone(130, t, 0.1, 'sine', 0.3, null, 55); },
    ooh(t) { // crowd "ooooh": detuned vowel stack gliding up then down + breathy noise swell
      [0, 7, -5, 12].forEach((d, i) => formant(t + i * 0.02, 0.8, 190 * Math.pow(2, d / 12), 260 * Math.pow(2, d / 12), 0.12, [350, 300], [800, 700], null, 'sawtooth'));
      noise(t, 0.8, 0.18, 500, 900, 'bandpass', 1.5);
    },
    ding(t) { tone(1320, t, 0.5, 'triangle', 0.3); tone(1980, t + 0.01, 0.4, 'sine', 0.15); },
    fight(t) { tone(392, t, 0.1, 'square', 0.22); tone(523, t + 0.1, 0.1, 'square', 0.22); tone(784, t + 0.2, 0.3, 'square', 0.25); noise(t + 0.2, 0.25, 0.15, 5000, 1200, 'highpass'); },
    ko(t) { // sad trombone slide + boing + crowd
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(master);
      [311, 293, 277, 233].forEach((f, i) => tone(f, t + 0.15 + i * 0.2, i === 3 ? 0.7 : 0.18, 'sawtooth', 0.4, lp, i === 3 ? f * 0.62 : 0, 0.02));
      tone(160, t, 0.2, 'triangle', 0.7, null, 50); S.ooh(t + 0.05);
    },
    win(t) { [0, 2, 4, 7, 9].forEach((n, i) => tone(freq(n + 5), t + i * 0.09, 0.28, 'triangle', 0.3)); tone(freq(14), t + 0.5, 0.5, 'square', 0.12); },
    ui(t) { tone(700, t, 0.05, 'sine', 0.2, null, 900); },
    // special stingers by kind
    special(t, k) {
      if (k === 'speech') [0, 1, 2].forEach(i => formant(t + i * 0.11, 0.1, 210 + i * 25, 190, 0.35, [700, 600], [1500, 1200])); // blah blah blah
      else if (k === 'sit') { tone(300, t, 0.25, 'sine', 0.4, null, 90); tone(110, t + 0.2, 0.2, 'triangle', 0.6, null, 60); noise(t + 0.2, 0.15, 0.3, 900, 150); }
      else if (k === 'dash') { tone(400, t, 0.35, 'sine', 0.3, null, 1700); tone(1500, t + 0.3, 0.1, 'square', 0.15); noise(t + 0.15, 0.2, 0.25, 800, 4000, 'bandpass', 1); }
      else if (k === 'cup') { for (let i = 0; i < 3; i++) tone(240 + i * 70, t + i * 0.08, 0.08, 'sine', 0.3, null, 420 + i * 90); } // glug glug
      else if (k === 'rush') { tone(392, t, 0.12, 'square', 0.2); tone(523, t + 0.13, 0.28, 'square', 0.2); } // pip-peeep horn
      else if (k === 'pull') { tone(1200, t, 0.3, 'sawtooth', 0.12, null, 200); tone(180, t + 0.3, 0.08, 'triangle', 0.7, null, 70); noise(t + 0.3, 0.07, 0.5, 4000, 900, 'bandpass', 1); }
      else if (k === 'fwd') [0, 1, 2].forEach(i => { tone(1568, t + i * 0.1, 0.06, 'sine', 0.22); tone(2093, t + i * 0.1 + 0.05, 0.08, 'sine', 0.18); }); // message pings
      else if (k === 'jugaad') { for (let i = 0; i < 6; i++) noise(t + i * 0.04, 0.02, 0.2, 5000, 3000, 'highpass'); tone(200, t + 0.24, 0.25, 'triangle', 0.3, null, 900); } // ratchet + spring
      else if (k === 'challan') { tone(120, t, 0.12, 'sine', 0.8, null, 50); noise(t, 0.05, 0.4, 3000, 800, 'bandpass'); for (let i = 0; i < 4; i++) tone(2600, t + 0.15 + i * 0.045, 0.04, 'square', 0.1, null, 2700); } // stamp + whistle trill
    },
    suspend(t) { tone(900, t, 0.1, 'square', 0.15, null, 300); S.ko(t + 0.1); },
    stamp(t) { tone(120, t, 0.12, 'sine', 0.7, null, 50); noise(t, 0.05, 0.3, 2000, 500); },
    // catchphrase as a pitched-blip jingle: six vowel blips on the character's own tune; per-character timbre
    catchphrase(t, tune, idx) {
      const base = 262 * (1 + (idx % 3) * 0.12), vowels = [[[800, 700], [1200, 1100]], [[400, 350], [2000, 1700]], [[600, 500], [1000, 900]]];
      tune.forEach((n, i) => { const f = freq(n, base), v = vowels[(i + idx) % 3]; formant(t + i * 0.13, 0.12, f, f * 0.96, 0.32, v[0], v[1], null, idx % 2 ? 'square' : 'sawtooth'); });
    }
  };
  // loops. funny: dhol-style 16-step bounce at 0.17 s/step (low "dha" kick, high "tak", bass bounce, pentatonic hook). calm: soft arpeggio.
  const HOOK = [0, -1, 2, -1, 4, 2, -1, 0, 2, -1, 4, -1, 7, 4, 2, -1], BASS = [0, 0, -3, -3];
  function beatStep(s, t) {
    const k = s % 16;
    if (pack === 'calm') { if (k % 2 === 0) tone(freq(HOOK[k] < 0 ? 0 : HOOK[k]), t, 0.28, 'triangle', 0.5, musicGain); if (k % 8 === 0) tone(freq(BASS[(s >> 3) % 4] + 5) / 4, t, 0.6, 'sine', 0.9, musicGain); return; }
    if (k % 4 === 0 || k === 10) tone(130, t, 0.14, 'sine', 1.0, musicGain, 42); // dha
    if (k % 4 === 2) noise(t, 0.05, 0.5, 4500, 2500, 'bandpass', 2, musicGain); // tak
    if (k % 2 === 1) noise(t, 0.03, 0.25, 7000, 6000, 'highpass', 0, musicGain);
    if (k % 2 === 0) tone(freq(BASS[(s >> 4) % 4] + 0) / 4, t, 0.14, 'square', 0.3, musicGain);
    if (HOOK[k] >= 0) tone(freq(HOOK[k] + ((s >> 4) % 2) * 2), t, 0.14, 'triangle', 0.45, musicGain);
  }
  function sched() { if (!ctx || !music || !on) { if (ctx) nextT = Math.max(nextT, ctx.currentTime); return; } while (nextT < ctx.currentTime + 0.25) { beatStep(step, nextT); step++; nextT += 0.17; } }
  const go = (fn, a, b) => { if (!ctx) return; fn(ctx.currentTime, a, b); };
  const api = {
    init, resume, suspend,
    get on() { return on; }, get music() { return music; }, get pack() { return pack; },
    setOn(v) { on = v; if (master) master.gain.setTargetAtTime(v ? MASTER : 0, ctx.currentTime, 0.02); },
    setMusic(v) { music = v; if (musicGain) musicGain.gain.setTargetAtTime(v ? 0.08 : 0, ctx.currentTime, 0.05); },
    setPack(p) { pack = p === 'calm' ? 'calm' : 'funny'; },
    hit(heavy) { if (!ctx) return; if (ctx.currentTime - lastHit < 0.04) return; lastHit = ctx.currentTime; S.hit(ctx.currentTime, heavy); },
    block(h) { go(S.block, h); }, whoosh(h) { go(S.whoosh, h); }, jump() { go(S.jump); }, land() { go(S.land); }, ooh() { go(S.ooh); }, ding() { go(S.ding); }, fight() { go(S.fight); },
    ko() { go(S.ko); }, win() { go(S.win); }, ui() { go(S.ui); }, special(k) { go(S.special, k); }, suspend() { go(S.suspend); }, stamp() { go(S.stamp); },
    catchphrase(tune, idx) { if (!ctx) return; S.catchphrase(ctx.currentTime + 0.25, tune, idx || 0); },
    _test: { build, setPack: (p) => { pack = p; }, S, tone, beat: (t0, n) => { for (let i = 0; i < n; i++) beatStep(i, t0 + i * 0.17); } }
  };
  return api;
})();
