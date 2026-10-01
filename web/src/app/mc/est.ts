/** Tipos do motor `public/mc-engine.js` (carregado por <script defer> no index.html). */
export interface EstAudio {
  music: number; sfx: number; muted: boolean;
  set(o: Partial<{ music: number; sfx: number; muted: boolean }>): void;
  [stinger: string]: unknown;
}
export interface FxEngine {
  reduced: boolean;
  setTension(t: number): void;
  burst(x: number, y: number, col: string, n?: number): void;
  static(ms: number): void;
  destroy(): void;
}
export interface EstGlobal {
  ready?: boolean;
  lowEnd?: boolean;
  audio?: EstAudio;
  FX?: new (canvas: HTMLCanvasElement) => FxEngine;
}

declare global { interface Window { EST?: EstGlobal } }

/** Executa `fn` quando o motor terminar de carregar. Devolve um cancelador. */
export function whenEst(fn: (est: EstGlobal) => void): () => void {
  let t: ReturnType<typeof setTimeout> | undefined, dead = false;
  const tick = () => { if (dead) return; if (window.EST?.ready) fn(window.EST); else t = setTimeout(tick, 60); };
  tick();
  return () => { dead = true; clearTimeout(t); };
}
