/* ============================================================
 * Momento da franquia: estágio REBUILD↔CONTENDER e química.
 * ============================================================ */

import type { GameState } from './types';
import { clamp } from './rng';

export interface StageInfo {
  score: number;
  label: string;
  factors: { campanha: number; talento: number; janela: number; nucleos: number };
}

export function teamStage(s: GameState, teamId: string): StageInfo {
  const t = s.teams.find(x => x.id === teamId)!;
  const ativos = s.players.filter(p => p.teamId === teamId && p.status !== 'PS');
  const top = [...ativos].sort((a, b) => b.ovr - a.ovr).slice(0, 22);

  const h = t.histCampanha.length ? t.histCampanha : [0.5];
  const campanha = clamp(h[0] * 0.5 + (h[1] ?? h[0]) * 0.3 + (h[2] ?? h[0]) * 0.2, 0, 1);

  const avgOvr = top.length ? top.reduce((a, p) => a + p.ovr, 0) / top.length : 60;
  const talento = clamp((avgOvr - 65) / 17, 0, 1);

  const avgIdade = top.length ? top.reduce((a, p) => a + p.idade, 0) / top.length : 26;
  const janela = avgIdade <= 25
    ? clamp(0.45 + (avgIdade - 22) * 0.18, 0.2, 0.99)
    : avgIdade <= 29 ? 1.0
      : clamp(1.0 - (avgIdade - 29) * 0.18, 0, 1);

  const jovens = ativos.filter(p => p.idade <= 24 && p.ovr >= 72).length;
  const nucleos = clamp(jovens / 6, 0, 1);

  const score = Math.round(clamp(campanha * 40 + talento * 35 + janela * 15 + nucleos * 10, 0, 100));
  return { score, label: stageLabel(score), factors: { campanha, talento, janela, nucleos } };
}

export const stageLabel = (score: number) =>
  score >= 90 ? 'All-in · favorito' :
    score >= 75 ? 'Contender' :
      score >= 60 ? 'Janela abrindo' :
        score >= 40 ? 'Transição' :
          score >= 20 ? 'Rebuild' : 'Tank total';

export const STAGE_ZONES = [
  { ate: 20, nome: 'Tank' },
  { ate: 40, nome: 'Rebuild' },
  { ate: 60, nome: 'Transição' },
  { ate: 75, nome: 'Janela' },
  { ate: 90, nome: 'Contender' },
  { ate: 100, nome: 'All-in' },
];

export interface ChemInfo {
  score: number;
  media: number;
  qbLink: number;
  churn: number;
}

export function teamChemistry(s: GameState, teamId: string): ChemInfo {
  const t = s.teams.find(x => x.id === teamId)!;
  const ativos = s.players.filter(p => p.teamId === teamId && p.status !== 'PS' && p.lesao === 0);
  const top = [...ativos].sort((a, b) => b.ovr - a.ovr).slice(0, 22);
  const media = top.length ? top.reduce((a, p) => a + Math.min(p.anosNoTime, 8), 0) / top.length : 0;

  const qb = ativos.filter(p => p.pos === 'QB').sort((a, b) => b.ovr - a.ovr)[0];
  const wr = ativos.filter(p => p.pos === 'WR').sort((a, b) => b.ovr - a.ovr)[0];
  const qbLink = qb && wr ? Math.min(qb.anosNoTime, wr.anosNoTime) : 0;

  const score = Math.round(clamp(35 + media * 6 + qbLink * 1.5 - t.teamChurn * 1.2, 20, 99));
  return { score, media: Math.round(media * 10) / 10, qbLink, churn: t.teamChurn };
}

export const chemistryLabel = (score: number) =>
  score >= 80 ? 'Conexão de elite' :
    score >= 60 ? 'Vestiário entrosado' :
      score >= 40 ? 'Química em formação' : 'Vestiário fragmentado';

export function recalcChemistry(s: GameState, teamId: string): void {
  const t = s.teams.find(x => x.id === teamId);
  if (t) t.quimica = teamChemistry(s, teamId).score;
}

export function addChurn(s: GameState, teamId: string, amount: number): void {
  const t = s.teams.find(x => x.id === teamId);
  if (!t) return;
  t.teamChurn = clamp(t.teamChurn + amount, 0, 40);
  recalcChemistry(s, teamId);
}
