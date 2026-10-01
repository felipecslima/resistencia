import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { GameService } from './game.service';
import { ChatPanel } from './chat-panel';
import { RulesButton } from './rules';
import { MissionResult, RoleKey, VoteRecord, needsTwoFails, spyCount, teamSize } from './models';
import { AudioService } from './mc/audio.service';
import { FxService } from './mc/fx.service';
import { HubVm, RoundTable, SeatVm, VerdictVm } from './mc/round-table';
import { ReleasePipeline } from './mc/release-pipeline';
import { BuildReveal, HoloCard, KnownVm, OpeningSequence, PostMortem, PostMortemVm, TimelineVm } from './mc/overlays';
import { Icon, RoleEmblem } from './mc/ui';
import { COL, ROLE_UI, Side, hhmm, logText, reasonText, sideCol, sideOf, tension, winnerSide } from './mc/theme';

type SideTab = 'chat' | 'reviews' | 'log';
/** Momentos tocados em fila, um por vez, para nunca sobrepor overlays. */
type Moment =
  | { kind: 'opening' }
  | { kind: 'role'; first: boolean }
  | { kind: 'vote'; rec: VoteRecord }
  | { kind: 'build'; result: MissionResult; cards: boolean[] }
  | { kind: 'end'; animate: boolean };
interface VoteShow { rec: VoteRecord; order: { id: string; ok: boolean }[]; step: number; verdict: boolean; }

@Component({
  selector: 'app-game',
  imports: [ChatPanel, RulesButton, RoundTable, ReleasePipeline, OpeningSequence, HoloCard, BuildReveal, PostMortem, Icon, RoleEmblem],
  templateUrl: './game.html',
  styleUrl: './game.scss',
})
export class Game {
  protected readonly g = inject(GameService);
  protected readonly audio = inject(AudioService);
  protected readonly fx = inject(FxService);
  protected readonly col = COL;
  protected readonly rejectDots = [1, 2, 3, 4, 5];

  private readonly table = viewChild(RoundTable);
  private readonly shakeEl = viewChild.required<ElementRef<HTMLElement>>('shake');

  protected readonly tab = signal<SideTab>('reviews');
  protected readonly selection = signal<ReadonlySet<string>>(new Set());
  protected readonly confirmLeave = signal(false);
  protected readonly audioOpen = signal(false);
  protected readonly current = signal<Moment | null>(null);
  protected readonly voteShow = signal<VoteShow | null>(null);
  /** Quantos votos/resultados já foram revelados na tela (evita spoiler no histórico e no pipeline). */
  private readonly shownVotes = signal(this.g.room()?.vote_history.length ?? 0);
  private readonly shownResults = signal(this.g.room()?.results.length ?? 0);

  // ---------- estado derivado ----------
  protected readonly room = computed(() => this.g.room()!);
  protected readonly n = computed(() => this.g.players().length);
  protected readonly size = computed(() => teamSize(this.n(), this.room().round));
  protected readonly twoFails = computed(() => needsTwoFails(this.n(), this.room().round));
  protected readonly attempt = computed(() => this.room().reject_count + 1);
  protected readonly myId = computed(() => this.g.me()?.id ?? '');
  protected readonly myRole = computed<RoleKey>(() => this.g.myRole() ?? 'resistance');
  protected readonly mySide = computed<Side>(() => sideOf(this.g.myRole()));
  protected readonly myRoleName = computed(() => ROLE_UI[this.myRole()].name);
  protected readonly fin = computed(() => this.room().phase === 'finished');
  protected readonly onTeam = computed(() => this.room().team.includes(this.myId()));
  protected readonly hasVoted = computed(() => this.room().voted.includes(this.myId()));
  protected readonly hasActed = computed(() => this.room().acted.includes(this.myId()));
  protected readonly isAssassin = computed(() => this.g.myRole() === 'assassin');
  protected readonly leaderName = computed(() => this.g.leader()?.name ?? '');
  protected readonly leaderIndex = computed(() => {
    const vs = this.voteShow(), ps = this.g.sorted();
    if (this.fin()) return -1;
    return vs ? ps.findIndex((p) => p.id === vs.rec.leader) : ps.findIndex((p) => p.seat === this.room().leader_seat);
  });
  protected readonly selecting = computed(() => {
    const p = this.room().phase, busy = !!this.voteShow() || !!this.current();
    return !busy && ((p === 'team' && this.g.isLeader()) || (p === 'assassin' && this.isAssassin()));
  });
  private readonly limit = computed(() => (this.room().phase === 'assassin' ? 1 : this.size()));
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
  protected readonly knownList = computed<KnownVm[]>(() => [...this.g.known()].map(([id, label]) => ({ name: this.nameOf(id), label })));
  protected readonly visibleResults = computed(() => this.room().results.slice(0, this.shownResults()));

