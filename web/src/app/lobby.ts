import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { GameService } from './game.service';
import { AudioService } from './mc/audio.service';
import { ChatPanel } from './chat-panel';
import { RulesButton } from './rules';
import { MIN_PLAYERS, MISSION_SIZES, RoleKey, RoomOptions, spyCount } from './models';
import { Icon, RoleEmblem, Sigil } from './mc/ui';
import { sigil } from './mc/theme';

interface OptionDef { key: keyof RoomOptions; role: RoleKey; title: string; text: string; }

@Component({
  selector: 'app-lobby',
  imports: [ChatPanel, Icon, RoleEmblem, Sigil, RulesButton],
  template: `
    <main class="lobby">
      <header class="head">
        <div class="code-box">
          <span class="eyebrow">Repositório da sala</span>
          <span class="code">{{ room().code }}</span>
        </div>
        <div class="tools">
          <app-rules-button [players]="n()" />
          <button class="mc-btn" (click)="copy()"><mc-icon name="link" [size]="18" /> {{ copied() ? 'Link copiado!' : 'Copiar convite' }}</button>
          <button class="mc-btn icon" (click)="audio.toggle()" [attr.aria-label]="audio.muted() ? 'Ativar som' : 'Silenciar'" [attr.aria-pressed]="audio.muted()">
            <span class="vol"><mc-icon name="speaker" /><mc-icon [name]="audio.muted() ? 'mutedX' : 'waves'" /></span>
          </button>
          <button class="mc-btn ghost danger" (click)="g.leave()">Sair</button>
        </div>
      </header>

      <div class="cols">
        <section class="mc-panel">
          <div class="row">
            <h2 class="h-section">Contribuidores {{ n() }}/10</h2>
            <span class="chip" [class.team]="n() >= min" [class.sab]="n() < min">{{ n() < min ? 'Faltam ' + (min - n()) : 'Pronto para começar' }}</span>
          </div>
          <ul class="players">
            @for (p of g.sorted(); track p.id) {
              <li [class.me]="p.id === g.me()?.id">
                <span class="av">
                  <mc-sigil [name]="p.name" [size]="40" />
                  <i class="dot" [class.on]="g.online().has(p.id)" [attr.title]="g.online().has(p.id) ? 'Online' : 'Offline'"></i>
                </span>
                <span class="who">
                  <span class="nm">{{ p.name }}</span>
                  <span class="sub" [class.host]="p.user_id === room().host_user">
                    {{ p.user_id === room().host_user ? 'host' : hex(p.name) }}{{ p.id === g.me()?.id ? ' · você' : '' }}{{ g.online().has(p.id) ? '' : ' · offline' }}
                  </span>
                </span>
                @if (g.isHost() && p.id !== g.me()?.id) {
                  <button class="kick" (click)="g.kick(p.id)" [attr.aria-label]="'Remover ' + p.name"><mc-icon name="mutedX" [size]="16" /></button>
                }
              </li>
            }
          </ul>
          <p class="comp">{{ n() >= min ? 'Com ' + n() + ' jogadores: ' + spies() + (spies() === 1 ? ' sabotador e ' : ' sabotadores e ') + (n() - spies()) + ' devs. Equipes: ' + sizes() + '.' : 'Mínimo de ' + min + ' jogadores. Mande o convite.' }}</p>
        </section>

        <section class="mc-panel">
          <h2 class="h-section">Papéis especiais</h2>
          @for (o of defs; track o.key) {
            <button class="opt" role="switch" [attr.aria-checked]="room().options[o.key]" [class.on]="room().options[o.key]" [disabled]="!g.isHost()" (click)="toggle(o.key)">
              <mc-emblem [role]="o.role" [size]="40" />
              <span class="t"><b>{{ o.title }}</b><span>{{ o.text }}</span></span>
              <span class="sw" aria-hidden="true"><i></i></span>
            </button>
          }
          @if (optionError()) { <p class="err">{{ optionError() }}</p> }
          @if (g.isHost()) {
            <button class="mc-btn primary big" [disabled]="!canStart() || g.busy()" (click)="start()">git push --start</button>
          } @else {
            <p class="comp">Aguardando o host começar a partida…</p>
          }
        </section>

        <section class="mc-panel chatbox">
          <h2 class="h-section">#geral</h2>
          <app-chat />
        </section>
      </div>
    </main>
  `,
  styles: [`
    .lobby { max-width: 1080px; margin: 0 auto; padding: 22px 16px 60px; display: flex; flex-direction: column; gap: 18px; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
    .code-box { display: flex; flex-direction: column; gap: 6px; }
    .code { font-family: var(--mono); font-weight: 800; font-size: clamp(42px, 12vw, 64px); letter-spacing: .18em; line-height: 1; color: oklch(0.86 0.14 80); text-shadow: 0 0 28px oklch(0.85 0.14 80 / .45); }
    .tools { display: flex; gap: 10px; flex-wrap: wrap; }
    .vol { display: grid; } .vol > * { grid-area: 1 / 1; }
    .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 16px; }
    .chatbox { grid-column: 1 / -1; }
    .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .players { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
    .players li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; background: oklch(0.12 0.01 250 / .75); border: 1px solid oklch(0.42 0.025 250 / .45); min-width: 0; }
    .players li.me { border-color: oklch(0.85 0.14 80 / .6); }
    .av { position: relative; flex: none; }
    .dot { position: absolute; right: -1px; bottom: 1px; width: 11px; height: 11px; border-radius: 50%; background: oklch(0.45 0.02 250); border: 2px solid #0b0d12; }
    .dot.on { background: var(--team); box-shadow: 0 0 8px var(--team); }
    .who { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .nm { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { font-size: 12px; font-family: var(--mono); color: var(--muted-2); }
    .sub.host { color: var(--lead); }
    .kick { flex: none; width: 44px; height: 44px; margin: -8px -6px -8px 0; display: grid; place-items: center; border: 0; background: none; border-radius: 10px; color: var(--muted-2); }
    .kick:hover { color: var(--sabotage); background: oklch(0.72 0.19 22 / .1); }
    .comp { margin: 0; color: oklch(0.82 0.015 250); font-size: 14px; }
    .opt { display: flex; gap: 12px; align-items: center; text-align: left; padding: 12px; border-radius: 14px; border: 1px solid oklch(0.42 0.025 250 / .5); background: oklch(0.12 0.01 250 / .6);
      transition: border-color 260ms var(--ease-out), background 260ms, transform 200ms var(--ease-spring); }
    .opt:hover:not(:disabled) { transform: translateY(-1px); }
    .opt:active:not(:disabled) { transform: scale(.985); }
    .opt:disabled { cursor: default; }
    .opt.on { border-color: var(--lead); background: oklch(0.85 0.14 80 / .07); }
    .opt .t { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .opt b { font-size: 15px; }
    .opt .t span { font-size: 13px; color: var(--muted-1); line-height: 1.4; }
    .sw { flex: none; width: 44px; height: 26px; border-radius: 999px; background: oklch(0.35 0.02 250); position: relative; transition: background 260ms; }
    .sw i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: var(--ink); transition: transform 360ms var(--ease-spring); }
    .opt.on .sw { background: var(--lead); }
    .opt.on .sw i { transform: translateX(18px); }
    .err { margin: 0; color: oklch(0.8 0.14 28); font-size: 14px; }
  `],
})
export class Lobby {
  protected readonly g = inject(GameService);
  protected readonly audio = inject(AudioService);
  protected readonly copied = signal(false);
  protected readonly room = computed(() => this.g.room()!);
  protected readonly n = computed(() => this.g.players().length);
  protected readonly min = MIN_PLAYERS;
  protected readonly spies = computed(() => spyCount(this.n()));
  protected readonly sizes = computed(() => (MISSION_SIZES[Math.min(this.n(), 10)] ?? []).join(' · '));
  protected readonly defs: OptionDef[] = [
    { key: 'merlin', role: 'merlin', title: 'Tech Lead + Headhunter', text: 'O Tech Lead vê os sabotadores. Se o time fechar 3 releases, o Headhunter tenta achá-lo.' },
    { key: 'percival', role: 'percival', title: 'QA + Impostor', text: 'O QA vê o Tech Lead e o Impostor, sem saber qual é qual. Exige o Tech Lead.' },
    { key: 'mordred', role: 'mordred', title: 'Zero-day', text: 'Sabotador invisível para o Tech Lead.' },
    { key: 'oberon', role: 'oberon', title: 'Legado', text: 'Sabotador isolado: não conhece os outros e não é conhecido por eles.' },
  ];
  protected readonly optionError = computed(() => {
    const o = this.room().options, n = this.n();
    if (o.percival && !o.merlin) return 'O QA só funciona junto com o Tech Lead.';
    const special = [o.merlin, o.percival, o.mordred, o.oberon].filter(Boolean).length;
    if (n >= MIN_PLAYERS && special > spyCount(n)) return `Muitos papéis especiais para ${n} jogadores (máximo ${spyCount(n)}).`;
    return '';
  });
  protected readonly canStart = computed(() => this.n() >= MIN_PLAYERS && !this.optionError());

  private seen = new Set(this.g.players().map((p) => p.id));
  constructor() {
    // som quando alguém entra na sala
    effect(() => {
      const ids = this.g.players().map((p) => p.id);
      untracked(() => {
        if (ids.some((id) => !this.seen.has(id))) this.audio.select(ids.length % 6);
        this.seen = new Set(ids);
      });
    });
  }

  protected hex(name: string): string { return sigil(name).hex; }

  protected toggle(key: keyof RoomOptions): void {
    const o = this.room().options, next: RoomOptions = { ...o, [key]: !o[key] };
    if (key === 'merlin' && o.merlin) next.percival = false;
    if (key === 'percival' && !o.percival) next.merlin = true;
    this.audio.ui();
    void this.g.updateOptions(next);
  }

  protected start(): void { this.audio.lock(); void this.g.start(); }

  protected async copy(): Promise<void> {
    const url = `${location.origin}${location.pathname}?sala=${this.room().code}`;
    try { await navigator.clipboard.writeText(url); this.audio.select(3); this.copied.set(true); setTimeout(() => this.copied.set(false), 2000); } catch { /* ignora */ }
  }
}
