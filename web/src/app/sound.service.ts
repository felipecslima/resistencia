import { Injectable, signal } from '@angular/core';

type Note = [freq: number, start: number, dur: number];

@Injectable({ providedIn: 'root' })
export class SoundService {
  readonly muted = signal(this.readMuted());
  private ctx: AudioContext | null = null;

  toggle(): void {
    const next = !this.muted();
    this.muted.set(next);
    try { localStorage.setItem('resistencia.muted', next ? '1' : '0'); } catch { /* ignora */ }
  }

  ping(): void { this.play([[660, 0, 0.12], [880, 0.12, 0.16]], 'sine'); }
  approved(): void { this.play([[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.2]], 'triangle'); }
  rejected(): void { this.play([[330, 0, 0.18], [247, 0.18, 0.28]], 'sawtooth', 0.12); }
  missionSuccess(): void { this.play([[392, 0, 0.12], [523, 0.12, 0.12], [659, 0.24, 0.12], [784, 0.36, 0.3]], 'triangle'); }
  missionFail(): void { this.play([[220, 0, 0.2], [196, 0.2, 0.2], [147, 0.4, 0.4]], 'sawtooth', 0.12); }
  win(): void { this.play([[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.45]], 'triangle'); }
  lose(): void { this.play([[392, 0, 0.25], [330, 0.25, 0.25], [262, 0.5, 0.5]], 'sawtooth', 0.1); }
  chat(): void { this.play([[900, 0, 0.05]], 'sine', 0.05); }

  private play(notes: Note[], type: OscillatorType, gain = 0.18): void {
    if (this.muted()) return;
    try {
      this.ctx ??= new AudioContext();
      const ctx = this.ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const t0 = ctx.currentTime;
      for (const [freq, start, dur] of notes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0 + start);
        g.gain.exponentialRampToValueAtTime(gain, t0 + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0 + start);
        osc.stop(t0 + start + dur + 0.05);
      }
    } catch { /* áudio indisponível */ }
  }

  private readMuted(): boolean {
    try { return localStorage.getItem('resistencia.muted') === '1'; } catch { return false; }
  }
}
