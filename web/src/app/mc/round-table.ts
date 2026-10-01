import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { FxService } from './fx.service';
import { Sigil } from './ui';
import { COL, ICON } from './theme';

export interface SeatVm {
  id: string; name: string; me: boolean; lead: boolean; picked: boolean;
  ring: string; glow: number; rw: number; scale: number; dim: boolean;
  disabled: boolean; selectable: boolean;
  tag: string; tagC: string; mark: 'spy' | 'merlin?' | null;
  /** cor do fio de luz hub→assento, ou null se apagado */
  wire: string | null;
  aria: string;
}
export interface HubVm { k: string; v: string; s: string; c: string; }
export interface VerdictVm { approved: boolean; t: string; s: string; }

/** Mesa redonda vista de cima: assentos, fios do PR, hub central, feixe do lead e veredito. */
@Component({
  selector: 'mc-round-table',
  imports: [Sigil],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="glass" aria-hidden="true"></div>
    <div class="dash" aria-hidden="true"></div>
    <div class="beam-pivot" aria-hidden="true">
      <div #beam class="beam" [style.opacity]="leaderIndex() >= 0 ? 1 : 0">
        <div class="cone"></div><div class="line"></div>
      </div>
    </div>
    <svg class="wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      @for (w of wires(); track $index) {
        <path [attr.d]="w.d" fill="none" [attr.stroke]="w.col" [attr.stroke-width]="wireWidth()" vector-effect="non-scaling-stroke" stroke-linecap="round"
          pathLength="1" stroke-dasharray="1" [style.stroke-dashoffset]="w.on ? 0 : 1" [style.opacity]="w.on ? 1 : 0" [style.filter]="'drop-shadow(0 0 4px ' + w.col + ')'" />
      }
    </svg>
    <div class="hub-wrap">
      <div #ring class="ring" aria-hidden="true"></div>
      <div class="ring2" aria-hidden="true"></div>
      <div #hubNode class="hub">
        <span class="k">{{ hub().k }}</span>
        <span class="v" [style.color]="hub().c" [style.text-shadow]="'0 0 18px ' + hub().c">{{ hub().v }}</span>
        <span class="s">{{ hub().s }}</span>
      </div>
    </div>
    @for (p of seats(); track p.id; let i = $index) {
      <button type="button" class="seat" [attr.data-seat]="p.id" (click)="pick.emit(p.id)" [disabled]="p.disabled"
        [attr.aria-pressed]="p.selectable ? p.picked : null" [attr.aria-label]="p.aria"
        [style.left.%]="pos(i).x" [style.top.%]="pos(i).y" [style.opacity]="p.dim ? 0.5 : 1"
        [style.transform]="'translate(-50%,-50%) scale(' + p.scale + ')'" [class.selectable]="p.selectable">
        <span class="av" [style.filter]="'drop-shadow(0 0 ' + p.glow + 'px ' + p.ring + ')'">
          <mc-sigil [name]="p.name" size="100%" [ring]="p.ring" [ringWidth]="p.rw" />
          @if (p.lead) { <span class="lead">LEAD</span> }
          @if (p.mark) {
            <span class="mark" [class.spy]="p.mark === 'spy'">
              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path [attr.d]="p.mark === 'spy' ? icon.no : 'M12 7v6M12 16.5v.5'" fill="none" stroke="#0b0d12" stroke-width="3.4" stroke-linecap="round" /></svg>
            </span>
          }
        </span>
        <span class="nm" [class.me]="p.me">{{ p.name }}</span>
        @if (p.tag) { <span class="tag" [style.color]="p.tagC" [style.border-color]="p.tagC">{{ p.tag }}</span> }
      </button>
    }
    @if (verdict(); as v) {
      <div #verdictEl class="verdict" role="status" [style.--c]="v.approved ? col.d : col.s">
        <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path [attr.d]="v.approved ? icon.circOk : icon.diaNo" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span class="vt">{{ v.t }}</span>
        <span class="vs">{{ v.s }}</span>
      </div>
    }
  `,
  styleUrl: './round-table.scss',
})
export class RoundTable {
  private readonly fx = inject(FxService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly seats = input.required<SeatVm[]>();
  readonly leaderIndex = input(-1);
  readonly hub = input.required<HubVm>();
  readonly verdict = input<VerdictVm | null>(null);
  readonly wireWidth = input(2);
  readonly pick = output<string>();

  protected readonly icon = ICON;
  protected readonly col = COL;
  private readonly beam = viewChild.required<ElementRef<HTMLElement>>('beam');
  private readonly ring = viewChild.required<ElementRef<HTMLElement>>('ring');
  private readonly hubRef = viewChild.required<ElementRef<HTMLElement>>("hubNode");
  private readonly verdictEl = viewChild<ElementRef<HTMLElement>>('verdictEl');

  protected readonly wires = computed(() =>
    this.seats().map((p, i) => { const q = this.pos(i); return { d: `M50 50L${q.x} ${q.y}`, col: p.wire ?? COL.a, on: !!p.wire }; }),
  );

  private ang = 90; private vel = 0; private ringA = 0; private raf = 0;

  constructor() {
    afterNextRender(() => {
      let last = performance.now();
      const loop = (now: number) => {
        this.raf = requestAnimationFrame(loop);
        if (document.hidden) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const n = this.seats().length, li = this.leaderIndex();
        if (n && li >= 0) {
          let diff = 90 + (li * 360) / n - this.ang; diff = (((diff % 360) + 540) % 360) - 180;
          const tgt = this.ang + diff;
          if (!this.fx.full()) { this.ang += (tgt - this.ang) * Math.min(1, dt * 6); this.vel = 0; }
          else { const a = 120 * (tgt - this.ang) - 13 * this.vel; this.vel += a * dt; this.ang += this.vel * dt; } // mola k=120, c=13
          this.beam().nativeElement.style.transform = `rotate(${this.ang}deg)`;
        }
        this.ringA += dt * (this.fx.full() ? 10 + this.fx.tension() * 40 : 3);
        this.ring().nativeElement.style.transform = `rotate(${this.ringA}deg)`;
      };
      this.raf = requestAnimationFrame(loop);
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.raf));

    effect(() => {
      if (!this.verdict()) return;
      untracked(() => requestAnimationFrame(() => this.verdictEl()?.nativeElement.animate(
        [{ transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }],
        { duration: this.fx.full() ? 520 : 200, easing: 'cubic-bezier(.34,1.56,.64,1)' },
      )));
    });
  }

  protected pos(i: number): { x: number; y: number } {
    const n = this.seats().length || 1, a = ((90 + (i * 360) / n) * Math.PI) / 180;
    return { x: +(50 + 41 * Math.cos(a)).toFixed(2), y: +(50 + 41 * Math.sin(a)).toFixed(2) };
  }

  seatEl(id: string): HTMLElement | null { return this.host.nativeElement.querySelector(`[data-seat="${id}"]`); }
  hubEl(): HTMLElement { return this.hubRef().nativeElement; }
}
