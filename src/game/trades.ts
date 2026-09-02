/* ============================================================
 * SISTEMA DE TRADES (Trade Machine)
 * Regras:
 *  - Trade Deadline: semana 9. Após isso, APENAS jogador↔jogador
 *    (sem picks envolvidos).
 *  - Picks já negociadas/usadas não podem ser re-trocadas.
 *  - Salary cap deve comportar o contrato recebido.
 *  - Roster mínimo de 44 ativos após a troca.
 * A IA dos outros GMs avalia valor + necessidade posicional.
 * ============================================================ */

import type { GameState, PickOwner, Player, Pos, TradeAsset, TradeProposal } from './types';
import { addChurn } from './franchise';
import { Rng, clamp } from './rng';
import { playersOf, capUsed, teamById } from './season';

export const TRADE_DEADLINE_WEEK = 9;
export const ROSTER_MIN_ACTIVE = 44;
export const ROUNDS = 7;
export const SLOTS_PER_ROUND = 32;

/* ---------- valor de picks (tabela decrescente, em pontos) ---------- */
const PICK_VALUE: number[] = [100, 80, 65, 52, 42, 33, 25];
export const pickValue = (round: number): number => PICK_VALUE[round - 1] ?? 25;

/** Posições premium para a IA (QB vale mais). */
const POS_MULT: Record<Pos, number> = {
  QB: 1.35, RB: 1.0, WR: 1.08, TE: 0.95, OL: 1.05,
  DL: 1.0, LB: 0.95, CB: 1.0, S: 0.9, K: 0.6, P: 0.6,
};

/* ---------- valor de um jogador ---------- */
export function playerValue(p: Player): number {
  // crescimento quadrático com OVR acima de 55
  const base = Math.pow(Math.max(0, p.ovr - 50), 2) / 6;
  // juventude vale mais (potencial de revenda / desenvolvimento)
  const ageFactor = p.idade <= 25 ? 1.2 : p.idade <= 28 ? 1.05 : p.idade <= 31 ? 0.9 : 0.7;
  // potencial pesa para novatos
  const potBonus = p.rookie ? (p.pot - p.ovr) * 0.4 : 0;
  // contrato longo é mais atrativo
  const contractBonus = p.contrato >= 3 ? 4 : p.contrato === 2 ? 2 : 0;
  // lesão reduz drasticamente
  const injuryPenalty = p.lesao > 0 ? 12 : 0;
  return Math.round((base * POS_MULT[p.pos] * ageFactor + potBonus + contractBonus - injuryPenalty) * 10) / 10;
}

/** Necessidade posicional de um time (0 = suprido, >0 = carente). */
export function positionalNeed(s: GameState, teamId: string, pos: Pos): number {
  const count = playersOf(s, teamId).filter(p => p.pos === pos && p.status !== 'PS').length;
  if (pos === 'QB') return count >= 2 ? 0 : count === 1 ? 1 : 2;
  if (pos === 'K' || pos === 'P') return count >= 1 ? 0 : 1;
  if (pos === 'OL') return count >= 8 ? 0 : count >= 6 ? 1 : 2;
  if (pos === 'DL' || pos === 'LB') return count >= 7 ? 0 : count >= 5 ? 1 : 2;
  if (pos === 'CB' || pos === 'S') return count >= 5 ? 0 : count >= 4 ? 1 : 2;
  return count >= 5 ? 0 : count >= 3 ? 1 : 2; // RB/WR/TE
}

/** Valor de um asset na perspectiva de um time (jogador ganha bônus de necessidade). */
export function assetValueFor(s: GameState, teamId: string, a: TradeAsset): number {
  if (a.kind === 'pick') return pickValue(a.round ?? 7);
  const p = s.players.find(x => x.id === a.playerId);
  if (!p) return 0;
  const need = positionalNeed(s, teamId, p.pos);
  return playerValue(p) + need * 10;
}

/* ---------- validação ---------- */
export interface TradeValidation {
  ok: boolean;
  erros: string[];
  capDepois: number;   // cap do usuário após a troca
  rosterDepois: number;
}