  protected readonly seats = computed<SeatVm[]>(() => {
    const r = this.room(), ps = this.g.sorted(), vs = this.voteShow(), sel = this.selection(), known = this.g.known(), online = this.g.online();
    const fin = this.fin(), assassin = r.phase === 'assassin', selecting = this.selecting();
    const showTeam = !!vs || r.phase === 'vote' || r.phase === 'mission';
    const team = vs ? vs.rec.team : r.team;
    const li = this.leaderIndex();
    const wireCol = assassin ? COL.s : showTeam ? COL.d : COL.a;
    return ps.map((p, i) => {
      const me = p.id === this.myId(), picked = sel.has(p.id), inPr = showTeam && team.includes(p.id), lead = i === li, on = online.has(p.id);
      const mark = known.get(p.id) ?? null, rr = fin ? (r.reveal?.[p.id] ?? null) : null;
      let ring = 'oklch(0.5 0.025 250)', glow = 0, rw = 3;
      if (inPr) { ring = COL.d; glow = 10; rw = 5; }
      if (picked) { ring = assassin ? COL.s : COL.a; glow = 16; rw = 6; }
      if (lead) { if (!picked && !inPr) ring = COL.a; glow = Math.max(glow, 8); }
      const vi = vs ? vs.order.findIndex((o) => o.id === p.id) : -1;
      let tag = '', tagC: string = COL.d;
      if (vs && vi >= 0 && vi < vs.step) { const ok = vs.order[vi].ok; tag = ok ? '✓ approve' : '✗ changes'; tagC = ok ? COL.d : COL.s; }
      else if (!vs && r.phase === 'vote' && r.voted.includes(p.id)) { tag = 'review enviado'; tagC = COL.a; }
      else if (!vs && r.phase === 'mission' && r.acted.includes(p.id)) { tag = 'commit feito'; tagC = COL.a; }
      else if (rr) { tag = ROLE_UI[rr].name; tagC = sideCol(ROLE_UI[rr].side); }
      else if (!on) { tag = 'offline'; tagC = 'oklch(0.72 0.015 250)'; }
      else if (me) { tag = 'você'; tagC = 'oklch(0.85 0.015 250)'; }
      return {
        id: p.id, name: p.name, me, lead, picked, ring, glow, rw, mark, tag, tagC,
        scale: picked ? 1.1 : vs && vi === vs.step - 1 ? 1.12 : 1,
        dim: (assassin && this.isAssassin() && me) || !on,
        disabled: !selecting || (assassin && me), selectable: selecting,
        wire: picked || inPr ? wireCol : null,
        aria: `${p.name}${me ? ' (você)' : ''}${lead ? ', lead' : ''}${inPr ? ', no PR' : ''}${picked ? ', selecionado' : ''}${mark === 'spy' ? ', sabotador conhecido' : mark ? ', Tech Lead?' : ''}${rr ? ', ' + ROLE_UI[rr].name : ''}${on ? '' : ', offline'}`,
      };
    });
  });

  protected readonly hub = computed<HubVm>(() => {
    const r = this.room(), vs = this.voteShow();
    if (vs) { const ap = vs.order.slice(0, vs.step).filter((o) => o.ok).length; return { k: 'code review', v: `${ap}·${vs.step - ap}`, s: 'approve · changes', c: COL.ink }; }
    switch (r.phase) {
      case 'vote': return { k: `PR #${r.round}.${this.attempt()}`, v: 'REVIEW', s: `${r.voted.length}/${this.n()} reviews`, c: COL.d };
      case 'mission': return { k: `release ${r.round}`, v: 'BUILD', s: `${r.acted.length}/${r.team.length} commits`, c: COL.d };
      case 'assassin': return { k: 'headhunt', v: '?', s: 'quem é o Tech Lead?', c: COL.s };
      case 'finished': { const d = r.winner === 'resistance'; return { k: 'merge', v: d ? 'SHIP' : 'FAIL', s: d ? 'time venceu' : 'sabotadores venceram', c: d ? COL.d : COL.s }; }
      default: return { k: `release ${r.round}`, v: this.g.isLeader() ? `${this.selection().size}/${this.size()}` : `${this.size()}`, s: 'devs no PR', c: COL.a };
    }
  });

