/* ============================================================
 * Orquestração da temporada: calendário NFL, tabela, avanço de
 * semanas, playoffs, offseason guiada e o SISTEMA DE INFLAÇÃO.
 * ============================================================ */

import type {
  Conf, ContractOffer, ContractStructure, Focus, GameResult, GameState, Match, Player, Pos, PowerRankingEntry, Rivalry, Screen, Staff, Team, TeamBox, TeamSeasonStats,
} from './types';
import { zeroStats, zeroTeamStats } from './types';
import { Rng, clamp, newSeed } from './rng';
import { computeOvr, genName, POS_ORDER, rookieSalary, salaryFor } from './data';
import type { Side } from './engine';
import { NFLMatchEngine } from './engine';
import { applyDraftSurprise, resetScouting, scoutBudgetMaxFor } from './scouting';
import { emptyProBowl, runWeeklyProBowlVoting, selectProBowlRoster, type WeekBox } from './probowl';
import { addChurn, recalcChemistry } from './franchise';
import {
  acceptanceRoll, calcExpectations, franchiseTagValue, happinessVerdict,
  makeContract, makeTagContract, negotiationHappiness, shouldHoldout,
  STRUCT_LABEL,
} from './contracts';
import { staffExpectations, staffHappiness } from './negotiations';
import { simulateTrainingWeek, type TrainingCenterState } from './training';
import {
  computeStandings as computeFullStandings, rankDivision as rankDivisionTb,
  conferenceOrder, generatePlayoffBracket, type TeamStanding,
} from './tiebreakers';

/* ================= helpers ================= */
export const teamById = (s: GameState, id: string): Team => s.teams.find(t => t.id === id)!;
export const playersOf = (s: GameState, teamId: string): Player[] => s.players.filter(p => p.teamId === teamId);
export const staffOf = (s: GameState, teamId: string): Staff[] => s.staff.filter(st => st.teamId === teamId);
export const fmtM = (v: number) => `$${v.toFixed(1).replace('.', ',')}M`;

/**
 * 🏈 Campanha no formato oficial W-L-T (vitória-derrota-empate).
 * O empate (T) só aparece quando houver ao menos 1, ex.: `11-6` ou `11-6-2`.
 */
export const fmtRecord = (v: number, d: number, e: number): string =>
  e > 0 ? `${v}-${d}-${e}` : `${v}-${d}`;

/** Cap hit atual: contrato estruturado (ano 1) ou salário simples. */
export const capHitOf = (p: Player) =>
  p.contract && p.contract.capHits.length ? p.contract.capHits[0] : p.salario;
export const capUsed = (s: GameState, teamId: string) =>
  Math.round(playersOf(s, teamId).reduce((sum, p) => sum + capHitOf(p), 0) * 10) / 10;

export const crowdPressure = (t: Team) => {
  const h = t.histCampanha ?? [0.5];
  const recente = (h[0] ?? 0.5) * 0.5 + (h[1] ?? 0.4) * 0.3 + (h[2] ?? 0.3) * 0.2;
  return clamp(Math.round(t.hostilidade * 0.6 + recente * 100 * 0.4), 5, 99);
};

export const sideOf = (s: GameState, teamId: string): Side => ({
  team: teamById(s, teamId),
  players: playersOf(s, teamId),
  staff: staffOf(s, teamId),
  pressao: crowdPressure(teamById(s, teamId)),
});

export function teamStrength(s: GameState, teamId: string): number {
  const ativos = playersOf(s, teamId).filter(p => p.status !== 'PS' && p.lesao === 0);
  if (!ativos.length) return 50;
  const top = [...ativos].sort((a, b) => b.ovr - a.ovr).slice(0, 22);
  return clamp(Math.round(top.reduce((a, p) => a + p.ovr, 0) / top.length), 40, 95);
}

export const pushNews = (s: GameState, rotulo: string, texto: string) => {
  s.news.unshift({ id: Date.now() + Math.floor(Math.random() * 9999), rotulo, texto });
};

function updateMediaNarratives(s: GameState, results: Match[]): void {
  const previous = new Map(s.narrativas.map(n => [`${n.type}:${n.affectedPlayerId ?? n.teamId}`, n]));
  const candidates: GameState['narrativas'] = [];
  const add = (type: GameState['narrativas'][number]['type'], teamId: string, headline: string, pressureLevel: number, affectedPlayerId?: string) => {
    const key = `${type}:${affectedPlayerId ?? teamId}`;
    const old = previous.get(key);
    candidates.push({ type, teamId, affectedPlayerId, weeksActive: (old?.weeksActive ?? 0) + 1, pressureLevel, headline });
  };

  const contractPlayer = [...s.players]
    .filter(p => p.teamId && p.contrato === 1 && p.ovr >= 78)
    .sort((a, b) => b.ovr - a.ovr)[0];
  if (contractPlayer) add('contract_year', contractPlayer.teamId!, `${contractPlayer.nome} entra em ano de contrato — cada snap pesa no próximo salário.`, 7, contractPlayer.id);

  const sophomore = [...s.players]
    .filter(p => p.teamId && !p.rookie && p.jogosCarreira >= 17 && p.jogosCarreira <= 34 && p.ovr >= 72)
    .sort((a, b) => b.ovr - a.ovr)[0];
  if (sophomore) add('sophomore_slump', sophomore.teamId!, `${sophomore.nome} enfrenta a cobrança do segundo ano — a liga já descobriu seus atalhos.`, 6, sophomore.id);

  const rookieQb = s.players.find(p => p.teamId && p.pos === 'QB' && p.rookie && p.status === 'TIT');
  if (rookieQb) add('rookie_qb', rookieQb.teamId!, `${rookieQb.nome} é o QB novato sob escrutínio máximo. Uma interceptação vira manchete.`, 8, rookieQb.id);

  const favorite = [...s.teams].sort((a, b) => teamStrength(s, b.id) - teamStrength(s, a.id))[0];
  if (favorite && teamStrength(s, favorite.id) >= 84) add('championship_or_bust', favorite.id, `${favorite.cidade} ${favorite.nome}: talento de campeão ou temporada perdida?`, 9);

  s.narrativas = candidates;
  for (const narrative of candidates) {
    const firstWeek = narrative.weeksActive === 1;
    const relevantResult = results.find(m => m.casa === narrative.teamId || m.fora === narrative.teamId);
    if (firstWeek) pushNews(s, 'MANCHETE', narrative.headline);
    if (narrative.type === 'championship_or_bust' && relevantResult?.jogada) {
      const home = relevantResult.casa === narrative.teamId;
      const won = home ? relevantResult.placarCasa! > relevantResult.placarFora! : relevantResult.placarFora! > relevantResult.placarCasa!;
      if (!won && relevantResult.placarCasa !== relevantResult.placarFora) pushNews(s, 'PRESSÃO', `${narrative.headline} A derrota aumenta a temperatura nos bastidores.`);
    }
  }
}

/* ============================================================
 * CALENDÁRIO OFICIAL DA NFL — 17 jogos por time
 * ============================================================ */
export interface SchedTeam { id: string; conf: Conf; div: number; }
interface Game { casa: string; fora: string; isDiv: boolean; }
export type RankMap = Map<string, number>;

const ROT3: [number, number][][] = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
const pairs3 = (step: number) => ROT3[((step % 3) + 3) % 3];

