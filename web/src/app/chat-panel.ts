import { AfterViewChecked, Component, ElementRef, effect, inject, input, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameService } from './game.service';
import { Icon } from './mc/ui';
import { hhmm, sigil } from './mc/theme';

@Component({
  selector: 'app-chat',
  imports: [FormsModule, Icon],
  template: `
    <div class="chat">
      <div class="msgs" #box aria-live="polite" aria-label="Mensagens">
        @for (m of g.messages(); track m.id) {
          <div class="msg" [class.mine]="m.player_id === g.me()?.id">
            <span class="meta"><b [style.color]="col(m.name)">{{ m.name }}</b> <time>{{ time(m.created_at) }}</time></span>
            <span class="body">{{ m.body }}</span>
          </div>
        } @empty {
          <p class="empty">Nenhuma mensagem ainda. Diga oi!</p>
        }
      </div>
      <form class="send" (ngSubmit)="send()">
        <input class="mc-input" name="msg" maxlength="300" placeholder="Escreva uma mensagem…" aria-label="Mensagem" [(ngModel)]="text" autocomplete="off" />
        <button class="mc-btn icon" type="submit" [disabled]="!text.trim()" aria-label="Enviar"><mc-icon name="send" [size]="18" /></button>
      </form>
    </div>
  `,
  styles: [`
    .chat { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; }
    .msgs { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; min-height: 160px; max-height: 300px; }
    .msg { display: flex; flex-direction: column; gap: 2px; padding: 7px 11px; border-radius: 12px; max-width: 92%; align-self: flex-start; word-break: break-word;
      background: oklch(0.11 0.01 250 / .8); border: 1px solid oklch(0.42 0.025 250 / .45); }
    .msg.mine { align-self: flex-end; border-color: oklch(0.85 0.14 80 / .45); background: oklch(0.85 0.14 80 / .06); }
    .meta { font-size: 12px; }
    time { font-family: var(--mono); font-size: 11px; color: var(--muted-2); }
    .body { font-size: 15px; line-height: 1.4; }
    .empty { margin: auto; text-align: center; color: var(--muted-2); font-size: 14px; }
    .send { display: flex; gap: 8px; }
    .send .mc-input { padding: 10px 14px; font-size: 15px; }
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

  protected col(name: string): string { return sigil(name).col; }
  protected time(iso: string): string { return hhmm(iso); }

  protected async send(): Promise<void> {
    const body = this.text.trim();
    if (!body) return;
    this.text = '';
    await this.g.sendMessage(body);
  }
}
