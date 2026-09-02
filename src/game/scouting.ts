/* ============================================================
 * 🔍 SISTEMA DE SCOUTING DO DRAFT
 * - Notas A+..F para Overall / Potential / Need
 * - Ranges de precisão por nível de investigação (±15/±10/±5/exato)
 * - Budget de scouting (10 + olheiros), reset na offseason
 * - Surpresas no draft (3 relatórios → 10% de chance, ±5 rating)
 * - Apenas 3-5 prospectos A+ por classe
 * ============================================================ */

import type { Attrs, GameState, GradeLetter, OpponentScoutingReport, Player, Pos, Staff } from './types';
import { Rng, clamp } from './rng';
import { computeOvr, STARTER_SLOTS } from './data';

/* ---------- escala de notas ---------- */
const GRADE_TABLE: [GradeLetter, number][] = [
  ['A+', 90], ['A', 85], ['A-', 80], ['B+', 75], ['B', 70],
  ['B-', 65], ['C+', 60], ['C', 55], ['C-', 50], ['D', 45], ['F', 0],
];

export function ratingToGrade(rating: number): GradeLetter {
  for (const [g, min] of GRADE_TABLE) if (rating >= min) return g;
  return 'F';
}

export const GRADE_MEANING: Record<GradeLetter, string> = {
  'A+': 'Franchise player', 'A': 'Pro Bowl', 'A-': 'Starter elite',
  'B+': 'Starter', 'B': 'Starter', 'B-': 'Role player',
  'C+': 'Backup', 'C': 'Backup', 'C-': 'Practice squad',
  'D': 'Practice squad', 'F': 'Undrafted',
};

/* ---------- precisão por nível de investigação ----------
 * 0 relatórios → ±15 · 1 → ±10 · 2 → ±5 · 3 → exato */
export function accuracyRange(reports: number): number {
  if (reports >= 3) return 0;
  if (reports === 2) return 5;
  if (reports === 1) return 10;
  return 15;
}

/** Erro determinístico do scout por prospecto (não muda entre renders). */
function scoutError(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 31) - 15; // -15..15
}

export interface Estimate {
  lo: number; hi: number; exact: boolean;
  center: number; grade: GradeLetter;
  label: string; // "60-90" ou "75"
}

/** Estimativa de um aspecto (OVR/POT) com a precisão atual do scout. */
export function estimateAspect(p: Player, aspect: 'ovr' | 'pot'): Estimate {
  const real = aspect === 'ovr' ? p.ovr : p.pot;
  const reports = p.scout?.reports ?? 0;
  const range = accuracyRange(reports);
  if (range === 0) {
    return { lo: real, hi: real, exact: true, center: real, grade: ratingToGrade(real), label: `${real}` };
  }
  const err = Math.round((scoutError(p.id, aspect === 'ovr' ? 7 : 131) / 15) * range);
  const center = clamp(real + err, 20, 99);
  const lo = clamp(center - range, 20, 99);
  const hi = clamp(center + range, 20, 99);
  return { lo, hi, exact: false, center, grade: ratingToGrade(center), label: `${lo}-${hi}` };
}

/* ---------- necessidade do time por posição ---------- */
export function needScore(pos: Pos, roster: Player[]): number {
  const starters = STARTER_SLOTS[pos] ?? 1;
  const count = roster.filter(p => p.pos === pos && p.status !== 'PS').length;
  const deficit = starters + 2 - count;
  return clamp(50 + deficit * 14, 5, 99);
}
export function needGradeFor(pos: Pos, roster: Player[]): GradeLetter {
  return ratingToGrade(needScore(pos, roster));
}

/* ---------- orçamento de scouting ---------- */
export const SCOUT_BASE_BUDGET = 10;
export function scoutBudgetMaxFor(staff: Staff[]): number {
  const extras = staff.filter(s => s.funcao === 'Olheiro Extra').length;
  const personnel = staff.some(s => s.funcao === 'Diretor de Personnel') ? 2 : 0;
  return SCOUT_BASE_BUDGET + extras * 2 + personnel;
}
/** Chamado na offseason: zera os relatórios e restaura o orçamento. */
export function resetScouting(s: GameState): void {
  s.scoutBudgetMax = scoutBudgetMaxFor(s.staff.filter(x => x.teamId === s.userTeam));
  s.scoutBudget = s.scoutBudgetMax;
  for (const p of s.draftClass) {
    if (p.scout) { p.scout.reports = 0; p.scout.onBoard = false; }
  }
}

/* ---------- investigação ---------- */
export function investigate(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.draftClass.find(x => x.id === playerId);
  if (!p || !p.scout) return { ok: false, msg: 'Prospecto não está mais disponível.' };
  if (p.scout.reports >= p.scout.maxReports)
    return { ok: false, msg: `${p.nome} já tem os 3 relatórios completos.` };
  if (s.scoutBudget < 1)
    return { ok: false, msg: 'Sem pontos de scouting. Contrate um Olheiro Extra para aumentar o orçamento.' };
  s.scoutBudget--;
  p.scout.reports++;
  const left = p.scout.maxReports - p.scout.reports;
  return {
    ok: true,
    msg: left === 0
      ? `Relatório final de ${p.nome} concluído — avaliação agora é EXATA.`
      : `Relatório ${p.scout.reports}/${p.scout.maxReports} de ${p.nome} pronto. Restam ${s.scoutBudget} ponto(s).`,
  };
}

