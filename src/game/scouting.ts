/* ============================================================
 * 🔍 Sistema de Scouting — investigação de prospectos.
 * ============================================================ */

import type { GameState, Player, Pos } from './types';
import { Rng, clamp } from './rng';
import { computeOvr } from './data';

export const COLLEGES = [
  'Alabama', 'Ohio State', 'Georgia', 'Michigan', 'Clemson', 'LSU', 'Oklahoma',
  'Notre Dame', 'Florida State', 'Oregon', 'Penn State', 'Washington', 'Texas',
  'USC', 'Tennessee', 'Ole Miss', 'Utah', 'Wisconsin', 'Iowa', 'Stanford',
];

export const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
export const gradeForOvr = (ovr: number): string =>
  ovr >= 90 ? 'A+' : ovr >= 85 ? 'A' : ovr >= 80 ? 'A-' : ovr >= 75 ? 'B+' :
  ovr >= 70 ? 'B' : ovr >= 65 ? 'B-' : ovr >= 60 ? 'C+' : ovr >= 55 ? 'C' :
  ovr >= 50 ? 'C-' : ovr >= 45 ? 'D' : 'F';

export function scoutBudgetMaxFor(s: GameState): number {
  const user = s.staff.filter(st => st.teamId === s.userTeam);
  const olheiros = user.filter(st => st.funcao === 'Olheiro' || st.funcao === 'Olheiro Extra').length;
  return 10 + olheiros * 3;
}

export function resetScouting(s: GameState): void {
  s.scoutBudgetMax = scoutBudgetMaxFor(s);
  s.scoutBudget = s.scoutBudgetMax;
  for (const p of s.draftClass) {
    if (p.scout) { p.scout.reports = 0; p.scout.onBoard = false; p.scout.aiHeat = 0; }
  }
}

/** Investiga um prospecto (gasta 1 ponto), revelando atributos com mais precisão. */
export function investigate(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.draftClass.find(x => x.id === playerId);
  if (!p || !p.scout) return { ok: false, msg: 'Prospecto inválido.' };
  if (s.scoutBudget <= 0) return { ok: false, msg: 'Sem pontos de scouting. Contrate mais olheiros.' };
  if (p.scout.reports >= p.scout.maxReports) return { ok: false, msg: 'Este prospecto já foi totalmente investigado (3 relatórios).' };
  s.scoutBudget--;
  p.scout.reports++;
  return { ok: true, msg: `Relatório ${p.scout.reports}/${p.scout.maxReports} de ${p.nome} concluído. ${s.scoutBudget} ponto(s) restante(s).` };
}

export function toggleBoard(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.draftClass.find(x => x.id === playerId);
  if (!p || !p.scout) return { ok: false, msg: 'Prospecto inválido.' };
  p.scout.onBoard = !p.scout.onBoard;
  return { ok: true, msg: p.scout.onBoard ? `${p.nome} adicionado ao board.` : `${p.nome} removido do board.` };
}

/** A IA das outras franquias investiga prospectos durante a offseason. */
export function aiScoutingWave(s: GameState, rng: Rng): void {
  for (const t of s.teams) {
    if (t.id === s.userTeam) continue;
    const budget = rng.int(2, 6);
    const targets = [...s.draftClass].sort(() => rng.next() - 0.5).slice(0, budget);
    for (const p of targets) {
      if (p.scout) p.scout.aiHeat = (p.scout.aiHeat ?? 0) + 1;
    }
  }
}

/** Surpresa de draft: 3 relatórios → 10% de chance de ±5 no OVR real. */
export function applyDraftSurprise(s: GameState, p: Player, rng: Rng): boolean {
  if (!p.scout || p.scout.reports < 3) return false;
  if (!rng.chance(0.10)) return false;
  const delta = rng.chance(0.5) ? 5 : -5;
  const keys = Object.keys(p.attrs) as (keyof typeof p.attrs)[];
  for (const k of keys) {
    p.attrs[k] = clamp(p.attrs[k] + Math.round(delta / 2), 25, 95);
  }
  const oldOvr = p.ovr;
  p.ovr = computeOvr(p.pos, p.attrs);
  void oldOvr;
  return true;
}
