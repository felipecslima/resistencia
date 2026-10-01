import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccessService } from './access.service';
import { Logo } from './mc/ui';

@Component({
  selector: 'app-gate',
  imports: [FormsModule, Logo],
  template: `
    <main class="gate">
      <mc-logo [size]="72" />
      <h1><span class="m">Merge</span> <span class="c">Conflict</span></h1>
      <form class="mc-panel" (ngSubmit)="submit()" [class.shake]="wrong()">
        <label class="field">
          <span class="eyebrow">acesso restrito</span>
          <input class="mc-input pass" type="password" name="pass" placeholder="Senha" aria-label="Senha de acesso"
            [(ngModel)]="pass" (ngModelChange)="wrong.set(false); msg.set('')" autocomplete="off" autocapitalize="off" autofocus />
        </label>
        @if (msg()) { <p class="mono err" role="alert">{{ msg() }}</p> }
        <button class="mc-btn primary big" type="submit" [disabled]="!pass.trim() || busy()">Entrar</button>
      </form>
    </main>
  `,
  styles: [`
    .gate { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; text-align: center; }
    h1 { margin: 0; font-family: var(--display); font-size: clamp(30px, 8vw, 44px); line-height: 1; text-transform: uppercase; }
    .m { font-variation-settings: 'wdth' 150, 'wght' 900; }
    .c { font-variation-settings: 'wdth' 150, 'wght' 300; letter-spacing: .14em; color: var(--lead); }
    form { width: min(100%, 380px); display: flex; flex-direction: column; gap: 14px; text-align: left; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .pass { letter-spacing: .12em; }
    .err { margin: 0; color: var(--sabotage); font-size: 14px; }
    .shake { animation: shake 360ms cubic-bezier(.36,.07,.19,.97); }
    @keyframes shake { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
    @media (prefers-reduced-motion: reduce) { .shake { animation: none; } }
  `],
})
export class Gate {
  private readonly access = inject(AccessService);
  protected pass = '';
  protected readonly wrong = signal(false);
  protected readonly msg = signal('');
  protected readonly busy = signal(false);

  protected async submit(): Promise<void> {
    if (!this.pass.trim() || this.busy()) return;
    this.busy.set(true);
    try {
      const ok = await this.access.attempt(this.pass);
      if (!ok) { this.wrong.set(true); this.msg.set('permission denied: senha incorreta'); this.pass = ''; }
    } catch (e) {
      this.msg.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
