/* ============================================================
 * 🏋️ Sistema de Treino & Desenvolvimento
 * Jogadores evoluem com playing time (snaps) e foco de treino.
 * ============================================================ */

import type { AttrKey, Player } from './types';
import { Rng, clamp } from './rng';

export type TrainingIntensity = 'LEVE' | 'NORMAL' | 'INTENSO';

export interface TrainingCenterState {
  focus: AttrKey;             // atributo priorizado
  intensity: TrainingIntensity;
  playersTraining: string[];  // ids dos jogadores em treino extra
}

/** Multiplicador de evolução por intensidade (INTENSO evolui mais, mas lesiona mais). */
const INTENSITY_MULT: Record<TrainingIntensity, number> = {
  LEVE: 0.7,
  NORMAL: 1.0,
  INTENSO: 1.4,
};

/** Jovens (≤26) evoluem; veteranos (30+) declinam; o foco acelera o atributo alvo. */
export function simulateTrainingWeek(
  players: Player[],
  state: TrainingCenterState,
  snapsByPlayer: Record<string, number>,
): { playerId: string; nome: string; improvements: Record<string, number> }[] {
  const rng = new Rng(Math.floor(Math.random() * 0xffffffff));
  const results: { playerId: string; nome: string; improvements: Record<string, number> }[] = [];
  const mult = INTENSITY_MULT[state.intensity];

  for (const p of players) {
    if (!p.teamId || p.status === 'PS' || p.lesao > 0) continue;

    const snaps = snapsByPlayer[p.id] ?? 0;
    // playing time: quanto mais snaps, mais desenvolvimento (0..1)
    const playtime = clamp(snaps / 55, 0, 1);

    // base de evolução por idade
    let base = p.idade <= 24 ? 0.35 : p.idade <= 26 ? 0.22 : p.idade <= 29 ? 0.05 : p.idade <= 31 ? -0.12 : -0.3;
    base *= mult;
    // jovens com playing time evoluem mais
    if (p.idade <= 26) base *= 0.5 + playtime;
    // veterano declina mais com INTENSO (desgaste)
    if (p.idade >= 30 && state.intensity === 'INTENSO') base -= 0.1;

    if (Math.abs(base) < 0.02 && !state.playersTraining.includes(p.id)) continue;

    const improvements: Record<string, number> = {};
    const keys = Object.keys(p.attrs) as AttrKey[];
    for (const k of keys) {
      let delta = base * rng.f(0.3, 1.0);
      // foco de treino acelera o atributo alvo
      if (k === state.focus) delta += Math.abs(base) * 0.8 + 0.15;
      // treino extra individual
      if (state.playersTraining.includes(p.id)) delta += 0.2;

      // teto: perto do potencial, evolução reduz
      if (delta > 0 && p.ovr >= p.pot - 2) delta *= 0.2;

      const rounded = Math.round(delta);
      if (rounded !== 0) {
        const newVal = clamp(p.attrs[k] + rounded, 25, 95);
        const actual = newVal - p.attrs[k];
        if (actual !== 0) {
          p.attrs[k] = newVal;
          improvements[k] = (improvements[k] ?? 0) + actual;
        }
      }
    }

    if (Object.keys(improvements).length > 0) {
      results.push({ playerId: p.id, nome: p.nome, improvements });
    }
  }
  return results;
}

/** Risco extra de lesão por treino INTENSO (aplicado na offseason/pré). */
export const injuryRiskFromIntensity = (state: TrainingCenterState): number =>
  state.intensity === 'INTENSO' ? 0.02 : state.intensity === 'NORMAL' ? 0.005 : 0;