function buildMatchups(teams: SchedTeam[], year: number, ranks: RankMap): Game[] {
  const games: Game[] = [];
  const byDiv = new Map<string, SchedTeam[]>();
  for (const t of teams) {
    const k = `${t.conf}-${t.div}`;
    byDiv.set(k, [...(byDiv.get(k) ?? []), t]);
  }
  const divOf = (conf: Conf, div: number) => byDiv.get(`${conf}-${div}`)!;
  const rankOf = (id: string) => ranks.get(id) ?? 1;
  const divByRank = (conf: Conf, div: number) =>
    [...divOf(conf, div)].sort((a, b) => rankOf(a.id) - rankOf(b.id));

  const intra = pairs3(year);
  const parity = year % 2;

  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    for (let d = 0; d < 4; d++) {
      const div = divOf(conf, d);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        games.push({ casa: div[i].id, fora: div[j].id, isDiv: true });
        games.push({ casa: div[j].id, fora: div[i].id, isDiv: true });
      }
    }
    for (const [da, db] of intra) {
      const A = divByRank(conf, da); const B = divByRank(conf, db);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const aHosts = (i + j + parity) % 2 === 0;
        games.push(aHosts ? { casa: A[i].id, fora: B[j].id, isDiv: false } : { casa: B[j].id, fora: A[i].id, isDiv: false });
      }
    }
    const [[p0, p1], [p2, p3]] = intra;
    const edges: [number, number][] = [[p0, p2], [p2, p1], [p1, p3], [p3, p0]];
    for (const [dh, da] of edges) {
      const H = divByRank(conf, dh); const A = divByRank(conf, da);
      for (let r = 0; r < 4; r++) {
        const h = H[r]; const a = A[r];
        if (h && a) games.push({ casa: h.id, fora: a.id, isDiv: false });
      }
    }
  }

  for (let d = 0; d < 4; d++) {
    const oppDiv = (d + year) % 4;
    const A = divByRank('AFC', d); const B = divByRank('NFC', oppDiv);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const aHosts = (i + j + parity) % 2 === 0;
      games.push(aHosts ? { casa: A[i].id, fora: B[j].id, isDiv: false } : { casa: B[j].id, fora: A[i].id, isDiv: false });
    }
  }

  const g17Conf: Conf = year % 2 === 0 ? 'AFC' : 'NFC';
  const otherConf: Conf = g17Conf === 'AFC' ? 'NFC' : 'AFC';
  for (const t of teams) {
    if (t.conf !== g17Conf) continue;
    const targetDiv = (t.div + year + 2) % 4;
    const opp = divByRank(otherConf, targetDiv)[rankOf(t.id) - 1];
    if (!opp) continue;
    games.push({ casa: t.id, fora: opp.id, isDiv: false });
  }

  const seen = new Set<string>();
  return games.filter(g => {
    const k = `${g.casa}>${g.fora}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function validateMatchups(teams: SchedTeam[], games: Game[]): string | null {
  const count = new Map<string, number>();
  const home = new Map<string, number>();
  const divVs = new Map<string, Map<string, number>>();
  const pairCount = new Map<string, number>();
  for (const g of games) {
    count.set(g.casa, (count.get(g.casa) ?? 0) + 1);
    count.set(g.fora, (count.get(g.fora) ?? 0) + 1);
    home.set(g.casa, (home.get(g.casa) ?? 0) + 1);
    const pk = [g.casa, g.fora].sort().join('|');
    pairCount.set(pk, (pairCount.get(pk) ?? 0) + 1);
    if (g.isDiv) for (const [a, b] of [[g.casa, g.fora], [g.fora, g.casa]] as const) {
      const m = divVs.get(a) ?? new Map<string, number>();
      m.set(b, (m.get(b) ?? 0) + 1);
      divVs.set(a, m);
    }
  }
  for (const [pk, n] of pairCount) {
    if (n > 2) return `confronto ${pk.replace('|', ' × ')} acontece ${n}x (máx. 2)`;
    const [a, b] = pk.split('|');
    const ta = teams.find(t => t.id === a)!; const tb = teams.find(t => t.id === b)!;
    const sameDiv = ta.conf === tb.conf && ta.div === tb.div;
    if (n === 2 && !sameDiv) return `confronto não-divisão ${pk.replace('|', ' × ')} acontece 2x`;
  }
  for (const t of teams) {
    const n = count.get(t.id) ?? 0;
    if (n !== 17) return `${t.id} tem ${n} jogos (esperado 17)`;
    const h = home.get(t.id) ?? 0;
    if (h < 8 || h > 9) return `${t.id} tem ${h} jogos em casa (esperado 8-9)`;
    const mo = divVs.get(t.id) ?? new Map();
    if ([...mo.values()].reduce((a, b) => a + b, 0) !== 6) return `${t.id} sem 6 jogos de divisão`;
  }
  return null;
}

function fallbackSchedule(teams: SchedTeam[]): Game[] {
  const games: Game[] = [];
  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    const arr = teams.filter(t => t.conf === conf);
    for (let d = 0; d < 4; d++) {
      const div = arr.filter(t => t.div === d);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        games.push({ casa: div[i].id, fora: div[j].id, isDiv: true });
        games.push({ casa: div[j].id, fora: div[i].id, isDiv: true });
      }
    }
    const skip = new Map<string, string>();
    for (let d = 0; d < 4; d++) {
      const div = arr.filter(t => t.div === d);
      skip.set(div[0].id, div[1].id); skip.set(div[1].id, div[0].id);
      skip.set(div[2].id, div[3].id); skip.set(div[3].id, div[2].id);
    }
    for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) {
      const a = arr[i]; const b = arr[j];
      if (skip.get(a.id) === b.id) continue;
      games.push((i + j) % 2 === 0 ? { casa: a.id, fora: b.id, isDiv: false } : { casa: b.id, fora: a.id, isDiv: false });
    }
  }
  return games;
}

function repairMatchups(teams: SchedTeam[], raw: Game[]): Game[] {
  const games = [...raw];
  const count = () => {
    const c = new Map<string, number>(); const h = new Map<string, number>();
    for (const g of games) {
      c.set(g.casa, (c.get(g.casa) ?? 0) + 1); c.set(g.fora, (c.get(g.fora) ?? 0) + 1);
      h.set(g.casa, (h.get(g.casa) ?? 0) + 1);
    }
    return { c, h };
  };
  for (let guard = 0; guard < 800; guard++) {
    const { h } = count();
    const low = teams.find(t => (h.get(t.id) ?? 0) < 8);
    const high = teams.find(t => (h.get(t.id) ?? 0) > 9);
    if (!low && !high) break;
    let flipped = false;
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (g.isDiv) continue;
      if (low && g.fora === low.id && (h.get(g.casa) ?? 0) <= 9) { games[i] = { ...g, casa: g.fora, fora: g.casa }; flipped = true; break; }
      if (high && g.casa === high.id && (h.get(g.fora) ?? 0) <= 8) { games[i] = { ...g, casa: g.fora, fora: g.casa }; flipped = true; break; }
    }
    if (!flipped) break;
  }
  return games;
}

function assignWeeks(teams: SchedTeam[], games: Game[], rng: Rng): { weeks: Game[][]; week18: Game[] } {
  const byDiv = new Map<string, SchedTeam[]>();
  for (const t of teams) {
    const k = `${t.conf}-${t.div}`;
    byDiv.set(k, [...(byDiv.get(k) ?? []), t]);
  }
  // semana 18 = divisão (um confronto por par de rivais)
  const week18: Game[] = [];
  const w18Keys = new Set<string>();
  for (const [key, tms] of byDiv) {
    if (tms.length < 4) continue;
    const flip = (key.length + tms[0].id.length) % 2 === 1;
    const pairs: [SchedTeam, SchedTeam][] = flip
      ? [[tms[0], tms[2]], [tms[1], tms[3]]]
      : [[tms[0], tms[1]], [tms[2], tms[3]]];
    for (const [a, b] of pairs) {
      const legs = games.filter(g => g.isDiv &&
        ((g.casa === a.id && g.fora === b.id) || (g.casa === b.id && g.fora === a.id)) &&
        !w18Keys.has(`${g.casa}>${g.fora}`));
      if (!legs.length) continue;
      const pick = legs[(a.id.length + b.id.length) % legs.length];
      week18.push(pick);
      w18Keys.add(`${pick.casa}>${pick.fora}`);
    }
  }
  const rest = games.filter(g => !w18Keys.has(`${g.casa}>${g.fora}`));

  // bye weeks 5-14 (índices 4..13): 8 semanas com 4 folgas (paridade par —
  // sempre dá para emparelhar os demais), sem rivais de divisão na mesma semana
  const bye = new Map<string, number>();
  {
    const byeWeeks = rng.shuffle([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).slice(0, 8);
    const slots = new Map<number, string[]>();
    for (const w of byeWeeks) slots.set(w, []);
    for (const key of rng.shuffle([...byDiv.keys()])) {
      const usedByDiv = new Set<number>();
      for (const t of rng.shuffle(byDiv.get(key)!)) {
        const open = byeWeeks
          .filter(w => !usedByDiv.has(w) && (slots.get(w)?.length ?? 0) < 4)
          .sort((a, b) => (slots.get(a)!.length - slots.get(b)!.length) || (rng.next() - 0.5));
        const w = open[0] ?? byeWeeks[0];
        slots.get(w)!.push(t.id);
        usedByDiv.add(w);
        bye.set(t.id, w);
      }
    }
  }

  /* Alocação semanas 1..17 — mínimos conflitos.
     INVARIANTE GARANTIDO: nenhum time joga duas vezes na mesma semana.
     Cada time tem 16 jogos nas 17 semanas (1 bye + 1 folga), então sempre
     existe uma solução perfeita; o algoritmo a encontra por reparo iterativo. */
  const N = 17;
  // semana[i] = lista de jogos; busy[i] = set de times ocupados na semana i
  const weeks: Game[][] = Array.from({ length: N }, () => []);
  const busy: Set<string>[] = Array.from({ length: N }, () => new Set<string>());
  for (let w = 0; w < N; w++) {
    for (const t of teams) if (bye.get(t.id) === w) busy[w].add(t.id);
  }
  // em qual semana cada jogo está (-1 = não alocado)
  const weekOf = new Array<number>(rest.length).fill(-1);

  const conflictsAt = (w: number, g: Game): number => {
    let c = 0;
    if (busy[w].has(g.casa)) c++;
    if (busy[w].has(g.fora)) c++;
    return c;
  };

  // 1) Inicialização gulosa: cada jogo na semana com menos conflitos
  const order = rng.shuffle(rest.map((_, i) => i));
  for (const gi of order) {
    const g = rest[gi];
    let bestW = 0; let bestC = Infinity;
    for (let w = 0; w < N; w++) {
      const c = conflictsAt(w, g);
      if (c < bestC || (c === bestC && rng.next() < 0.5)) { bestC = c; bestW = w; }
    }
    weekOf[gi] = bestW;
    weeks[bestW].push(g);
    busy[bestW].add(g.casa); busy[bestW].add(g.fora);
  }

  // 2) Reparo por mínimos conflitos até não haver choque de times
  const isConflicted = (gi: number): boolean => {
    const w = weekOf[gi]; const g = rest[gi];
    let cntC = 0; let cntF = 0;
    for (const other of weeks[w]) {
      if (other === g) continue;
      if (other.casa === g.casa || other.fora === g.casa) cntC++;
      if (other.casa === g.fora || other.fora === g.fora) cntF++;
    }
    return cntC > 0 || cntF > 0;
  };

  for (let iter = 0; iter < 20000; iter++) {
    const conflicted = rest.map((_, i) => i).filter(isConflicted);
    if (conflicted.length === 0) break;
    const gi = conflicted[rng.int(0, conflicted.length - 1)];
    const g = rest[gi];
    const from = weekOf[gi];
    // semana com menos conflitos para este jogo (excluindo a atual para forçar movimento)
    let bestW = from; let bestC = Infinity;
    for (let w = 0; w < N; w++) {
      const c = conflictsAt(w, g) + weeks[w].length * 0.001; // leve preferência por semanas vazias
      if (w !== from && (c < bestC || (c === bestC && rng.next() < 0.5))) { bestC = c; bestW = w; }
    }
    if (bestW === from) continue;
    // move o jogo
    weeks[from] = weeks[from].filter(x => x !== g);
    busy[from] = new Set(weeks[from].flatMap(x => [x.casa, x.fora]));
    for (const t of teams) if (bye.get(t.id) === from) busy[from].add(t.id);
    weeks[bestW].push(g);
    busy[bestW] = new Set(weeks[bestW].flatMap(x => [x.casa, x.fora]));
    for (const t of teams) if (bye.get(t.id) === bestW) busy[bestW].add(t.id);
    weekOf[gi] = bestW;
  }

  // 3) Correção forçada do invariante: nenhum time 2x na mesma semana.
  //    Remove duplicatas e as redistribui em semanas livres.
  const overflow: Game[] = [];
  for (let w = 0; w < N; w++) {
    const seen = new Set<string>();
    const kept: Game[] = [];
    for (const g of weeks[w]) {
      if (seen.has(g.casa) || seen.has(g.fora)) {
        overflow.push(g); // conflito: retira da semana
      } else {
        seen.add(g.casa); seen.add(g.fora);
        kept.push(g);
      }
    }
    weeks[w] = kept;
  }
  // redistribui o que sobrou em semanas com ambos os times livres
  for (const g of [...overflow]) {
    for (let w = 0; w < N; w++) {
      const busyW = new Set(weeks[w].flatMap(x => [x.casa, x.fora]));
      for (const t of teams) if (bye.get(t.id) === w) busyW.add(t.id);
      if (!busyW.has(g.casa) && !busyW.has(g.fora)) {
        weeks[w].push(g);
        overflow.splice(overflow.indexOf(g), 1);
        break;
      }
    }
  }
  if (overflow.length > 0) {
    console.warn(`Calendário: ${overflow.length} jogo(s) sem semana — o grafo de confrontos não fechou. Isso não deveria acontecer.`);
  }

  return { weeks, week18 };
}

export function initialRanks(teams: { id: string; conf: Conf; div: number; s: number }[], rng: Rng): RankMap {
  const map: RankMap = new Map();
  const byDiv = new Map<string, { id: string; s: number }[]>();
  for (const t of teams) {
    const k = `${t.conf}-${t.div}`;
    byDiv.set(k, [...(byDiv.get(k) ?? []), { id: t.id, s: t.s * 100 + rng.int(0, 9) }]);
  }
  for (const list of byDiv.values()) {
    list.sort((a, b) => b.s - a.s);
    list.forEach((x, i) => map.set(x.id, i + 1));
  }
  return map;
}

export function generateNFLSchedule(teams: SchedTeam[], year: number, ranks: RankMap, rng: Rng): Match[] {
  let games = buildMatchups(teams, year, ranks);
  games = repairMatchups(teams, games);
  const err = validateMatchups(teams, games);
  if (err) {
    console.warn('Calendário oficial falhou, usando fallback:', err);
    games = repairMatchups(teams, fallbackSchedule(teams));
  } else {
    console.info('✓ Calendário NFL ok: 32×17 jogos, 6 de divisão por time.');
  }
  const { weeks, week18 } = assignWeeks(teams, games, rng);
  const ms: Match[] = [];
  weeks.forEach((weekGames, w) => weekGames.forEach((g, i) => ms.push({
    id: `reg-${w + 1}-${g.casa}-${i}-${year}`, fase: 'REG', rodada: w + 1,
    casa: g.casa, fora: g.fora, placarCasa: null, placarFora: null, jogada: false,
  })));
  week18.forEach((g, i) => ms.push({
    id: `reg-18-${g.casa}-${i}-${year}`, fase: 'REG', rodada: 18,
    casa: g.casa, fora: g.fora, placarCasa: null, placarFora: null, jogada: false,
  }));
  return ms;
}

/**
 * 🧹 Reset de Pré-temporada: ao virar para a temporada regular, zera tudo que os
 * dois amistosos acumularam — estatísticas de jogadores, acumuladores de franquia,
 * power rankings, narrativas e storylines. Estatísticas de carreira são preservadas.
 */
export function resetPreseasonStats(s: GameState): void {
  // estatísticas da temporada (mantém carreira e jogos de carreira)
  for (const p of s.players) {
    p.stats = zeroStats();
  }
  // acumuladores por franquia
  s.teamSeasonStats = s.teams.map(t => zeroTeamStats(t.id, s.settings.temporada));
  // rankings e narrativas da pré-temporada
  s.powerRankings = [];
  s.seasonStorylines = [];
  s.narrativas = [];
  pushNews(s, 'RESET', 'Classificação e estatísticas zeradas após a Pré-temporada. A temporada regular começa limpa — todos os times 0-0.');
}

/* ================= classificação ================= */
export interface TableRow {
  teamId: string; j: number; v: number; e: number; d: number;
  pf: number; pc: number; net: number; seq: string;
  /* métricas oficiais de desempate (NFL) — preenchidas via tiebreakers */
  winPct?: number; divPct?: number; confPct?: number;
  sov?: number; sos?: number;
  tiebreakNote?: string | null;
  tiebreakKey?: string;   // chave curta do critério de desempate (H2H, DIV, SOV…)
  gamesBehind?: number;   // jogos atrás do líder
  tiedAbove?: boolean;    // mesma campanha do time de cima
  divRec?: string;        // recorde dentro da divisão "4-2"
  isChamp?: boolean;
  seed?: number | null;
}
export type { TeamStanding };
export { computeFullStandings, rankDivisionTb, conferenceOrder, generatePlayoffBracket };
export function standings(s: GameState): TableRow[] {
  const rows: TableRow[] = s.teams.map(t => ({ teamId: t.id, j: 0, v: 0, e: 0, d: 0, pf: 0, pc: 0, net: 0, seq: '' }));
  const byId = new Map(rows.map(r => [r.teamId, r]));
  for (const m of s.matches) {
    // apenas partidas da temporada regular contam para a classificação
    if (m.fase !== 'REG') continue;
    if (!m.jogada || m.placarCasa == null || m.placarFora == null) continue;
    const rc = byId.get(m.casa)!; const rf = byId.get(m.fora)!;
    rc.j++; rf.j++;
    rc.pf += m.placarCasa; rc.pc += m.placarFora;
    rf.pf += m.placarFora; rf.pc += m.placarCasa;
    if (m.placarCasa > m.placarFora) { rc.v++; rf.d++; rc.seq += 'V '; rf.seq += 'D '; }
    else if (m.placarCasa < m.placarFora) { rf.v++; rc.d++; rf.seq += 'V '; rc.seq += 'D '; }
    else { rc.e++; rf.e++; rc.seq += 'E '; rf.seq += 'E '; }
  }
  for (const r of rows) { r.net = r.pf - r.pc; r.seq = r.seq.trim().split(' ').slice(-5).join(' '); }
  return rows;
}
/** Tabela da divisão ordenada pelos 15 tiebreakers oficiais da NFL. */
export function divisionTable(s: GameState, conf: Conf, div: number): TableRow[] {
  const full = computeFullStandings(s);
  const ordered = rankDivisionTb(s, conf, div, full);
  const base = new Map(standings(s).map(r => [r.teamId, r]));
  return ordered.map(t => {
    const b = base.get(t.teamId)!;
    return {
      ...b,
      winPct: t.winPct, divPct: t.divPct, confPct: t.confPct,
      sov: t.sov, sos: t.sos,
      tiebreakNote: t.tiebreakNote, tiebreakKey: t.tiebreakKey,
      gamesBehind: t.gamesBehind, tiedAbove: t.tiedAbove,
      divRec: `${t.divWins}-${t.divLosses}${t.divTies ? `-${t.divTies}` : ''}`,
      isChamp: t.isDivisionChampion,
    };
  });
}

/** Conferência inteira ordenada (campeões 1–4 + wild cards 5–7 + bolha), com GB e desempates. */
export function conferenceTable(s: GameState, conf: Conf): TableRow[] {
  const ordered = conferenceOrder(s, conf);
  const base = new Map(standings(s).map(r => [r.teamId, r]));
  return ordered.map(t => {
    const b = base.get(t.teamId)!;
    return {
      ...b,
      winPct: t.winPct, divPct: t.divPct, confPct: t.confPct,
      sov: t.sov, sos: t.sos,
      tiebreakNote: t.tiebreakNote, tiebreakKey: t.tiebreakKey,
      gamesBehind: t.gamesBehind, tiedAbove: t.tiedAbove,
      divRec: `${t.divWins}-${t.divLosses}${t.divTies ? `-${t.divTies}` : ''}`,
      isChamp: t.isDivisionChampion, seed: t.playoffSeed,
    };
  });
}
/**
 * Seeds 1–7 da conferência pelos tiebreakers oficiais.
 * Regra de ouro: campeões de divisão (1–4) SEMPRE à frente dos wild cards (5–7).
 */
export function conferenceSeeds(s: GameState, conf: Conf): { teamId: string; seed: number }[] {
  return conferenceOrder(s, conf)
    .filter(t => t.playoffSeed != null)
    .sort((a, b) => a.playoffSeed! - b.playoffSeed!)
    .map(t => ({ teamId: t.teamId, seed: t.playoffSeed! }));
}
export function playoffZone(s: GameState, conf: Conf): Set<string> {
  return new Set(conferenceSeeds(s, conf).map(x => x.teamId));
}

export function generatePowerRankings(s: GameState): PowerRankingEntry[] {
  const table = standings(s);
  const scoreFor = (teamId: string) => {
    const row = table.find(x => x.teamId === teamId)!;
    const played = s.matches.filter(m => m.jogada && (m.casa === teamId || m.fora === teamId));
    const opponents = played.map(m => m.casa === teamId ? m.fora : m.casa);
    const sos = opponents.length ? opponents.reduce((sum, id) => sum + teamStrength(s, id), 0) / opponents.length / 100 : 0.5;
    const recent = played.slice(-3);
    const recentPerformance = recent.length ? recent.reduce((sum, m) => {
      const home = m.casa === teamId;
      return sum + (home ? (m.placarCasa! > m.placarFora! ? 1 : m.placarCasa === m.placarFora ? 0.5 : 0) : (m.placarFora! > m.placarCasa! ? 1 : m.placarFora === m.placarCasa ? 0.5 : 0));
    }, 0) / recent.length : 0.5;
    return row.v / Math.max(1, row.j) * 40 + row.net * 0.1 + sos * 20 + recentPerformance * 30;
  };
  return s.teams.map(t => ({ teamId: t.id, rank: 0, score: Math.round(scoreFor(t.id) * 10) / 10 }))
    .sort((a, b) => b.score - a.score || teamStrength(s, b.teamId) - teamStrength(s, a.teamId))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function recordPowerRankings(s: GameState, week: number): void {
  if (s.powerRankings.some(snapshot => snapshot.season === s.settings.temporada && snapshot.week === week)) return;
  s.powerRankings.push({ season: s.settings.temporada, week, entries: generatePowerRankings(s) });
}

export function updateSeasonStorylines(s: GameState): void {
  const table = standings(s);
  const next: GameState['seasonStorylines'] = [];
  const previous = new Map(s.seasonStorylines.map(story => [story.type, story]));
  const add = (type: GameState['seasonStorylines'][number]['type'], description: string, affectedTeams: string[]) => {
    const old = previous.get(type);
    next.push({ type, description, affectedTeams, weeksActive: (old?.weeksActive ?? 0) + 1 });
  };
  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    const teams = table.filter(row => teamById(s, row.teamId).conf === conf && row.v >= 8);
    if (teams.length >= 3) add('strong_division', `${conf} domina a temporada: ${teams.length} times já alcançaram 8 vitórias.`, teams.map(row => row.teamId));
  }
  const rookie = s.players.filter(p => p.rookie && p.pos === 'QB' && p.teamId && p.stats.py >= 2000 && p.stats.jogos <= 8).sort((a, b) => b.stats.py - a.stats.py)[0];
  if (rookie) add('rookie_record', `${rookie.nome} está quebrando recordes: ${rookie.stats.py} jardas nas primeiras ${rookie.stats.jogos} partidas.`, [rookie.teamId!]);
  const historicDefense = s.teams.map(team => {
    const games = table.find(row => row.teamId === team.id)?.j ?? 0;
    const stats = s.teamSeasonStats.find(row => row.teamId === team.id);
    return { team, average: stats && games ? stats.pointsAllowed / games : 99 };
  }).filter(row => row.average < 15).sort((a, b) => a.average - b.average)[0];
  if (historicDefense) add('historic_defense', `A defesa dos ${historicDefense.team.nome} permite ${historicDefense.average.toFixed(1)} pontos por jogo — ritmo histórico.`, [historicDefense.team.id]);
  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    const leaders = table.filter(row => teamById(s, row.teamId).conf === conf).sort((a, b) => (b.v + b.e * 0.5) - (a.v + a.e * 0.5) || b.net - a.net).slice(0, 3);
    if (leaders.length === 3 && leaders[0].v === leaders[2].v) add('seed_race', `Corrida pelo #1 seed na ${conf}: três franquias estão empatadas com ${leaders[0].v} vitórias.`, leaders.map(row => row.teamId));
  }
  s.seasonStorylines = next;
}

