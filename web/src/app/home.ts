import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameService } from './game.service';
import { AudioService } from './mc/audio.service';
import { FxService } from './mc/fx.service';
import { Icon, Logo } from './mc/ui';
import { Rules } from './rules';

@Component({
  selector: 'app-home',
  imports: [FormsModule, Logo, Icon, Rules],
  template: `
    <main class="home">
      <header>
        <mc-logo #logo [size]="92" />
        <h1>
          <span class="m">Merge</span>
          <span class="c">Conflict</span>
        </h1>
        <p>Dedução social em tempo real para 4 a 10 devs. Alguém no time está plantando bugs. Descubra quem antes do deploy.</p>
      </header>

      <section class="mc-panel">
        <label class="field">
          <span class="eyebrow">git config user.name</span>
          <input class="mc-input" maxlength="20" placeholder="Como você quer ser chamado?" [(ngModel)]="name" (ngModelChange)="saveName()" autocomplete="nickname" />
        </label>

        <button class="mc-btn primary big" [disabled]="!validName() || g.busy()" (click)="create()">
          <mc-icon name="git" [stroke]="2.2" /> Criar repositório
        </button>

        <div class="divider"><span></span>ou clone uma sala<span></span></div>

        <form class="join" (ngSubmit)="join()">
          <input class="mc-input code" name="code" maxlength="5" placeholder="CÓDIGO" aria-label="Código da sala" [(ngModel)]="code"
            (ngModelChange)="code = $event.toUpperCase().replace(regex, '')" autocapitalize="characters" autocomplete="off" />
          <button class="mc-btn outline-team" type="submit" [disabled]="!validName() || code.length < 5 || g.busy()">Entrar</button>
        </form>

        @if (g.resumable()) {
          <button class="mc-btn team" (click)="g.resume()">Voltar para a partida em andamento</button>
        }
      </section>

      <section class="rules">
        <button class="rules-toggle" (click)="toggleRules()" [attr.aria-expanded]="showRules()">
          <span>README · Regras e modos</span>
          <span class="plus" [class.open]="showRules()"><mc-icon name="plus" [size]="18" /></span>
        </button>
        @if (showRules()) {
          <app-rules />
        }
      </section>
    </main>
  `,
  styles: [`
    .home { max-width: 470px; margin: 0 auto; padding: clamp(36px, 9vh, 96px) 20px 80px; display: flex; flex-direction: column; gap: 28px; }
    header { display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; }
    h1 { display: flex; flex-direction: column; align-items: center; gap: 2px; font-family: var(--display); line-height: .86; text-transform: uppercase; }
    .m { font-size: clamp(48px, 15vw, 74px); font-variation-settings: 'wdth' 150, 'wght' 900; letter-spacing: .01em; }
    .c { font-size: clamp(30px, 9.4vw, 46px); font-variation-settings: 'wdth' 150, 'wght' 300; letter-spacing: .2em; color: var(--lead);
      text-shadow: -2px 0 oklch(0.72 0.19 22 / .7), 2px 0 oklch(0.85 0.12 195 / .7); }
    header p { margin: 0; color: oklch(0.82 0.015 250); max-width: 34ch; line-height: 1.5; text-wrap: pretty; }
    .mc-panel { gap: 16px; padding: 22px; box-shadow: 0 30px 80px -24px #000, inset 0 1px 0 oklch(1 0 0 / .07); }
    .field { display: flex; flex-direction: column; gap: 8px; }
    .divider { display: flex; align-items: center; gap: 12px; color: var(--muted-2); font-size: 13px; }
    .divider span { flex: 1; height: 1px; background: oklch(0.42 0.025 250 / .5); }
    .join { display: flex; gap: 10px; }
    .code { flex: 1 1 auto; min-width: 0; color: oklch(0.86 0.14 80); padding: 14px 12px; font-family: var(--mono); font-weight: 700; font-size: 20px; letter-spacing: .4em; text-align: center; text-transform: uppercase; }
    .join .mc-btn { min-height: 52px; flex: none; }
    .rules { border-radius: 18px; border: 1px solid oklch(0.42 0.025 250 / .45); background: oklch(0.15 0.012 250 / .65); overflow: hidden; }
    .rules-toggle { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; min-height: 52px; background: none; border: 0; }
    .rules-toggle:hover { background: oklch(1 0 0 / .03); }
    .rules-toggle > span:first-child { font-family: var(--display); font-variation-settings: 'wdth' 120, 'wght' 700; letter-spacing: .16em; text-transform: uppercase; font-size: 13px; }
    .plus { display: grid; transition: transform 340ms var(--ease-spring); }
    .plus.open { transform: rotate(45deg); }
    app-rules { max-height: 70dvh; border-top: 1px solid oklch(0.42 0.025 250 / .45); }
  `],
})
export class Home {
  protected readonly g = inject(GameService);
  private readonly audio = inject(AudioService);
  private readonly fx = inject(FxService);
  private readonly logo = viewChild.required(Logo, { read: ElementRef });
  protected readonly regex = /[^A-Z0-9]/g;
  protected name = this.loadName();
  protected code = new URLSearchParams(location.search).get('sala')?.toUpperCase().slice(0, 5) ?? '';
  protected readonly showRules = signal(false);

  constructor() {
    afterNextRender(() => this.animateLogo(this.logo().nativeElement as HTMLElement));
  }

  protected validName(): boolean { return this.name.trim().length >= 1; }
  protected saveName(): void { try { localStorage.setItem('resistencia.name', this.name); } catch { /* ignora */ } }
  protected toggleRules(): void { this.audio.ui(); this.showRules.update((v) => !v); }
  protected async create(): Promise<void> { this.audio.lock(); await this.g.create(this.name.trim()); }
  protected async join(): Promise<void> {
    if (!this.validName() || this.code.length < 5) return;
    this.audio.lock();
    await this.g.join(this.code, this.name.trim());
  }
  private loadName(): string { try { return localStorage.getItem('resistencia.name') ?? ''; } catch { return ''; } }

  /** Desenha as duas branches, o tronco e faz o commit "pular". Branch coral pisca em glitch. */
  private animateLogo(root: HTMLElement): void {
    const q = (k: string) => root.querySelector(`[data-${k}]`), full = this.fx.full();
    const draw = (el: Element | null, delay: number, dur: number) => el?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: full ? dur : 1, delay: full ? delay : 0, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'both' });
    draw(q('a'), 100, 700); draw(q('b')?.firstElementChild ?? null, 260, 700); draw(q('c'), 900, 400);
    q('d')?.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.35)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: full ? 600 : 1, delay: full ? 900 : 0, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'both' });
    const b = q('b');
    if (!b || !full) return;
    const id = setInterval(() => {
      if (!b.isConnected) return clearInterval(id);
      if (document.hidden) return;
      b.animate([{ transform: 'none' }, { transform: 'translate(2px,-1px)' }, { transform: 'translate(-3px,1px)', opacity: 0.4 }, { transform: 'translate(1px,0)' }, { transform: 'none' }], { duration: 260, easing: 'steps(4)' });
    }, 2600);
  }
}