  protected readonly verdict = computed<VerdictVm | null>(() => {
    const vs = this.voteShow();
    if (!vs?.verdict) return null;
    const ap = vs.order.filter((o) => o.ok).length;
    return { approved: vs.rec.approved, t: vs.rec.approved ? 'PR aprovado' : 'Mudanças pedidas', s: `${ap} approve · ${vs.order.length - ap} changes` };
  });

  protected readonly banner = computed(() => {
    const r = this.room(), L = this.leaderName(), size = this.size();
    if (this.voteShow()) return { head: 'Code review', text: `revelando os votos do PR de ${this.nameOf(this.voteShow()!.rec.leader)}…`, mine: false, hc: COL.a };
    switch (r.phase) {
      case 'team': return this.g.isLeader()
        ? { head: 'Sua vez de abrir o PR!', text: `Marque ${size} devs para o release ${r.round}.`, mine: true, hc: COL.a }
        : { head: L, text: `está montando o PR do release ${r.round} (${size} devs).`, mine: false, hc: COL.a };
      case 'vote': return !this.hasVoted()
        ? { head: 'Code review:', text: `avalie o PR de ${L}.`, mine: true, hc: COL.a }
        : { head: 'Code review', text: `em andamento no PR de ${L}.`, mine: false, hc: COL.a };
      case 'mission': return this.onTeam() && !this.hasActed()
        ? { head: 'Você está no release!', text: 'Faça seu commit em segredo.', mine: true, hc: COL.a }
        : { head: 'Build rodando…', text: 'a equipe está commitando em segredo.', mine: false, hc: COL.a };
      case 'assassin': return this.isAssassin()
        ? { head: 'O time entregou 3 releases…', text: 'mas você pode virar o jogo: aponte o Tech Lead!', mine: true, hc: COL.s }
        : { head: 'O time entregou 3 releases.', text: 'O Headhunter está procurando o Tech Lead…', mine: false, hc: COL.s };
      default: { const d = r.winner === 'resistance'; return { head: d ? 'O time venceu!' : 'Os sabotadores venceram!', text: reasonText(r.win_reason) + '.', mine: false, hc: d ? COL.d : COL.s }; }
    }
  });
  protected readonly live = computed(() => {
    const b = this.banner(), v = this.verdict();
    return `${b.head} ${b.text}`.trim() + (v ? ` ${v.t}.` : '');
  });

  protected readonly reviews = computed(() => {
    const ps = this.g.sorted();
    return this.room().vote_history.slice(0, this.shownVotes()).map((h) => {
      const ap = Object.values(h.votes).filter(Boolean).length, total = Object.keys(h.votes).length;
      return {
        title: `PR #${h.round}.${h.attempt}`, approved: h.approved, chip: `${h.approved ? 'Aprovado' : 'Mudanças'} ${ap}x${total - ap}`,
        sub: `Lead ${this.nameOf(h.leader)} · ${h.team.map((id) => this.nameOf(id)).join(', ')}`,
        votes: ps.filter((p) => p.id in h.votes).map((p) => ({ name: p.name, ok: !!h.votes[p.id] })),
      };
    }).reverse();
  });
  protected readonly logList = computed(() => [...this.room().log].reverse().map((l) => ({ h: hhmm(l.t), m: logText(l.m) })));

  protected readonly postMortem = computed<PostMortemVm | null>(() => {
    const r = this.room(), w = winnerSide(r.winner);
    if (!w) return null;
    const ps = this.g.sorted(), role = (id: string): RoleKey => r.reveal?.[id] ?? 'resistance', side = (id: string) => ROLE_UI[role(id)].side;
    const hist = r.vote_history;
    let moment = '';
    const saved = [...hist].reverse().find((h) => !h.approved && h.team.some((id) => side(id) === 's'));
    const broke = r.results.find((x) => !x.success);
    if (w === 'd' && saved) {
      const sab = saved.team.filter((id) => side(id) === 's');
      moment = `O review que salvou o time: PR #${saved.round}.${saved.attempt} foi barrado, e ${sab.map((id) => this.nameOf(id)).join(' e ')} ${sab.length > 1 ? 'eram sabotadores' : 'era sabotador'}.`;
    } else if (w === 's' && broke) {
      const h = [...hist].reverse().find((x) => x.approved && x.round === broke.round);
      if (h) moment = `O approve que derrubou produção: o PR #${h.round}.${h.attempt} passou com ${Object.values(h.votes).filter(Boolean).length} votos e levou ${broke.fails} ${broke.fails === 1 ? 'bug' : 'bugs'} para o release ${broke.round}.`;
    }
    const timeline: TimelineVm[] = [];
    for (const h of hist) {
      const ap = Object.values(h.votes).filter(Boolean).length, total = Object.keys(h.votes).length;
      timeline.push({ k: `PR #${h.round}.${h.attempt}`, t: `${this.nameOf(h.leader)} → ${h.team.map((id) => this.nameOf(id)).join(', ')} · ${h.approved ? 'aprovado' : 'mudanças'} ${ap}x${total - ap}`, c: h.approved ? 'oklch(0.85 0.015 250)' : COL.s, dia: false, fill: false });
      const res = r.results.find((x) => x.round === h.round);
      if (h.approved && res) timeline.push({ k: `build R${res.round}`, t: res.success ? 'verde' : `quebrado · ${res.fails} ${res.fails === 1 ? 'bug' : 'bugs'}`, c: res.success ? COL.d : COL.s, dia: !res.success, fill: true });
    }
    return {
      winner: w, won: this.mySide() === w, reason: reasonText(r.win_reason), moment, timeline,
      dossier: ps.map((p) => ({ id: p.id, name: p.name + (p.id === this.myId() ? ' (você)' : ''), role: role(p.id) })),
    };
  });