export function studyOpponent(s: GameState, teamId: string): { ok: boolean; msg: string } {
  if (teamId === s.userTeam) return { ok: false, msg: 'Não é possível estudar a própria equipe.' };
  if (s.settings.fase === 'OFF') return { ok: false, msg: 'A análise adversária só está disponível antes de uma partida.' };
  if (s.scoutBudget < 1) return { ok: false, msg: 'Sem pontos de scouting para estudar o adversário.' };
  const team = s.teams.find(t => t.id === teamId);
  if (!team) return { ok: false, msg: 'Adversário não encontrado.' };
  const roster = s.players.filter(p => p.teamId === teamId && p.status !== 'PS');
  const passRate = 100 - team.tactics.corrida;
  const report: OpponentScoutingReport = {
    teamId, season: s.settings.temporada, reports: (s.opponentScouting.find(r => r.teamId === teamId && r.season === s.settings.temporada)?.reports ?? 0) + 1,
    strengths: [team.tactics.corrida < 42 ? 'Passe forte' : 'Jogo terrestre forte', teamStrengthLabel(roster) ],
    weaknesses: [team.tactics.corrida > 58 ? 'Passe previsível' : 'Defesa contra corrida vulnerável', roster.filter(p => p.pos === 'OL').reduce((sum, p) => sum + p.ovr, 0) / Math.max(1, roster.filter(p => p.pos === 'OL').length) < 72 ? 'OL lenta' : 'Secondary pode ser explorada'],
    keyPlayers: roster.sort((a, b) => b.ovr - a.ovr).slice(0, 3).map(p => p.id),
    passRate, runOnFirstDown: Math.max(20, Math.min(80, team.tactics.corrida + 8)),
  };
  s.scoutBudget--;
  s.opponentScouting = s.opponentScouting.filter(r => !(r.teamId === teamId && r.season === s.settings.temporada));
  s.opponentScouting.unshift(report);
  return { ok: true, msg: `Relatório de ${team.sigla} concluído. Restam ${s.scoutBudget} ponto(s).` };
}

function teamStrengthLabel(roster: Player[]): string {
  const average = roster.length ? roster.reduce((sum, p) => sum + p.ovr, 0) / roster.length : 0;
  return average >= 78 ? 'Elenco profundo' : average >= 70 ? 'Núcleo competitivo' : 'Elenco inconsistente';
}

export function toggleBoard(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.draftClass.find(x => x.id === playerId);
  if (!p || !p.scout) return { ok: false, msg: 'Prospecto indisponível.' };
  p.scout.onBoard = !p.scout.onBoard;
  return { ok: true, msg: p.scout.onBoard ? `📌 ${p.nome} marcado como alvo no board.` : `${p.nome} removido do board.` };
}

/* ---------- surpresa no draft ----------
 * Prospecto com 3 relatórios: 10% de chance de ±5 rating no combine. */
export function applyDraftSurprise(p: Player, rng: Rng): string | null {
  if ((p.scout?.reports ?? 0) < 3 || !rng.chance(0.10)) return null;
  const up = rng.chance(0.5);
  const delta = up ? 5 : -5;
  const attrs = p.attrs as Record<keyof Attrs, number>;
  for (const k of Object.keys(attrs) as (keyof Attrs)[]) attrs[k] = clamp(attrs[k] + delta, 20, 99);
  p.ovr = computeOvr(p.pos, p.attrs);
  p.pot = clamp(p.pot + delta, p.ovr, 99);
  return up
    ? `🔥 SURPRESA NO COMBINE: ${p.nome} testa muito acima do esperado (+5 OVR → ${p.ovr})!`
    : `😬 BALDE DE ÁGUA FRIA: ${p.nome} decepciona nos testes (−5 OVR → ${p.ovr}).`;
}

/* ---------- balanceamento: 3-5 prospectos A+ por classe ---------- */
export function balanceElite(rng: Rng, list: Player[]): void {
  const want = rng.int(3, 5);
  const sorted = [...list].sort((a, b) => b.pot - a.pot);
  let elevated = 0;
  for (const p of sorted) {
    if (elevated >= want) break;
    if (p.ovr >= 90) { elevated++; continue; }
    const target = 90 + rng.int(0, 5);
    const boost = target - p.ovr;
    if (boost <= 0) continue;
    const attrs = p.attrs as Record<keyof Attrs, number>;
    for (const k of Object.keys(attrs) as (keyof Attrs)[]) attrs[k] = clamp(attrs[k] + boost, 20, 99);
    p.ovr = computeOvr(p.pos, p.attrs);
    p.pot = clamp(Math.max(p.pot, p.ovr + rng.int(2, 7)), 20, 99);
    elevated++;
  }
}

/* ---------- compatibilidade com saves antigos ---------- */
export function backfillScoutInfo(p: Player, college: string): void {
  if (!p.scout) p.scout = { college, reports: 0, maxReports: 3, onBoard: false };
}
