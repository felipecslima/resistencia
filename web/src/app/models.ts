export type Phase = 'lobby' | 'team' | 'vote' | 'mission' | 'assassin' | 'finished';
export type RoleKey = 'resistance' | 'merlin' | 'percival' | 'spy' | 'assassin' | 'morgana' | 'mordred' | 'oberon';

export interface RoomOptions {
  merlin: boolean;
  percival: boolean;
  mordred: boolean;
  oberon: boolean;
}

export interface MissionResult { round: number; size: number; fails: number; success: boolean; }
export interface VoteRecord {
  round: number;
  attempt: number;
  leader: string;
  team: string[];
  votes: Record<string, boolean>;
  approved: boolean;
}
export interface LogEntry { t: string; m: string; }

export interface Room {
  id: string;
  code: string;
  host_user: string;
  options: RoomOptions;
  phase: Phase;
  round: number;
  leader_seat: number;
  reject_count: number;
  team: string[];
  voted: string[];
  acted: string[];
  results: MissionResult[];
  vote_history: VoteRecord[];
  log: LogEntry[];
  winner: 'resistance' | 'spies' | null;
  win_reason: string | null;
  reveal: Record<string, RoleKey> | null;
  created_at: string;
}

export interface Player { id: string; room_id: string; user_id: string; name: string; seat: number; }
export interface ChatMessage { id: number; room_id: string; player_id: string; name: string; body: string; created_at: string; }

export interface MyView {
  player_id: string;
  role: RoleKey | null;
  known: { player_id: string; label: 'spy' | 'merlin?' }[];
}

export interface RoleInfo {
  name: string;
  side: 'resistance' | 'spies';
  icon: string;
  blurb: string;
}

export const ROLES: Record<RoleKey, RoleInfo> = {
  resistance: { name: 'Membro da Resistência', side: 'resistance', icon: '✊', blurb: 'Você não sabe quem são os espiões. Descubra pelo comportamento e garanta o sucesso de 3 missões.' },
  merlin: { name: 'Comandante', side: 'resistance', icon: '👁️', blurb: 'Você vê os espiões (menos Mordred). Oriente a Resistência sem se entregar: se o Assassino te achar no fim, os espiões vencem.' },
  percival: { name: 'Vigia', side: 'resistance', icon: '🛡️', blurb: 'Você vê duas pessoas marcadas como "Comandante?": uma é o Comandante de verdade, a outra é a Impostora. Proteja o verdadeiro.' },
  spy: { name: 'Espião', side: 'spies', icon: '🗡️', blurb: 'Você conhece seus aliados espiões. Sabote missões sem ser descoberto.' },
  assassin: { name: 'Assassino', side: 'spies', icon: '🎯', blurb: 'Espião com uma missão extra: se a Resistência vencer 3 missões, você tem uma chance de apontar o Comandante e virar o jogo.' },
  morgana: { name: 'Impostora', side: 'spies', icon: '🎭', blurb: 'Espiã que aparece para o Vigia como se fosse o Comandante. Use isso para confundir.' },
  mordred: { name: 'Mordred', side: 'spies', icon: '👑', blurb: 'Espião que o Comandante não consegue ver.' },
  oberon: { name: 'Oberon', side: 'spies', icon: '🌑', blurb: 'Espião isolado: você não conhece os outros espiões e eles não conhecem você.' },
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;

/** Tamanho das equipes por rodada. Deve bater com `_team_size` no banco (supabase/003). */
export const MISSION_SIZES: Record<number, number[]> = {
  4: [2, 2, 3, 3, 3],
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

export function spyCount(n: number): number { return n <= 4 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : 4; }
export function teamSize(n: number, round: number): number { return (MISSION_SIZES[Math.min(Math.max(n, MIN_PLAYERS), MAX_PLAYERS)])[round - 1]; }
export function needsTwoFails(n: number, round: number): boolean { return n >= 7 && round === 4; }