/* ================= estatísticas acumuladas da temporada ================= */
/** Retorna (ou cria) o acumulador de estatísticas de uma franquia. */
export function getTeamStats(s: GameState, teamId: string): TeamSeasonStats {
  let st = s.teamSeasonStats.find(x => x.teamId === teamId);
  if (!st) { st = zeroTeamStats(teamId, s.settings.temporada); s.teamSeasonStats.push(st); }
  return st;
}
/** Todas as franquias com seus acumuladores (times sem jogo ainda aparecem zerados). */
export function teamStatsTable(s: GameState): TeamSeasonStats[] {
  return s.teams.map(t => {
    const found = s.teamSeasonStats.find(x => x.teamId === t.id);
    return found ?? zeroTeamStats(t.id, s.settings.temporada);
  });
}

/* ================= avanço de semana ================= */
export interface AdvanceOutcome { match?: GameResult; eliminado?: boolean; }

function mergeStats(s: GameState, r: GameResult, importantGame: boolean, rivalry?: Rivalry, playoffGame = false) {
  for (const [pid, delta] of Object.entries(r.statDeltas)) {
    const p = s.players.find(x => x.id === pid);
    if (!p) continue;
    for (const [k, v] of Object.entries(delta)) (p.stats as unknown as Record<string, number>)[k] = ((p.stats as unknown as Record<string, number>)[k] ?? 0) + v;
  }
  // campos novos (não presentes em statDeltas) acumulados do box score rico
  for (const l of r.rich.lines) {
    const p = s.players.find(x => x.id === l.id);
    if (!p) continue;
    p.stats.cmp += l.cmp ?? 0;
    p.stats.att += l.att ?? 0;
    p.stats.car += l.rAtt ?? 0;
    p.stats.intDef += l.intDef ?? 0;
    p.stats.ff += l.ff ?? 0;
    p.stats.punts += l.punts ?? 0;
    p.stats.puntYds += l.puntYds ?? 0;
  }
  // estatísticas acumuladas da temporada por franquia
  const acc = (teamId: string, tb: TeamBox, oppPts: number) => {
    const st = getTeamStats(s, teamId);
    st.pointsScored += tb.pts;
    st.totalYards += tb.yds;
    st.passingYards += tb.passYds;
    st.rushingYards += tb.rushYds;
    st.turnovers += tb.tos;
    st.thirdAtt += tb.thirdAtt;
    st.thirdConv += tb.thirdConv;
    st.pointsAllowed += oppPts;
    for (const l of r.rich.lines) {
      if (l.teamId === teamId) { st.sacks += l.sacks ?? 0; st.interceptions += l.intDef ?? 0; }
    }
  };
  acc(r.casaId, r.rich.casa, r.placarFora);
  acc(r.foraId, r.rich.fora, r.placarCasa);
  for (const pid of r.participantes) {
    const p = s.players.find(x => x.id === pid);
    if (p) { p.stats.jogos++; p.jogosCarreira++; }
  }
  for (const inj of r.lesoes) {
    const p = s.players.find(x => x.id === inj.playerId);
    if (p && p.lesao === 0) { p.lesao = inj.semanas; p.lesaoTotal = inj.semanas; p.lesaoTipo = inj.tipo; }
  }
  const winner = r.placarCasa > r.placarFora ? r.casaId : r.placarFora > r.placarCasa ? r.foraId : null;
  for (const id of [r.casaId, r.foraId]) {
    const t = teamById(s, id);
    const venceu = id === winner;
    const perdeu = winner !== null && !venceu;
    const delta = venceu ? (importantGame ? 5 : 3) : perdeu ? -3 : 0;
    t.moral = clamp(t.moral + delta, 25, 95);
    const ultimos = s.matches.filter(m => m.jogada && (m.casa === id || m.fora === id)).slice(-3);
    const derrotasSeguidas = ultimos.length === 3 && ultimos.every(m => {
      const emCasa = m.casa === id;
      return emCasa ? m.placarCasa! < m.placarFora! : m.placarFora! < m.placarCasa!;
    });
    const criticaMidia = derrotasSeguidas ? -2 : 0;
    for (const p of playersOf(s, id)) {
      let playerDelta = delta + criticaMidia + (rivalry ? 5 : 0);
      if (t.quimica >= 75) playerDelta += 3;
      const line = r.rich.lines.find(l => l.id === p.id);
      if (p.pos === 'QB' && p.status === 'RES' && (line?.snaps ?? 0) > 0) playerDelta -= 10;
      p.moral = clamp(p.moral + playerDelta, 25, 95);
    }
  }
  if (rivalry) {
    rivalry.gamesPlayed++;
    if (winner === r.casaId) {
      if (rivalry.team1Id === r.casaId) rivalry.team1Wins++;
      else rivalry.team2Wins++;
    } else if (winner === r.foraId) {
      if (rivalry.team1Id === r.foraId) rivalry.team1Wins++;
      else rivalry.team2Wins++;
    } else rivalry.draws++;
    rivalry.intensity = Math.min(10, rivalry.intensity + 1);
    pushNews(s, 'RIVALIDADE', `Clássico de alta tensão: ${teamById(s, r.casaId).sigla} × ${teamById(s, r.foraId).sigla} atraiu atenção máxima da mídia.`);
  }
  if (playoffGame) {
    for (const playerId of r.participantes) {
      const player = s.players.find(p => p.id === playerId);
      if (!player) continue;
      player.clutchRating = clamp(player.clutchRating + 5, 0, 100);
      if (winner && player.teamId === (winner === r.casaId ? r.casaId : r.foraId))
        player.clutchRating = clamp(player.clutchRating + 3, 0, 100);
    }
  }
}

function gameRevenue(s: GameState, m: Match, attendance: number): { total: number; tickets: number; tv: number } {
  const ticketPrice = 0.00008; // $80 por ingresso, valores do jogo em milhões
  const tickets = Math.round(attendance * ticketPrice * 100) / 100;
  const tv = Math.round(s.settings.tvDeal * 0.02 * 100) / 100;
  return { total: Math.round((tickets + tv) * 100) / 100, tickets, tv };
}