  // ---------- fila de momentos ----------
  private queue: Moment[] = [];
  private readonly timers: ReturnType<typeof setTimeout>[] = [];
  private later(fn: () => void, ms: number): void { this.timers.push(setTimeout(fn, ms)); }
  private push(m: Moment): void { this.queue.push(m); if (!this.current() && !this.voteShow()) this.next(); }
  protected next(): void {
    const m = this.queue.shift() ?? null;
    this.current.set(m?.kind === 'vote' ? null : m);
    if (m?.kind === 'vote') this.playVote(m.rec);
    if (!m && this.myTurn()) { this.audio.ping(); this.fx.vib([20, 40, 20]); }
  }

  constructor() {
    const r0 = this.g.room();
    let prevRole: RoleKey | null = null, prevPhase = r0?.phase, prevTurn = true;
    let seenVotes = r0?.vote_history.length ?? 0, seenResults = r0?.results.length ?? 0, endHandled = r0?.phase === 'finished';
    if (endHandled) this.queue.push({ kind: 'end', animate: false });

    afterNextRender(() => { this.fx.shakeEl = this.shakeEl().nativeElement; });
    inject(DestroyRef).onDestroy(() => {
      this.timers.forEach(clearTimeout); this.audio.stopHeart(); this.fx.shakeEl = null; document.title = 'Merge Conflict';
    });

    effect(() => this.fx.tension.set(tension(this.g.room())));

    // limpa seleção ao mudar de fase / rodada / tentativa
    effect(() => { const r = this.room(); void r.phase; void r.round; void r.reject_count; untracked(() => this.selection.set(new Set())); });

    // papel chegou: abertura completa numa partida nova; só a carta numa reconexão
    effect(() => {
      const role = this.g.myRole();
      untracked(() => {
        if (role && !prevRole) {
          const r = this.room(), fresh = r.round === 1 && r.vote_history.length === 0 && r.phase === 'team';
          if (fresh) this.push({ kind: 'opening' });
          this.push({ kind: 'role', first: fresh });
        }
        prevRole = role;
      });
    });

    // PR aberto (team → vote): trava, flash âmbar e onda de choque
    effect(() => {
      const ph = this.room().phase;
      untracked(() => {
        if (prevPhase === 'team' && ph === 'vote') {
          this.audio.lock(); this.fx.vib([15, 30, 50]); this.fx.flash(COL.a);
          requestAnimationFrame(() => { const c = this.fx.center(this.table()?.hubEl()); this.fx.wave(c.x, c.y, COL.a, 220); });
        }
        prevPhase = ph;
      });
    });

    effect(() => {
      const hist = this.room().vote_history;
      untracked(() => { for (let i = seenVotes; i < hist.length; i++) this.push({ kind: 'vote', rec: hist[i] }); seenVotes = hist.length; });
    });

    effect(() => {
      const results = this.room().results;
      untracked(() => {
        for (let i = seenResults; i < results.length; i++) {
          const result = results[i], cards = Array.from({ length: result.size }, (_, k) => k >= result.fails);
          for (let k = cards.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [cards[k], cards[j]] = [cards[j], cards[k]]; }
          this.push({ kind: 'build', result, cards });
        }
        seenResults = results.length;
      });
    });

    effect(() => {
      const finished = this.fin();
      untracked(() => {
        if (finished && !endHandled) { endHandled = true; this.push({ kind: 'end', animate: true }); }
        if (!finished) endHandled = false;
      });
    });

    // "sua vez": som + vibração + título da aba (fora de overlays)
    effect(() => {
      const turn = this.myTurn(), busy = !!this.current() || !!this.voteShow();
      untracked(() => {
        if (turn && !prevTurn && !busy) { this.audio.ping(); this.fx.vib([20, 40, 20]); }
        prevTurn = turn;
        document.title = turn ? '● Sua vez — Merge Conflict' : 'Merge Conflict';
      });
    });

    if (this.queue.length) this.next();
  }

