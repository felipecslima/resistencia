import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MissionResult, needsTwoFails, teamSize } from '../models';
import { COL, ICON } from './theme';

interface Stage {
  m: number; res?: MissionResult; cur: boolean; col: string; sub: string; txt: string; aria: string;
  seg: string; segGlow: string; last: boolean;
}

/** Pipeline dos 5 releases: círculo verde = build passou, losango coral = quebrou. */
@Component({
  selector: 'mc-release-pipeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol aria-label="Pipeline de releases">
      @for (s of stages(); track s.m) {
        <li [attr.aria-label]="s.aria">
          @if (!s.last) { <span class="seg" aria-hidden="true" [style.background]="s.seg" [style.box-shadow]="s.segGlow"></span> }
          <span class="node" [class.cur]="s.cur" [class.ok]="s.res?.success" [class.fail]="s.res && !s.res.success" [style.--c]="s.col">
            <span class="in">
              @if (s.res) {
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path [attr.d]="s.res.success ? icon.ok : icon.no" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
              } @else { {{ s.txt }} }
            </span>
          </span>
          <span class="lbl" [class.cur]="s.cur">R{{ s.m }}</span>
          <span class="sub">{{ s.sub }}</span>
        </li>
      }
    </ol>
  `,
  styles: [`
    ol { list-style: none; margin: 4px 0 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
    li { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .seg { position: absolute; top: 21px; left: 50%; width: 100%; height: 2px; transition: background 700ms, box-shadow 700ms; }
    .node { --c: var(--mute); position: relative; z-index: 1; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%;
      background: oklch(0.12 0.01 250); border: 2px solid var(--c); color: var(--muted-2);
      transition: transform 600ms var(--ease-spring), background 500ms, box-shadow 600ms, border-radius 500ms; }
    .node .in { display: grid; place-items: center; font-family: var(--mono); font-weight: 800; font-size: 14px; transition: transform 500ms; }
    .node.cur { transform: scale(1.12); color: var(--lead); box-shadow: 0 0 0 6px oklch(0.85 0.14 80 / .14), 0 0 22px -4px var(--c); }
    .node.ok { background: oklch(0.85 0.12 195 / .18); color: var(--c); box-shadow: 0 0 22px -2px var(--c); }
    .node.fail { border-radius: 6px; transform: rotate(45deg); background: oklch(0.72 0.19 22 / .18); color: var(--c); box-shadow: 0 0 22px -2px var(--c); }
    .node.fail .in { transform: rotate(-45deg); }
    .lbl { font-family: var(--display); font-variation-settings: 'wdth' 120, 'wght' 700; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted-1); }
    .lbl.cur { color: var(--lead); }
    .sub { font-size: 11px; color: var(--muted-2); min-height: 14px; }
  `],
})
export class ReleasePipeline {
  readonly results = input.required<MissionResult[]>();
  readonly round = input.required<number>();
  readonly n = input.required<number>();
  readonly live = input(true);
  protected readonly icon = ICON;

  protected readonly stages = computed<Stage[]>(() => {
    const rs = this.results(), n = this.n();
    return [1, 2, 3, 4, 5].map((m) => {
      const res = rs.find((x) => x.round === m), nx = rs.find((x) => x.round === m + 1);
      const cur = !res && m === this.round() && this.live();
      const col = res ? (res.success ? COL.d : COL.s) : cur ? COL.a : 'oklch(0.45 0.02 250)';
      const size = n >= 5 ? teamSize(n, m) : 0;
      const segC = res && nx ? (nx.success ? COL.d : COL.s) : 'oklch(0.35 0.02 250)';
      return {
        m, res, cur, col, txt: size ? String(size) : '', last: m === 5,
        sub: res ? `${res.fails} ${res.fails === 1 ? 'bug' : 'bugs'}` : needsTwoFails(n, m) ? '2 bugs' : '',
        seg: segC, segGlow: res && nx ? `0 0 10px ${segC}` : 'none',
        aria: `Release ${m}: ${res ? (res.success ? 'build verde' : `build quebrado, ${res.fails} bugs`) : cur ? 'atual' : 'pendente'}${size ? `, ${size} devs` : ''}`,
      };
    });
  });
}