export function advance(s0: GameState): { state: GameState; out: AdvanceOutcome; trainingResults?: { playerId: string; nome: string; improvements: Record<string, number> }[] } {
  const s = structuredClone(s0);
  const out: AdvanceOutcome = {};
  const { fase, semana } = s.settings;

  const isUser = (m: Match) => m.casa === s.userTeam || m.fora === s.userTeam;

  // Nos playoffs, garante que os jogos da rodada atual existam como partidas jogáveis.
  if (fase === 'PO') syncPlayoffMatches(s);

  const weekMatches = s.matches.filter(m => m.fase === fase && m.rodada === semana && !m.jogada);

  for (const p of s.players) if (p.lesao > 0) {
    p.lesao--;
    if (p.lesao === 0) { p.lesaoTipo = null; p.lesaoTotal = 0; }
  }

  const rng = new Rng(newSeed());
  const results: Match[] = [];
  const weekBoxes: WeekBox[] = [];
  let userRes: GameResult | null = null;

  // Mapa para acumular snaps da semana por jogador
  const snapsPorJogadorSemana = new Map<string, number>();

  for (const m of weekMatches) {
    const user = isUser(m);
    const rivalry = s.rivalries.find(r =>
      (r.team1Id === m.casa && r.team2Id === m.fora) || (r.team1Id === m.fora && r.team2Id === m.casa));
    const opponentScouted = s.opponentScouting.some(r => r.teamId === (m.casa === s.userTeam ? m.fora : m.casa) && r.season === s.settings.temporada);
    const homeRow = standings(s).find(row => row.teamId === m.casa);
    const opponentPopular = teamStrength(s, m.fora) >= 84;
    const attendanceBoost = ((homeRow?.v ?? 0) >= 10 ? 0.10 : 0)
      + (rivalry ? 0.15 : 0) + (opponentPopular ? 0.05 : 0);
    const engine = new NFLMatchEngine(sideOf(s, m.casa), sideOf(s, m.fora), rng, {
      neutro: fase === 'PO' && semana === 4,
      rivalry,
      attendanceBoost,
      opponentScouted,
    });
    const faseLabel = fase === 'PRE' ? `Pré-temporada, semana ${semana}` : fase === 'REG' ? `Semana ${semana}` : `Playoffs — ${s.bracket?.[semana - 1]?.nome ?? ''}`;
    const r = engine.simulate(m.id, faseLabel);
    m.placarCasa = r.placarCasa; m.placarFora = r.placarFora; m.jogada = true;
    m.publico = r.publico;
    const revenue = gameRevenue(s, m, r.publico);
    m.receitaBilheteria = revenue.tickets; m.receitaTV = revenue.tv; m.receitaCasa = revenue.total;
    const homeTeam = teamById(s, m.casa);
    homeTeam.dinheiro = Math.round((homeTeam.dinheiro + revenue.total) * 100) / 100;
    mergeStats(s, r, fase === 'PO' || (fase === 'REG' && semana >= 15), rivalry, fase === 'PO');
    results.push({ ...m });
    
    // Acumula snaps dos jogadores
    for (const line of r.rich.lines) {
      const current = snapsPorJogadorSemana.get(line.id) ?? 0;
      snapsPorJogadorSemana.set(line.id, current + (line.snaps ?? 0));
    }
    
    if (fase === 'REG') weekBoxes.push({ casaId: m.casa, foraId: m.fora, rich: r.rich });
    if (user) { userRes = r; out.match = r; }
  }
  updateMediaNarratives(s, results);
  recordPowerRankings(s, semana);
  updateSeasonStorylines(s);
  s.weekResults = results.filter(m => !isUser(m));
  s.lastResult = userRes;

  // 🏆 Pro Bowl: votação após cada semana da temporada regular
  if (fase === 'REG') runWeeklyProBowlVoting(s, semana, weekBoxes);
  
  // 💪 Sistema de Treino: aplica desenvolvimento semanal apenas na temporada regular e pré-temporada
  let trainingResults: { playerId: string; nome: string; improvements: Record<string, number> }[] = [];
  if (fase === 'REG' || fase === 'PRE') {
    const snapsObj = Object.fromEntries(snapsPorJogadorSemana);
    trainingResults = simulateTrainingWeek(s.players, s.trainingState, snapsObj);
    
    // Notícia se houver evoluções relevantes
    if (trainingResults.length > 0) {
      const destaques = trainingResults.slice(0, 3);
      const nomes = destaques.map(d => d.nome).join(', ');
      pushNews(s, 'TREINAMENTO', `Jogadores evoluíram: ${nomes}${trainingResults.length > 3 ? ' e mais ' + (trainingResults.length - 3) : ''}.`);
    }
  }

  if (fase === 'PRE') {
    if (semana >= 2) {
      resetPreseasonStats(s);   // 🧹 zera classificação e stats antes da temporada regular
      s.settings.fase = 'REG'; s.settings.semana = 1;
      pushNews(s, 'TEMPORADA REGULAR', 'A pré-temporada acabou! 18 semanas valem a vaga nos playoffs. Semana 18 é 100% divisão.');
    } else s.settings.semana++;
  } else if (fase === 'REG') {
    if (semana >= 18) {
      selectProBowlRoster(s);   // 🏆 anuncia o roster do Pro Bowl
      startPlayoffs(s);
    }
    else s.settings.semana++;
  } else if (fase === 'PO') {
    // Grava os resultados simulados no bracket e gera a próxima fase quando a rodada fecha.
    const playedRodada = semana;                      // rodada recém-jogada
    const roundsBefore = s.bracket?.length ?? 0;
    syncRoundResults(s, playedRodada);
    const roundsAfter = s.bracket?.length ?? 0;

    // O usuário foi eliminado se a rodada fechou (nova fase gerada) e ele não está nela.
    if (roundsAfter > roundsBefore && s.bracket) {
      const nova = s.bracket[s.bracket.length - 1];
      const stillIn = nova.jogos.some(j => j.casa === s.userTeam || j.fora === s.userTeam);
      if (!stillIn) {
        const t = teamById(s, s.userTeam);
        pushNews(s, 'ELIMINAÇÃO', `Fim de sonho: ${t.cidade} ${t.nome} cai nos playoffs.`);
        out.eliminado = true;
      }
    }

    s.settings.semana++;
    syncPlayoffMatches(s);   // prepara as partidas da nova rodada no calendário jogável
    if (s.settings.semana > (s.bracket?.length ?? 4)) endSeason(s, rng);
  }
  return { state: s, out, trainingResults };
}

/* ================= playoffs ================= */
function startPlayoffs(s: GameState) {
  s.settings.fase = 'PO'; s.settings.semana = 1;
  const jogos = () => {
    const out: { casa: string; fora: string; pc: number | null; pf: number | null; jogada: boolean }[] = [];
    for (const conf of ['AFC', 'NFC'] as Conf[]) {
      const seeds = conferenceSeeds(s, conf);
      const g = (n: number) => seeds[n - 1].teamId;
      out.push({ casa: g(3), fora: g(6), pc: null, pf: null, jogada: false });
      out.push({ casa: g(4), fora: g(5), pc: null, pf: null, jogada: false });
      out.push({ casa: g(2), fora: g(7), pc: null, pf: null, jogada: false });
    }
    return out;
  };
  s.bracket = [{ nome: 'Wild Card', jogos: jogos() }];
  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    const seeds = conferenceSeeds(s, conf);
    const one = teamById(s, seeds[0].teamId);
    pushNews(s, 'PLAYOFFS', `${one.cidade} ${one.nome} é o seed #1 da ${conf} e folga no Wild Card.`);
  }
  syncPlayoffMatches(s);   // cria as partidas jogáveis da rodada 1 imediatamente
}

function nextRound(s: GameState) {
  const nomes = ['Wild Card', 'Divisional', 'Final de Conferência', 'Super Bowl'];
  const idx = s.bracket!.length - 1;
  const round = s.bracket![idx];
  const map = new Map<Conf, { teamId: string; seed: number }[]>();
  for (const conf of ['AFC', 'NFC'] as Conf[]) map.set(conf, conferenceSeeds(s, conf));

  const winners: { casa: string; fora: string }[] = round.jogos.map(j => ({
    casa: (j.pc ?? 0) >= (j.pf ?? 0) ? j.casa : j.fora,
    fora: (j.pc ?? 0) >= (j.pf ?? 0) ? j.fora : j.casa,
  }));
  const winByConf = new Map<Conf, string[]>();
  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    const seeds = map.get(conf)!;
    const seedOf = new Map(seeds.map(x => [x.teamId, x.seed]));
    const ws = winners.filter(w => seedOf.has(w.casa)).map(w => w.casa);
    winByConf.set(conf, ws.sort((a, b) => seedOf.get(a)! - seedOf.get(b)!));
  }

  const next: { casa: string; fora: string; pc: number | null; pf: number | null; jogada: boolean }[] = [];
  if (nomes[idx + 1] === 'Super Bowl') {
    const a = winByConf.get('AFC')![0]; const b = winByConf.get('NFC')![0];
    const casa = s.settings.temporada % 2 === 0 ? a : b;
    next.push({ casa, fora: casa === a ? b : a, pc: null, pf: null, jogada: false });
  } else {
    for (const conf of ['AFC', 'NFC'] as Conf[]) {
      const seeds = map.get(conf)!;
      const seedOf = new Map(seeds.map(x => [x.teamId, x.seed]));
      const ws = winByConf.get(conf)!;
      if (nomes[idx + 1] === 'Divisional') {
        const one = seeds[0].teamId;
        const wLow = ws[ws.length - 1]; const wHigh = ws[0];
        next.push({ casa: one, fora: wLow, pc: null, pf: null, jogada: false });
        next.push({ casa: wHigh, fora: seeds[1].teamId === wHigh ? seeds.find(x => x.seed === 2 && x.teamId !== wHigh)!.teamId : seeds[1].teamId, pc: null, pf: null, jogada: false });
      } else {
        const sorted = [...ws].sort((a, b) => seedOf.get(a)! - seedOf.get(b)!);
        next.push({ casa: sorted[0], fora: sorted[1], pc: null, pf: null, jogada: false });
      }
    }
  }
  s.bracket!.push({ nome: nomes[idx + 1], jogos: next });
}

/** Garante que os jogos da rodada atual de playoffs existam como partidas jogáveis. */
function syncPlayoffMatches(s: GameState) {
  if (!s.bracket) return;
  const rodada = s.settings.semana;
  const round = s.bracket[rodada - 1];
  if (!round) return;
  for (const j of round.jogos) {
    const exists = s.matches.some(m =>
      m.fase === 'PO' && m.rodada === rodada &&
      ((m.casa === j.casa && m.fora === j.fora) || (m.casa === j.fora && m.fora === j.casa)));
    if (!exists) {
      s.matches.push({
        id: `po-${rodada}-${j.casa}-${j.fora}`,
        fase: 'PO', rodada,
        casa: j.casa, fora: j.fora,
        placarCasa: null, placarFora: null, jogada: false,
      });
    }
  }
}

/** Grava os resultados das partidas jogadas no bracket e gera a próxima fase quando a rodada fecha. */
function syncRoundResults(s: GameState, rodada: number) {
  if (!s.bracket) return;
  const idx = rodada - 1;
  if (idx < 0 || idx >= s.bracket.length) return;
  const round = s.bracket[idx];
  for (const j of round.jogos) {
    if (j.jogada) continue;
    const m = s.matches.find(x =>
      x.fase === 'PO' && x.rodada === rodada &&
      ((x.casa === j.casa && x.fora === j.fora) || (x.casa === j.fora && x.fora === j.casa)) &&
      x.jogada);
    if (!m) continue;
    j.pc = m.casa === j.casa ? m.placarCasa : m.placarFora;
    j.pf = m.casa === j.casa ? m.placarFora : m.placarCasa;
    j.jogada = true;
  }
  if (round.jogos.every(j => j.jogada)) {
    if (round.nome === 'Super Bowl') {
      const sb = round.jogos[0];
      const champ = (sb.pc ?? 0) >= (sb.pf ?? 0) ? sb.casa : sb.fora;
      s.campeoes.push({ temporada: s.settings.temporada, teamId: champ });
      const c = teamById(s, champ);
      pushNews(s, 'SUPER BOWL', `${c.cidade} ${c.nome} é o CAMPEÃO da temporada ${s.settings.temporada}! 🏆`);
    } else {
      nextRound(s);
    }
  }
}

