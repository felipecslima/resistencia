import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { GameService } from './game.service';
import { SoundService } from './sound.service';
import { ChatPanel } from './chat-panel';
import { MissionResult, ROLES, RoleKey, VoteRecord, needsTwoFails, teamSize } from './models';

type Tab = 'chat' | 'log' | 'votes';

@Component({
  selector: 'app-game',
  imports: [ChatPanel],
  templateUrl: './game.html',
  styleUrl: './game.scss',
})
export class Game {
  protected readonly g = inject(GameService);
  protected readonly sound = inject(SoundService);
  protected readonly roles = ROLES;
  protected readonly missionNumbers = [1, 2, 3, 4, 5];
  protected readonly rejectDots = [1, 2, 3, 4, 5];

  protected readonly tab = signal<Tab>('chat');
  protected readonly selection = signal<ReadonlySet<string>>(new Set());
  protected readonly showRole = signal(false);
  protected readonly confirmLeave = signal(false);
  protected readonly voteReveal = signal<VoteRecord | null>(null);
  protected readonly missionReveal = signal<{ result: MissionResult; cards: boolean[] } | null>(null);

  protected readonly room = computed(() => this.g.room()!);
  protected readonly n = computed(() => this.g.players().length);
  protected readonly size = computed(() => teamSize(this.n(), this.room().round));
  protected readonly twoFails = computed(() => needsTwoFails(this.n(), this.room().round));
  protected readonly myId = computed(() => this.g.me()?.id ?? '');
  protected readonly mySide = computed(() => (this.g.myRole() ? ROLES[this.g.myRole()!].side : null));
  protected readonly isEvil = computed(() => this.mySide() === 'spies');
  protected readonly onTeam = computed(() => this.room().team.includes(this.myId()));
  protected readonly hasVoted = computed(() => this.room().voted.includes(this.myId()));
  protected readonly hasActed = computed(() => this.room().acted.includes(this.myId()));
  protected readonly isAssassin = computed(() => this.g.myRole() === 'assassin');
  protected readonly selecting = computed(() => {
    const p = this.room().phase;
    return (p === 'team' && this.g.isLeader()) || (p === 'assassin' && this.isAssassin());
  });
  protected readonly limit = computed(() => (this.room().phase === 'assassin' ? 1 : this.size()));
  protected readonly myRoleInfo = computed(() => (this.g.myRole() ? ROLES[this.g.myRole()!] : null));
  protected readonly knownList = computed(() => {
    const out: { name: string; label: 'spy' | 'merlin?' }[] = [];
    for (const [id, label] of this.g.known()) out.push({ name: this.nameOf(id), label });
    return out;
  });
  protected readonly myTurn = computed(() => {
    const r = this.room();
    if (!this.g.me()) return false;
    switch (r.phase) {
      case 'team': return this.g.isLeader();
      case 'vote': return !this.hasVoted();
      case 'mission': return this.onTeam() && !this.hasActed();
      case 'assassin': return this.isAssassin();
      default: return false;
    }
  });
  protected readonly iWon = computed(() => !!this.room().winner && this.room().winner === this.mySide());
  protected readonly votesReversed = computed(() => [...this.room().vote_history].reverse());
  protected readonly logReversed = computed(() => [...this.room().log].reverse());
  protected readonly resultWins = computed(() => this.room().results.filter((r) => r.success).length);
  protected readonly resultLosses = computed(() => this.room().results.filter((r) => !r.success).length);

  private seenVotes = this.g.room()?.vote_history.length ?? 0;
  private seenResults = this.g.room()?.results.length ?? 0;
  private prevRole: RoleKey | null = null;
  private prevTurn = false;
  private finishedHandled = this.g.room()?.phase === 'finished';
  private voteTimer: ReturnType<typeof setTimeout> | undefined;
  private missionTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // limpa seleção ao mudar de fase / rodada / tentativa
    effect(() => {
      const r = this.room();
      void r.phase; void r.round; void r.reject_count;
      untracked(() => this.selection.set(new Set()));
    });

    // revela o papel quando ele chega
    effect(() => {
      const role = this.g.myRole();
      untracked(() => {
        if (role && !this.prevRole) this.showRole.set(true);
        this.prevRole = role;
      });
    });

    // resultado da votação
    effect(() => {
      const hist = this.room().vote_history;
      untracked(() => {
        if (hist.length > this.seenVotes) {
          const last = hist[hist.length - 1];
          this.voteReveal.set(last);
          last.approved ? this.sound.approved() : this.sound.rejected();
          clearTimeout(this.voteTimer);
          this.voteTimer = setTimeout(() => this.voteReveal.set(null), 7000);
        }
        this.seenVotes = hist.length;
      });
    });

    // resultado da missão
    effect(() => {
      const results = this.room().results;
      untracked(() => {
        if (results.length > this.seenResults) {
          const result = results[results.length - 1];
          const cards = Array.from({ length: result.size }, (_, i) => i >= result.fails);
          for (let i = cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cards[i], cards[j]] = [cards[j], cards[i]];
          }
          this.missionReveal.set({ result, cards });
          result.success ? this.sound.missionSuccess() : this.sound.missionFail();
          clearTimeout(this.missionTimer);
          this.missionTimer = setTimeout(() => this.missionReveal.set(null), 5000);
        }
        this.seenResults = results.length;
      });
    });

    // aviso de "sua vez"
    effect(() => {
      const turn = this.myTurn();
      untracked(() => {
        if (turn && !this.prevTurn) this.sound.ping();
        this.prevTurn = turn;
        document.title = turn ? '🔔 Sua vez! — A Resistência' : 'A Resistência';
      });
    });

    // fim de jogo
    effect(() => {
      const finished = this.room().phase === 'finished';
      untracked(() => {
        if (finished && !this.finishedHandled) {
          this.finishedHandled = true;
          setTimeout(() => (this.iWon() ? this.sound.win() : this.sound.lose()), 1200);
        }
        if (!finished) this.finishedHandled = false;
      });
    });
  }

  protected nameOf(id: string): string {
    return this.g.players().find((p) => p.id === id)?.name ?? '?';
  }

  protected teamSizeOf(round: number): number { return teamSize(this.n(), round); }

  protected resultFor(round: number): MissionResult | undefined {
    return this.room().results.find((r) => r.round === round);
  }

  protected toggle(id: string): void {
    if (!this.selecting()) return;
    const next = new Set(this.selection());
    if (this.room().phase === 'assassin') {
      if (id === this.myId()) return;
      next.clear();
      next.add(id);
    } else if (next.has(id)) {
      next.delete(id);
    } else if (next.size < this.limit()) {
      next.add(id);
    }
    this.selection.set(next);
  }

  protected async propose(): Promise<void> {
    await this.g.proposeTeam([...this.selection()]);
  }

  protected async strike(): Promise<void> {
    const [target] = [...this.selection()];
    if (target) await this.g.assassinate(target);
  }

  protected setTab(t: Tab): void { this.tab.set(t); }

  protected async leave(): Promise<void> {
    this.confirmLeave.set(false);
    await this.g.leave();
  }

  protected voteEntries(v: VoteRecord): { name: string; ok: boolean }[] {
    return this.g.sorted().map((p) => ({ name: p.name, ok: !!v.votes[p.id] }));
  }

  protected teamNames(v: VoteRecord): string { return v.team.map((id) => this.nameOf(id)).join(', '); }

  protected approvals(v: VoteRecord): number {
    return Object.values(v.votes).filter(Boolean).length;
  }

  protected revealRole(id: string): RoleKey | null {
    return this.room().reveal?.[id] ?? null;
  }
}
