/* ============================================================
 * Queries de estatísticas da temporada — o equivalente das
 * "rotas" do backend: Top N por categoria, ordenação padrão
 * pela stat principal, filtros e regra de qualificação da NFL.
 * Pura: recebe GameState, devolve dados prontos para as tabelas.
 * ============================================================ */

import type { Conf, GameState, Player, Team, TeamSeasonStats } from './types';
import { clamp } from './rng';

/* ---------- fórmula oficial do Passer Rating da NFL (0–158.3) ---------- */
export function passerRating(cmp: number, att: number, yds: number, td: number, intc: number): number {
  if (att <= 0) return 0;
  const a = clamp((cmp / att - 0.3) * 5, 0, 2.375);
  const b = clamp((yds / att - 3) * 0.25, 0, 2.375);
  const c = clamp((td / att) * 20, 0, 2.375);
  const d = clamp(2.375 - (intc / att) * 25, 0, 2.375);
  return Math.round(((a + b + c + d) / 6) * 1000) / 10;
}

/* ---------- médias derivadas ---------- */
export const ypc = (ry: number, car: number) => (car > 0 ? Math.round((ry / car) * 10) / 10 : 0);
export const ypr = (yds: number, rec: number) => (rec > 0 ? Math.round((yds / rec) * 10) / 10 : 0);
export const fgPct = (m: number, t: number) => (t > 0 ? Math.round((m / t) * 100) : 0);
export const puntAvg = (yds: number, punts: number) => (punts > 0 ? Math.round((yds / punts) * 10) / 10 : 0);
export const thirdPct = (conv: number, att: number) => (att > 0 ? Math.round((conv / att) * 100) : 0);
export const perGame = (v: number, jogos: number) => (jogos > 0 ? Math.round((v / jogos) * 10) / 10 : 0);

/* ---------- linhas de ranking ---------- */
export interface RankingRow { p: Player; t: Team; }

export function seasonRows(s: GameState): RankingRow[] {
  const tm = new Map(s.teams.map(t => [t.id, t]));
  return s.players
    .filter(p => p.teamId && p.stats.jogos > 0 && tm.has(p.teamId))
    .map(p => ({ p, t: tm.get(p.teamId!)! }));
}

/* Regra de qualificação da NFL: para aparecer nos rankings oficiais o jogador
   precisa ter participado de pelo menos metade das semanas disputadas. */
export function weeksPlayed(s: GameState): number {
  return new Set(s.matches.filter(m => m.fase === 'REG' && m.jogada).map(m => m.rodada)).size;
}
export function minGamesToRank(s: GameState): number {
  return Math.max(1, Math.floor(weeksPlayed(s) * 0.5));
}

export function applyTeamFilter(rows: RankingRow[], conf: Conf | 'ALL', div: number): RankingRow[] {
  return rows.filter(r => (conf === 'ALL' || r.t.conf === conf) && (div < 0 || r.t.div === div));
}

export function topBy<T>(rows: T[], val: (r: T) => number, n: number): T[] {
  return [...rows].sort((a, b) => val(b) - val(a)).slice(0, n);
}

/* ---------- categorias (as "rotas") ---------- */
export const qbRows = (s: GameState) => seasonRows(s).filter(r => r.p.stats.att > 0);
export const rbRows = (s: GameState) => seasonRows(s).filter(r => r.p.stats.car > 0);
export const recRows = (s: GameState) => seasonRows(s).filter(r => r.p.stats.rec > 0);
export const defRows = (s: GameState) =>
  seasonRows(s).filter(r => r.p.stats.tackles > 0 || r.p.stats.sacks > 0 || r.p.stats.intDef > 0);
export const kRows = (s: GameState) => seasonRows(s).filter(r => r.p.stats.fgT > 0);
export const pRows = (s: GameState) => seasonRows(s).filter(r => r.p.stats.punts > 0);

/* ---------- estatísticas de times ---------- */
export interface TeamRankRow { t: Team; ts: TeamSeasonStats; }
export function teamRankRows(s: GameState, conf: Conf | 'ALL', div: number): TeamRankRow[] {
  return s.teams
    .filter(t => (conf === 'ALL' || t.conf === conf) && (div < 0 || t.div === div))
    .map(t => ({
      t,
      ts: s.teamSeasonStats.find(x => x.teamId === t.id && x.season === s.settings.temporada)
        ?? {
          teamId: t.id, season: s.settings.temporada,
          pointsScored: 0, totalYards: 0, passingYards: 0, rushingYards: 0,
          turnovers: 0, thirdAtt: 0, thirdConv: 0, pointsAllowed: 0, sacks: 0, interceptions: 0,
        },
    }));
}
