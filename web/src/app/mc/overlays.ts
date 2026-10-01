import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { MissionResult, RoleKey } from '../models';
import { AudioService } from './audio.service';
import { FxService } from './fx.service';
import { Logo, RoleEmblem } from './ui';
import { COL, ICON, ROLE_ORDER, ROLE_UI, Side, sideCol, sigil } from './theme';

/** Timers que morrem junto com o componente. */
function timers() {
  const ids: ReturnType<typeof setTimeout>[] = [];
  inject(DestroyRef).onDestroy(() => ids.forEach(clearTimeout));
  return (fn: () => void, ms: number) => { ids.push(setTimeout(fn, ms)); };
}

// ---------------------------------------------------------------------------
/** Abertura: letterbox, `git merge`, título com eixo wdth abrindo, glitch, aviso e cartas. */
@Component({
  selector: 'mc-opening',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'dialog', 'aria-label': 'Abertura da partida', class: 'mc-ov' },
  template: `
    <div class="dim" [style.opacity]="os() >= 1 && os() < 4 ? 0.92 : 0"></div>
    <div class="bar top" [style.height.vh]="os() >= 1 ? 12 : 0"></div>
    <div class="bar bot" [style.height.vh]="os() >= 1 ? 12 : 0"></div>
    <div class="txt" [style.opacity]="os() >= 2 && os() < 4 ? 1 : 0">
      <span class="cmd">$ git merge --no-ff release/1</span>
      <h2 #title>Merge<br /><span>Conflict</span></h2>
      <span class="warn" [style.opacity]="os() >= 3 ? 1 : 0">CONFLICT (content): {{ spies() }} sabotadores neste time</span>
    </div>
  `,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
    .dim { position: absolute; inset: 0; background: #05060a; transition: opacity 900ms var(--ease-out); }
    .bar { position: absolute; left: 0; right: 0; background: #000; transition: height 900ms cubic-bezier(.7,0,.2,1); }
    .top { top: 0; } .bot { bottom: 0; }
    .txt { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; padding: 20px; transition: opacity 600ms var(--ease-out); }
    .cmd { font-family: var(--mono); font-size: clamp(12px, 3.4vw, 15px); color: var(--team); }
    h2 { margin: 0; font-family: var(--display); font-variation-settings: 'wdth' 150, 'wght' 900; font-size: clamp(44px, 13vw, 128px); line-height: .85; text-transform: uppercase; }
    h2 span { color: var(--lead); font-variation-settings: 'wdth' 150, 'wght' 300; letter-spacing: .18em; font-size: .6em; }
    .warn { font-family: var(--mono); font-size: clamp(12px, 3.4vw, 15px); color: oklch(0.82 0.15 25); transition: opacity 400ms; }
  `],
})
export class OpeningSequence {
  private readonly fx = inject(FxService);
  private readonly audio = inject(AudioService);
  readonly spies = input.required<number>();
  /** Disparado quando as cartas devem voar para os assentos. */
  readonly deal = output<void>();
  protected readonly os = signal(0);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  constructor() {
    const later = timers();
    afterNextRender(() => {
      this.audio.open(); this.fx.vib([30, 60, 30]);
      later(() => this.os.set(1), 30);
      later(() => {
        this.os.set(2);
        this.title().nativeElement.animate(this.fx.full()
          ? [{ fontVariationSettings: "'wdth' 50,'wght' 200", letterSpacing: '.5em', opacity: 0, filter: 'blur(14px)' }, { fontVariationSettings: "'wdth' 150,'wght' 900", letterSpacing: '0em', opacity: 1, filter: 'blur(0)' }]
          : [{ opacity: 0 }, { opacity: 1 }], { duration: 1400, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
      }, 700);
      later(() => { this.os.set(3); this.fx.glitch(this.title().nativeElement); this.audio.glitch(); }, 2300);
      later(() => { this.os.set(4); this.deal.emit(); }, 3300);
    });
  }
}

// ---------------------------------------------------------------------------
export interface KnownVm { name: string; label: 'spy' | 'merlin?'; }

/** Revelação do papel: carta 5:7 holográfica que vira, solta partículas e segue ponteiro/giroscópio. */
@Component({
  selector: 'mc-holo-card',
  imports: [RoleEmblem, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Seu papel', '(click)': 'closed.emit()', '(pointermove)': 'onTilt($event)', '(pointerleave)': 'setTilt(0.5, 0.3)', '(document:keydown.escape)': 'closed.emit()', '[style.background]': 'bg()', '[style.opacity]': 'rs() >= 1 ? 1 : 0' },
  template: `
    <div #tilt class="card-wrap" (click)="$event.stopPropagation()" [style.transform]="wrapT()" [style.opacity]="rs() >= 1 ? 1 : 0">
      <div class="tilt">
        <div class="flip" [style.transform]="'rotateY(' + (rs() >= 2 || reduced() ? 0 : 180) + 'deg)'">
          <div class="face" [style.--c]="col()" [style.--bgA]="ui().side === 'd' ? 'oklch(0.3 0.07 210)' : 'oklch(0.3 0.09 20)'">
            <div class="row1">
              <span>#{{ num() }} / 08</span>
              <span class="side"><i [class.dia]="ui().side === 's'"></i>{{ ui().side === 'd' ? 'TIME' : 'SABOTAGEM' }}</span>
            </div>
            <div class="em"><mc-emblem [role]="role()" size="62%" /></div>
            <h2>{{ ui().name }}</h2>
            <p>{{ ui().blurb }}</p>
            <div class="foil" aria-hidden="true" [style.opacity]="reduced() ? 0.2 : 0.55"></div>
          </div>
          <div class="back"><mc-logo [size]="120" /></div>
        </div>
      </div>
    </div>
    <div class="ui" (click)="$event.stopPropagation()" [style.opacity]="rs() >= 3 ? 1 : 0" [style.transform]="'translateY(' + (rs() >= 3 || reduced() ? 0 : 16) + 'px)'">
      @if (known().length) {
        <span class="kt">{{ knownTitle() }}</span>
        <div class="chips">
          @for (k of known(); track k.name) {
            <span class="chip" [style.color]="k.label === 'spy' ? colS : colA" [style.border-color]="k.label === 'spy' ? colS : colA">{{ k.label === 'spy' ? '◆' : '?' }} {{ k.name }}</span>
          }
        </div>
      }
      <button #ok type="button" class="mc-btn primary" (click)="closed.emit()">Entendi — esconder</button>
      <span class="hint">Esconda a tela antes de mostrar para alguém.</span>
    </div>
  `,
  styleUrl: './holo-card.scss',
})
export class HoloCard {
  private readonly fx = inject(FxService);
  private readonly audio = inject(AudioService);
  readonly role = input.required<RoleKey>();
  readonly known = input<KnownVm[]>([]);
  readonly first = input(false);
  readonly closed = output<void>();

  protected readonly colS = COL.s;
  protected readonly colA = COL.a;
  protected readonly rs = signal(0);
  protected readonly reduced = this.fx.reduced;
  protected readonly ui = computed(() => ROLE_UI[this.role()]);
  protected readonly col = computed(() => sideCol(this.ui().side));
  protected readonly num = computed(() => String(ROLE_ORDER.indexOf(this.role()) + 1).padStart(2, '0'));
  protected readonly bg = computed(() => `radial-gradient(circle at 50% 45%, ${this.ui().side === 'd' ? 'oklch(0.3 0.08 210 / .9)' : 'oklch(0.28 0.1 20 / .9)'}, #05060a 70%)`);
  protected readonly wrapT = computed(() => this.rs() >= 1 || this.reduced() ? 'none' : 'translateY(60px) scale(.8)');
  protected readonly knownTitle = computed(() => this.role() === 'percival' ? 'Um deles é o Tech Lead:' : this.role() === 'merlin' ? 'Sabotadores que você enxerga:' : 'Seus aliados sabotadores:');
  private readonly tilt = viewChild.required<ElementRef<HTMLElement>>('tilt');
  private readonly ok = viewChild.required<ElementRef<HTMLButtonElement>>('ok');
  private onOri?: (e: DeviceOrientationEvent) => void;

  constructor() {
    const later = timers();
    afterNextRender(() => {
      const first = this.first();
      this.ok().nativeElement.focus({ preventScroll: true });
      later(() => this.rs.set(1), 60);
      later(() => { this.rs.set(2); this.audio.flip(); }, first ? 900 : 350);
      later(() => {
        const c = this.fx.center(this.tilt().nativeElement), d = this.ui().side === 'd';
        this.fx.burst(c.x, c.y, d ? 'rgba(110,225,235,.95)' : 'rgba(255,110,95,.95)', 70);
        this.audio.reveal(d ? 'resistance' : 'spies'); this.fx.vib(40); this.rs.set(3);
      }, first ? 1500 : 800);
      if (this.fx.full()) {
        this.onOri = (e) => { if (e.gamma == null || e.beta == null) return; this.setTilt(clamp(0.5 + e.gamma / 60), clamp(0.5 + (e.beta - 45) / 60)); };
        addEventListener('deviceorientation', this.onOri);
      }
    });
    inject(DestroyRef).onDestroy(() => { cancelAnimationFrame(this.tiltRaf); if (this.onOri) removeEventListener('deviceorientation', this.onOri); });
  }

  // ponteiro e giroscópio disparam várias vezes por quadro: guarda o último valor e aplica uma vez por frame
  private tiltRaf = 0;
  private pending: { px: number; py: number } | { cx: number; cy: number } | null = null;

  protected onTilt(e: PointerEvent): void {
    if (!this.fx.full() || (e.pointerType === 'touch' && !e.isPrimary)) return;
    this.queueTilt({ cx: e.clientX, cy: e.clientY });
  }
  protected setTilt(px: number, py: number): void { this.queueTilt({ px, py }); }

  private queueTilt(p: NonNullable<HoloCard['pending']>): void {
    this.pending = p;
    this.tiltRaf ||= requestAnimationFrame(() => {
      this.tiltRaf = 0;
      const v = this.pending, el = this.tilt().nativeElement;
      if (!v) return;
      let px: number, py: number;
      if ('cx' in v) { const r = el.getBoundingClientRect(); px = clamp((v.cx - r.left) / r.width); py = clamp((v.cy - r.top) / r.height); }
      else { px = v.px; py = v.py; }
      const s = el.style;
      s.setProperty('--rx', `${(0.5 - py) * 18}deg`); s.setProperty('--ry', `${(px - 0.5) * 24}deg`);
      s.setProperty('--mx', `${px * 100}%`); s.setProperty('--my', `${py * 100}%`);
    });
  }
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------------------
/** Build: batida cardíaca acelerando, commits virados um a um, PASSED/FAILED. */
@Component({
  selector: 'mc-build-reveal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Resultado do build', '[style.background]': 'glow()' },
  template: `
    <div #title class="head">
      <span class="cmd">$ npm run build -- --release={{ result().round }}</span>
      <h2 [style.color]="done() ? (result().success ? col.d : col.s) : col.ink">{{ done() ? (result().success ? 'Build verde' : 'Build quebrado') : 'Rodando testes' }}</h2>
      <span class="sub" aria-live="polite">{{ sub() }}</span>
    </div>
    <div class="cards">
      @for (ok of cards(); track $index; let i = $index) {
        <div class="bcard" [attr.data-bcard]="i" [style.transform]="cardT(i)">
          <div class="front" [style.--c]="ok ? col.d : col.s" [style.--bgA]="ok ? 'oklch(0.3 0.07 210)' : 'oklch(0.3 0.1 20)'">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="ok ? icon.circ : icon.dia" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path [attr.d]="ok ? 'M7.5 12.5l3 3 6-6.5' : 'M9 9l6 6m0-6-6 6'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <span>{{ ok ? 'PASSED' : 'FAILED' }}</span>
            <i aria-hidden="true"></i>
          </div>
          <div class="back"><span>{{ hash(i) }}</span></div>
        </div>
      }
    </div>
    <button type="button" class="mc-btn" [style.opacity]="done() ? 1 : 0.4" (click)="close()">Continuar</button>
  `,
  styleUrl: './build-reveal.scss',
})
export class BuildReveal {
  private readonly fx = inject(FxService);
  private readonly audio = inject(AudioService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly result = input.required<MissionResult>();
  readonly cards = input.required<boolean[]>();
  readonly twoFails = input(false);
  readonly closed = output<void>();
  protected readonly col = COL;
  protected readonly icon = ICON;
  protected readonly flipped = signal(0);
  protected readonly done = signal(false);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  protected readonly glow = computed(() => `radial-gradient(circle at 50% 50%, ${this.done() ? (this.result().success ? 'oklch(0.3 0.08 210 / .9)' : 'oklch(0.3 0.12 22 / .9)') : 'oklch(0.18 0.02 250 / .95)'}, #05060a 75%)`);
  protected readonly sub = computed(() => {
    const r = this.result();
    if (this.done()) return `${r.fails} ${r.fails === 1 ? 'bug encontrado' : 'bugs encontrados'}${!r.success && this.twoFails() ? ' (2 necessários)' : ''}`;
    const fl = this.cards().slice(0, this.flipped()).filter((c) => !c).length;
    return `${this.flipped()}/${this.cards().length} commits · ${fl} ${fl === 1 ? 'falha' : 'falhas'}`;
  });

  constructor() {
    const later = timers();
    inject(DestroyRef).onDestroy(() => this.audio.stopHeart());
    afterNextRender(() => {
      const cards = this.cards(), full = this.fx.full(), first = full ? 1700 : 900, gap = full ? 1150 : 600;
      this.audio.startHeart();
      cards.forEach((ok, i) => later(() => {
        this.flipped.set(i + 1); this.audio.flip();
        later(() => {
          const el = this.host.nativeElement.querySelector(`[data-bcard="${i}"]`), c = this.fx.center(el);
          if (ok) { this.audio.cardOk(); this.fx.burst(c.x, c.y, 'rgba(110,225,235,.9)', 18); }
          else { this.audio.cardFail(); this.fx.glitch(el); this.fx.glitch(this.title().nativeElement); this.fx.shake(0.8); this.fx.noise(650); this.fx.vib([80, 30, 80]); }
        }, 380);
      }, first + i * gap));
      const tEnd = first + cards.length * gap + 500;
      later(() => {
        this.audio.stopHeart(); this.done.set(true);
        const c = this.fx.center(this.title().nativeElement);
        if (this.result().success) { this.audio.missionSuccess(); this.fx.wave(c.x, c.y, COL.d, 360); this.fx.burst(c.x, c.y, 'rgba(110,225,235,.95)', 90); this.fx.flash(COL.d); this.fx.vib(60); }
        else { this.audio.missionFail(); this.fx.shake(1.6); this.fx.wave(c.x, c.y, COL.s, 360); this.fx.noise(1200); this.fx.glitch(this.title().nativeElement); this.fx.vib([120, 50, 120, 50, 200]); }
      }, tEnd);
      later(() => this.closed.emit(), tEnd + 4200);
    });
  }

  protected cardT(i: number): string {
    const f = this.flipped(), next = i === f && !this.done();
    return `rotateY(${i < f ? 0 : 180}deg) translateY(${next ? -10 : 0}px) scale(${next ? 1.06 : 1})`;
  }
  protected hash(i: number): string { return sigil('c' + i + this.result().round).hex.slice(0, 5); }
  protected close(): void { this.closed.emit(); }
}

// ---------------------------------------------------------------------------
export interface DossierVm { id: string; name: string; role: RoleKey; }
export interface TimelineVm { k: string; t: string; c: string; dia: boolean; fill: boolean; }
export interface PostMortemVm {
  winner: Side; won: boolean; reason: string; moment: string;
  dossier: DossierVm[]; timeline: TimelineVm[];
}

/** Fim: SHIP IT / PRODUÇÃO CAIU, git blame com papéis revelados um a um, git log --graph e o momento da partida. */
@Component({
  selector: 'mc-post-mortem',
  imports: [RoleEmblem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Fim de jogo', '[style.background]': 'bg()', '[style.--c]': 'c()' },
  template: `
    <div class="wrap">
      <header #title>
        <span class="cmd">{{ vm().winner === 'd' ? '$ git push origin main  ✓ deployed' : '$ git push origin main  ✗ rejected' }}</span>
        <h2>{{ vm().winner === 'd' ? 'Ship it' : 'Produção caiu' }}</h2>
        <span class="mine" [class.won]="vm().won">{{ vm().won ? 'Você venceu' : 'Você perdeu' }}</span>
        <p>{{ vm().reason }}.</p>
      </header>
      <section>
        <h3>git blame · quem era quem</h3>
        <div class="dossier">
          @for (d of vm().dossier; track d.id; let i = $index) {
            <div class="dz" [attr.data-dz]="i" [class.on]="i < es()" [class.sab]="side(d.role) === 's'">
              <mc-emblem [role]="d.role" [size]="42" />
              <span class="t"><b>{{ d.name }}</b><span [style.color]="sideColor(d.role)">{{ roleName(d.role) }}</span></span>
            </div>
          }
        </div>
      </section>
      @if (vm().moment) {
        <section class="moment"><span>// momento da partida</span><b>{{ vm().moment }}</b></section>
      }
      <section>
        <h3>git log --graph</h3>
        @for (tl of vm().timeline; track $index) {
          <div class="tl">
            <i [class.dia]="tl.dia" [style.border-color]="tl.c" [style.background]="tl.fill ? tl.c : 'transparent'"></i>
            <span class="k" [style.color]="tl.c">{{ tl.k }}</span>
            <span>{{ tl.t }}</span>
          </div>
        }
      </section>
      <div class="actions">
        @if (host()) {
          <button type="button" class="mc-btn primary" (click)="replay.emit()">Jogar de novo</button>
        } @else {
          <span class="wait">Aguardando o host reiniciar…</span>
        }
        <button type="button" class="mc-btn" (click)="closed.emit()">Ver a mesa</button>
        <button type="button" class="mc-btn ghost" (click)="leave.emit()">Sair da sala</button>
      </div>
    </div>
  `,
  styleUrl: './post-mortem.scss',
})
export class PostMortem {
  private readonly fx = inject(FxService);
  private readonly audio = inject(AudioService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly vm = input.required<PostMortemVm>();
  readonly host = input(false);
  /** false ao reabrir pelo botão "Ver post-mortem": sem som nem stagger. */
  readonly animate = input(true);
  readonly replay = output<void>();
  readonly leave = output<void>();
  readonly closed = output<void>();
  protected readonly es = signal(0);
  protected readonly c = computed(() => sideCol(this.vm().winner));
  protected readonly bg = computed(() => `radial-gradient(80% 60% at 50% 0%, ${this.vm().winner === 'd' ? 'oklch(0.32 0.08 210 / .9)' : 'oklch(0.3 0.12 22 / .9)'}, #05060a 70%)`);
  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  constructor() {
    const later = timers();
    afterNextRender(() => {
      const vm = this.vm();
      if (!this.animate()) { this.es.set(vm.dossier.length); return; }
      later(() => {
        const t = this.title().nativeElement;
        t.animate(this.fx.full() ? [{ transform: 'scale(1.4)', opacity: 0, filter: 'blur(16px)' }, { transform: 'scale(1)', opacity: 1, filter: 'blur(0)' }] : [{ opacity: 0 }, { opacity: 1 }], { duration: 1200, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
        vm.won ? this.audio.win() : this.audio.lose();
        if (vm.winner === 's') { this.fx.noise(1400); this.fx.shake(1.2); }
        else { const c = this.fx.center(t); this.fx.burst(c.x, c.y, 'rgba(110,225,235,.95)', 120); }
      }, 60);
      vm.dossier.forEach((d, i) => later(() => {
        this.es.set(i + 1);
        if (ROLE_UI[d.role].side === 's') { this.fx.glitch(this.el.nativeElement.querySelector(`[data-dz="${i}"]`)); this.audio.glitch(); } else this.audio.ui();
      }, 1400 + i * 380));
    });
  }
  protected side(r: RoleKey): Side { return ROLE_UI[r].side; }
  protected sideColor(r: RoleKey): string { return sideCol(ROLE_UI[r].side); }
  protected roleName(r: RoleKey): string { return ROLE_UI[r].name; }
}
