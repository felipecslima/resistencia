import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { RealtimeChannel, SupabaseClient, createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './supabase.config';
import { ChatMessage, MyView, Player, Room, RoomOptions } from './models';

const DEFAULT_OPTIONS: RoomOptions = { merlin: true, percival: false, mordred: false, oberon: false };

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  private channel: RealtimeChannel | null = null;
  private errorTimer: ReturnType<typeof setTimeout> | undefined;

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

  private async rejoinLast(): Promise<void> {
    const { data } = await this.sb.from('rooms').select('*').neq('phase', 'finished')
      .order('created_at', { ascending: false }).limit(1);
    const r = (data as Room[] | null)?.[0];
    if (r) await this.enterRoom(r.id);
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
    } else {
      this.resumable.set(true);
    }
    this.exitRoom();
  }

  /** Sai da tela sem deixar a sala (útil durante a partida: dá para voltar). */
  exitRoom(): void {
    void this.channel?.unsubscribe();
    this.channel = null;
    this.room.set(null);
    this.players.set([]);
    this.messages.set([]);
    this.view.set(null);
    this.online.set(new Set());
    this.unread.set(0);
  }

  async resume(): Promise<void> {
    this.busy.set(true);
    try { await this.rejoinLast(); this.resumable.set(false); } finally { this.busy.set(false); }
  }

  kick(playerId: string) { return this.rpc('kick_player', { p_room: this.rid(), p_player: playerId }); }
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

  private async enterRoom(roomId: string): Promise<void> {
    void this.channel?.unsubscribe();
    this.room.set(null);
    this.players.set([]);
    this.messages.set([]);
    this.unread.set(0);
    await this.syncAll(roomId);
    if (!this.room()) return;
    this.subscribe(roomId);
  }

  private async syncAll(roomId: string): Promise<void> {
    const [r, p, m] = await Promise.all([
      this.sb.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      this.sb.from('players').select('*').eq('room_id', roomId),
      this.sb.from('messages').select('*').eq('room_id', roomId).order('id', { ascending: true }).limit(200),
    ]);
    if (r.error) return this.fail(r.error);
    if (!r.data) { this.exitRoom(); return; }
    this.room.set(r.data as Room);
    this.players.set((p.data as Player[]) ?? []);
    this.messages.set((m.data as ChatMessage[]) ?? []);
  }

  private subscribe(roomId: string): void {
    const myPlayer = this.me();
    const ch = this.sb.channel(`room:${roomId}`, { config: { presence: { key: myPlayer?.id ?? this.userId() ?? 'anon' } } });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
      if (payload.eventType === 'DELETE') { this.exitRoom(); return; }
      this.room.set(payload.new as Room);
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, async () => {
      const { data } = await this.sb.from('players').select('*').eq('room_id', roomId);
      if (data) this.players.set(data as Player[]);
      // fui removido da sala?
      if (data && !data.some((p: Player) => p.user_id === this.userId())) this.exitRoom();
    });
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload) => {
      const msg = payload.new as ChatMessage;
      this.messages.update((list) => (list.some((x) => x.id === msg.id) ? list : [...list, msg]));
      if (msg.player_id !== this.me()?.id) this.unread.update((n) => n + 1);
    });
    ch.on('presence', { event: 'sync' }, () => {
      this.online.set(new Set(Object.keys(ch.presenceState())));
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ at: Date.now() });
        await this.syncAll(roomId); // garante estado correto após (re)conexão
        const r = this.room();
        if (r && r.phase !== 'lobby') void this.loadView(roomId);
      }
    });
    this.channel = ch;
  }

  private async loadView(roomId: string): Promise<void> {
    const { data, error } = await this.sb.rpc('get_my_view', { p_room: roomId });
    if (error) return;
    if (this.room()?.id === roomId) this.view.set(data as MyView);
  }
}
