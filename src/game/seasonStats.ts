/* ============================================================
 * Estatísticas acumuladas da temporada — helpers de consulta.
 * ============================================================ */

import type { Conf, GameState, Player, Pos } from './types';
import { clamp } from './rng';

export const fmtPct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`;

export function passerRatingOf(p: Player): number {
  const { cmp, att, py, ptd, int: ints } = p.stats;
  if (att <= 0) return 0;
  const c = (x: number) => clamp(x, 0, 2.375);
  const a = c((cmp / att - 0.3) * 5);
  const b = c((py / att - 3) * 0.25);
  const d = c((ptd / att) * 20);
  const e = c(2.375 - (ints / att) * 25);
  return Math.round(((a + b + d + e) / 6) * 100 * 10) / 10;
}

export function totalYardsOf(p: Player): number {
  return p.stats.py + p.stats.ry + p.stats.recYds;
}

export function totalTdsOf(p: Player): number {
  return p.stats.ptd + p.stats.rtd + p.stats.recTD;
}

export function playersWithGames(s: GameState): Player[] {
  return s.players.filter(p => p.teamId && p.stats.jogos > 0);
}

export function topByPos(s: GameState, positions: Pos[], stat: (p: Player) => number, limit = 20): Player[] {
  return playersWithGames(s)
    .filter(p => positions.includes(p.pos))
    .sort((a, b) => stat(b) - stat(a))
    .slice(0, limit);
}

export const OFF_POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE'];
export const DEF_POSITIONS: Pos[] = ['DL', 'LB', 'CB', 'S'];
export const ST_POSITIONS: Pos[] = ['K', 'P'];

export function teamSeason(s: GameState, teamId: string) {
  return s.teamSeasonStats.find(x => x.teamId === teamId && x.season === s.settings.temporada);
}