export function validateProposal(s: GameState, p: TradeProposal): TradeValidation {
  const erros: string[] = [];
  const me = s.userTeam;
  const myRoster = playersOf(s, me).filter(x => x.status !== 'PS');
  const theirRoster = playersOf(s, p.to).filter(x => x.status !== 'PS');

  // deadline: após semana 9, só jogador↔jogador
  const afterDeadline = s.settings.fase === 'REG' && s.settings.semana > TRADE_DEADLINE_WEEK;
  const hasPick = [...p.give, ...p.get].some(a => a.kind === 'pick');
  if (afterDeadline && hasPick)
    erros.push(`Trade Deadline (semana ${TRADE_DEADLINE_WEEK}) ultrapassado: após isso apenas trocas jogador↔jogador (sem picks).`);
  if (s.settings.fase === 'PO') erros.push('Não é possível trocar durante os playoffs.');

  // picks: propriedade + não re-trocar picks já usadas
  for (const a of p.give) {
    if (a.kind !== 'pick') continue;
    const own = s.pickOwners[(a.round ?? 1) - 1]?.[a.slot ?? 0];
    if (!own || own.owner !== me) erros.push(`Você não detém a escolha R${a.round}.${(a.slot ?? 0) + 1}.`);
    else if (own.consumed) erros.push(`A escolha R${a.round}.${(a.slot ?? 0) + 1} já foi usada no draft e não pode ser trocada.`);
  }
  for (const a of p.get) {
    if (a.kind !== 'pick') continue;
    const own = s.pickOwners[(a.round ?? 1) - 1]?.[a.slot ?? 0];
    if (!own || own.owner !== p.to) erros.push(`${teamById(s, p.to).sigla} não detém a escolha R${a.round}.${(a.slot ?? 0) + 1}.`);
    else if (own.consumed) erros.push(`A escolha R${a.round}.${(a.slot ?? 0) + 1} já foi usada no draft.`);
  }

  // jogadores: devem pertencer aos times corretos
  for (const a of p.give) {
    if (a.kind !== 'player') continue;
    const pl = s.players.find(x => x.id === a.playerId);
    if (!pl || pl.teamId !== me) erros.push('Um dos jogadores oferecidos não está no seu elenco.');
  }
  for (const a of p.get) {
    if (a.kind !== 'player') continue;
    const pl = s.players.find(x => x.id === a.playerId);
    if (!pl || pl.teamId !== p.to) erros.push('Um dos jogadores pedidos não está no elenco adversário.');
  }

  if (p.give.length === 0 || p.get.length === 0) erros.push('A troca precisa ter ao menos 1 item de cada lado.');

  // salary cap do usuário após receber contratos
  const capSaindo = p.give.filter(a => a.kind === 'player')
    .reduce((sum, a) => sum + (s.players.find(x => x.id === a.playerId)?.salario ?? 0), 0);
  const capEntrando = p.get.filter(a => a.kind === 'player')
    .reduce((sum, a) => sum + (s.players.find(x => x.id === a.playerId)?.salario ?? 0), 0);
  const capDepois = Math.round((capUsed(s, me) - capSaindo + capEntrando) * 10) / 10;
  if (capDepois > s.settings.cap)
    erros.push(`Seu cap ficaria em $${capDepois}M, acima do teto de $${s.settings.cap}M.`);

  // roster mínimo de 44
  const outPlayers = p.give.filter(a => a.kind === 'player').length;
  const inPlayers = p.get.filter(a => a.kind === 'player').length;
  const rosterDepois = myRoster.length - outPlayers + inPlayers;
  if (rosterDepois < ROSTER_MIN_ACTIVE)
    erros.push(`Seu elenco ativo ficaria com ${rosterDepois} jogadores (mínimo ${ROSTER_MIN_ACTIVE}).`);
  const theirRosterDepois = theirRoster.length - inPlayers + outPlayers;
  if (theirRosterDepois < ROSTER_MIN_ACTIVE)
    erros.push(`O elenco do adversário ficaria com ${theirRosterDepois} jogadores (mínimo ${ROSTER_MIN_ACTIVE}).`);

  return { ok: erros.length === 0, erros, capDepois, rosterDepois };
}

/* ---------- avaliação da IA (probabilidade de aceitação) ---------- */
export interface TradeEvaluation {
  valueGive: number;   // valor do que o parceiro RECEBE (na visão dele)
  valueGet: number;    // valor do que o parceiro ENTREGA (na visão dele)
  net: number;
  chance: number;      // 0..100
  parecer: string;
}

export function evaluateProposal(s: GameState, p: TradeProposal, rng: Rng): TradeEvaluation {
  const partner = p.to;
  // O parceiro recebe o que você entrega (give) e entrega o que você pede (get)
  const valueGive = p.give.reduce((sum, a) => sum + assetValueFor(s, partner, a), 0);
  const valueGet = p.get.reduce((sum, a) => sum + assetValueFor(s, partner, a), 0);
  const net = Math.round((valueGive - valueGet) * 10) / 10;

  // GM quer receber MAIS do que entrega. Margem de segurança ~ 8 pontos.
  let chance = clamp(50 + (net - 8) * 2.2, 2, 96);
  // times em rebuild valorizam picks; contenders valorizam veteranos prontos
  const rebuild = teamById(s, partner).moral < 55;
  const pickInGive = p.give.some(a => a.kind === 'pick');
  const vetInGive = p.give.some(a => a.kind === 'player' && (s.players.find(x => x.id === a.playerId)?.idade ?? 99) >= 29);
  if (rebuild && pickInGive) chance = clamp(chance + 8, 2, 96);
  if (!rebuild && vetInGive) chance = clamp(chance + 6, 2, 96);
  // leve ruído para não ser determinístico
  chance = clamp(Math.round(chance + rng.f(-4, 4)), 2, 96);

  const parecer =
    chance >= 75 ? 'O GM adversário está animado — oferta muito vantajosa para ele.'
      : chance >= 55 ? 'O GM considera a oferta justa e tende a aceitar.'
        : chance >= 35 ? 'O GM hesita — quer mais valor em troca.'
          : 'O GM ri da oferta. Você precisa oferecer bem mais.';

  return { valueGive: Math.round(valueGive), valueGet: Math.round(valueGet), net, chance, parecer };
}

