import { MissionResult, RoleKey, Room } from '../models';

/** Apresentação "Merge Conflict". Regras, banco e RPCs continuam como resistance/spies. */
export type Side = 'd' | 's';

export const COL = {
  d: 'oklch(0.85 0.12 195)', // time (ciano) · círculo · ✓
  s: 'oklch(0.72 0.19 22)', // sabotagem (coral) · losango · ✗
  a: 'oklch(0.85 0.14 80)', // lead / foco / CTA (âmbar)
  mute: 'oklch(0.5 0.02 250)',
  ink: '#eef0f3',
} as const;

export interface RoleUi { name: string; side: Side; blurb: string; }

export const ROLE_UI: Record<RoleKey, RoleUi> = {
  resistance: { name: 'Dev', side: 'd', blurb: 'Você não sabe quem são os sabotadores. Observe os reviews e entregue 3 releases.' },
  merlin: { name: 'Tech Lead', side: 'd', blurb: 'Você enxerga os sabotadores (menos o Zero-day). Oriente o time sem se expor: se o Headhunter te achar no fim, os sabotadores vencem.' },
  percival: { name: 'QA', side: 'd', blurb: 'Você vê duas pessoas marcadas como "Tech Lead?": uma é o Tech Lead de verdade, a outra é o Impostor. Proteja o verdadeiro.' },
  spy: { name: 'Sabotador', side: 's', blurb: 'Você conhece os outros sabotadores. Plante bugs nos releases sem ser descoberto.' },
  assassin: { name: 'Headhunter', side: 's', blurb: 'Sabotador com uma carta extra: se o time entregar 3 releases, você tem uma chance de apontar o Tech Lead e virar o jogo.' },
  morgana: { name: 'Impostor', side: 's', blurb: 'Sabotador que aparece para o QA como se fosse o Tech Lead. Use isso para confundir.' },
  mordred: { name: 'Zero-day', side: 's', blurb: 'Sabotador que o Tech Lead não consegue enxergar.' },
  oberon: { name: 'Legado', side: 's', blurb: 'Sabotador isolado: você não conhece os outros e eles não conhecem você.' },
};

export const ROLE_ORDER: RoleKey[] = ['resistance', 'merlin', 'percival', 'spy', 'assassin', 'morgana', 'mordred', 'oberon'];

export const sideOf = (r: RoleKey | null | undefined): Side => (r ? ROLE_UI[r].side : 'd');
export const sideCol = (s: Side): string => (s === 'd' ? COL.d : COL.s);
/** 'resistance' | 'spies' (banco) → lado de apresentação */
export const winnerSide = (w: 'resistance' | 'spies' | null): Side | null => (w ? (w === 'resistance' ? 'd' : 's') : null);

export const ICON = {
  ok: 'm6.5 12.5 3.5 3.5 7.5-8',
  no: 'm8 8 8 8m0-8-8 8',
  circ: 'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 1 1 0-19',
  dia: 'M12 1.5 22.5 12 12 22.5 1.5 12Z',
  circOk: 'M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 1 1 0-19 M7.5 12.5l3 3 6-6.5',
  diaNo: 'M12 1.5 22.5 12 12 22.5 1.5 12Z M9 9l6 6m0-6-6 6',
  git: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 9c0 6-12 3-12 9',
  link: 'M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1',
  exit: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
  speaker: 'M4 10v4h4l5 4V6L8 10Z',
  waves: 'M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12',
  mutedX: 'M16 9l5 6m0-6-5 6',
  pulse: 'M3 12h3l2-6 3 12 3-9 2 3h5',
  slash: 'M4 20 20 4',
  plus: 'M12 5v14M5 12h14',
  send: 'M4 12 20 4l-6 16-3-7Z',
} as const;
export type IconName = keyof typeof ICON;

export interface EmblemPath { d: string; w: number; op: number; dash: string; }
const ring = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const P = (d: string, w = 5, op = 1, dash = 'none'): EmblemPath => ({ d, w, op, dash });
const CIRC = P(ring(50, 50, 44), 3, 0.55);
const DIA = P('M50 5 95 50 50 95 5 50Z', 3, 0.55);

