import { ChangeDetectionStrategy, Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { MAX_PLAYERS, MIN_PLAYERS, MISSION_SIZES, RoleKey, needsTwoFails, spyCount } from './models';
import { ROLE_UI } from './mc/theme';
import { RoleEmblem } from './mc/ui';

type Tab = 'play' | 'roles' | 'modes';

interface RoleRow { role: RoleKey; when: string; }
const ROLE_ROWS: RoleRow[] = [
  { role: 'resistance', when: 'Sempre. Ocupa as vagas que sobram.' },
  { role: 'spy', when: 'Sempre. Ocupa as vagas de sabotador que sobram.' },
  { role: 'merlin', when: 'Opção "Tech Lead + Headhunter". Funciona com 4 ou mais jogadores.' },
  { role: 'assassin', when: 'Entra junto com o Tech Lead. É um sabotador com uma jogada extra no fim.' },
  { role: 'percival', when: 'Opção "QA + Impostor". Exige o Tech Lead, então só a partir de 5 jogadores.' },
  { role: 'morgana', when: 'Entra junto com o QA. Ocupa uma vaga de sabotador.' },
  { role: 'mordred', when: 'Opção "Zero-day". Ocupa uma vaga de sabotador.' },
  { role: 'oberon', when: 'Opção "Legado". Ocupa uma vaga de sabotador.' },
];

const COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

/** Regras do jogo, geradas a partir de models.ts para a tabela nunca divergir do que o banco aplica. */
@Component({
  selector: 'app-rules',
  imports: [RoleEmblem],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="tablist" class="rtabs" aria-label="Seções das regras">
      <button role="tab" [attr.aria-selected]="tab() === 'play'" [class.on]="tab() === 'play'" (click)="tab.set('play')">Como jogar</button>
      <button role="tab" [attr.aria-selected]="tab() === 'modes'" [class.on]="tab() === 'modes'" (click)="tab.set('modes')">Por nº de jogadores</button>
      <button role="tab" [attr.aria-selected]="tab() === 'roles'" [class.on]="tab() === 'roles'" (click)="tab.set('roles')">Papéis</button>
    </div>

    <div class="body" role="tabpanel">
      @switch (tab()) {
        @case ('play') {
          <section>
            <h3>Objetivo</h3>
            <p><b class="d">Devs</b> vencem entregando <b>3 releases</b> com o build verde. <b class="s">Sabotadores</b> vencem quebrando <b>3 builds</b>, ou fazendo <b>5 PRs seguidos</b> serem recusados (o deadline estoura).</p>
            <p>Cada jogador recebe um papel em segredo. Os sabotadores sabem quem são os outros sabotadores; os devs não sabem de ninguém.</p>
          </section>
          <section>
            <h3>Uma rodada (release)</h3>
            <ol>
              <li><b>Abrir o PR.</b> O <b>lead</b> (a vez passa de jogador em jogador pela mesa) escolhe uma equipe com o número de devs indicado. Pode se incluir.</li>
              <li><b>Code review.</b> Todos votam em segredo: <b>approve</b> ou <b>pedir mudanças</b>. Os votos são revelados juntos. Aprova quem tiver <b>mais da metade</b> dos votos: <b>empate recusa</b>.</li>
              <li><b>PR recusado:</b> o lead passa para o próximo e o deadline sobe 1. Ao chegar em 5, os sabotadores vencem. Um PR aprovado zera a contagem na rodada seguinte.</li>
              <li><b>PR aprovado:</b> cada membro da equipe faz um commit em segredo. Devs só podem fazer <b>commit limpo</b>. Sabotadores escolhem entre limpo e <b>plantar um bug</b>.</li>
              <li><b>Build.</b> Os commits são embaralhados e revelados: aparece só <b>quantos bugs</b> houve, nunca quem os fez. <b>1 bug quebra o build</b>. Na release 4 com 7 ou mais jogadores são precisos <b>2 bugs</b>.</li>
            </ol>
          </section>
          <section>
            <h3>Fim de jogo</h3>
            <p>Quem chegar primeiro a 3 builds (verdes ou quebrados) decide a partida. Com o <b>Tech Lead</b> ligado, se os devs fecharem 3 releases o <b>Headhunter</b> tem uma última chance: se apontar o Tech Lead, os sabotadores roubam a vitória.</p>
          </section>
          <section>
            <h3>Dicas</h3>
            <ul>
              <li>Build quebrado significa que há ao menos um sabotador na equipe. Compare quem esteve em cada release.</li>
              <li>Sabotadores às vezes fazem commit limpo de propósito para não levantar suspeita.</li>
              <li>Vale conversar no chat, mas ninguém é obrigado a dizer a verdade.</li>
            </ul>
          </section>
        }
        @case ('modes') {
          <section>
            <h3>Quantos jogadores?</h3>
            <p>De {{ min }} a {{ max }} jogadores. O número de sabotadores e o tamanho das equipes dependem de quantos entram na sala.</p>
            <div class="tbl-wrap">
              <table>
                <caption class="sr-only">Regras por número de jogadores</caption>
                <thead><tr><th scope="col">Jogadores</th><th scope="col">Sabotadores</th><th scope="col">Devs</th><th scope="col">Equipe por release (1 a 5)</th><th scope="col">Papéis especiais</th></tr></thead>
                <tbody>
                  @for (n of counts; track n) {
                    <tr [class.hl]="n === highlight()">
                      <th scope="row">{{ n }}</th>
                      <td>{{ spies(n) }}</td>
                      <td>{{ n - spies(n) }}</td>
                      <td class="mono">{{ sizes(n) }}{{ twoFails(n) ? ' *' : '' }}</td>
                      <td>até {{ spies(n) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="note">* Na release 4 são precisos <b>2 bugs</b> para quebrar o build. "Papéis especiais" é o máximo de opções do host ligadas ao mesmo tempo (Tech Lead, QA, Zero-day e Legado valem uma cada).</p>
          </section>
          <section class="mode4">
            <h3>Modo de 4 jogadores</h3>
            <p>Uma versão própria deste jogo, mais curta e mais de blefe. Há <b>1 sabotador</b>, sozinho: ele não conhece ninguém e ninguém sabe quem é.</p>
            <ul>
              <li>Equipes de <b>2, 2, 3, 3 e 3</b> devs, e <b>1 bug</b> quebra o build.</li>
              <li><b>Empate 2×2 recusa o PR.</b> Para aprovar são precisos <b>3 approves</b> em 4.</li>
              <li>Todo build quebrado aponta para a equipe: o sabotador precisa de equipes de 3 para se esconder.</li>
              <li>Só a opção <b>Tech Lead + Headhunter</b> cabe aqui. Nesse caso o Headhunter é o próprio sabotador e tenta achar o Tech Lead entre 3 devs.</li>
            </ul>
          </section>
          <section>
            <h3>Papéis especiais (opções do host)</h3>
            <ul>
              <li><b>Tech Lead + Headhunter:</b> o Tech Lead enxerga os sabotadores, mas se o Headhunter o achar no fim, os sabotadores vencem.</li>
              <li><b>QA + Impostor:</b> o QA vê dois jogadores marcados como "Tech Lead?": um é o verdadeiro, o outro é o Impostor. Exige o Tech Lead.</li>
              <li><b>Zero-day:</b> um sabotador que o Tech Lead não enxerga.</li>
              <li><b>Legado:</b> um sabotador isolado: não conhece os outros e eles não o conhecem.</li>
            </ul>
            <p class="note">O host só consegue iniciar se as opções ligadas couberem no número de sabotadores da tabela acima.</p>
          </section>
        }
        @case ('roles') {
          <section class="roles">
            @for (r of rows; track r.role) {
              <article class="role">
                <mc-emblem [role]="r.role" [size]="44" />
                <div>
                  <h3>{{ ui[r.role].name }} <span class="side" [class.d]="ui[r.role].side === 'd'" [class.s]="ui[r.role].side === 's'">{{ ui[r.role].side === 'd' ? 'time' : 'sabotagem' }}</span></h3>
                  <p>{{ ui[r.role].blurb }}</p>
                  <p class="when">{{ r.when }}</p>
                </div>
              </article>
            }
          </section>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 0; }
    .rtabs { display: flex; border-bottom: 1px solid var(--line); flex: none; }
    .rtabs button { flex: 1; min-height: 46px; padding: 0 8px; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--muted-2);
      font-family: var(--display); font-variation-settings: 'wdth' 120, 'wght' 700; font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; }
    .rtabs button:hover { color: var(--ink); }
    .rtabs button.on { color: var(--ink); border-bottom-color: var(--lead); }
    .body { overflow: auto; padding: 16px 18px 20px; display: flex; flex-direction: column; gap: 18px; color: oklch(0.87 0.012 250); font-size: 15px; line-height: 1.55; min-height: 0; }
    section { display: flex; flex-direction: column; gap: 8px; }
    h3 { margin: 0; font-family: var(--display); font-variation-settings: 'wdth' 120, 'wght' 760; font-size: 14px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink); }
    p { margin: 0; text-wrap: pretty; }
    ol, ul { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; }
    b.d { color: var(--team); } b.s { color: var(--sabotage); }
    .note { font-size: 13px; color: var(--muted-1); }
    .tbl-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 460px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid oklch(0.42 0.025 250 / .3); }
    thead th { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted-1); font-weight: 700; }
    tbody th { font-family: var(--mono); }
    tr:last-child > * { border-bottom: 0; }
    tr.hl { background: oklch(0.85 0.14 80 / .1); }
    tr.hl th { color: var(--lead); }
    .mode4 { padding: 14px; border-radius: 14px; border: 1px solid oklch(0.85 0.14 80 / .45); background: oklch(0.85 0.14 80 / .06); }
    .roles { gap: 10px; }
    .role { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: 14px; background: oklch(0.11 0.01 250 / .7); border: 1px solid oklch(0.42 0.025 250 / .45); }
    .role > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .role h3 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 15px; letter-spacing: .06em; }
    .role p { font-size: 14px; }
    .when { color: var(--muted-1); font-size: 13px !important; }
    .side { font-size: 10px; letter-spacing: .14em; padding: 1px 7px; border-radius: 999px; border: 1px solid currentColor; }
    .side.d { color: var(--team); } .side.s { color: var(--sabotage); }
  `],
})
export class Rules {
  readonly highlight = input<number | null>(null);
  protected readonly tab = signal<Tab>('play');
  protected readonly min = MIN_PLAYERS;
  protected readonly max = MAX_PLAYERS;
  protected readonly counts = COUNTS;
  protected readonly rows = ROLE_ROWS;
  protected readonly ui = ROLE_UI;
  protected spies(n: number): number { return spyCount(n); }
  protected sizes(n: number): string { return MISSION_SIZES[n].join(' · '); }
  protected twoFails(n: number): boolean { return needsTwoFails(n, 4); }
}

/** Botão "Regras" + janela com o conteúdo. Usável no lobby e durante a partida. */
@Component({
  selector: 'app-rules-button',
  imports: [Rules],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <button type="button" class="mc-btn" [class.icon]="compact()" (click)="open()" aria-haspopup="dialog" [attr.aria-label]="'Ver as regras'">{{ compact() ? '?' : 'Regras' }}</button>
    @if (shown()) {
      <div class="scrim" (click)="close()">
        <div class="dlg mc-panel" role="dialog" aria-modal="true" aria-label="Regras do jogo" (click)="$event.stopPropagation()">
          <header>
            <h2>Regras</h2>
            <button #x type="button" class="mc-btn ghost" (click)="close()">Fechar</button>
          </header>
          <app-rules [highlight]="players()" />
        </div>
      </div>
    }
  `,
  styles: [`
    .scrim { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 14px; background: oklch(0.05 0.01 250 / .78); }
    .dlg { width: min(720px, 100%); max-height: min(86dvh, 760px); padding: 0; gap: 0; overflow: hidden; background: oklch(0.15 0.014 250 / .98); }
    header { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 14px 12px 18px; border-bottom: 1px solid var(--line); flex: none; }
    h2 { margin: 0; font-family: var(--display); font-variation-settings: 'wdth' 120, 'wght' 800; font-size: 20px; letter-spacing: .06em; text-transform: uppercase; }
    app-rules { flex: 1; min-height: 0; }
  `],
})
export class RulesButton {
  readonly players = input<number | null>(null);
  readonly compact = input(false);
  protected readonly shown = signal(false);
  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('x');

  protected open(): void {
    this.shown.set(true);
    setTimeout(() => this.closeBtn()?.nativeElement.focus({ preventScroll: true }));
  }
  protected close(): void { this.shown.set(false); }
}
