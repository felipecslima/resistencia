import { Injectable, signal } from '@angular/core';
import { whenEst } from './est';

/**
 * Substitui o SoundService: mesma API pública (muted, toggle, ping, approved, rejected,
 * missionSuccess, missionFail, win, lose, chat) + stingers e trilha adaptativa do mc-engine.
 * Preferências persistem em localStorage['mergeconflict.audio'] (pelo motor).
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  readonly muted = signal(false);
  readonly music = signal(0.55);
  readonly sfx = signal(0.8);

  constructor() {
    whenEst((est) => {
      const a = est.audio!;
      this.muted.set(a.muted); this.music.set(a.music); this.sfx.set(a.sfx);
    });
    // Navegadores exigem gesto do usuário antes de tocar áudio.
    const unlock = () => this.call('unlock');
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock);
  }

  set(o: Partial<{ music: number; sfx: number; muted: boolean }>): void {
    window.EST?.audio?.set(o);
    if (o.music != null) this.music.set(o.music);
    if (o.sfx != null) this.sfx.set(o.sfx);
    if (o.muted != null) this.muted.set(o.muted);
  }
  toggle(): void { this.set({ muted: !this.muted() }); }
  setTension(t: number): void { this.call('setTension', t); }

  // API antiga
  ping(): void { this.call('turn'); }
  approved(): void { this.call('approved'); }
  rejected(): void { this.call('rejected'); }
  missionSuccess(): void { this.call('success'); }
  missionFail(): void { this.call('fail'); }
  win(): void { this.call('win'); }
  lose(): void { this.call('lose'); }
  chat(): void { this.call('blip'); }

  // novos stingers
  ui(): void { this.call('ui'); }
  select(i = 0): void { this.call('select', i); }
  lock(): void { this.call('lock'); }
  vote(): void { this.call('vote'); }
  pulse(i: number, ok: boolean): void { this.call('pulse', i, ok); }
  flip(): void { this.call('flip'); }
  cardOk(): void { this.call('cardOk'); }
  cardFail(): void { this.call('cardFail'); }
  startHeart(): void { this.call('startHeart'); }
  stopHeart(): void { this.call('stopHeart'); }
  open(): void { this.call('open'); }
  deal(i: number): void { this.call('deal', i); }
  reveal(side: 'resistance' | 'spies'): void { this.call('reveal', side); }
  glitch(): void { this.call('glitch'); }

  private call(fn: string, ...args: unknown[]): void {
    const a = window.EST?.audio as Record<string, unknown> | undefined;
    const f = a?.[fn];
    if (typeof f === 'function') { try { f.apply(a, args); } catch { /* áudio indisponível */ } }
  }
}