/* ================= fim de temporada → offseason ================= */
function resolveConditionalPicks(s: GameState): void {
  const playoffTeams = new Set(s.teams.flatMap(t => conferenceSeeds(s, t.conf).map(seed => seed.teamId)));
  for (let round = 0; round < s.pickOwners.length; round++) for (let slot = 0; slot < s.pickOwners[round].length; slot++) {
    const cell = s.pickOwners[round][slot];
    const conditional = cell.conditional;
    if (!conditional || conditional.resolvedRound) continue;
    const met = conditional.condition === 'team_makes_playoffs'
      ? playoffTeams.has(cell.owner)
      : !!conditional.conditionPlayerId && s.probowl.votes.some(v => v.playerId === conditional.conditionPlayerId && (v.isStarter || v.isReserve));
    conditional.resolvedRound = met ? conditional.upgradedRound : conditional.baseRound;
    pushNews(s, 'PICKS CONDICIONAIS', `${teamById(s, cell.owner).sigla}: pick R${conditional.baseRound} ${met ? `subiu para R${conditional.upgradedRound}` : 'permaneceu na rodada base'} (${conditional.condition}).`);
  }
}

function endSeason(s: GameState, rng: Rng) {
  s.settings.fase = 'OFF'; s.settings.semana = 0;
  const champion = s.campeoes[s.campeoes.length - 1]?.teamId;
  resolveConditionalPicks(s);
  const aposentados: string[] = [];
  for (const p of [...s.players]) {
    const career = p.careerStats ?? zeroStats();
    for (const key of Object.keys(p.stats) as (keyof typeof p.stats)[]) career[key] += p.stats[key];
    p.careerStats = career;
    if (champion && p.teamId === champion) p.careerChampionships = (p.careerChampionships ?? 0) + 1;
    p.idade++;
    const t = p.teamId ? teamById(s, p.teamId) : null;
    const ct = t ? t.centroTreino : 2;
    let growth = p.idade <= 23 ? 2.1 : p.idade <= 26 ? 1.2 : p.idade <= 29 ? 0.2 : p.idade <= 31 ? -1.1 : p.idade <= 33 ? -2.3 : -3.6;
    growth += (ct - 2) * 0.45;
    if (growth > 0 && p.ovr >= p.pot - 2) growth *= 0.25;
    // 💪 Playing time: jovens que entram em campo evoluem mais.
    // 0 jogos (banco) = 0.5× · temporada completa (17) = 1.3×.
    if (growth > 0 && p.idade <= 26) {
      const tempo = clamp(p.stats.jogos / 17, 0, 1);
      growth *= 0.5 + 0.8 * tempo;
    }
    const focusAttrs: Record<Focus, (keyof Player['attrs'])[]> = {
      CORRIDA: ['corrida', 'bloqueio'], PASSE: ['passe', 'recepcao'],
      DEFESA: ['tackle', 'velocidade'], FISICO: ['resistencia', 'velocidade'],
    };
    const focusKeys = t ? focusAttrs[s.focus] : [];
    for (const k of Object.keys(p.attrs) as (keyof Player['attrs'])[]) {
      let d = growth + rng.f(-1.6, 1.6);
      if (growth > 0 && focusKeys.includes(k) && p.idade <= 27) d += 1.1;
      p.attrs[k] = clamp(Math.round(p.attrs[k] + d), 25, 95);
    }
    p.ovr = computeOvr(p.pos, p.attrs);
    p.lesao = 0; p.lesaoTipo = null; p.lesaoTotal = 0;
    p.rookie = false;
    const retireP = p.idade >= 32 ? (p.idade - 31) * 0.12 + (p.ovr < 70 ? 0.18 : 0) : 0;
    if (rng.chance(retireP)) {
      aposentados.push(p.nome);
      s.hallOfFame.push({ playerId: p.id, nome: p.nome, pos: p.pos, yearsRetired: 0, proBowls: p.careerProBowls ?? 0, championships: p.careerChampionships ?? 0, careerStats: { ...(p.careerStats ?? p.stats) }, fanVotes: 0, mediaVotes: 0, playerVotes: 0, totalVotes: 0, inducted: false, jerseyRetired: false });
      s.players = s.players.filter(x => x.id !== p.id);
    }
  }
  if (aposentados.length)
    pushNews(s, 'APOSENTADORIAS', `${aposentados.length} veteranos penduram as chuteiras, incluindo ${aposentados.slice(0, 2).join(' e ')}.`);

  for (const p of [...s.players]) {
    // consome a temporada que passou do contrato estruturado
    if (p.contract && p.contract.capHits.length > 1) {
      p.contract.capHits.shift();
      p.contract.years = p.contract.capHits.length;
      p.salario = p.contract.capHits[0];
    }
    p.contrato--;
    if (p.contrato > 0) continue;
    if (p.tag) {
      // franchise tag: 1 ano pelo valor de mercado da posição (top 5)
      const value = franchiseTagValue(p.pos, s.players);
      p.contrato = 1;
      p.salario = value;
      p.contract = makeTagContract(value);
      p.tag = false;
      continue;
    }
    p.origem = p.teamId ?? undefined;
    p.teamId = null; p.status = 'RES';
    p.contract = undefined;
    // RFA: menos de 3 temporadas completas (~51 jogos) — time de origem tem direito de match.
    // UFA: 3+ temporadas — livre para assinar com qualquer franquia.
    p.rfa = p.jogosCarreira < 51;
    s.faPool.push(p);
    s.players = s.players.filter(x => x.id !== p.id);
  }

  // holdouts: estrelas em último ano mal pagas (happiness-baseline < 40%) se recusam a jogar
  const holdouts: string[] = [];
  for (const p of s.players) {
    if (p.holdout) { holdouts.push(p.nome); continue; }
    if (shouldHoldout(p, s.settings.inflacao)) {
      p.holdout = true;
      holdouts.push(p.nome);
    }
  }
  if (holdouts.length)
    pushNews(s, 'HOLDOUT', `${holdouts.slice(0, 3).join(', ')}${holdouts.length > 3 ? ` e mais ${holdouts.length - 3}` : ''} em holdout — recusam jogar até renovar. Negocie em Contratos.`);

  s.offPhase = 1;
  s.draftState = null;
  pushNews(s, 'OFFSEASON', 'Fim dos playoffs! Offseason em 4 fases: 1) Free Agency → 2) Renovações → 3) Draft → 4) Validação.');
}

function evaluateHallOfFame(s: GameState): void {
  for (const entry of s.hallOfFame) {
    if (entry.inducted) continue;
    entry.yearsRetired++;
    const stats = entry.careerStats;
    const eliteStats = stats.py >= 30000 || stats.ry >= 10000 || stats.recYds >= 10000 || stats.tackles >= 500;
    const eligible = entry.yearsRetired >= 5 && entry.proBowls >= 5 && eliteStats && entry.championships >= 1;
    if (!eligible) continue;
    entry.fanVotes = Math.min(100, 60 + entry.proBowls * 3);
    entry.mediaVotes = Math.min(100, 55 + (eliteStats ? 25 : 0));
    entry.playerVotes = Math.min(100, 50 + entry.championships * 10);
    entry.totalVotes = Math.round(entry.fanVotes * 0.5 + entry.mediaVotes * 0.3 + entry.playerVotes * 0.2);
    if (entry.totalVotes >= 75) { entry.inducted = true; entry.jerseyRetired = true; pushNews(s, 'HALL OF FAME', `${entry.nome} foi imortalizado no Hall of Fame. A camisa ${entry.pos} será aposentada.`); }
  }
}

/* ---------- offseason guiada ---------- */
export const OFF_PHASES: { n: 1 | 2 | 3 | 4; titulo: string; desc: string; destino: Screen }[] = [
  { n: 1, titulo: 'Free Agency', desc: 'O mercado abre: 31 franquias disputam os agentes livres.', destino: 'mercado' },
  { n: 2, titulo: 'Renovações', desc: 'Garanta suas estrelas antes do Draft.', destino: 'negociacoes' },
  { n: 3, titulo: 'Draft de Novatos', desc: '7 rodadas para construir o futuro. Ordem pela campanha.', destino: 'draft' },
  { n: 4, titulo: 'Validação Final', desc: 'Feche com 53 jogadores e dentro do cap para iniciar.', destino: 'offseason' },
];

export function setupDraftOrder(s: GameState) {
  const st = standings(s);
  const champId = s.campeoes[s.campeoes.length - 1]?.teamId;
  const elimRound = new Map<string, number>();
  s.bracket?.forEach((r, i) => r.jogos.forEach(j => {
    if (!j.jogada) return;
    const loser = (j.pc ?? 0) >= (j.pf ?? 0) ? j.fora : j.casa;
    elimRound.set(loser, i + 1);
  }));
  if (champId) elimRound.set(champId, 5);
  const order = s.teams.map(t => t.id).sort((a, b) => {
    const ra = st.find(r => r.teamId === a)!; const rb = st.find(r => r.teamId === b)!;
    const ea = elimRound.get(a) ?? 0; const eb = elimRound.get(b) ?? 0;
    if (ea !== eb) return ea - eb;
    return (ra.v - rb.v) || (ra.net - rb.net);
  });
  s.draftState = { round: 1, pick: 0, order, done: false };
  pushNews(s, 'DRAFT', `Ordem do Draft ${s.settings.temporada + 1}: ${teamById(s, order[0]).cidade} ${teamById(s, order[0]).nome} escolhe primeiro. Sua posição: ${order.indexOf(s.userTeam) + 1}.`);
}

export function aiFreeAgency(s: GameState, rng: Rng) {
  const matches = rfaMatchPass(s, rng);
  const disputas = biddingPass(s, rng);
  if (matches.length)
    pushNews(s, 'RFA', `Direito de match exercido: ${matches.slice(0, 2).join('; ')}${matches.length > 2 ? `… e mais ${matches.length - 2}.` : '.'}`);
  if (disputas.length)
    pushNews(s, 'FREE AGENCY', `Mercado em leilão: ${disputas.slice(0, 3).join('; ')}${disputas.length > 3 ? `… e mais ${disputas.length - 3}.` : '.'}`);
}

const structPorIdade = (idade: number): ContractStructure => idade >= 30 ? 'FRONT' : idade <= 27 ? 'BACK' : 'BALANCED';

/** Assina um FA por um time (remove do pool, aplica contrato estruturado). */
function assina(s: GameState, f: Player, teamId: string, base: number, years: number) {
  s.faPool = s.faPool.filter(x => x.id !== f.id);
  f.teamId = teamId; f.status = 'RES'; f.origem = undefined; f.rfa = false;
  f.salario = base; f.contrato = years;
  f.contract = makeContract({ years, base, bonus: Math.round(base * years * 0.08 * 10) / 10, structure: structPorIdade(f.idade) });
  s.players.push(f);
}

/** FASE 1 · passo 1 — times de origem exercem o direito de match sobre seus RFAs. */
function rfaMatchPass(s: GameState, rng: Rng): string[] {
  const feitos: string[] = [];
  for (const f of [...s.faPool]) {
    if (!f.rfa || !f.origem || f.origem === s.userTeam) continue; // RFAs do usuário ficam no mercado p/ match manual
    const t = s.teams.find(x => x.id === f.origem);
    if (!t) continue;
    const space = s.settings.cap - capUsed(s, t.id);
    const ativos = playersOf(s, t.id).filter(p => p.status !== 'PS').length;
    const need = playersOf(s, t.id).filter(p => p.pos === f.pos && p.status !== 'PS').length <= 2;
    const ask = marketValue(f, s.settings.inflacao);
    if (ativos >= 53 || space < ask) continue;
    if (f.ovr < 68 && !need && !rng.chance(0.25)) continue;
    assina(s, f, t.id, ask, calcExpectations(f, s.settings.inflacao).anos);
    feitos.push(`${t.sigla} segura ${f.nome} (${f.pos}, OVR ${f.ovr})`);
  }
  return feitos;
}

interface AiOffer { teamId: string; base: number; years: number; }

/** FASE 1 · passo 2 — GMs fazem ofertas simultâneas; o jogador escolhe
 *  (salário 60% · duração 20% · competitividade 20%). */