/* ---------- execução ---------- */
export interface TradeResult { ok: boolean; msg: string; aceita: boolean; }

export function executeProposal(s: GameState, p: TradeProposal, rng: Rng): TradeResult {
  const val = validateProposal(s, p);
  if (!val.ok) return { ok: false, aceita: false, msg: val.erros[0] };

  const ev = evaluateProposal(s, p, rng);
  const aceita = rng.chance(ev.chance / 100);

  const describe = (assets: TradeAsset[], ownerSide: string): string => assets.map(a => {
    if (a.kind === 'pick') {
      const own = s.pickOwners[(a.round ?? 1) - 1]?.[a.slot ?? 0];
      const from = own?.from && own.from !== ownerSide ? ` (de ${teamById(s, own.from).sigla})` : '';
      return `R${a.round}.${(a.slot ?? 0) + 1}${from}`;
    }
    const pl = s.players.find(x => x.id === a.playerId);
    return pl ? `${pl.nome} (${pl.pos})` : '?';
  }).join(', ');

  if (!aceita) {
    s.tradeLog.unshift({
      id: Date.now() + Math.floor(rng.next() * 999),
      temporada: s.settings.temporada, semana: s.settings.semana, fase: s.settings.fase,
      a: p.from, b: p.to,
      aGives: describe(p.give, p.from), bGives: describe(p.get, p.to),
      aceita: false,
    });
    return { ok: true, aceita: false, msg: `Recusada! ${teamById(s, p.to).sigla} quer mais valor (chance era ${ev.chance}%).` };
  }

  // --- executa a troca ---
  // jogadores (chegam sem entrosamento; a rotatividade derruba a química dos dois lados)
  let movidos = 0;
  for (const a of p.give) {
    if (a.kind !== 'player') continue;
    const pl = s.players.find(x => x.id === a.playerId)!;
    pl.teamId = p.to; pl.status = 'RES'; pl.anosNoTime = 0;
    pl.moral = clamp(pl.moral - 4, 30, 95);
    movidos++;
  }
  for (const a of p.get) {
    if (a.kind !== 'player') continue;
    const pl = s.players.find(x => x.id === a.playerId)!;
    pl.teamId = p.from; pl.status = 'RES'; pl.anosNoTime = 0;
    pl.moral = clamp(pl.moral + 4, 30, 95);
    movidos++;
  }
  if (movidos > 0) {
    addChurn(s, p.from, 10);
    addChurn(s, p.to, 10);
  }
  // picks: transfere a posse (mantém o `from` original para rastreio)
  for (const a of p.give) {
    if (a.kind !== 'pick') continue;
    const cell = s.pickOwners[(a.round ?? 1) - 1][(a.slot ?? 0)];
    cell.owner = p.to;
  }
  for (const a of p.get) {
    if (a.kind !== 'pick') continue;
    const cell = s.pickOwners[(a.round ?? 1) - 1][(a.slot ?? 0)];
    if (!cell.from || cell.from === cell.owner) cell.from = p.to; // registra origem
    cell.owner = p.from;
  }

  const aDesc = describe(p.give, p.from);
  const bDesc = describe(p.get, p.to);
  s.tradeLog.unshift({
    id: Date.now() + Math.floor(rng.next() * 999),
    temporada: s.settings.temporada, semana: s.settings.semana, fase: s.settings.fase,
    a: p.from, b: p.to, aGives: aDesc, bGives: bDesc, aceita: true,
  });
  s.news.unshift({
    id: Date.now() + Math.floor(rng.next() * 999),
    rotulo: 'TRADE',
    texto: `${teamById(s, p.from).sigla} envia ${aDesc} para ${teamById(s, p.to).sigla} e recebe ${bDesc}.`,
  });
  return { ok: true, aceita: true, msg: `TROCA FECHADA! ${teamById(s, p.to).sigla} aceitou (chance ${ev.chance}%).` };
}

/** Inicializa a posse de picks: cada franquia detém as próprias escolhas. */
export function initialPickOwners(teamIds: string[]): PickOwner[][] {
  return Array.from({ length: ROUNDS }, () =>
    Array.from({ length: SLOTS_PER_ROUND }, (_, slot) => ({
      owner: teamIds[slot % teamIds.length],
      from: null,
    })));
}
