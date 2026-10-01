import { Component, effect, inject, untracked } from '@angular/core';
import { GameService } from './game.service';
import { SoundService } from './sound.service';
import { Home } from './home';
import { Lobby } from './lobby';
import { Game } from './game';

@Component({
  selector: 'app-root',
  imports: [Home, Lobby, Game],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly g = inject(GameService);
  private readonly sound = inject(SoundService);
  private lastMsg = 0;

  constructor() {
    void this.g.init();
    // som de chat para mensagens de outros jogadores
    effect(() => {
      const list = this.g.messages();
      untracked(() => {
        const last = list.at(-1);
        if (last && last.id > this.lastMsg) {
          if (this.lastMsg !== 0 && last.player_id !== this.g.me()?.id) this.sound.chat();
          this.lastMsg = last.id;
        }
        if (!list.length) this.lastMsg = 0;
      });
    });
  }
}