function biddingPass(s: GameState, rng: Rng): string[] {
  const offers = new Map<string, AiOffer[]>();
  for (const t of s.teams) {
    if (t.id === s.userTeam) continue;
    let space = s.settings.cap - capUsed(s, t.id);
    if (space < 1) continue;
    const moves = 1 + Math.min(2, Math.floor(space / 25));
    const reconstruindo = teamStrength(s, t.id) < 68;
    // GM considera: necessidade da posição, cap space, rating (e juventude se rebuild)
    const ranked = [...s.faPool].map(f => {
      const n = playersOf(s, t.id).filter(p => p.pos === f.pos && p.status !== 'PS').length;
      const need = n <= 1 ? 22 : n <= 2 ? 12 : 0;
      const juventude = reconstruindo ? Math.max(0, 27 - f.idade) * 1.6 : f.idade >= 28 ? 5 : 0;
      return { f, score: f.ovr + need + juventude + rng.f(0, 10) };
    }).sort((a, b) => b.score - a.score);

    let feitos = 0; let projetado = space;
    for (const { f } of ranked) {
      if (feitos >= moves) break;
      const ask = marketValue(f, s.settings.inflacao);
      const offerBase = Math.round(ask * rng.f(0.92, 1.12) * 10) / 10;
      if (offerBase > projetado) continue;
      const anos = clamp(calcExpectations(f, s.settings.inflacao).anos + (rng.chance(0.3) ? 1 : 0), 1, 5);
      const list = offers.get(f.id) ?? [];
      list.push({ teamId: t.id, base: offerBase, years: anos });
      offers.set(f.id, list);
      projetado -= offerBase; feitos++;
    }
  }

  const assinaturas: string[] = [];
  for (const [pid, list] of offers) {
    const f = s.faPool.find(x => x.id === pid);
    if (!f || !list.length) continue;
    const mv = Math.max(0.1, marketValue(f, s.settings.inflacao));
    const expAnos = Math.max(1, calcExpectations(f, s.settings.inflacao).anos);
    let best: AiOffer | null = null; let bestScore = -1;
    for (const o of list) {
      const sal = clamp(o.base / mv, 0.4, 1.4);
      const dur = clamp(o.years / expAnos, 0.4, 1.3);
      const comp = 0.5 + teamStrength(s, o.teamId) / 200;
      const score = sal * 0.6 + dur * 0.2 + comp * 0.2 + rng.f(0, 0.05);
      if (score > bestScore) { bestScore = score; best = o; }
    }
    if (!best) continue;
    const t = s.teams.find(x => x.id === best.teamId)!;
    const space = s.settings.cap - capUsed(s, t.id);
    const ativos = playersOf(s, t.id).filter(p => p.status !== 'PS').length;
    if (ativos >= 53 || best.base > space) continue;
    assina(s, f, t.id, best.base, clamp(best.years, 1, 5));
    if (f.ovr >= 74 || list.length >= 3)
      assinaturas.push(`${t.sigla} vence disputa de ${list.length} oferta${list.length > 1 ? 's' : ''} e leva ${f.nome} (${f.pos}, OVR ${f.ovr}, ${fmtM(best.base)}/ano)`);
  }
  return assinaturas;
}

/** RFAs do usuário que não tiveram match exercido são levados pela melhor oferta da IA. */
export function stealUnmatchedRfas(s: GameState, rng: Rng): number {
  let perdidos = 0;
  for (const f of [...s.faPool]) {
    if (!f.rfa || f.origem !== s.userTeam) continue;
    const ask = marketValue(f, s.settings.inflacao);
    const candidatos = s.teams.filter(t => t.id !== s.userTeam
      && playersOf(s, t.id).filter(p => p.status !== 'PS').length < 53
      && s.settings.cap - capUsed(s, t.id) >= ask * 0.95);
    if (!candidatos.length) continue;
    const t = [...candidatos].sort((a, b) => (s.settings.cap - capUsed(s, b.id)) - (s.settings.cap - capUsed(s, a.id)))[0];
    assina(s, f, t.id, Math.round(ask * rng.f(0.95, 1.1) * 10) / 10, calcExpectations(f, s.settings.inflacao).anos);
    pushNews(s, 'RFA PERDIDO', `${f.nome} (${f.pos}, OVR ${f.ovr}) assina com ${t.cidade} ${t.nome} — o direito de match não foi exercido a tempo.`);
    perdidos++;
  }
  return perdidos;
}

/** IA faz scouting durante a offseason: cada GM "investiga" 2 prospectos do seu board. */
export function aiScoutingWave(s: GameState, rng: Rng) {
  if (!s.draftClass.length) return;
  for (const t of s.teams) {
    if (t.id === s.userTeam) continue;
    const alvos = [...s.draftClass].map(p => {
      const n = playersOf(s, t.id).filter(x => x.pos === p.pos && x.status !== 'PS').length;
      return { p, score: p.pot * 0.6 + p.ovr * 0.4 + (n <= 2 ? 12 : 0) + rng.f(0, 8) };
    }).sort((a, b) => b.score - a.score).slice(0, 2);
    for (const { p } of alvos) {
      if (!p.scout) continue;
      p.scout.aiHeat = (p.scout.aiHeat ?? 0) + 1;
    }
  }
  const top = [...s.draftClass].sort((a, b) => (b.scout?.aiHeat ?? 0) - (a.scout?.aiHeat ?? 0))[0];
  pushNews(s, 'SCOUTING', `Os 31 GMs enviaram olheiros pelo país${top ? ` — ${top.nome} (${top.pos}, ${top.scout?.college}) é o nome mais cotado nos boards da liga.` : '.'}`);
}

export function advanceOffPhase(s: GameState): { ok: boolean; msg: string } {
  const rng = new Rng(newSeed());
  const ph = s.offPhase ?? 1;
  if (s.settings.fase !== 'OFF') return { ok: false, msg: 'A offseason ainda não começou.' };
  if (ph === 1) {
    aiFreeAgency(s, rng);
    const perdidos = stealUnmatchedRfas(s, rng);
    aiScoutingWave(s, rng);
    s.offPhase = 2;
    pushNews(s, 'OFFSEASON', `Free Agency encerrada${perdidos ? ` — você perdeu ${perdidos} RFA(s) sem exercer o match` : ''}. Fase 2: Renovações aberta.`);
    return { ok: true, msg: perdidos ? `Fase 2 aberta — ${perdidos} RFA(s) perdidos no mercado.` : 'Fase 2 — Renovações aberta.' };
  }
  if (ph === 2) {
    setupDraftOrder(s);
    aiScoutingWave(s, rng);
    s.offPhase = 3;
    pushNews(s, 'OFFSEASON', 'Renovações concluídas. Fase 3: Draft aberto em 7 rodadas.');
    return { ok: true, msg: 'Fase 3 — Draft aberto.' };
  }
  if (ph === 3) {
    if (!s.draftState?.done) return { ok: false, msg: 'Conclua as 7 rodadas do Draft antes de avançar.' };
    // todas as escolhas foram usadas no draft — não podem mais ser trocadas
    for (const round of s.pickOwners) for (const cell of round) cell.consumed = true;
    s.offPhase = 4;
    pushNews(s, 'OFFSEASON', 'Draft encerrado. Fase 4: valide elenco (53) e salary cap.');
    return { ok: true, msg: 'Fase 4 — Validação final.' };
  }
  return { ok: false, msg: 'A offseason já foi concluída.' };
}

/* ---------- validação e auto-fix ---------- */
export interface RosterCheck { ok: boolean; erros: string[]; }
export interface RosterRule {
  id: string; label: string; ok: boolean; detalhe: string;
  destino?: Screen; acao?: string;
}

/** Validação final obrigatória: cada regra traz o diagnóstico e a ação sugerida. */
export function validateRosterDetailed(s: GameState): RosterRule[] {
  const roster = playersOf(s, s.userTeam);
  const ativosArr = roster.filter(p => p.status !== 'PS');
  const ativos = ativosArr.length;
  const ps = roster.length - ativos;
  const cap = capUsed(s, s.userTeam);
  const espaco = Math.max(0, Math.round((s.settings.cap - cap) * 10) / 10);
  const nQB = ativosArr.filter(p => p.pos === 'QB').length;
  const nK = ativosArr.filter(p => p.pos === 'K').length;
  const nP = ativosArr.filter(p => p.pos === 'P').length;
  return [
    {
      id: 'roster', label: 'Elenco ativo com exatamente 53', ok: ativos === 53,
      detalhe: ativos > 53 ? `${ativos - 53} acima do limite — corte ${ativos - 53} jogador(es)`
        : ativos < 53 ? `${53 - ativos} abaixo — contrate ${53 - ativos} free agent(s)` : `${ativos}/53 jogadores`,
      destino: 'elenco', acao: 'Gerenciar Roster',
    },
    {
      id: 'cap', label: 'Folha salarial dentro do teto', ok: cap <= s.settings.cap,
      detalhe: cap > s.settings.cap
        ? `estourado em ${fmtM(Math.round((cap - s.settings.cap) * 10) / 10)} — reestruture ou corte`
        : `espaço livre de ${fmtM(espaco)}`,
      destino: 'negociacoes', acao: 'Reestruturar Contratos',
    },
    {
      id: 'qb', label: 'Ao menos 2 QBs', ok: nQB >= 2,
      detalhe: nQB < 2 ? `apenas ${nQB}/2 — contrate 1 QB` : `${nQB}/2 — titular e reserva garantidos`,
      destino: 'mercado', acao: 'Contratar QB',
    },
    {
      id: 'k', label: 'Ao menos 1 Kicker', ok: nK >= 1,
      detalhe: nK < 1 ? 'nenhum K — contrate 1 Kicker' : `${nK}/1 — field goals garantidos`,
      destino: 'mercado', acao: 'Contratar K',
    },
    {
      id: 'p', label: 'Ao menos 1 Punter', ok: nP >= 1,
      detalhe: nP < 1 ? 'nenhum P — contrate 1 Punter' : `${nP}/1 — punts garantidos`,
      destino: 'mercado', acao: 'Contratar P',
    },
    {
      id: 'ps', label: 'Practice Squad até 10', ok: ps <= 10,
      detalhe: ps > 10 ? `${ps - 10} acima do limite — corte ${ps - 10}` : `${ps}/10 jogadores`,
      destino: 'elenco', acao: 'Gerenciar PS',
    },
  ];
}

export function validateRoster(s: GameState): RosterCheck {
  const rules = validateRosterDetailed(s);
  const erros = rules.filter(r => !r.ok).map(r => `${r.label}: ${r.detalhe}.`);
  return { ok: erros.length === 0, erros };
}

export function enforceCapCompliance(s: GameState, teamId: string): Player[] {
  const cortados: Player[] = [];
  let guard = 0;
  while (capUsed(s, teamId) > s.settings.cap && guard++ < 80) {
    const roster = playersOf(s, teamId);
    const ps = roster.filter(p => p.status === 'PS').sort((a, b) => a.ovr - b.ovr);
    const res = roster.filter(p => p.status === 'RES' && !p.tag).sort((a, b) => a.ovr - b.ovr);
    const tit = roster.filter(p => p.status === 'TIT' && !p.tag).sort((a, b) => a.ovr - b.ovr);
    const ativos = roster.filter(p => p.status !== 'PS').length;
    const alvo = ps[0] ?? res[0] ?? (ativos > 44 ? tit[0] : undefined);
    if (!alvo) break;
    s.players = s.players.filter(x => x.id !== alvo.id);
    alvo.teamId = null; alvo.status = 'RES'; alvo.origem = teamId;
    s.faPool.push(alvo);
    cortados.push(alvo);
  }
  return cortados;
}
export function enforceAllCompliance(s: GameState) {
  for (const t of s.teams) enforceCapCompliance(s, t.id);
}

export function autoFixRoster(s: GameState): { msg: string } {
  const feitas: string[] = [];
  const cortesCap = enforceCapCompliance(s, s.userTeam);
  if (cortesCap.length) feitas.push(`${cortesCap.length} corte(s) para caber no cap`);

  const contratar = (f: Player) => {
    s.faPool = s.faPool.filter(x => x.id !== f.id);
    f.teamId = s.userTeam; f.status = 'RES'; f.contrato = 1; f.origem = undefined; f.rfa = false;
    s.players.push(f);
  };

  // 1) garante posições obrigatórias primeiro: 2 QBs, 1 K, 1 P
  const alvo = (pos: Pos, min: number) => {
    const n = playersOf(s, s.userTeam).filter(p => p.pos === pos && p.status !== 'PS').length;
    for (let i = n; i < min; i++) {
      const ativosAgora = playersOf(s, s.userTeam).filter(p => p.status !== 'PS').length;
      if (ativosAgora >= 53) break;
      const space = s.settings.cap - capUsed(s, s.userTeam);
      const c = s.faPool.filter(f => f.pos === pos && f.salario <= space).sort((a, b) => b.ovr - a.ovr)[0];
      if (!c) break;
      contratar(c); feitas.push(`${pos} contratado (${c.nome})`);
    }
  };
  alvo('QB', 2); alvo('K', 1); alvo('P', 1);

  // 2) completa até 53 com os mais baratos disponíveis
  let ativos = playersOf(s, s.userTeam).filter(p => p.status !== 'PS').length;
  let guard = 0;
  while (ativos < 53 && s.faPool.length && guard++ < 60) {
    const space = s.settings.cap - capUsed(s, s.userTeam);
    const cabem = s.faPool.filter(f => f.salario <= space).sort((a, b) => a.salario - b.salario);
    if (!cabem.length) break;
    contratar(cabem[0]); ativos++;
  }
  if (ativos > 0) feitas.push(`elenco ativo em ${playersOf(s, s.userTeam).filter(p => p.status !== 'PS').length}/53`);

  // 3) corta excesso de Practice Squad
  const psJog = playersOf(s, s.userTeam).filter(p => p.status === 'PS').sort((a, b) => a.ovr - b.ovr);
  while (psJog.length > 10) {
    const c = psJog.shift()!;
    s.players = s.players.filter(x => x.id !== c.id);
    c.teamId = null; s.faPool.push(c);
    feitas.push('1 corte no Practice Squad');
  }
  return { msg: feitas.length ? `Auto-Fix aplicado: ${feitas.join(', ')}.` : 'Auto-Fix: nada a ajustar — elenco e cap já em ordem.' };
}

