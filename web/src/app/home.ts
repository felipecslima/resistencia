import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameService } from './game.service';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  template: `
    <main class="wrap hero">
      <header class="brand">
        <div class="logo" aria-hidden="true">✊</div>
        <h1>A Resistência</h1>
        <p class="muted">Dedução social em tempo real para 5 a 10 jogadores. Descubra os espiões antes que sabotem tudo.</p>
      </header>

      <section class="panel stack card">
        <label class="stack small">
          <span class="muted">Seu nome</span>
          <input class="input" maxlength="20" placeholder="Como você quer ser chamado?" [(ngModel)]="name" (ngModelChange)="saveName()" autocomplete="nickname" />
        </label>

        <button class="btn primary big" [disabled]="!validName() || g.busy()" (click)="create()">Criar sala</button>

        <div class="divider"><span>ou entre em uma sala</span></div>

        <form class="row" (ngSubmit)="join()">
          <input class="input code grow" name="code" maxlength="5" placeholder="CÓDIGO" [(ngModel)]="code" (ngModelChange)="code = code.toUpperCase()" autocapitalize="characters" autocomplete="off" />
          <button class="btn" type="submit" [disabled]="!validName() || code.length < 5 || g.busy()">Entrar</button>
        </form>

        @if (g.resumable()) {
          <button class="btn good" (click)="g.resume()">Voltar para a partida em andamento</button>
        }
      </section>

      <section class="panel rules">
        <button class="rules-toggle" (click)="showRules.set(!showRules())" [attr.aria-expanded]="showRules()">
          <b>Como jogar</b><span>{{ showRules() ? '−' : '+' }}</span>
        </button>
        @if (showRules()) {
          <div class="rules-body">
            <p>Cada jogador recebe em segredo um papel: <b>Resistência</b> ou <b>Espião</b>. Os espiões se conhecem; a Resistência não sabe quem é quem.</p>
            <p>O jogo tem até 5 missões. A cada rodada o <b>líder</b> propõe uma equipe e todos votam (maioria aprova). Se 5 equipes seguidas forem rejeitadas, os espiões vencem.</p>
            <p>Com a equipe aprovada, cada membro joga uma carta em segredo: a Resistência só pode jogar <b>Sucesso</b>, espiões escolhem entre Sucesso e <b>Falha</b>. Uma única Falha derruba a missão (na 4ª missão com 7+ jogadores são necessárias 2 Falhas).</p>
            <p>Quem conquistar 3 missões vence. Com o <b>Comandante</b> ligado, se a Resistência vencer, o <b>Assassino</b> ainda pode apontar o Comandante para roubar a vitória.</p>
          </div>
        }
      </section>
    </main>
  `,
  styles: [`
    .hero { max-width: 520px; padding-top: 7vh; display: flex; flex-direction: column; gap: 16px; }
    .brand { text-align: center; margin-bottom: 4px; animation: fadeUp 0.5s ease; }
    .brand h1 { font-size: clamp(32px, 9vw, 44px); }
    .brand p { margin: 8px auto 0; max-width: 40ch; }
    .logo { font-size: 44px; width: 84px; height: 84px; margin: 0 auto 12px; display: grid; place-items: center; border-radius: 24px;
      background: linear-gradient(145deg, #1d3a56, #3a1620); border: 1px solid var(--line); box-shadow: var(--shadow); }
    .card { animation: fadeUp 0.5s ease 0.08s backwards; }
    .small { font-size: 14px; }
    .code { text-align: center; letter-spacing: 0.4em; font-weight: 700; font-size: 20px; text-transform: uppercase; }
    .divider { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 13px; }
    .divider::before, .divider::after { content: ''; height: 1px; background: var(--line); flex: 1; }
    .rules { padding: 0; }
    .rules-toggle { all: unset; box-sizing: border-box; width: 100%; padding: 16px; display: flex; justify-content: space-between; cursor: pointer; }
    .rules-body { padding: 0 16px 8px; color: #c4d0df; font-size: 15px; }
    .rules-body p { margin: 0 0 12px; }
  `],
})
export class Home {
  protected readonly g = inject(GameService);
  protected name = this.loadName();
  protected code = new URLSearchParams(location.search).get('sala')?.toUpperCase().slice(0, 5) ?? '';
  protected readonly showRules = signal(false);

  protected validName(): boolean { return this.name.trim().length >= 1; }
  protected saveName(): void { try { localStorage.setItem('resistencia.name', this.name); } catch { /* ignora */ } }
  protected async create(): Promise<void> { await this.g.create(this.name.trim()); }
  protected async join(): Promise<void> {
    if (!this.validName() || this.code.length < 5) return;
    await this.g.join(this.code, this.name.trim());
  }
  private loadName(): string { try { return localStorage.getItem('resistencia.name') ?? ''; } catch { return ''; } }
}
