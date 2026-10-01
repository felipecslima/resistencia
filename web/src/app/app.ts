import { Component, effect, inject, untracked } from '@angular/core';
import { GameService } from './game.service';
import { AudioService } from './mc/audio.service';
import { FxService } from './mc/fx.service';
import { FxStage } from './mc/fx-stage';
import { Logo } from './mc/ui';
import { Home } from './home';
import { Lobby } from './lobby';
import { Game } from './game';

@Component({
  selector: 'app-root',
  imports: [FxStage, Logo, Home, Lobby, Game],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly g = inject(GameService);
  private readonly audio = inject(AudioService);
  private readonly fx = inject(FxService);
  private lastMsg = 0;

  constructor() {
    void this.g.init();
    // som de chat para mensagens de outros jogadores
    effect(() => {
      const list = this.g.messages();
      untracked(() => {
        const last = list.at(-1);
        if (last && last.id > this.lastMsg) {
          if (this.lastMsg !== 0 && last.player_id !== this.g.me()?.id) this.audio.chat();
          this.lastMsg = last.id;
        }
        if (!list.length) this.lastMsg = 0;
      });
    });
    // fora da mesa, tensão volta ao repouso
    effect(() => { const r = this.g.room(); if (!r || r.phase === 'lobby') untracked(() => this.fx.tension.set(0.12)); });
  }
}
