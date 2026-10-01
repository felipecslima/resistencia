import { AfterViewChecked, Component, ElementRef, effect, inject, input, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameService } from './game.service';

@Component({
  selector: 'app-chat',
  imports: [FormsModule],
  template: `
    <div class="chat">
      <div class="msgs" #box aria-live="polite">
        @for (m of g.messages(); track m.id) {
          <div class="msg" [class.mine]="m.player_id === g.me()?.id">
            <span class="who">{{ m.name }}</span>
            <span class="body">{{ m.body }}</span>
          </div>
        } @empty {
          <p class="muted empty">Nenhuma mensagem ainda. Diga oi!</p>
        }
      </div>
      <form class="send" (ngSubmit)="send()">
        <input class="input" name="msg" maxlength="300" placeholder="Escreva uma mensagem…" [(ngModel)]="text" autocomplete="off" />
        <button class="btn" type="submit" [disabled]="!text.trim()">Enviar</button>
      </form>
    </div>
  `,
  styles: [`
    .chat { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; }
    .msgs { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; min-height: 160px; max-height: 340px; }
    .msg { background: var(--panel2); border: 1px solid var(--line); border-radius: 12px; padding: 7px 11px; max-width: 92%; align-self: flex-start; word-break: break-word; }
    .msg.mine { align-self: flex-end; background: #1e3147; }
    .who { display: block; font-size: 12px; font-weight: 700; color: var(--gold); }
    .empty { text-align: center; margin: auto; }
    .send { display: flex; gap: 8px; }
  `],
})
export class ChatPanel implements AfterViewChecked {
  protected readonly g = inject(GameService);
  readonly active = input(true);
  private readonly box = viewChild<ElementRef<HTMLDivElement>>('box');
  protected text = '';
  private stick = true;

  constructor() {
    effect(() => {
      this.g.messages();
      if (this.active()) untracked(() => { this.g.unread.set(0); this.stick = true; });
    });
  }

  ngAfterViewChecked(): void {
    const el = this.box()?.nativeElement;
    if (el && this.stick) { el.scrollTop = el.scrollHeight; this.stick = false; }
  }

  protected async send(): Promise<void> {
    const body = this.text.trim();
    if (!body) return;
    this.text = '';
    await this.g.sendMessage(body);
  }
}