  // ---------- momentos ----------
  private playVote(rec: VoteRecord): void {
    const order = this.g.sorted().filter((p) => p.id in rec.votes).map((p) => ({ id: p.id, ok: !!rec.votes[p.id] }));
    this.voteShow.set({ rec, order, step: 0, verdict: false });
    const gap = this.fx.full() ? 360 : 240;
    order.forEach((v, i) => this.later(() => {
      const t = this.table();
      this.fx.pulse(t?.seatEl(v.id) ?? null, t?.hubEl() ?? null, v.ok);
      this.audio.pulse(i, v.ok);
      this.voteShow.update((s) => (s ? { ...s, step: i + 1 } : s));
    }, 300 + i * gap));
    const tv = 300 + order.length * gap + 500;
    this.later(() => {
      this.voteShow.update((s) => (s ? { ...s, verdict: true } : s));
      const c = this.fx.center(this.table()?.hubEl());
      if (rec.approved) { this.audio.approved(); this.fx.wave(c.x, c.y, COL.d, 300); this.fx.burst(c.x, c.y, 'rgba(110,225,235,.95)', 50); this.fx.vib(40); }
      else { this.audio.rejected(); this.fx.shake(1); this.fx.wave(c.x, c.y, COL.s, 300); this.fx.noise(500); this.fx.vib([60, 40, 60]); }
    }, tv);
    this.later(() => { this.voteShow.set(null); this.shownVotes.update((x) => x + 1); this.next(); }, tv + 2400);
  }

  protected onDeal(): void {
    const t = this.table();
    const dur = t ? this.fx.deal(t.hubEl(), this.g.sorted().map((p) => t.seatEl(p.id))) : 0;
    this.later(() => this.next(), dur + 900);
  }
  protected buildClosed(): void { this.shownResults.update((x) => x + 1); this.next(); }
  protected openRole(): void { this.audio.ui(); if (!this.current()) this.push({ kind: 'role', first: false }); }
  protected openEnd(): void { if (!this.current()) this.push({ kind: 'end', animate: false }); }

  // ---------- ações ----------
  protected nameOf(id: string): string { return this.g.players().find((p) => p.id === id)?.name ?? '?'; }
  protected spies(): number { return spyCount(this.n()); }

  protected toggle(id: string): void {
    if (!this.selecting()) return;
    const next = new Set(this.selection());
    if (this.room().phase === 'assassin') {
      if (id === this.myId()) return;
      next.clear(); next.add(id); this.audio.select(0);
    } else if (next.has(id)) { next.delete(id); this.audio.ui(); }
    else if (next.size < this.limit()) { next.add(id); this.audio.select(next.size - 1); this.fx.vib(10); }
    this.selection.set(next);
  }
  protected propose(): void { void this.g.proposeTeam([...this.selection()]); }
  protected vote(ok: boolean): void { this.audio.vote(); this.fx.vib(15); void this.g.vote(ok); }
  protected commit(ok: boolean): void { this.audio.vote(); this.fx.vib(15); void this.g.playMission(ok); }
  protected strike(): void { const [t] = [...this.selection()]; if (t) void this.g.assassinate(t); }
  protected replay(): void { this.current.set(null); void this.g.reset(); }
  /** Host encerra a partida travada (ex.: jogador caiu) e todos voltam ao lobby, onde dá para removê-lo. */
  protected abort(): void { this.confirmLeave.set(false); this.replay(); }
  protected async leave(): Promise<void> { this.confirmLeave.set(false); await this.g.leave(); }

  protected setTab(t: SideTab): void { this.audio.ui(); this.tab.set(t); }
  protected toggleAudio(): void { this.audio.ui(); this.audioOpen.update((v) => !v); }
  protected onMusic(e: Event): void { this.audio.set({ music: +(e.target as HTMLInputElement).value / 100 }); }
  protected onSfx(e: Event): void { this.audio.set({ sfx: +(e.target as HTMLInputElement).value / 100 }); this.audio.ui(); }
  protected toggleFx(): void { this.fx.toggleReduced(); this.audio.ui(); }
}
