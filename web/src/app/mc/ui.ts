import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RoleKey } from '../models';
import { EMBLEMS, ICON, IconName, ROLE_UI, sideCol, sigil } from './theme';

/** Ícone de traço 24×24. Decorativo: o rótulo acessível fica no botão. */
@Component({
  selector: 'mc-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display:inline-grid;flex:none' },
  template: `<svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()"><path [attr.d]="d()" fill="none" stroke="currentColor" [attr.stroke-width]="stroke()" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly stroke = input(2);
  protected readonly d = computed(() => ICON[this.name()]);
}

/** Identicon hexagonal do jogador. */
@Component({
  selector: 'mc-sigil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display:block;flex:none;line-height:0' },
  template: `
    <svg viewBox="0 0 100 100" [attr.width]="size()" [attr.height]="size()" [style.color]="s().col" style="overflow:visible">
      <path d="M50 3 91 26.5v47L50 97 9 73.5v-47Z" fill="oklch(0.15 0.015 250)" [attr.stroke]="ring() || 'currentColor'" [attr.stroke-width]="ringWidth()" style="transition:stroke 400ms" />
      <g fill="currentColor">
        @for (c of s().cells; track $index) { <rect [attr.x]="c.x" [attr.y]="c.y" width="12" height="12" rx="2" /> }
      </g>
    </svg>`,
})
export class Sigil {
  readonly name = input.required<string>();
  readonly size = input<number | string>(40);
  readonly ring = input<string>('');
  readonly ringWidth = input(3);
  protected readonly s = computed(() => sigil(this.name()));
}

/** Emblema do papel (moldura circular = time, losango = sabotagem). */
@Component({
  selector: 'mc-emblem',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display:block;flex:none;line-height:0' },
  template: `
    <svg viewBox="0 0 100 100" [attr.width]="size()" [attr.height]="size()" [style.color]="col()">
      @for (p of paths(); track $index) {
        <path [attr.d]="p.d" fill="none" stroke="currentColor" [attr.stroke-width]="p.w" [attr.opacity]="p.op" [attr.stroke-dasharray]="p.dash" stroke-linecap="round" stroke-linejoin="round" />
      }
    </svg>`,
})
export class RoleEmblem {
  readonly role = input.required<RoleKey>();
  readonly size = input<number | string>(40);
  readonly color = input<string>('');
  protected readonly paths = computed(() => EMBLEMS[this.role()]);
  protected readonly col = computed(() => this.color() || sideCol(ROLE_UI[this.role()].side));
}

/** Logo: duas branches (time/sabotagem) se fundindo num commit âmbar. */
@Component({
  selector: 'mc-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display:block;line-height:0' },
  template: `
    <svg viewBox="0 0 64 64" [attr.width]="size()" [attr.height]="size()" style="overflow:visible">
      <path data-a d="M14 6 V22 C14 34 32 30 32 42" fill="none" stroke="oklch(0.85 0.12 195)" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" style="filter:drop-shadow(0 0 5px oklch(0.85 0.12 195 / .8))" />
      <g data-b><path d="M50 6 V22 C50 34 32 30 32 42" fill="none" stroke="oklch(0.72 0.19 22)" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" style="filter:drop-shadow(0 0 5px oklch(0.72 0.19 22 / .8))" /></g>
      <path data-c d="M32 42 V60" stroke="#eef0f3" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" />
      <path data-d d="M32 33 41 42 32 51 23 42Z" fill="#0b0d12" stroke="oklch(0.85 0.14 80)" stroke-width="3.5" stroke-linejoin="round" style="filter:drop-shadow(0 0 8px oklch(0.85 0.14 80));transform-origin:32px 42px;transform-box:view-box" />
    </svg>`,
})
export class Logo {
  readonly size = input(92);
}
