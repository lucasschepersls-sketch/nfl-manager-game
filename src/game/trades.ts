/* ============================================================
 * 🔄 Sistema de Trades — avaliação e execução de propostas.
 * ============================================================ */

import type { GameState, PickOwner, Player, TradeAsset, TradeProposal } from './types';
import { Rng } from './rng';
import { addChurn } from './franchise';

export const initialPickOwners = (teamIds: string[]): PickOwner[][] =>
  Array.from({ length: 7 }, () =>
    Array.from({ length: 32 }, (_, slot) => ({
      owner: teamIds[slot % teamIds.length],
      from: null,
    })));

export const buildSlotsFromOrder = (order: string[]): PickOwner[][] =>
  initialPickOwners(order);

/** Valor de um ativo (jogador por OVR/salário; pick por rodada). */
const PICK_VALUE = [100, 60, 42, 30, 22, 16, 12]; // rodadas 1..7

function assetValue(s: GameState, a: TradeAsset): number {
  if (a.kind === 'player') {
    const p = s.players.find(x => x.id === a.playerId);
    if (!p) return 0;
    return p.ovr * 1.2 + (p.pos === 'QB' ? 15 : 0) - Math.max(0, p.idade - 28) * 2;
  }
  return PICK_VALUE[(a.round ?? 1) - 1] ?? 12;
}

/** Avalia a proposta do ponto de vista do time parceiro (IA). */
export function evaluateProposal(s: GameState, prop: TradeProposal, rng: Rng): { accepts: boolean; diff: number } {
  const giveValue = prop.give.reduce((sum, a) => sum + assetValue(s, a), 0); // o que a IA recebe
  const getValue = prop.get.reduce((sum, a) => sum + assetValue(s, a), 0);   // o que a IA entrega
  const diff = giveValue - getValue;
  const noise = rng.f(-8, 8);
  return { accepts: diff + noise >= 0, diff };
}

/** Valida e executa a troca. */
export function executeProposal(s: GameState, prop: TradeProposal, rng: Rng): { ok: boolean; msg: string } {
  const ev = evaluateProposal(s, prop, rng);
  if (!ev.accepts) {
    return { ok: false, msg: `Proposta recusada (diferença ${ev.diff.toFixed(0)} pts). Ofereça mais.` };
  }

  // jogadores
  for (const a of prop.give) {
    if (a.kind !== 'player') continue;
    const p = s.players.find(x => x.id === a.playerId);
    if (p) { p.teamId = prop.to; p.anosNoTime = 0; }
  }
  for (const a of prop.get) {
    if (a.kind !== 'player') continue;
    const p = s.players.find(x => x.id === a.playerId);
    if (p) { p.teamId = prop.from; p.anosNoTime = 0; }
  }

  // picks
  for (const a of prop.give) {
    if (a.kind !== 'pick') continue;
    const slot = s.pickOwners[(a.round ?? 1) - 1]?.[a.slot ?? 0];
    if (slot && slot.owner === prop.from && !slot.consumed) {
      slot.owner = prop.to; slot.from = prop.from;
    }
  }
  for (const a of prop.get) {
    if (a.kind !== 'pick') continue;
    const slot = s.pickOwners[(a.round ?? 1) - 1]?.[a.slot ?? 0];
    if (slot && slot.owner === prop.to && !slot.consumed) {
      slot.owner = prop.from; slot.from = prop.to;
    }
  }

  addChurn(s, prop.from, 6);
  addChurn(s, prop.to, 6);

  const fromTeam = s.teams.find(t => t.id === prop.from);
  const toTeam = s.teams.find(t => t.id === prop.to);
  s.tradeLog.push({
    id: Date.now(),
    temporada: s.settings.temporada,
    semana: s.settings.semana,
    fase: s.settings.fase,
    a: prop.from, b: prop.to,
    aGives: describeAssets(s, prop.give),
    bGives: describeAssets(s, prop.get),
    aceita: true,
  });
  s.news.unshift({ id: Date.now(), rotulo: 'TRADE', texto: `${fromTeam?.sigla} troca com ${toTeam?.sigla}: ${describeAssets(s, prop.give)} por ${describeAssets(s, prop.get)}.` });

  return { ok: true, msg: 'Troca aceita!' };
}

function describeAssets(s: GameState, assets: TradeAsset[]): string {
  return assets.map(a => {
    if (a.kind === 'player') {
      const p = s.players.find(x => x.id === a.playerId);
      return p ? `${p.nome} (${p.pos})` : '?';
    }
    return `Pick R${a.round}.${(a.slot ?? 0) + 1}`;
  }).join(', ');
}
