import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, computed, inject, viewChild } from '@angular/core';
import { FxService } from './fx.service';

/**
 * Palco de fundo: luz quente (time) × fria (servidor), grade, canvas de partículas,
 * vinheta e camada de flash. Tudo dirigido pela tensão do FxService.
 */
@Component({
  selector: 'mc-fx-stage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layer warm" [style.opacity]="warm()" aria-hidden="true"></div>
    <div class="layer cold" [style.opacity]="cold()" aria-hidden="true"></div>
    <div class="layer grid" aria-hidden="true"></div>
    <canvas #cv class="layer cv" aria-hidden="true"></canvas>
    <div class="layer vig" [style.opacity]="vig()" aria-hidden="true"></div>
    <div #flash class="layer flash" aria-hidden="true"></div>
    <div class="content"><ng-content /></div>
  `,
  styles: [`
    :host { display: block; position: relative; min-height: 100dvh; isolation: isolate; }
    .layer { position: fixed; inset: 0; pointer-events: none; }
    .warm { z-index: 0; background: radial-gradient(80% 65% at 0% 0%, oklch(0.34 0.08 70 / .55), transparent 62%); transition: opacity 1800ms var(--ease-out); }
    .cold { z-index: 0; background: radial-gradient(85% 75% at 100% 100%, oklch(0.32 0.08 215 / .65), transparent 62%); transition: opacity 1800ms var(--ease-out); }
    .grid { z-index: 0; background-image: linear-gradient(oklch(1 0 0 / .025) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / .025) 1px, transparent 1px);
      background-size: 32px 32px; mask-image: radial-gradient(70% 60% at 50% 45%, #000, transparent); }
    .cv { z-index: 1; width: 100%; height: 100%; }
    .vig { z-index: 3; background: radial-gradient(ellipse at 50% 45%, transparent 38%, #000 100%); transition: opacity 1800ms var(--ease-out); }
    .flash { z-index: 80; opacity: 0; }
    .content { position: relative; z-index: 2; min-height: 100dvh; }
  `],
})
export class FxStage implements OnDestroy {
  private readonly fx = inject(FxService);
  private readonly cv = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly flash = viewChild.required<ElementRef<HTMLElement>>('flash');
  protected readonly warm = computed(() => (1 - this.fx.tension() * 0.85).toFixed(2));
  protected readonly cold = computed(() => (0.35 + this.fx.tension() * 0.65).toFixed(2));
  protected readonly vig = computed(() => (0.45 + this.fx.tension() * 0.5).toFixed(2));

  constructor() {
    afterNextRender(() => {
      this.fx.attach(this.cv().nativeElement);
      this.fx.flashEl = this.flash().nativeElement;
    });
  }
  ngOnDestroy(): void { this.fx.detach(); this.fx.flashEl = null; }
}
