import { Injectable, effect, inject, signal } from '@angular/core';
import { AudioService } from './audio.service';
import { COL } from './theme';
import { FxEngine, whenEst } from './est';

const FX_KEY = 'mergeconflict.fx';
type Pt = { x: number; y: number };

/**
 * Efeitos visuais: fundo vivo (canvas do mc-engine), tensão, flash, tremor, ondas,
 * partículas, glitch, pulsos de voto e cartas distribuídas. Elementos efêmeros usam
 * WAAPI (transform/opacity) e são removidos ao terminar.
 */
@Injectable({ providedIn: 'root' })
export class FxService {
  private readonly audio = inject(AudioService);
  private engine: FxEngine | null = null;
  private cancelBoot: (() => void) | null = null;

  /** Modo "Efeitos: reduzido". Padrão segue prefers-reduced-motion. */
  readonly reduced = signal(this.readPref());
  readonly tension = signal(0.12);
  flashEl: HTMLElement | null = null;
  shakeEl: HTMLElement | null = null;

  constructor() {
    effect(() => { const t = this.tension(); this.engine?.setTension(t); this.audio.setTension(t); });
    effect(() => { const r = this.reduced(); if (this.engine) this.engine.reduced = r; });
  }

  full(): boolean { return !this.reduced(); }
  toggleReduced(): void {
    const r = !this.reduced();
    this.reduced.set(r);
    try { localStorage.setItem(FX_KEY, r ? 'reduced' : 'full'); } catch { /* ignora */ }
  }

  attach(canvas: HTMLCanvasElement): void {
    this.cancelBoot = whenEst((est) => {
      if (!est.FX) return;
      this.engine = new est.FX(canvas);
      this.engine.reduced = this.reduced();
      this.engine.setTension(this.tension());
    });
  }
  detach(): void { this.cancelBoot?.(); this.engine?.destroy(); this.engine = null; }

  vib(p: number | number[]): void { if (this.full() && navigator.vibrate) try { navigator.vibrate(p); } catch { /* ignora */ } }
  burst(x: number, y: number, col: string, n?: number): void { this.engine?.burst(x, y, col, n); }
  noise(ms: number): void { this.engine?.static(ms); }

  center(el: Element | null | undefined): Pt {
    if (!el) return { x: innerWidth / 2, y: innerHeight / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Flash único, pico 26% (6% no reduzido). Nunca repetido. */
  flash(col: string): void {
    const el = this.flashEl; if (!el) return;
    el.style.background = col;
    el.animate([{ opacity: 0 }, { opacity: this.full() ? 0.26 : 0.06 }, { opacity: 0 }], { duration: this.full() ? 560 : 800, easing: 'cubic-bezier(.16,1,.3,1)' });
  }

  shake(k = 1): void {
    const el = this.shakeEl; if (!this.full() || !el) return;
    const a = 7 * k;
    el.animate([
      { transform: 'none' }, { transform: `translate(${-a}px,${a * 0.5}px)` }, { transform: `translate(${a * 0.8}px,${-a * 0.4}px)` },
      { transform: `translate(${-a * 0.5}px,${-a * 0.3}px)` }, { transform: `translate(${a * 0.3}px,${a * 0.2}px)` }, { transform: 'none' },
    ], { duration: 440, easing: 'cubic-bezier(.16,1,.3,1)' });
  }

  wave(x: number, y: number, col: string, size = 260): void {
    const el = this.ephemeral({ left: x - size / 2 + 'px', top: y - size / 2 + 'px', width: size + 'px', height: size + 'px', borderRadius: '50%', border: `2px solid ${col}`, boxShadow: `0 0 30px ${col}, inset 0 0 30px ${col}`, zIndex: '66' });
    el.animate([{ transform: 'scale(.1)', opacity: 0.9 }, { transform: `scale(${this.full() ? 2.4 : 1.2})`, opacity: 0 }], { duration: this.full() ? 900 : 700, easing: 'cubic-bezier(.16,1,.3,1)' }).onfinish = () => el.remove();
  }

  glitch(el: Element | null | undefined): void {
    if (!el) return;
    if (!this.full()) { el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 400 }); return; }
    el.animate([
      { transform: 'none', filter: 'none' },
      { transform: 'translate(-7px,0) skewX(-10deg)', filter: `drop-shadow(5px 0 0 ${COL.s}) drop-shadow(-5px 0 0 ${COL.d})`, clipPath: 'inset(8% 0 52% 0)' },
      { transform: 'translate(6px,0)', filter: `drop-shadow(-5px 0 0 ${COL.s}) drop-shadow(5px 0 0 ${COL.d})`, clipPath: 'inset(58% 0 6% 0)' },
      { transform: 'translate(-3px,0)', filter: `drop-shadow(3px 0 0 ${COL.s})`, clipPath: 'inset(28% 0 30% 0)' },
      { transform: 'none', filter: 'none', clipPath: 'inset(0 0 0 0)' },
    ], { duration: 480, easing: 'steps(5)' });
  }

  /** Pulso de voto viajando do assento até o hub (círculo = approve, losango = changes). */
  pulse(from: Element | null, to: Element | null, ok: boolean): void {
    const a = this.center(from), b = this.center(to), col = ok ? COL.d : COL.s;
    const el = this.ephemeral({ left: a.x - 7 + 'px', top: a.y - 7 + 'px', width: '14px', height: '14px', borderRadius: ok ? '50%' : '2px', background: col, boxShadow: `0 0 18px 4px ${col}`, zIndex: '66' });
    const r = ok ? 0 : 45;
    el.animate([
      { transform: `translate(0,0) rotate(${r}deg) scale(1)` },
      { transform: `translate(${b.x - a.x}px,${b.y - a.y}px) rotate(${r}deg) scale(.6)`, opacity: 0.9 },
    ], { duration: this.full() ? 460 : 300, easing: 'cubic-bezier(.55,0,.75,.2)' }).onfinish = () => { el.remove(); this.wave(b.x, b.y, col, 90); };
  }

  /** Cartas voando do hub para cada assento (abertura). */
  deal(from: Element | null, seats: (Element | null)[]): number {
    const c = this.center(from), step = 130;
    seats.forEach((seat, i) => setTimeout(() => {
      const to = this.center(seat);
      const el = this.ephemeral({ left: c.x - 14 + 'px', top: c.y - 20 + 'px', width: '28px', height: '40px', borderRadius: '5px', background: 'repeating-linear-gradient(0deg,#1b2029 0 5px,#232a35 5px 6px)', border: `1.5px solid ${COL.a}`, boxShadow: '0 0 16px oklch(0.85 0.14 80 / .6)', zIndex: '61' });
      const dx = to.x - c.x, dy = to.y - c.y;
      el.animate([
        { transform: 'translate(0,0) rotate(0) scale(.6)', opacity: 0 }, { opacity: 1, offset: 0.15 },
        { transform: `translate(${dx}px,${dy}px) rotate(${360 + (i % 2 ? 12 : -12)}deg) scale(1)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${dx}px,${dy}px) scale(.4)`, opacity: 0 },
      ], { duration: this.full() ? 820 : 400, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => { el.remove(); this.burst(to.x, to.y, 'rgba(255,205,120,.9)', 10); };
      this.audio.deal(i);
    }, i * step));
    return seats.length * step + 820;
  }

  private ephemeral(style: Partial<CSSStyleDeclaration>): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'fixed', pointerEvents: 'none' }, style);
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  }

  private readPref(): boolean {
    try {
      const v = localStorage.getItem(FX_KEY);
      if (v) return v === 'reduced';
    } catch { /* ignora */ }
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