/** Emblemas dos papéis (viewBox 0 0 100 100). Time = moldura circular, sabotagem = losango. */
export const EMBLEMS: Record<RoleKey, EmblemPath[]> = {
  resistance: [CIRC, P('M38 36 24 50 38 64M62 36 76 50 62 64'), P('M55 30 45 70', 4, 0.8)],
  merlin: [CIRC, P('M40 30v42'), P('M40 44c0 13 22 7 22 20', 5), P(ring(40, 28, 6), 4), P(ring(62, 68, 6), 4)],
  percival: [CIRC, P(ring(46, 46, 15), 4), P('M57 57 70 70', 5), P('M39 46l5 5 9-10', 4)],
  spy: [DIA, P('M37 37 63 63M63 37 37 63')],
  assassin: [DIA, P(ring(50, 50, 15), 4), P('M50 24v12M50 64v12M24 50h12M64 50h12', 4)],
  morgana: [DIA, P(ring(42, 50, 13), 4), P(ring(58, 50, 13), 4, 1, '5 5')],
  mordred: [P('M50 5 95 50 50 95 5 50Z', 3, 0.55, '7 6'), P('M50 33c-8 0-12 7-12 17s4 17 12 17 12-7 12-17-4-17-12-17Z', 4), P('M41 64 59 36', 4)],
  oberon: [DIA, P('M33 40h34M33 50h26M33 60h16', 4), P(ring(64, 60, 3), 3, 0.7)],
};

export function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export interface SigilData { cells: { x: number; y: number }[]; col: string; hex: string; }
const sigCache = new Map<string, SigilData>();

/** Identicon 5×5 espelhado a partir do hash FNV-1a do nome. */
export function sigil(name: string): SigilData {
  const hit = sigCache.get(name);
  if (hit) return hit;
  const h = fnv(name), h2 = fnv(name + '#'), cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    if ((h >> (y * 3 + x)) & 1) {
      cells.push({ x: 20 + x * 12, y: 20 + y * 12 });
      if (x < 2) cells.push({ x: 20 + (4 - x) * 12, y: 20 + y * 12 });
    }
  }
  if (cells.length < 5) cells.push({ x: 44, y: 32 }, { x: 44, y: 44 }, { x: 44, y: 56 });
  const out = { cells, col: `oklch(0.86 0.09 ${h2 % 360})`, hex: (h2.toString(16) + '0000000').slice(0, 7) };
  sigCache.set(name, out);
  return out;
}

/** Tensão adaptativa 0..1 a partir do estado da sala. */
export function tension(r: Room | null): number {
  if (!r || r.phase === 'lobby') return 0.12;
  const fails = r.results.filter((x: MissionResult) => !x.success).length, wins = r.results.length - fails;
  let t = 0.12 + r.reject_count * 0.13 + fails * 0.17 + Math.max(0, r.round - 3) * 0.1 + (wins === 2 && fails === 2 ? 0.15 : 0);
  if (r.phase === 'assassin') t += 0.25;
  return Math.max(0, Math.min(1, t));
}

export const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const REASONS: Record<string, string> = {
  'cinco equipes rejeitadas seguidas': 'Cinco PRs recusados seguidos: o deadline estourou',
  'três missões falharam': 'Três builds quebraram em produção',
  'três missões bem-sucedidas': 'Três releases entregues',
  'o Assassino encontrou o Comandante': 'O Headhunter contratou o Tech Lead',
  'o Assassino errou o Comandante': 'O Headhunter errou: não era o Tech Lead',
};
export const reasonText = (r: string | null): string => (r ? (REASONS[r] ?? r) : '');

/** Traduz as mensagens do registro (geradas no banco) para o vocabulário da interface. */
export function logText(m: string): string {
  let x: RegExpMatchArray | null;
  if ((x = m.match(/^A partida começou com (\d+) jogadores \((\d+) espi(?:ões|ão)\)\.$/))) return `git merge: ${x[1]} devs, ${x[2]} ${x[2] === '1' ? 'sabotador' : 'sabotadores'} no time.`;
  if ((x = m.match(/^(.+) propôs a equipe: (.+)\.$/))) return `${x[1]} abriu o PR com ${x[2]}.`;
  if ((x = m.match(/^Votação: equipe (APROVADA|REJEITADA) \((\d+) a favor, (\d+) contra\)\.$/))) return `Code review: ${x[1] === 'APROVADA' ? 'PR aprovado' : 'mudanças pedidas'} (${x[2]} approve, ${x[3]} changes).`;
  if ((x = m.match(/^Missão (\d+): (FALHOU|SUCESSO) \((\d+) carta\(s\) de falha\)\.$/))) return `Build do release ${x[1]}: ${x[2] === 'SUCESSO' ? 'verde' : 'quebrado'} (${x[3]} ${x[3] === '1' ? 'bug' : 'bugs'}).`;
  if (m.startsWith('A Resistência completou 3 missões')) return 'O time entregou 3 releases. O Headhunter tem uma última chance de achar o Tech Lead.';
  if ((x = m.match(/^(.+) apontou (.+) como o Comandante\.$/))) return `O Headhunter fez a proposta a ${x[2]}.`;
  if ((x = m.match(/^(A Resistência venceu|Os Espiões venceram): (.+)$/))) return `${x[1].startsWith('A') ? 'O time venceu' : 'Os sabotadores venceram'}: ${reasonText(x[2])}.`;
  if ((x = m.match(/^(.+) criou a sala\.$/))) return `${x[1]} criou o repositório.`;
  return m;
}
