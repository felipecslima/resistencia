import { Component, computed, inject, signal } from '@angular/core';
import { GameService } from './game.service';
import { SoundService } from './sound.service';
import { ChatPanel } from './chat-panel';
import { RoomOptions, spyCount } from './models';

interface OptionDef { key: keyof RoomOptions; title: string; text: string; needs?: keyof RoomOptions; }

@Component({
  selector: 'app-lobby',
  imports: [ChatPanel],
  template: `
    <main class="wrap">
      <header class="head">
        <div>
          <div class="muted small">Código da sala</div>
          <div class="code">{{ room().code }}</div>
        </div>
        <div class="row">
          <button class="btn small" (click)="copy()">{{ copied() ? 'Link copiado!' : 'Copiar link' }}</button>
          <button class="btn small ghost" (click)="sound.toggle()" [attr.aria-label]="sound.muted() ? 'Ativar som' : 'Silenciar'">{{ sound.muted() ? '🔇' : '🔊' }}</button>
          <button class="btn small ghost" (click)="g.leave()">Sair</button>
        </div>
      </header>

      <div class="cols">
        <section class="panel stack">
          <div class="row between">
            <h2>Jogadores ({{ g.players().length }}/10)</h2>
            <span class="chip" [class.good]="canStart()" [class.bad]="!canStart()">{{ g.players().length < 5 ? 'Faltam ' + (5 - g.players().length) : 'Pronto para começar' }}</span>
          </div>
          <ul class="players">
            @for (p of g.sorted(); track p.id) {
              <li [class.me]="p.id === g.me()?.id">
                <span class="dot" [class.on]="g.online().has(p.id)" [attr.title]="g.online().has(p.id) ? 'Online' : 'Offline'"></span>
                <span class="name">{{ p.name }}</span>
                @if (p.user_id === room().host_user) { <span class="chip gold">👑 Anfitrião</span> }
                @if (p.id === g.me()?.id) { <span class="chip">você</span> }
                @if (g.isHost() && p.id !== g.me()?.id) {
                  <button class="btn small ghost kick" (click)="g.kick(p.id)" [attr.aria-label]="'Remover ' + p.name">Remover</button>
                }
              </li>
            }
          </ul>
          @if (g.players().length >= 5) {
            <p class="muted small">Com {{ g.players().length }} jogadores: {{ spies() }} espiões e {{ g.players().length - spies() }} membros da Resistência.</p>
          }
        </section>

        <section class="panel stack">
          <h2>Papéis especiais</h2>
          @for (o of defs; track o.key) {
            <label class="opt" [class.off]="!g.isHost()">
              <input type="checkbox" [checked]="room().options[o.key]" [disabled]="!g.isHost()" (change)="toggle(o.key, $any($event.target).checked)" />
              <span><b>{{ o.title }}</b><br /><span class="muted small">{{ o.text }}</span></span>
            </label>
          }
          @if (optionError()) { <p class="err small">{{ optionError() }}</p> }
          @if (g.isHost()) {
            <button class="btn primary big" [disabled]="!canStart() || g.busy()" (click)="g.start()">Começar partida</button>
          } @else {
            <p class="muted">Aguardando o anfitrião começar a partida…</p>
          }
        </section>

        <section class="panel chatbox">
          <h2>Chat</h2>
          <app-chat />
        </section>
      </div>
    </main>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
    .code { font-size: 38px; font-weight: 800; letter-spacing: 0.25em; color: var(--gold); line-height: 1; }
    .small { font-size: 14px; }
    .between { justify-content: space-between; }
    .cols { display: grid; gap: 14px; grid-template-columns: 1fr; animation: fadeUp 0.35s ease; }
    @media (min-width: 900px) { .cols { grid-template-columns: 1fr 1fr; } .chatbox { grid-column: 1 / -1; } }
    .players { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .players li { display: flex; align-items: center; gap: 8px; background: var(--panel2); border: 1px solid var(--line); border-radius: 12px; padding: 9px 12px; flex-wrap: wrap; }
    .players li.me { border-color: #355070; }
    .name { font-weight: 600; flex: 1 1 auto; word-break: break-word; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #455468; flex: none; }
    .dot.on { background: var(--good); box-shadow: 0 0 8px var(--good); }
    .kick { color: var(--bad); }
    .opt { display: flex; gap: 12px; align-items: flex-start; padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel2); cursor: pointer; }
    .opt.off { cursor: default; opacity: 0.85; }
    .opt input { margin-top: 5px; width: 18px; height: 18px; accent-color: #f3c14f; flex: none; }
    .err { color: var(--bad); margin: 0; }
  `],
})
export class Lobby {
  protected readonly g = inject(GameService);
  protected readonly sound = inject(SoundService);
  protected readonly copied = signal(false);
  protected readonly room = computed(() => this.g.room()!);
  protected readonly spies = computed(() => spyCount(this.g.players().length));
  protected readonly defs: OptionDef[] = [
    { key: 'merlin', title: 'Comandante + Assassino', text: 'O Comandante vê os espiões. Se a Resistência vencer 3 missões, o Assassino tenta achá-lo.' },
    { key: 'percival', title: 'Vigia + Impostora', text: 'O Vigia vê o Comandante e a Impostora, sem saber qual é qual. Exige o Comandante.', needs: 'merlin' },
    { key: 'mordred', title: 'Mordred', text: 'Espião invisível para o Comandante.' },
    { key: 'oberon', title: 'Oberon', text: 'Espião isolado: não conhece os outros e não é conhecido por eles.' },
  ];
  protected readonly optionError = computed(() => {
    const o = this.room().options;
    const n = this.g.players().length;
    if (o.percival && !o.merlin) return 'O Vigia só funciona junto com o Comandante.';
    const special = [o.merlin, o.percival, o.mordred, o.oberon].filter(Boolean).length;
    if (n >= 5 && special > spyCount(n)) return `Muitos papéis especiais para ${n} jogadores (máximo ${spyCount(n)}).`;
    return '';
  });
  protected readonly canStart = computed(() => this.g.players().length >= 5 && !this.optionError());

  protected toggle(key: keyof RoomOptions, value: boolean): void {
    const next: RoomOptions = { ...this.room().options, [key]: value };
    if (key === 'merlin' && !value) next.percival = false;
    if (key === 'percival' && value) next.merlin = true;
    void this.g.updateOptions(next);
  }

  protected async copy(): Promise<void> {
    const url = `${location.origin}${location.pathname}?sala=${this.room().code}`;
    try { await navigator.clipboard.writeText(url); this.copied.set(true); setTimeout(() => this.copied.set(false), 2000); } catch { /* ignora */ }
  }
}