/* ---------- contratação de olheiro (aumenta o budget de scouting) ---------- */
export const SCOUT_HIRE_COST = 3.5; // $M por temporada
export function hireScoutStaff(s: GameState): { ok: boolean; msg: string } {
  const t = teamById(s, s.userTeam);
  if (t.dinheiro < SCOUT_HIRE_COST)
    return { ok: false, msg: `Caixa insuficiente: olheiro extra custa ${fmtM(SCOUT_HIRE_COST)}/ano.` };
  const myStaff = s.staff.filter(x => x.teamId === t.id);
  const extras = myStaff.filter(x => x.funcao === 'Olheiro Extra').length;
  if (extras >= 3) return { ok: false, msg: 'Limite de 3 olheiros extras atingido.' };
  t.dinheiro = Math.round((t.dinheiro - SCOUT_HIRE_COST) * 10) / 10;
  s.staff.push({
    id: `st${Date.now()}${Math.floor(Math.random() * 999)}`, teamId: t.id,
    nome: genName(new Rng(newSeed())), funcao: 'Olheiro Extra', nivel: 3,
    experiencia: 8, salario: SCOUT_HIRE_COST, bonus: 0, contrato: 2, moral: 70,
  });
  s.scoutBudgetMax = scoutBudgetMaxFor(s.staff.filter(x => x.teamId === t.id));
  s.scoutBudget += 2;
  pushNews(s, 'SCOUTING', `${t.sigla} contrata olheiro extra por ${fmtM(SCOUT_HIRE_COST)}/ano. Budget de scouting +2.`);
  return { ok: true, msg: `Olheiro extra contratado! Budget agora é ${s.scoutBudget} ponto(s).` };
}

/* ---------- draft ---------- */
/** Adiciona um prospecto ao time, aplicando a surpresa de combine (se houver). */
function commitPick(s: GameState, p: Player, teamId: string, rng: Rng): string | null {
  s.draftClass = s.draftClass.filter(x => x.id !== p.id);
  p.teamId = teamId; p.status = 'RES'; p.contrato = 4; p.salario = rookieSalary(p.ovr);
  s.players.push(p);
  return applyDraftSurprise(p, rng);
}

export function aiPickFor(s: GameState, teamId: string): Player | null {
  if (!s.draftClass.length) return null;
  const roster = playersOf(s, teamId);
  const need = (pos: Player['pos']) => {
    const n = roster.filter(p => p.pos === pos && p.status !== 'PS').length;
    return n <= 1 ? 2 : n <= 3 ? 1 : 0;
  };
  const bpa = s.draftState!.round <= 2;
  const scored = s.draftClass.map(p => ({
    p,
    // BPA nas 2 primeiras rodadas · need-based nas finais · viés do scouting da IA (aiHeat)
    score: (bpa ? p.pot * 0.7 + p.ovr * 0.3 : p.pot * 0.4 + p.ovr * 0.3 + need(p.pos) * 22) + (p.scout?.aiHeat ?? 0) * 1.2 + Math.random() * 6,
  })).sort((a, b) => b.score - a.score);
  return scored[0].p;
}

/** Avança a escolha da IA até chegar na vez do usuário (ou fim). */
function runAiPicks(s: GameState, untilUser: boolean, rng: Rng) {
  const d = s.draftState!;
  let guard = 0;
  while (!d.done && guard++ < 400 && s.draftClass.length) {
    if (untilUser && d.order[d.pick] === s.userTeam) break;
    const teamId = d.order[d.pick];
    const pick = aiPickFor(s, teamId);
    if (!pick) { d.done = true; break; }
    commitPick(s, pick, teamId, rng);
    d.pick++;
    if (d.pick >= 32) {
      d.pick = 0; d.round++;
      if (d.round > 7) { d.done = true; pushNews(s, 'DRAFT', `Draft ${s.settings.temporada + 1} encerrado após 7 rodadas.`); }
    }
  }
}

function advanceDraft(s: GameState) {
  const d = s.draftState!;
  if (!s.draftClass.length) { d.done = true; return; }
  d.pick++;
  if (d.pick >= 32) {
    d.pick = 0; d.round++;
    if (d.round > 7) { d.done = true; pushNews(s, 'DRAFT', `Draft ${s.settings.temporada + 1} encerrado após 7 rodadas.`); return; }
  }
  runAiPicks(s, true, new Rng(newSeed()));
}

export function userDraftPick(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const d = s.draftState;
  if (!d || d.done) return { ok: false, msg: 'O draft não está em andamento.' };
  if (d.order[d.pick] !== s.userTeam) return { ok: false, msg: 'Não é a sua escolha.' };
  const p = s.draftClass.find(x => x.id === playerId);
  if (!p) return { ok: false, msg: 'Prospecto indisponível.' };
  const ativos = playersOf(s, s.userTeam).filter(x => x.status !== 'PS').length;
  if (ativos >= 53) return { ok: false, msg: 'Elenco cheio (53). Dispense alguém antes de draftar.' };
  const rng = new Rng(newSeed());
  const surprise = commitPick(s, p, s.userTeam, rng);
  addChurn(s, s.userTeam, 3);   // novato entra no vestiário — leve ajuste de química
  pushNews(s, 'DRAFT', `Rodada ${d.round}: ${teamById(s, s.userTeam).sigla} escolhe ${p.nome} (${p.pos}, OVR ${p.ovr}).`);
  if (surprise) pushNews(s, 'COMBINE', surprise);
  advanceDraft(s);
  return { ok: true, msg: surprise ? `${p.nome} draftado! ${surprise}` : `${p.nome} draftado!` };
}

export function autoDraftUntilUser(s: GameState) {
  const d = s.draftState;
  if (!d || d.done) return;
  runAiPicks(s, true, new Rng(newSeed()));
}
export function autoDraftAll(s: GameState) {
  const d = s.draftState;
  if (!d || d.done) return;
  runAiPicks(s, false, new Rng(newSeed()));
  d.done = true;
}

/* ============================================================
 * 💰 SISTEMA DE INFLAÇÃO DA LIGA
 * ============================================================
 * tv_revenue_growth_rate: 3–8% ao ano (aleatório).
 * A cada fim de temporada:
 *   novo_cap = cap_antigo × (1 + crescimento_tv)
 *   salários pedidos (FA e renovações) escalam com o índice de inflação
 *   → times com pouco cap space sofrem para renovar estrelas.
 * ============================================================ */
export function newSeason(prev: GameState, buildWorld: (s: GameState, rng: Rng, ranks: RankMap) => { matches: Match[]; draftClass: Player[] }): GameState {
  const s = structuredClone(prev);
  const rng = new Rng(newSeed());
  evaluateHallOfFame(s);

  // ranks da temporada encerrada (para o calendário do ano seguinte)
  const st = standings(s);
  for (const t of s.teams) {
    const r = st.find(x => x.teamId === t.id);
    const ap = r && r.j > 0 ? clamp((r.v + r.e * 0.5) / r.j, 0, 1) : 0.5;
    t.histCampanha = [Math.round(ap * 100) / 100, ...(t.histCampanha ?? [])].slice(0, 3);
  }
  const ranks: RankMap = new Map();
  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    for (let d = 0; d < 4; d++) {
      divisionTable(s, conf, d).forEach((r, i) => ranks.set(r.teamId, i + 1));
    }
  }

  /* ---- inflação: o cap cresce com a receita de TV ---- */
  const crescimento = s.settings.tvGrowth;                       // % projetado no ano anterior
  s.settings.cap = Math.round(s.settings.cap * (1 + crescimento / 100));
  s.settings.inflacao = Math.round(s.settings.inflacao * (1 + crescimento / 100) * 1000) / 1000;
  s.settings.tvDeal = Math.round(s.settings.tvDeal * (1 + crescimento / 100) * 100) / 100;
  const novaProjecao = Math.round(rng.f(3, 8) * 10) / 10;        // nova taxa p/ o próximo ano (3–8%)

  s.settings.temporada++;
  s.settings.fase = 'PRE';
  s.settings.semana = 1;

  for (const p of s.players) {
    p.stats = zeroStats(); p.lesao = 0; p.lesaoTipo = null; p.lesaoTotal = 0; p.tag = false;
    p.moral = 75;   // reset de moral e fadiga na virada de temporada
    if (p.teamId) p.anosNoTime = Math.min(10, p.anosNoTime + 1);  // +1 temporada de casa
  }
  for (const t of s.teams) {
    t.moral = 75;
    t.teamChurn = Math.max(0, t.teamChurn - 12);  // rotatividade esfria com o tempo
    recalcChemistry(s, t.id);                     // química se refaz com o elenco estável
  }
  s.teamSeasonStats = [];  // zera acumuladores de franquia para a nova temporada
  s.seasonStorylines = [];
  s.probowl = emptyProBowl(s.settings.temporada);  // nova votação do Pro Bowl

  const w = buildWorld(s, rng, ranks);
  s.matches = w.matches;
  s.draftClass = w.draftClass;
  // escala rookie acompanha a inflação do cap
  for (const p of s.draftClass) p.salario = Math.round(p.salario * s.settings.inflacao * 10) / 10;
  // salários dos FAs também sobem com a inflação (pedidos mais altos)
  for (const f of s.faPool) f.salario = Math.round(f.salario * s.settings.inflacao * 10) / 10;

  s.draftState = null;
  s.bracket = null;
  s.lastResult = null;
  s.weekResults = [];
  s.offPhase = undefined;
  resetScouting(s);   // restaura o orçamento de scouting e zera relatórios

  // renova as escolhas de draft: cada franquia volta a deter as próprias picks
  s.pickOwners = Array.from({ length: 7 }, () =>
    Array.from({ length: 32 }, (_, slot) => ({
      owner: s.teams[slot % s.teams.length].id,
      from: null,
    })));

  // completa elencos das IAs até 53 com FAs baratos
  for (const t of s.teams) {
    if (t.id === s.userTeam) continue;
    let ativos = playersOf(s, t.id).filter(p => p.status !== 'PS').length;
    let guard = 0;
    while (ativos < 53 && s.faPool.length && guard++ < 60) {
      const space = s.settings.cap - capUsed(s, t.id);
      const cabem = s.faPool.filter(f => f.salario <= space).sort((a, b) => a.salario - b.salario);
      if (!cabem.length) break;
      const f = cabem[0];
      s.faPool = s.faPool.filter(x => x.id !== f.id);
      f.teamId = t.id; f.status = 'RES'; f.contrato = 1; f.origem = undefined;
      s.players.push(f); ativos++;
    }
  }
  // compliance de cap
  for (const t of s.teams) {
    const cortados = enforceCapCompliance(s, t.id);
    if (cortados.length && t.id === s.userTeam) {
      const pior = [...cortados].sort((a, b) => b.ovr - a.ovr)[0];
      pushNews(s, 'CAP', `ALERTA: sua franquia iniciou acima do teto e cortou ${cortados.length} jogador(es), incluindo ${pior.nome} (${pior.pos}, OVR ${pior.ovr}).`);
    }
  }

  pushNews(s, 'ECONOMIA', `Acordo de TV rende $${s.settings.tvDeal.toFixed(1).replace('.', ',')}B/ano: salary cap sobe ${crescimento.toFixed(1).replace('.', ',')}% e vai a ${fmtM(s.settings.cap)}. Pedidos dos agentes livres já refletem a inflação. Projeção p/ ${s.settings.temporada + 1}: +${novaProjecao.toFixed(1).replace('.', ',')}%.`);
  pushNews(s, 'TEMPORADA', `Temporada ${s.settings.temporada} começa! Calendário oficial: 17 jogos em 18 semanas (semana 18 é 100% divisão).`);
  s.settings.tvGrowth = novaProjecao;
  return s;
}

/* ================= renovações / free agency do usuário ================= */
export function marketValue(p: Player, inflacao = 1): number {
  const base = 0.62 + Math.pow(Math.max(0, p.ovr - 50) / 40, 4.4) * 33;
  const posMult: Partial<Record<Pos, number>> = { QB: 1.28, OL: 1.06, TE: 1.02, CB: 1.04, DL: 1.03, S: 1.01 };
  const ageMult = p.idade <= 25 ? 1.1 : p.idade >= 31 ? 0.88 : 1;
  return Math.max(0.6, Math.round(base * (posMult[p.pos] ?? 1) * ageMult * inflacao * 10) / 10);
}

