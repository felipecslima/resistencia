import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { RealtimeChannel, SupabaseClient, createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './supabase.config';
import { ChatMessage, MyView, Player, Room, RoomOptions } from './models';

const DEFAULT_OPTIONS: RoomOptions = { merlin: true, percival: false, mordred: false, oberon: false };
const LAST_ROOM_KEY = 'resistencia.room';

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  private channel: RealtimeChannel | null = null;
  private errorTimer: ReturnType<typeof setTimeout> | undefined;
  /** Muda a cada entrada/saída de sala: respostas assíncronas de uma sala antiga são descartadas. */
  private epoch = 0;

  readonly ready = signal(false);
  readonly initError = signal<string | null>(null);
  readonly connecting = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly userId = signal<string | null>(null);

  readonly room = signal<Room | null>(null);
  readonly players = signal<Player[]>([]);
  readonly messages = signal<ChatMessage[]>([]);
  readonly view = signal<MyView | null>(null);
  readonly online = signal<ReadonlySet<string>>(new Set());
  readonly unread = signal(0);
  readonly resumable = signal(false);

  readonly me = computed(() => this.players().find((p) => p.user_id === this.userId()) ?? null);
  readonly sorted = computed(() => [...this.players()].sort((a, b) => a.seat - b.seat));
  readonly isHost = computed(() => !!this.room() && this.room()!.host_user === this.userId());
  readonly leader = computed(() => {
    const r = this.room();
    return r && r.phase !== 'lobby' ? (this.sorted().find((p) => p.seat === r.leader_seat) ?? null) : null;
  });
  readonly isLeader = computed(() => !!this.me() && this.leader()?.id === this.me()!.id);
  readonly myRole = computed(() => this.view()?.role ?? null);
  readonly known = computed(() => {
    const map = new Map<string, 'spy' | 'merlin?'>();
    for (const k of this.view()?.known ?? []) map.set(k.player_id, k.label);
    return map;
  });
  private readonly viewKey = computed(() => {
    const r = this.room();
    return r ? `${r.id}:${r.phase === 'lobby' ? 'lobby' : 'game'}` : '';
  });

  constructor() {
    effect(() => {
      const key = this.viewKey();
      untracked(() => {
        const r = this.room();
        if (r && r.phase !== 'lobby') void this.loadView(r.id);
        else this.view.set(null);
        if (!key) this.view.set(null);
      });
    });
  }

  // ---------- inicialização / reconexão ----------
  async init(): Promise<void> {
    this.connecting.set(true);
    this.initError.set(null);
    try {
      let { data: { session } } = await this.sb.auth.getSession();
      if (!session) {
        const { data, error } = await this.sb.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      this.userId.set(session?.user.id ?? null);
      this.ready.set(true);
      await this.rejoinLast();
    } catch (e) {
      this.initError.set((e as { message?: string } | null)?.message ?? 'Erro desconhecido');
      this.fail(e, 'Não foi possível conectar.');
    } finally {
      this.connecting.set(false);
    }
  }

  /** Volta para a sala do convite (se já sou membro), senão para a última sala usada. */
  private async rejoinLast(useInvite = true): Promise<void> {
    const { data } = await this.sb.from('rooms').select('id, code').neq('phase', 'finished')
      .order('created_at', { ascending: false }).limit(20);
    const rooms = (data as Pick<Room, 'id' | 'code'>[] | null) ?? [];
    if (!rooms.length) return;
    const invite = useInvite ? (new URLSearchParams(location.search).get('sala')?.toUpperCase().slice(0, 5) ?? '') : '';
    if (invite) {
      // convite para outra sala: fica na home com o código preenchido, mas dá para voltar
      const r = rooms.find((x) => x.code === invite);
      if (r) await this.enterRoom(r.id); else this.resumable.set(true);
      return;
    }
    const last = this.lastRoom();
    await this.enterRoom((rooms.find((x) => x.id === last) ?? rooms[0]).id);
  }

  private lastRoom(): string | null { try { return localStorage.getItem(LAST_ROOM_KEY); } catch { return null; } }
  private saveLastRoom(id: string | null): void {
    try { if (id) localStorage.setItem(LAST_ROOM_KEY, id); else localStorage.removeItem(LAST_ROOM_KEY); } catch { /* ignora */ }
  }

  // ---------- ações ----------
  async create(name: string, options: RoomOptions = DEFAULT_OPTIONS): Promise<void> {
    const res = await this.rpc<{ room_id: string }>('create_room', { p_name: name, p_options: options });
    if (res) await this.enterRoom(res.room_id);
  }

  async join(code: string, name: string): Promise<void> {
    const res = await this.rpc<{ room_id: string }>('join_room', { p_code: code, p_name: name });
    if (res) await this.enterRoom(res.room_id);
  }

  async leave(): Promise<void> {
    const r = this.room();
    if (!r) return;
    if (r.phase === 'lobby' || r.phase === 'finished') {
      const ok = await this.rpc('leave_room', { p_room: r.id });
      if (ok === undefined) return;
      this.resumable.set(false);
      this.saveLastRoom(null);
    } else {
      this.resumable.set(true);
    }
    this.exitRoom();
  }

  /** Sai da tela sem deixar a sala (útil durante a partida: dá para voltar). */
  exitRoom(): void {
    this.dropChannel();
    this.room.set(null);
    this.players.set([]);
    this.messages.set([]);
    this.view.set(null);
    this.online.set(new Set());
    this.unread.set(0);
  }

  async resume(): Promise<void> {
    this.busy.set(true);
    try { await this.rejoinLast(false); this.resumable.set(false); } finally { this.busy.set(false); }
  }

  async kick(playerId: string): Promise<void> {
    const ok = await this.rpc('kick_player', { p_room: this.rid(), p_player: playerId });
    // não depende do realtime: o evento de DELETE pode não chegar
    if (ok !== undefined) this.players.update((list) => list.filter((p) => p.id !== playerId));
  }
  updateOptions(o: RoomOptions) { return this.rpc('update_options', { p_room: this.rid(), p_options: o }); }
  start() { return this.rpc('start_game', { p_room: this.rid() }); }
  reset() { return this.rpc('reset_room', { p_room: this.rid() }); }
  proposeTeam(ids: string[]) { return this.rpc('propose_team', { p_room: this.rid(), p_team: ids }); }
  vote(approve: boolean) { return this.rpc('cast_vote', { p_room: this.rid(), p_approve: approve }); }
  playMission(success: boolean) { return this.rpc('play_mission', { p_room: this.rid(), p_success: success }); }
  assassinate(target: string) { return this.rpc('assassinate', { p_room: this.rid(), p_target: target }); }
  async sendMessage(body: string): Promise<void> {
    await this.rpc('send_message', { p_room: this.rid(), p_body: body }, false);
  }

  dismissError(): void { this.error.set(null); }

  // ---------- internos ----------
  private rid(): string { return this.room()?.id ?? ''; }

  private async rpc<T = unknown>(fn: string, args: object, showBusy = true): Promise<T | undefined> {
    if (showBusy) this.busy.set(true);
    try {
      const { data, error } = await this.sb.rpc(fn, args);
      if (error) throw error;
      return (data ?? true) as T;
    } catch (e) {
      this.fail(e);
      return undefined;
    } finally {
      if (showBusy) this.busy.set(false);
    }
  }

  private fail(e: unknown, fallback = 'Algo deu errado.'): void {
    const msg = (e as { message?: string } | null)?.message || fallback;
    this.error.set(msg);
    clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => this.error.set(null), 6000);
  }

  private dropChannel(): void {
    this.epoch++;
    if (this.channel) void this.sb.removeChannel(this.channel);
    this.channel = null;
  }

  private async enterRoom(roomId: string): Promise<void> {
    this.dropChannel();
    this.room.set(null);
    this.players.set([]);
    this.messages.set([]);
    this.unread.set(0);
    const epoch = this.epoch;
    await this.syncAll(roomId);
    if (epoch !== this.epoch || !this.room()) return;
    this.saveLastRoom(roomId);
    this.subscribe(roomId);
  }

  private async syncAll(roomId: string): Promise<void> {
    const epoch = this.epoch;
    const [r, p, m] = await Promise.all([
      this.sb.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      this.sb.from('players').select('*').eq('room_id', roomId),
      // as 200 mais recentes, exibidas em ordem cronológica
      this.sb.from('messages').select('*').eq('room_id', roomId).order('id', { ascending: false }).limit(200),
    ]);
    if (epoch !== this.epoch) return;
    if (r.error) return this.fail(r.error);
    if (!r.data) { this.exitRoom(); return; }
    this.room.set(r.data as Room);
    this.players.set((p.data as Player[]) ?? []);
    this.messages.set(((m.data as ChatMessage[]) ?? []).reverse());
  }

  /** Agrupa rajadas de eventos: no máximo uma busca em andamento e uma na fila. */
  private coalesce(fn: () => Promise<void>): () => void {
    let running = false, dirty = false;
    return () => {
      if (running) { dirty = true; return; }
      running = true;
      void (async () => {
        try { do { dirty = false; await fn(); } while (dirty); } finally { running = false; }
      })();
    };
  }

  private subscribe(roomId: string): void {
    const myPlayer = this.me();
    const ch = this.sb.channel(`room:${roomId}`, { config: { presence: { key: myPlayer?.id ?? this.userId() ?? 'anon' } } });
    this.channel = ch;
    const live = () => this.channel === ch;
    // o payload do realtime pode vir sem colunas grandes (TOAST) que não mudaram: sempre rebusca a linha
    const refreshRoom = this.coalesce(async () => {
      const { data, error } = await this.sb.from('rooms').select('*').eq('id', roomId).maybeSingle();
      if (!live() || error) return;
      if (data) this.room.set(data as Room); else this.exitRoom();
    });
    const refreshPlayers = this.coalesce(async () => {
      const { data } = await this.sb.from('players').select('*').eq('room_id', roomId);
      if (!live() || !data) return;
      this.players.set(data as Player[]);
      // fui removido da sala?
      if (!data.some((p: Player) => p.user_id === this.userId())) this.exitRoom();
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
      if (!live()) return;
      // DELETE não respeita o filtro: chega para qualquer sala apagada
      if (payload.eventType === 'DELETE') { if ((payload.old as Partial<Room>).id === roomId) this.exitRoom(); return; }
      refreshRoom();
    });
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, () => {
      if (live()) refreshPlayers();
    });
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, () => {
      if (live()) refreshPlayers();
    });
    // o Realtime não entrega DELETE com filtro (a linha apagada só traz a chave primária):
    // escuta sem filtro e só reage se o jogador apagado é desta sala
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players' }, (payload) => {
      const id = (payload.old as { id?: string }).id;
      if (live() && (!id || this.players().some((p) => p.id === id))) refreshPlayers();
    });
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload) => {
      if (!live()) return;
      const msg = payload.new as ChatMessage;
      this.messages.update((list) => (list.some((x) => x.id === msg.id) ? list : [...list, msg]));
      if (msg.player_id !== this.me()?.id) this.unread.update((n) => n + 1);
    });
    ch.on('presence', { event: 'sync' }, () => {
      if (live()) this.online.set(new Set(Object.keys(ch.presenceState())));
    });
    ch.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED' || !live()) return;
      await ch.track({ at: Date.now() });
      if (!live()) return;
      await this.syncAll(roomId); // garante estado correto após (re)conexão
      if (!live()) return;
      const r = this.room();
      if (r && r.phase !== 'lobby') void this.loadView(roomId);
    });
  }

  private async loadView(roomId: string): Promise<void> {
    const wanted = () => { const r = this.room(); return r?.id === roomId && r.phase !== 'lobby'; };
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((res) => setTimeout(res, 800 * attempt));
      if (!wanted()) return;
      const { data, error } = await this.sb.rpc('get_my_view', { p_room: roomId });
      if (!error) { if (wanted()) this.view.set(data as MyView); return; }
    }
    if (wanted()) this.fail(null, 'Não foi possível carregar seu papel. Recarregue a página.');
  }
}
