/* Merge Conflict — motor de apresentação: áudio procedural (WebAudio) + fundo vivo (canvas 2D). Sem dependências. */
(function () {
  'use strict';
  const EST = (window.EST = window.EST || {});
  const LS = 'mergeconflict.audio';
  const qs = new URLSearchParams(location.search);

  EST.lowEnd = (() => {
    try {
      const n = navigator;
      return (n.hardwareConcurrency || 8) <= 4 || (n.deviceMemory || 8) <= 3 || !!(n.connection && n.connection.saveData) || qs.get('low') === '1';
    } catch (e) { return false; }
  })();

  class Audio {
    constructor() {
      this.ctx = null; this.t = 0.15; this.started = false; this.heartTimer = null; this.forceMute = qs.get('audio') === '0';
      let p = {};
      try { p = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) {}
      this.music = p.music ?? 0.55; this.sfx = p.sfx ?? 0.8; this.muted = !!p.muted;
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend(); else if (this.started) this.ctx.resume();
      });
    }
    save() { if (this.forceMute) return; try { localStorage.setItem(LS, JSON.stringify({ music: this.music, sfx: this.sfx, muted: this.muted })); } catch (e) {} }
    ensure() {
      if (this.forceMute) return false;
      if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume(); return true; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.master = c.createGain(); this.mBus = c.createGain(); this.sBus = c.createGain();
      this.mBus.connect(this.master); this.sBus.connect(this.master); this.master.connect(this.comp).connect(c.destination);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
      return true;
    }
    apply() {
      if (!this.ctx) return;
      const n = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, n, 0.05);
      this.mBus.gain.setTargetAtTime(this.music * 0.9, n, 0.1);
      this.sBus.gain.setTargetAtTime(this.sfx, n, 0.05);
    }
    set(o) { Object.assign(this, o); this.save(); this.apply(); if (!this.muted) this.unlock(); }
    unlock() { if (this.muted || !this.ensure()) return; this.started = true; if (!this.layers) this.startMusic(); }
    ok() { return !this.muted && this.ensure(); }

    startMusic() {
      const c = this.ctx, n = c.currentTime, bus = this.mBus;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 5;
      const dg = c.createGain(); dg.gain.setValueAtTime(0.0001, n); dg.gain.exponentialRampToValueAtTime(0.07, n + 5);
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.4;
      o1.connect(lp); o2.connect(lp); lp.connect(dg).connect(bus);
      const sub = c.createOscillator(); sub.frequency.value = 27.5;
      const sg = c.createGain(); sg.gain.value = 0.07; sub.connect(sg).connect(bus);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.06;
      const lg = c.createGain(); lg.gain.value = 140; lfo.connect(lg).connect(lp.frequency);
      const p1 = c.createOscillator(); p1.type = 'triangle'; p1.frequency.value = 164.8;
      const p2 = c.createOscillator(); p2.type = 'triangle'; p2.frequency.value = 246.9;
      const pad = c.createGain(); pad.gain.value = 0.035; p1.connect(pad); p2.connect(pad);
      const pl = c.createOscillator(); pl.frequency.value = 0.11;
      const plg = c.createGain(); plg.gain.value = 0.02; pl.connect(plg).connect(pad.gain); pad.connect(bus);
      const dO = c.createOscillator(); dO.frequency.value = 58.27;
      const dis = c.createGain(); dis.gain.value = 0; dO.connect(dis).connect(bus);
      const ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
      const st = c.createGain(); st.gain.value = 0.004; ns.connect(bp).connect(st).connect(bus);
      [o1, o2, sub, lfo, p1, p2, pl, dO, ns].forEach((o) => o.start(n));
      this.layers = { lp, o1, o2, dis, st, pad };
      this.next = c.currentTime + 0.5;
      this.sched = setInterval(() => this.tick(), 60);
      this.setTension(this.t);
    }
    setTension(t) {
      this.t = t;
      if (!this.layers) return;
      const L = this.layers, n = this.ctx.currentTime;
      L.lp.frequency.setTargetAtTime(260 + t * 1100, n, 1.2);
      L.o1.frequency.setTargetAtTime(55 - t * 6, n, 2);
      L.o2.frequency.setTargetAtTime(55.4 - t * 6, n, 2);
      L.dis.gain.setTargetAtTime(t * t * 0.05, n, 1.5);
      L.st.gain.setTargetAtTime(0.004 + t * 0.028, n, 1);
      L.pad.gain.setTargetAtTime(0.035 * (1 - t * 0.6), n, 2);
    }
    tick() {
      const c = this.ctx;
      if (!c || c.state !== 'running') return;
      if (this.next < c.currentTime) this.next = c.currentTime; // relógio saltou (ex.: volta do modo de espera)
      while (this.next < c.currentTime + 0.2) {
        const t = this.t;
        if (t > 0.18) this.kick(this.next, 0.03 + t * 0.1, this.mBus);
        if (t > 0.55) this.kick(this.next + 0.2, 0.02 + t * 0.06, this.mBus);
        this.next += 60 / (54 + t * 62);
      }
      if (Math.random() < 0.012 + this.t * 0.02) this.blip();
      if (Math.random() < this.t * 0.05) this.noise(0, 0.03 + Math.random() * 0.05, { gain: 0.02 + this.t * 0.04, freq: 3000 + Math.random() * 3000, bus: this.mBus });
    }
    kick(at, g, bus) {
      const c = this.ctx, o = c.createOscillator(), e = c.createGain();
      o.frequency.setValueAtTime(72, at); o.frequency.exponentialRampToValueAtTime(36, at + 0.16);
      e.gain.setValueAtTime(0.0001, at); e.gain.exponentialRampToValueAtTime(g, at + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      o.connect(e).connect(bus || this.sBus); o.start(at); o.stop(at + 0.3);
    }
    blip() {
      const f = [1318.5, 1568, 1760, 2093][Math.floor(Math.random() * 4)];
      this.tone(f, 0, 0.06, { gain: 0.012, bus: this.mBus });
      if (Math.random() < 0.5) this.tone(f * 1.5, 0.08, 0.05, { gain: 0.008, bus: this.mBus });
    }
    tone(f, at = 0, dur = 0.2, o = {}) {
      if (!this.ok()) return;
      const c = this.ctx, t = c.currentTime + at;
      const os = c.createOscillator(); os.type = o.type || 'sine';
      os.frequency.setValueAtTime(f, t);
      if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      const g = c.createGain(), pk = o.gain ?? 0.15, atk = o.attack ?? 0.008;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, atk + 0.02));
      let node = os;
      if (o.lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; os.connect(fl); node = fl; }
      node.connect(g).connect(o.bus || this.sBus);
      os.start(t); os.stop(t + dur + 0.05);
    }
    noise(at = 0, dur = 0.2, o = {}) {
      if (!this.ok()) return;
      const c = this.ctx, t = c.currentTime + at;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1000, t); f.Q.value = o.q ?? 1;
      if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      const g = c.createGain(), pk = o.gain ?? 0.1, atk = o.attack ?? 0.005;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, atk + 0.02));
      s.connect(f).connect(g).connect(o.bus || this.sBus);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    }
    // stingers
    ui() { this.tone(1500, 0, 0.05, { gain: 0.04 }); }
    select(i = 0) { const k = Math.pow(2, (i * 2) / 12); this.tone(520 * k, 0, 0.14, { type: 'triangle', gain: 0.09 }); this.tone(1040 * k, 0.02, 0.08, { gain: 0.03 }); }
    lock() { this.tone(110, 0, 0.35, { to: 40, gain: 0.35 }); this.noise(0, 0.14, { type: 'highpass', freq: 2500, gain: 0.12 }); this.tone(880, 0.03, 0.25, { type: 'square', gain: 0.04, lp: 3000 }); this.tone(1318.5, 0.07, 0.3, { type: 'square', gain: 0.03, lp: 3000 }); }
    vote() { this.tone(990, 0, 0.07, { gain: 0.06 }); this.noise(0, 0.05, { freq: 4000, gain: 0.04 }); }
    pulse(i, ok) { ok ? this.tone(440 * Math.pow(2, ((i % 8) * 2) / 12), 0, 0.16, { gain: 0.1 }) : this.tone(220 * Math.pow(2, -(i % 8) / 12), 0, 0.18, { type: 'square', gain: 0.05, lp: 1200 }); }
    approved() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.07, 0.6, { type: 'triangle', gain: 0.09 })); this.noise(0.28, 0.5, { type: 'highpass', freq: 6000, gain: 0.04 }); this.tone(130.8, 0, 0.8, { gain: 0.12 }); }
    rejected() { this.tone(233, 0, 0.6, { type: 'sawtooth', to: 116, gain: 0.1, lp: 900 }); this.tone(277, 0, 0.6, { type: 'sawtooth', to: 138, gain: 0.06, lp: 900 }); this.noise(0, 0.35, { freq: 500, gain: 0.12, q: 1.5 }); this.tone(70, 0, 0.5, { to: 35, gain: 0.35 }); }
    heart() { this.tone(64, 0, 0.16, { to: 38, gain: 0.45 }); this.tone(58, 0.2, 0.18, { to: 34, gain: 0.3 }); }
    startHeart() { this.stopHeart(); let iv = 900; const beat = () => { this.heart(); iv = Math.max(430, iv * 0.93); this.heartTimer = setTimeout(beat, iv); }; beat(); }
    stopHeart() { clearTimeout(this.heartTimer); this.heartTimer = null; }
    flip() { this.noise(0, 0.22, { freq: 1200, to: 5000, gain: 0.08, q: 0.7 }); }
    cardOk() { this.tone(784, 0, 0.5, { gain: 0.08 }); this.tone(1175, 0.04, 0.6, { gain: 0.05 }); }
    cardFail() { this.noise(0, 0.4, { freq: 900, gain: 0.22, q: 0.5 }); this.tone(98, 0, 0.5, { type: 'sawtooth', to: 49, gain: 0.16, lp: 700 }); this.glitch(); }
    success() { [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.09, 0.9, { type: 'triangle', gain: 0.08 })); this.tone(196, 0, 1.6, { gain: 0.1, attack: 0.2 }); this.noise(0.4, 0.8, { type: 'highpass', freq: 7000, gain: 0.03 }); }
    fail() { this.tone(196, 0, 1.2, { type: 'sawtooth', to: 65, gain: 0.12, lp: 800 }); this.tone(207.6, 0, 1.2, { type: 'sawtooth', to: 69, gain: 0.1, lp: 800 }); this.noise(0, 1.1, { freq: 700, to: 200, gain: 0.18, q: 0.6 }); this.tone(55, 0, 1, { to: 30, gain: 0.4 }); }
    win() { [261.6, 329.6, 392, 523.25, 659.25].forEach((f, i) => this.tone(f, i * 0.12, 2.4, { type: 'triangle', gain: 0.07, attack: 0.3 })); this.tone(130.8, 0, 2.8, { gain: 0.14, attack: 0.5 }); this.noise(0.6, 2, { type: 'highpass', freq: 8000, gain: 0.025, attack: 0.6 }); }
    lose() { this.tone(146.8, 0, 2.4, { type: 'sawtooth', to: 73, gain: 0.1, lp: 600, attack: 0.1 }); this.tone(155.6, 0, 2.4, { type: 'sawtooth', to: 77, gain: 0.08, lp: 600, attack: 0.1 }); this.noise(0, 2.5, { freq: 900, to: 150, gain: 0.12, attack: 0.4 }); this.tone(41, 0, 2, { gain: 0.35 }); }
    turn() { this.tone(880, 0, 0.14, { gain: 0.1 }); this.tone(1318.5, 0.13, 0.22, { gain: 0.1 }); }
    open() { this.tone(41, 0, 2.2, { to: 30, gain: 0.45, attack: 0.05 }); this.noise(0, 2.2, { freq: 200, to: 4000, gain: 0.1, attack: 1.6, q: 0.8 }); this.tone(110, 1.9, 1.6, { type: 'sawtooth', gain: 0.08, lp: 500 }); }
    deal(i) { this.noise(0, 0.09, { type: 'highpass', freq: 2500 + i * 200, gain: 0.06 }); }
    reveal(side) {
      if (side === 'spies') { this.tone(110, 0, 1.4, { type: 'sawtooth', gain: 0.09, lp: 700, attack: 0.05 }); this.tone(116.5, 0, 1.4, { type: 'sawtooth', gain: 0.07, lp: 700 }); this.noise(0, 0.6, { freq: 1200, gain: 0.08 }); }
      else { [440, 554.4, 659.25].forEach((f, i) => this.tone(f, i * 0.06, 1.3, { type: 'triangle', gain: 0.07 })); this.tone(220, 0, 1.5, { gain: 0.1, attack: 0.1 }); }
    }
    glitch() { for (let i = 0; i < 7; i++) this.tone(150 + Math.random() * 2400, Math.random() * 0.25, 0.03, { type: 'square', gain: 0.035 }); }
  }

  class FX {
    constructor(cv) {
      this.cv = cv; this.g = cv.getContext('2d'); this.t = 0.15; this.tt = 0.15; this.reduced = false; this.low = EST.lowEnd;
      this.bursts = []; this.staticT = 0; this.staticD = 1; this.fps = 60; this.fr = 0; this.fl = performance.now();
      // qualidade adaptativa: 0 = completa, 1 = sem granulado nem desfoque dos painéis, 2 = também 30 fps e resolução 1x
      this.q = this.low ? 1 : 0; this.slow = 0; this.skip = false; this.applyQ();
      const N = this.low ? 36 : 110;
      this.p = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75, ph: Math.random() * 6.28, s: 0.4 + Math.random() }));
      this.grain = this.mkGrain();
      this.resize();
      // no celular a barra de endereço dispara resize ao rolar: ignora variações pequenas só de altura e agrupa o resto
      this.onResize = () => {
        if (innerWidth === this.w && Math.abs(innerHeight - this.h) < 160) return;
        clearTimeout(this.rzT); this.rzT = setTimeout(() => this.resize(), 150);
      };
      addEventListener('resize', this.onResize);
      this.onVis = () => { if (!document.hidden) { this.last = this.fl = performance.now(); this.fr = 0; this.loop(); } };
      document.addEventListener('visibilitychange', this.onVis);
      this.last = performance.now(); this.loop();
    }
    applyQ() { document.documentElement.classList.toggle('mc-lite', this.q >= 1); }
    destroy() { cancelAnimationFrame(this.raf); clearTimeout(this.rzT); removeEventListener('resize', this.onResize); document.removeEventListener('visibilitychange', this.onVis); this.dead = true; }
    setTension(t) { this.tt = t; }
    resize() { const d = Math.min(devicePixelRatio || 1, this.low || this.q >= 2 ? 1 : 1.5); this.d = d; this.w = innerWidth; this.h = innerHeight; this.cv.width = this.w * d; this.cv.height = this.h * d; this.pat = null; }
    mkGrain() {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'), im = x.createImageData(128, 128);
      for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      x.putImageData(im, 0, 0); return c;
    }
    loop() { if (document.hidden || this.dead) return; cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame((n) => { this.frame(n); this.loop(); }); }
    beam(x, y, ang, len, wid, col) {
      const g = this.g; g.save(); g.translate(x, y); g.rotate(ang);
      const gr = g.createLinearGradient(0, -wid, 0, wid);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -wid * 0.12); g.lineTo(len, -wid); g.lineTo(len, wid); g.lineTo(0, wid * 0.12); g.fill(); g.restore();
    }
    frame(now) {
      this.fr++;
      if (now - this.fl > 1000) {
        this.fps = Math.round((this.fr * 1000) / (now - this.fl)); this.fr = 0; this.fl = now;
        // 3 s seguidos abaixo de 48 fps: desce um nível de qualidade (não sobe de volta, para não oscilar)
        this.slow = this.fps < 48 ? this.slow + 1 : 0;
        if (this.slow >= 3 && this.q < 2) { this.q++; this.slow = 0; this.applyQ(); if (this.q === 2) this.resize(); }
      }
      if (this.q >= 2) { this.skip = !this.skip; if (this.skip) return; }
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.t += (this.tt - this.t) * Math.min(1, dt * 1.5);
      const g = this.g, d = this.d, W = this.w, H = this.h, t = this.t, M = Math.max(W, H);
      g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      const fl = 0.92 + 0.08 * Math.sin(now / 900);
      this.beam(W * 0.05, -H * 0.1, 0.9, M * 1.3, M * 0.32, `rgba(255,196,120,${0.075 * (1 - t * 0.65) * fl})`);
      this.beam(W * 1.02, H * 1.05, -2.3, M * 1.1, M * 0.26, `rgba(80,215,230,${0.03 + t * 0.06})`);
      const sp = (this.reduced ? 0.15 : 1) * (1 + t * 2.6), sa = Math.sin(0.9), ca = Math.cos(0.9);
      const cr = (255 - 110 * t) | 0, cg = (215 - 10 * t) | 0, cb = (170 + 70 * t) | 0;
      for (const p of this.p) {
        p.ph += dt * (0.4 + t * 2) * p.s;
        p.x += (Math.sin(p.ph) * 0.004 + 0.006 * p.z) * dt * sp;
        p.y += (Math.cos(p.ph * 0.7) * 0.004 - 0.002) * dt * sp + (t > 0.6 && !this.reduced ? (Math.random() - 0.5) * 0.002 * t : 0);
        if (p.x > 1.02) p.x = -0.02; if (p.x < -0.02) p.x = 1.02; if (p.y < -0.02) p.y = 1.02; if (p.y > 1.02) p.y = -0.02;
        const X = p.x * W, Y = p.y * H, dx = X - W * 0.05, dy = Y + H * 0.1;
        const inB = Math.max(0, 1 - Math.abs(dx * sa - dy * ca) / (M * 0.22));
        g.fillStyle = `rgba(${cr},${cg},${cb},${(0.08 + inB * 0.55) * p.z})`;
        g.beginPath(); g.arc(X, Y, 0.6 + p.z * 1.6, 0, 6.283); g.fill();
      }
      for (let i = this.bursts.length - 1; i >= 0; i--) {
        const b = this.bursts[i]; b.life -= dt;
        if (b.life <= 0) { this.bursts.splice(i, 1); continue; }
        b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.96; b.vy = b.vy * 0.96 + 24 * dt;
        g.globalAlpha = Math.min(1, (b.life / b.max) * 1.4); g.fillStyle = b.c; g.fillRect(b.x, b.y, b.sz, b.sz);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if (!this.pat) this.pat = g.createPattern(this.grain, 'repeat');
      if (now < this.staticT) {
        const k = (this.staticT - now) / this.staticD;
        g.globalAlpha = (this.reduced ? 0.1 : 0.28) * k;
        const ox = (Math.random() * 128) | 0, oy = (Math.random() * 128) | 0;
        g.translate(-ox, -oy); g.fillStyle = this.pat; g.fillRect(0, 0, W + 128, H + 128); g.setTransform(d, 0, 0, d, 0, 0);
        if (!this.reduced) for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(255,255,255,${0.07 * k})`; g.fillRect(0, Math.random() * H, W, 2 + Math.random() * 12); }
        g.globalAlpha = 1;
      }
      if (this.q === 0) {
        g.globalAlpha = 0.025 + t * 0.025;
        const ox = this.reduced ? 0 : (Math.random() * 128) | 0, oy = this.reduced ? 0 : (Math.random() * 128) | 0;
        g.translate(-ox, -oy); g.fillStyle = this.pat; g.fillRect(0, 0, W + 128, H + 128); g.setTransform(d, 0, 0, d, 0, 0);
        g.globalAlpha = 1;
      }
    }
    burst(x, y, c, n = 40) {
      const k = this.low ? 0.35 : 1, m = Math.round(n * k * (this.reduced ? 0.3 : 1));
      for (let i = 0; i < m; i++) {
        const a = Math.random() * 6.283, v = (this.reduced ? 30 : 60) + Math.random() * (this.reduced ? 60 : 280), l = 0.6 + Math.random() * 0.9;
        this.bursts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, sz: 1.2 + Math.random() * 2.2, c });
      }
    }
    static(ms) { this.staticD = ms; this.staticT = performance.now() + ms; }
  }

  EST.audio = EST.audio || new Audio();
  EST.FX = FX;
  EST.ready = true;
})();