/** Focos de treinamento disponíveis no Centro de Treinamento. */
export const FOCUS_INFO: Record<Focus, { label: string; desc: string }> = {
  CORRIDA: { label: 'Jogo terrestre', desc: '+Corrida e +Bloqueio dos jovens' },
  PASSE: { label: 'Jogo aéreo', desc: '+Passe e +Recepção dos jovens' },
  DEFESA: { label: 'Defesa', desc: '+Tackle e +Velocidade dos jovens' },
  FISICO: { label: 'Condicionamento', desc: '+Resistência e +Velocidade para todos' },
};

export function canSign(s: GameState, p: Player): { ok: boolean; motivo: string } {
  const ativos = playersOf(s, s.userTeam).filter(x => x.status !== 'PS').length;
  if (ativos >= 53) return { ok: false, motivo: 'Elenco ativo cheio (53).' };
  const usado = capUsed(s, s.userTeam);
  if (usado + p.salario > s.settings.cap)
    return { ok: false, motivo: `Sem espaço no cap: restam ${fmtM(Math.max(0, Math.round((s.settings.cap - usado) * 10) / 10))}.` };
  return { ok: true, motivo: '' };
}

export function signFA(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.faPool.find(x => x.id === playerId);
  if (!p) return { ok: false, msg: 'Jogador indisponível.' };
  const chk = canSign(s, p);
  if (!chk.ok) return { ok: false, msg: chk.motivo };
  s.faPool = s.faPool.filter(x => x.id !== playerId);
  p.teamId = s.userTeam; p.status = 'RES'; p.contrato = Math.max(1, p.contrato); p.origem = undefined;
  p.anosNoTime = 0;              // acabou de chegar — sem entrosamento ainda
  p.moral = clamp(p.moral + 12, 25, 95);
  s.players.push(p);
  addChurn(s, s.userTeam, 8);    // contratação mexe com a química do vestiário
  const t = teamById(s, s.userTeam);
  pushNews(s, 'CONTRATAÇÃO', `${t.cidade} ${t.nome} contrata ${p.nome} (${p.pos}, OVR ${p.ovr}) por ${fmtM(p.salario)}/ano.`);
  return { ok: true, msg: `${p.nome} contratado!` };
}

export function releasePlayer(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam) return { ok: false, msg: 'Jogador inválido.' };
  if (p.tag) return { ok: false, msg: 'Jogador com franchise tag não pode ser dispensado.' };
  s.players = s.players.filter(x => x.id !== playerId);
  p.teamId = null; p.status = 'RES'; p.origem = s.userTeam;
  s.faPool.push(p);
  addChurn(s, s.userTeam, 6);    // corte abala o vestiário
  return { ok: true, msg: `${p.nome} dispensado — agora é free agent.` };
}

/** Contrata um free agent mediante oferta estruturada (Free Agency). */
export function signFAWithOffer(s: GameState, p: Player, offer: ContractOffer): { ok: boolean; msg: string } {
  const chk = canSign(s, p);
  if (!chk.ok) return { ok: false, msg: chk.motivo };
  if (offer.years < 1 || offer.years > 5) return { ok: false, msg: 'Contratos têm de 1 a 5 anos.' };
  if (offer.base <= 0) return { ok: false, msg: 'Salário-base precisa ser positivo.' };

  const usado = capUsed(s, s.userTeam);
  const novoHit = makeContract(offer).capHits[0];
  if (usado + novoHit > s.settings.cap) {
    return { ok: false, msg: `Cap insuficiente: a oferta pesa ${fmtM(novoHit)} no ano 1 e restam ${fmtM(Math.max(0, Math.round((s.settings.cap - usado) * 10) / 10))}.` };
  }

  const hap = negotiationHappiness(p, offer, s.settings.inflacao);
  const aceita = acceptanceRoll(hap.total, new Rng(newSeed()));
  const exp = calcExpectations(p, s.settings.inflacao);

  if (!aceita) {
    return { ok: false, msg: `${p.nome} recusou (${hap.total}% de felicidade). O agente quer ${fmtM(exp.aav)}/ano por ${exp.anos} ano(s), ${STRUCT_LABEL[exp.structure].toLowerCase()}.` };
  }

  s.faPool = s.faPool.filter(x => x.id !== p.id);
  p.teamId = s.userTeam; p.status = 'RES'; p.origem = undefined;
  p.contract = makeContract(offer);
  p.contrato = offer.years;
  p.salario = offer.base;
  p.holdout = false;
  p.anosNoTime = 0;
  p.moral = clamp(p.moral + 12, 25, 95);
  s.players.push(p);
  addChurn(s, s.userTeam, 8);
  const t = teamById(s, s.userTeam);
  pushNews(s, 'CONTRATAÇÃO', `${t.cidade} ${t.nome} contrata ${p.nome} (${p.pos}, OVR ${p.ovr}): ${offer.years} ano(s), ${fmtM(offer.base)}/ano, ${STRUCT_LABEL[offer.structure].toLowerCase()}${offer.bonus > 0 ? `, ${fmtM(offer.bonus)} de luvas` : ''} (felicidade ${hap.total}%).`);
  return { ok: true, msg: `✍️ ${p.nome} contratado! (${hap.total}%)` };
}

/** Renovação de contrato da comissão técnica. */
export function renewStaff(s: GameState, staffId: string, offer: ContractOffer): { ok: boolean; msg: string } {
  const st = s.staff.find(x => x.id === staffId && x.teamId === s.userTeam);
  if (!st) return { ok: false, msg: 'Profissional inválido.' };
  if (st.contrato > 2) return { ok: false, msg: 'Renovação antecipada vale para contratos com ≤2 anos restantes.' };
  const t = teamById(s, s.userTeam);
  if (t.dinheiro < offer.bonus) return { ok: false, msg: `Caixa insuficiente para o bônus (tem ${fmtM(t.dinheiro)}).` };
  const rng = new Rng(newSeed());
  const hap = staffHappiness(st, offer);
  if (!acceptanceRoll(hap.value, rng))
    return { ok: false, msg: `Recusada! ${st.nome} pede ~${fmtM(staffExpectations(st).aav)}/ano. Felicidade: ${hap.value}%.` };
  t.dinheiro = Math.round((t.dinheiro - offer.bonus) * 10) / 10;
  st.salario = offer.base; st.bonus = offer.bonus; st.contrato = offer.years;
  pushNews(s, 'COMISSÃO', `${st.nome} (${st.funcao}) renova: ${offer.years} ano(s), ${fmtM(offer.base)}/ano.`);
  return { ok: true, msg: `✍️ ${st.nome} renovou!` };
}

/* ================= 💼 negociações (sistema de contratos) ================= */

/**
 * Apresenta uma oferta estruturada ao jogador e resolve com a fórmula de
 * happiness (±10 de personalidade). Vale para renovação e extensão antecipada.
 */
export function negotiateContract(
  s: GameState, playerId: string, o: ContractOffer,
): { ok: boolean; msg: string; aceita?: boolean; hap?: number } {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam) return { ok: false, msg: 'Jogador inválido.' };
  if (p.tag) return { ok: false, msg: 'Jogador com franchise tag — a tag já define o contrato.' };
  if (p.contrato > 2) return { ok: false, msg: 'Extensão antecipada só é permitida com ≤2 anos restantes no contrato.' };
  if (o.years < 1 || o.years > 5) return { ok: false, msg: 'Contratos têm de 1 a 5 anos.' };
  if (o.base <= 0) return { ok: false, msg: 'Salário-base precisa ser positivo.' };

  // o cap precisa comportar o novo cap hit (ano 1)
  const usadoSemEle = capUsed(s, s.userTeam) - capHitOf(p);
  const novoHit = makeContract(o).capHits[0];
  if (usadoSemEle + novoHit > s.settings.cap) {
    return {
      ok: false,
      msg: `Cap insuficiente: a oferta pesa ${fmtM(novoHit)} no ano 1 e restam ${fmtM(Math.max(0, Math.round((s.settings.cap - usadoSemEle) * 10) / 10))}.`,
    };
  }

  const hap = negotiationHappiness(p, o, s.settings.inflacao, { lealdade: true });
  const aceita = acceptanceRoll(hap.total, new Rng(newSeed()));
  const veredicto = happinessVerdict(hap.total);

  if (!aceita) {
    p.moral = clamp(p.moral - 4, 25, 95);
    const motivo = hap.salary < 50 ? 'salário abaixo do pedido'
      : hap.years < 50 ? 'duração diferente da esperada'
        : hap.structure < 50 ? 'estrutura de pagamento'
          : 'conjunto da proposta';
    pushNews(s, 'NEGOCIAÇÃO', `${p.nome} recusa a oferta (${hap.total}% de felicidade — pesou o ${motivo}).`);
    return { ok: false, msg: `${p.nome} recusou: ${veredicto.label.toLowerCase()} (${hap.total}%). O agente quer ${fmtM(Math.round(calcExpectations(p, s.settings.inflacao).aav * 10) / 10)}/ano por ${calcExpectations(p, s.settings.inflacao).anos} ano(s).`, aceita, hap: hap.total };
  }

  p.contract = makeContract(o);
  p.contrato = o.years;
  p.salario = o.base;
  p.holdout = false;
  p.moral = clamp(p.moral + 8, 25, 95);
  pushNews(
    s, 'CONTRATO',
    `${p.nome} (${p.pos}, OVR ${p.ovr}) assina: ${o.years} ano(s), ${fmtM(o.base)}/ano, ${STRUCT_LABEL[o.structure].toLowerCase()}` +
    (o.bonus > 0 ? `, ${fmtM(o.bonus)} de luvas` : '') + ` (felicidade ${hap.total}%).`,
  );
  return { ok: true, msg: `${p.nome} assinou! ${o.years} ano(s) por ${fmtM(o.base)}/ano (${hap.total}%).`, aceita, hap: hap.total };
}

/** Atalho: renova na hora pela expectativa do agente (usa o sistema de happiness). */
export function renewPlayer(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam) return { ok: false, msg: 'Jogador inválido.' };
  if (p.contrato > 2) return { ok: false, msg: 'Renovação antecipada só com ≤2 anos restantes.' };
  if (p.tag) return { ok: false, msg: 'Jogador com franchise tag.' };
  const exp = calcExpectations(p, s.settings.inflacao);
  return negotiateContract(s, playerId, {
    years: exp.anos,
    base: exp.aav,
    bonus: Math.round(exp.aav * exp.anos * 0.1 * 10) / 10,
    structure: exp.structure,
  });
}

/** Franchise Tag: 1 ano, salário médio dos top 5 da posição na liga. */
export function applyTag(s: GameState, playerId: string): boolean {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam || p.contrato !== 1 || p.tag) return false;
  const value = franchiseTagValue(p.pos, s.players);
  p.tag = true;
  p.contract = makeTagContract(value);
  pushNews(s, 'FRANCHISE TAG', `${p.nome} recebe a franchise tag: 1 ano garantido por ${fmtM(value)} (média dos top 5 de ${p.pos}).`);
  return true;
}

export function setStatus(s: GameState, playerId: string, status: Player['status']) {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam) return;
  const roster = playersOf(s, s.userTeam);
  if (p.status === 'PS' && status !== 'PS' && roster.filter(x => x.status !== 'PS').length >= 53) return;
  if (p.status !== 'PS' && status === 'PS' && roster.filter(x => x.status === 'PS').length >= 10) return;
  p.status = status;
}

export function setTactics(s: GameState, corrida: number, agressividade: number) {
  const t = teamById(s, s.userTeam);
  t.tactics = { ...t.tactics, corrida, agressividade };
}

export const UPGRADE_COST = (nivel: number) => Math.round((18 + nivel * 14) * 10) / 10;
export function upgrade(s: GameState, kind: 'estadio' | 'centroTreino'): { ok: boolean; msg: string } {
  const t = teamById(s, s.userTeam);
  const nivel = t[kind];
  if (nivel >= 5) return { ok: false, msg: 'Já está no nível máximo.' };
  const cost = UPGRADE_COST(nivel);
  if (t.dinheiro < cost) return { ok: false, msg: `Caixa insuficiente: precisa de ${fmtM(cost)}.` };
  t.dinheiro = Math.round((t.dinheiro - cost) * 10) / 10;
  t[kind] = nivel + 1;
  pushNews(s, 'ESTRUTURA', `${kind === 'estadio' ? 'Estádio' : 'Centro de treinamento'} melhorado para o nível ${nivel + 1} (${fmtM(cost)}).`);
  return { ok: true, msg: `${kind === 'estadio' ? 'Estádio' : 'CT'} agora é nível ${nivel + 1}!` };
}
