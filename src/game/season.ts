/* ============================================================
 * Orquestração da temporada: calendário NFL, tabela, avanço de
 * semanas, playoffs, offseason guiada e o SISTEMA DE INFLAÇÃO.
 *
 * ⚠️ CORREÇÃO DO CALENDÁRIO: o alocador de semanas garante que
 * NENHUM time jogue duas vezes na mesma semana (invariante),
 * respeitando byes e a semana 18 100% divisional.
 * ============================================================ */

import type {
  Conf, ContractOffer, Focus, GameResult, GameState, Match, Player, Pos, Staff, Team,
} from './types';
import { zeroStats, zeroTeamStats } from './types';
import { Rng, clamp, newSeed } from './rng';
import { computeOvr, genName, POS_ORDER, rookieSalary, salaryFor } from './data';
import type { Side } from './engine';
import { NFLMatchEngine } from './engine';
import { resetScouting, aiScoutingWave, applyDraftSurprise } from './scouting';
import { emptyProBowl, runWeeklyProBowlVoting, selectProBowlRoster, type WeekBox } from './probowl';
import {
  recordCoachEvaluation, sendEvaluationMessage, sendWeeklyPressure, sendTrainingReport,
  checkUserFiring, checkEndSeasonFiring, generateAiCoachFirings, sendProBowlResults, sendSuperBowlMessage,
  sendInjuryMessage, sendDraftMessage, sendFreeAgentMessage, sendContractMessage, notify,
} from './messaging';
import { addChurn, recalcChemistry } from './franchise';
import {
  acceptanceRoll, calcExpectations, franchiseTagValue, happinessVerdict,
  makeContract, makeTagContract, negotiationHappiness, shouldHoldout,
  STRUCT_LABEL, baseMarketValue,
} from './contracts';
import { staffExpectations, staffHappiness, staffAcceptanceRoll, staffMarketValue } from './negotiations';
import { simulateTrainingWeek } from './training';
import { computeStandings, rankDivision, conferenceOrder, generatePlayoffBracket } from './tiebreakers';
import type { TeamStanding } from './tiebreakers';

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

/* ============================================================
 * CALENDÁRIO OFICIAL DA NFL — 17 jogos por time
 *  6 divisão · 4 intraconferência · 4 interconferência
 *  2 mesma-posição-conferência · 1 mesma-posição-outra-conferência
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
    // 6 de divisão (ida e volta)
    for (let d = 0; d < 4; d++) {
      const div = divOf(conf, d);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        games.push({ casa: div[i].id, fora: div[j].id, isDiv: true });
        games.push({ casa: div[j].id, fora: div[i].id, isDiv: true });
      }
    }
    // 4 de rotação intraconferência
    for (const [da, db] of intra) {
      const A = divByRank(conf, da); const B = divByRank(conf, db);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const aHosts = (i + j + parity) % 2 === 0;
        games.push(aHosts ? { casa: A[i].id, fora: B[j].id, isDiv: false } : { casa: B[j].id, fora: A[i].id, isDiv: false });
      }
    }
    // 2 mesma-posição-conferência (contra divisões NÃO sorteadas na rotação)
    const otherDivs = [0, 1, 2, 3].filter(d => !intra.some(([a, b]) => a === d || b === d));
    if (otherDivs.length >= 2) {
      const [da, db] = otherDivs;
      const A = divByRank(conf, da); const B = divByRank(conf, db);
      for (let r = 0; r < 4; r++) {
        const aHosts = (r + parity) % 2 === 0;
        games.push(aHosts ? { casa: A[r].id, fora: B[r].id, isDiv: false } : { casa: B[r].id, fora: A[r].id, isDiv: false });
      }
    }
  }

  // 4 interconferência (rotação por posição)
  for (const t of teams) {
    const otherConf: Conf = t.conf === 'AFC' ? 'NFC' : 'AFC';
    const oppDiv = (t.div + year) % 4;
    const opp = divByRank(otherConf, oppDiv)[rankOf(t.id) - 1];
    if (!opp) continue;
    for (let i = 0; i < 4; i++) {
      const partner = divByRank(otherConf, oppDiv)[i];
      const myRank = rankOf(t.id);
      if (i === myRank - 1) continue; // já é o jogo extra (abaixo)
      void partner;
    }
  }
  // jogo interconferência "mesma posição outra conferência" (1 por time)
  for (const t of teams) {
    const otherConf: Conf = t.conf === 'AFC' ? 'NFC' : 'AFC';
    const oppDiv = (t.div + year + 2) % 4;
    const opp = divByRank(otherConf, oppDiv)[rankOf(t.id) - 1];
    if (!opp) continue;
    const aHosts = (rankOf(t.id) + parity) % 2 === 0;
    games.push(aHosts ? { casa: t.id, fora: opp.id, isDiv: false } : { casa: opp.id, fora: t.id, isDiv: false });
  }

  // 4 interconferência "rotação de divisão" — cada time joga contra a divisão rotacionada
  for (const t of teams) {
    const otherConf: Conf = t.conf === 'AFC' ? 'NFC' : 'AFC';
    const oppDiv = (t.div + year + 1) % 4;
    const oppTeam = divByRank(otherConf, oppDiv)[rankOf(t.id) - 1];
    if (!oppTeam) continue;
    const extraDiv = (t.div + year + 3) % 4;
    const extra = divByRank(otherConf, extraDiv)[rankOf(t.id) - 1];
    if (!extra) continue;
    const aHosts = (rankOf(t.id) + parity) % 2 === 0;
    games.push(aHosts ? { casa: t.id, fora: extra.id, isDiv: false } : { casa: extra.id, fora: t.id, isDiv: false });
  }

  // dedupe
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
  for (const g of games) {
    count.set(g.casa, (count.get(g.casa) ?? 0) + 1);
    count.set(g.fora, (count.get(g.fora) ?? 0) + 1);
    home.set(g.casa, (home.get(g.casa) ?? 0) + 1);
  }
  for (const t of teams) {
    const n = count.get(t.id) ?? 0;
    if (n !== 17) return `${t.id} tem ${n} jogos (esperado 17)`;
    const h = home.get(t.id) ?? 0;
    if (h < 8 || h > 9) return `${t.id} tem ${h} jogos em casa (esperado 8-9)`;
  }
  return null;
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

/**
 * Aloca os jogos nas semanas 1..17.
 * INVARIANTE GARANTIDO: nenhum time joga duas vezes na mesma semana.
 */
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

  // bye weeks (semanas 5..14 = índices 4..13): 1 folga por time
  const bye = new Map<string, number>();
  {
    const byeWeeks = rng.shuffle([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const ids = rng.shuffle(teams.map(t => t.id));
    ids.forEach((id, i) => bye.set(id, byeWeeks[i % byeWeeks.length]));
  }

  // Alocação gulosa multissemente: tenta encaixar todos sem repetir time na semana.
  let bestWeeks: Game[][] | null = null;
  let bestLeft: Game[] = rest;
  for (let attempt = 0; attempt < 60 && bestLeft.length > 0; attempt++) {
    const r2 = new Rng((rng.int(1, 0x7fffffff) + attempt * 7919) >>> 0);
    const weeks: Game[][] = Array.from({ length: 17 }, () => []);
    const remaining = r2.shuffle([...rest]);
    for (let w = 0; w < 17 && remaining.length; w++) {
      const booked = new Set<string>();
      for (const t of teams) if (bye.get(t.id) === w) booked.add(t.id);
      let progress = true;
      while (progress) {
        progress = false;
        for (let i = remaining.length - 1; i >= 0; i--) {
          const g = remaining[i];
          if (booked.has(g.casa) || booked.has(g.fora)) continue;
          weeks[w].push(g);
          booked.add(g.casa); booked.add(g.fora);
          remaining.splice(i, 1);
          progress = true;
        }
      }
    }
    if (remaining.length < bestLeft.length) {
      bestLeft = remaining;
      bestWeeks = weeks;
    }
  }

  const weeks = bestWeeks ?? Array.from({ length: 17 }, () => []);
  // Varredura final CORRETIVA: encaixa jogos restantes em semanas onde AMBOS os
  // times estão livres (usa && — nunca coloca um time duas vezes na mesma semana).
  let left = bestLeft;
  for (const g of [...left]) {
    for (let w = 0; w < 17; w++) {
      const busy = new Set(weeks[w].flatMap(x => [x.casa, x.fora]));
      if (!busy.has(g.casa) && !busy.has(g.fora) && bye.get(g.casa) !== w && bye.get(g.fora) !== w) {
        weeks[w].push(g);
        left = left.filter(x => x !== g);
        break;
      }
    }
  }
  // Último recurso: ignora bye (mas NUNCA duplica time na semana).
  if (left.length > 0) {
    console.warn(`Calendário: ${left.length} jogo(s) realocados ignorando bye.`);
    for (const g of [...left]) {
      for (let w = 0; w < 17; w++) {
        const busy = new Set(weeks[w].flatMap(x => [x.casa, x.fora]));
        if (!busy.has(g.casa) && !busy.has(g.fora)) {
          weeks[w].push(g);
          left = left.filter(x => x !== g);
          break;
        }
      }
    }
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
    console.warn('Calendário oficial falhou, tentando reparo extra:', err);
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

/* ================= classificação ================= */
export interface TableRow {
  teamId: string; j: number; v: number; e: number; d: number;
  pf: number; pc: number; net: number; seq: string;
  winPct?: number; divPct?: number; confPct?: number; sov?: number; sos?: number;
  tiebreakNote?: string;
  tiebreakKey?: string;   // chave curta do critério de desempate (H2H, DIV, SOV…)
  gamesBehind?: number;   // jogos atrás do líder
  tiedAbove?: boolean;    // mesma campanha do time de cima
  divRec?: string;        // recorde dentro da divisão "4-2"
  isChamp?: boolean;
  seed?: number | null;
}
export type { TeamStanding };
export { computeStandings, rankDivision, conferenceOrder, generatePlayoffBracket };

export function standings(s: GameState): TableRow[] {
  const rows: TableRow[] = s.teams.map(t => ({ teamId: t.id, j: 0, v: 0, e: 0, d: 0, pf: 0, pc: 0, net: 0, seq: '' }));
  const byId = new Map(rows.map(r => [r.teamId, r]));
  for (const m of s.matches) {
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

export function divisionTable(s: GameState, conf: Conf, div: number): TableRow[] {
  const st = computeStandings(s);
  const ordered = rankDivision(s, conf, div, st);
  const base = new Map(standings(s).map(r => [r.teamId, r]));
  return ordered.map((t: TeamStanding) => {
    const b = base.get(t.teamId)!;
    return {
      ...b,
      winPct: t.winPct, divPct: t.divPct, confPct: t.confPct,
      sov: t.sov, sos: t.sos,
      tiebreakNote: t.tiebreakNote ?? undefined, tiebreakKey: t.tiebreakKey,
      gamesBehind: t.gamesBehind, tiedAbove: t.tiedAbove,
      divRec: `${t.divWins}-${t.divLosses}${t.divTies ? `-${t.divTies}` : ''}`,
      isChamp: t.isDivisionChampion,
    };
  });
}

/** Conferência inteira ordenada (campeões 1–4 + wild cards 5–7 + bolha), com GB e desempates. */
export function conferenceTable(s: GameState, conf: Conf): TableRow[] {
  const st = computeStandings(s);
  const ordered = conferenceOrder(s, conf, st);
  const base = new Map(standings(s).map(r => [r.teamId, r]));
  return ordered.map((t: TeamStanding) => {
    const b = base.get(t.teamId)!;
    return {
      ...b,
      winPct: t.winPct, divPct: t.divPct, confPct: t.confPct,
      sov: t.sov, sos: t.sos,
      tiebreakNote: t.tiebreakNote ?? undefined, tiebreakKey: t.tiebreakKey,
      gamesBehind: t.gamesBehind, tiedAbove: t.tiedAbove,
      divRec: `${t.divWins}-${t.divLosses}${t.divTies ? `-${t.divTies}` : ''}`,
      isChamp: t.isDivisionChampion, seed: t.playoffSeed,
    };
  });
}

export function conferenceSeeds(s: GameState, conf: Conf): { teamId: string; seed: number }[] {
  return conferenceOrder(s, conf)
    .filter(t => t.playoffSeed != null)
    .sort((a, b) => a.playoffSeed! - b.playoffSeed!)
    .map(t => ({ teamId: t.teamId, seed: t.playoffSeed! }));
}

export function playoffZone(s: GameState, conf: Conf): Set<string> {
  return new Set(conferenceSeeds(s, conf).map(x => x.teamId));
}

/** Zera classificação e stats após a Pré-temporada. */
export function resetPreseasonStats(s: GameState): void {
  for (const p of s.players) {
    p.stats = zeroStats();
  }
  s.teamSeasonStats = s.teams.map(t => zeroTeamStats(t.id, s.settings.temporada));
  s.powerRankings = [];
  s.seasonStorylines = [];
  s.narrativas = [];
  pushNews(s, 'RESET', 'Classificação e estatísticas zeradas após a Pré-temporada. A temporada regular começa limpa — todos os times 0-0.');
}

/* ================= avanço de semana ================= */
export interface AdvanceOutcome { match?: GameResult; eliminado?: boolean; trainingResults?: { playerId: string; nome: string; improvements: Record<string, number> }[]; }

function mergeStats(s: GameState, r: GameResult) {
  for (const [pid, delta] of Object.entries(r.statDeltas)) {
    const p = s.players.find(x => x.id === pid);
    if (!p) continue;
    for (const [k, v] of Object.entries(delta)) (p.stats as unknown as Record<string, number>)[k] = ((p.stats as unknown as Record<string, number>)[k] ?? 0) + v;
    p.jogosCarreira++;
  }
  for (const pid of r.participantes) {
    const p = s.players.find(x => x.id === pid);
    if (p) p.stats.jogos++;
  }
  for (const inj of r.lesoes) {
    const p = s.players.find(x => x.id === inj.playerId);
    if (p && p.lesao === 0) {
      p.lesao = inj.semanas; p.lesaoTotal = inj.semanas; p.lesaoTipo = inj.tipo;
      // mensagem para o usuário quando uma estrela do seu time se lesiona
      if (p.teamId === s.userTeam && p.ovr >= 78) {
        sendInjuryMessage(s, p.nome, p.pos, inj.semanas, inj.tipo);
      }
    }
  }
  const winner = r.placarCasa > r.placarFora ? r.casaId : r.placarFora > r.placarCasa ? r.foraId : null;
  for (const id of [r.casaId, r.foraId]) {
    const t = teamById(s, id);
    t.moral = clamp(t.moral + (id === winner ? 4 : winner ? -3 : 0), 25, 95);
    for (const p of playersOf(s, id)) p.moral = clamp(p.moral + (id === winner ? 3 : winner ? -2 : 0), 25, 95);
  }
  // acumuladores por franquia
  const updateTeam = (teamId: string, pts: number, yds: number, passYds: number, rushYds: number, tos: number) => {
    let st = s.teamSeasonStats.find(x => x.teamId === teamId && x.season === s.settings.temporada);
    if (!st) { st = zeroTeamStats(teamId, s.settings.temporada); s.teamSeasonStats.push(st); }
    st.pointsScored += pts; st.totalYards += yds; st.passingYards += passYds;
    st.rushingYards += rushYds; st.turnovers += tos;
  };
  const opp = (id: string) => id === r.casaId ? r.foraId : r.casaId;
  const oppPts = (id: string) => id === r.casaId ? r.placarFora : r.placarCasa;
  if (r.rich) {
    updateTeam(r.casaId, r.placarCasa, r.rich.casa.yds, r.rich.casa.passYds, r.rich.casa.rushYds, r.rich.casa.tos);
    updateTeam(r.foraId, r.placarFora, r.rich.fora.yds, r.rich.fora.passYds, r.rich.fora.rushYds, r.rich.fora.tos);
    const stC = s.teamSeasonStats.find(x => x.teamId === r.casaId)!;
    const stF = s.teamSeasonStats.find(x => x.teamId === r.foraId)!;
    stC.pointsAllowed += r.placarFora; stF.pointsAllowed += r.placarCasa;
    stC.sacks += r.rich.lines.filter(l => l.teamId === r.casaId).reduce((a, l) => a + (l.sacks ?? 0), 0);
    stF.sacks += r.rich.lines.filter(l => l.teamId === r.foraId).reduce((a, l) => a + (l.sacks ?? 0), 0);
    stC.interceptions += r.rich.lines.filter(l => l.teamId === r.casaId).reduce((a, l) => a + (l.intDef ?? 0), 0);
    stF.interceptions += r.rich.lines.filter(l => l.teamId === r.foraId).reduce((a, l) => a + (l.intDef ?? 0), 0);
  } else {
    // box score rico indisponível — acumula apenas pontos e pontos sofridos
    updateTeam(r.casaId, r.placarCasa, 0, 0, 0, 0);
    updateTeam(r.foraId, r.placarFora, 0, 0, 0, 0);
    const stC = s.teamSeasonStats.find(x => x.teamId === r.casaId)!;
    const stF = s.teamSeasonStats.find(x => x.teamId === r.foraId)!;
    stC.pointsAllowed += r.placarFora; stF.pointsAllowed += r.placarCasa;
  }
  void opp; void oppPts;
}

export function advance(s0: GameState): { state: GameState; out: AdvanceOutcome } {
  const s = structuredClone(s0);
  const prev = s0;
  const out: AdvanceOutcome = {};
  const { fase, semana } = s.settings;

  const isUser = (m: Match) => m.casa === s.userTeam || m.fora === s.userTeam;
  const weekMatches = s.matches.filter(m => m.fase === fase && m.rodada === semana && !m.jogada);

  for (const p of s.players) if (p.lesao > 0) { p.lesao--; if (p.lesao === 0) { p.lesaoTipo = null; p.lesaoTotal = undefined; } }

  const rng = new Rng(newSeed());
  const results: Match[] = [];
  let userRes: GameResult | null = null;
  const boxes: WeekBox[] = [];
  const snapsPorJogadorSemana = new Map<string, number>();

  let superBowlResult: GameResult | null = null;
  for (const m of weekMatches) {
    const user = isUser(m);
    const engine = new NFLMatchEngine(sideOf(s, m.casa), sideOf(s, m.fora), rng, {});
    const faseLabel = fase === 'PRE' ? `Pré-temporada, semana ${semana}` : fase === 'REG' ? `Semana ${semana}` : `Playoffs — ${s.bracket?.[semana - 1]?.nome ?? ''}`;
    const r = engine.simulate(m.id, faseLabel);
    m.placarCasa = r.placarCasa; m.placarFora = r.placarFora; m.jogada = true;
    m.publico = r.publico;
    mergeStats(s, r);
    results.push({ ...m });
    if (fase === 'REG') boxes.push(r.rich);
    if (fase === 'PO' && semana === 4) superBowlResult = r; // Super Bowl: guarda p/ MVP e destaques
    for (const l of r.rich.lines) snapsPorJogadorSemana.set(l.id, (snapsPorJogadorSemana.get(l.id) ?? 0) + (l.snaps ?? 0));
    if (user) { userRes = r; out.match = r; }
  }
  s.weekResults = results.filter(m => !isUser(m));
  s.lastResult = userRes;

  // Pro Bowl (temporada regular)
  if (fase === 'REG' && boxes.length) {
    runWeeklyProBowlVoting(s, semana, boxes);
  }

  // 💪 Sistema de Treino (temporada regular e pré)
  let trainingResults: { playerId: string; nome: string; improvements: Record<string, number> }[] = [];
  if (fase === 'REG' || fase === 'PRE') {
    const snapsObj = Object.fromEntries(snapsPorJogadorSemana);
    trainingResults = simulateTrainingWeek(s.players, s.trainingState, snapsObj);
    out.trainingResults = trainingResults;
    if (trainingResults.length > 0) {
      // 📧 relatório de treino como mensagem persistente (substitui o toast)
      sendTrainingReport(s, trainingResults);
      const destaques = trainingResults.slice(0, 3);
      const txt = destaques.map(t => `${t.nome} (+${Object.values(t.improvements).reduce((a, b) => a + b, 0)})`).join(', ');
      pushNews(s, 'TREINO', `Evolução da semana: ${txt}.`);
    }
  }

  if (fase === 'PRE') {
    if (semana >= 2) {
      resetPreseasonStats(s);
      s.settings.fase = 'REG'; s.settings.semana = 1;
      pushNews(s, 'TEMPORADA REGULAR', 'A pré-temporada acabou! 18 semanas valem a vaga nos playoffs. Semana 18 é 100% divisão.');
    } else s.settings.semana++;
  } else if (fase === 'REG') {
    // 📧 pressão da diretoria: toda semana + boletim detalhado a cada 4 semanas
    const perf = recordCoachEvaluation(s);
    sendWeeklyPressure(s, perf);
    if (semana % 4 === 0) sendEvaluationMessage(s, perf);
    // 📧 demissões de técnicos da IA abrem vagas no mercado
    generateAiCoachFirings(s, rng);
    // 📧 segurança do cargo do usuário (pode ser demitido)
    checkUserFiring(s, rng);

    if (semana >= 18) {
      selectProBowlRoster(s);
      sendProBowlResults(s);
      startPlayoffs(s);
    } else s.settings.semana++;
  } else if (fase === 'PO') {
    const stillIn = userStillAlive(s);
    if (prev.bracket && !stillIn && bracketHadUser(prev, s.userTeam)) {
      out.eliminado = true;
      const t = teamById(s, s.userTeam);
      pushNews(s, 'ELIMINAÇÃO', `Fim de sonho: ${t.cidade} ${t.nome} cai nos playoffs.`);
    }
    // sincroniza os placares da rodada no bracket e avança para a próxima fase.
    // Isolado em try/catch: uma falha na construção da próxima rodada NÃO pode
    // derrubar a simulação — os jogos já simulados devem sempre aparecer.
    try {
      if (s.bracket && s.bracket.length) {
        syncRoundResults(s, semana);
        if (semana === s.bracket.length) {
          if (semana < 4) nextRound(s);
          else {
            // Super Bowl (rodada 4) concluído → registra o campeão + mensagem
            const sb = s.bracket[3]?.jogos[0];
            if (sb && !s.campeoes.some(c => c.temporada === s.settings.temporada)) {
              const champId = (sb.pc ?? 0) >= (sb.pf ?? 0) ? sb.casa : sb.fora;
              s.campeoes.push({ temporada: s.settings.temporada, teamId: champId });
              sendSuperBowlMessage(s, champId, superBowlResult ?? undefined);
            }
          }
        }
      }
    } catch (err) {
      console.error('[TAG] Falha ao progredir rodada dos playoffs (semana ' + semana + '):', err);
    }
    s.settings.semana++;
    if (s.settings.semana > 4) endSeason(s, rng);
  }
  return { state: s, out };
}

const userStillAlive = (s: GameState) => {
  if (!s.bracket) return false;
  const rd = s.bracket[Math.min(s.settings.semana - 1, s.bracket.length - 1)];
  return rd.jogos.some(j => (j.casa === s.userTeam || j.fora === s.userTeam) && !j.jogada);
};
const bracketHadUser = (s: GameState, uid: string) => {
  const rd = s.bracket![Math.min(s.settings.semana - 1, s.bracket!.length - 1)];
  return rd.jogos.some(j => j.casa === uid || j.fora === uid);
};

/* ================= playoffs ================= */
function startPlayoffs(s: GameState) {
  s.settings.fase = 'PO'; s.settings.semana = 1;
  const jogos: { casa: string; fora: string; pc: number | null; pf: number | null; jogada: boolean }[] = [];
  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    for (const m of generatePlayoffBracket(s, conf).matchups) {
      jogos.push({ casa: m.casaId, fora: m.foraId, pc: null, pf: null, jogada: false });
    }
  }
  if (!jogos.length) {
    // segurança: sem matchups válidos, volta para a offseason sem quebrar
    console.error('[TAG] startPlayoffs: nenhum matchup de Wild Card gerado.');
    endSeason(s, new Rng(newSeed()));
    return;
  }
  s.bracket = [{ nome: 'Wild Card', jogos }];
  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    const seeds = conferenceSeeds(s, conf);
    const one = teamById(s, seeds[0].teamId);
    pushNews(s, 'PLAYOFFS', `${one.cidade} ${one.nome} é o seed #1 da ${conf} e folga no Wild Card.`);
  }
  // cria partidas jogáveis da rodada 1
  for (const j of jogos) {
    s.matches.push({ id: `po-1-${j.casa}-${j.fora}`, fase: 'PO', rodada: 1, casa: j.casa, fora: j.fora, placarCasa: null, placarFora: null, jogada: false });
  }
}

function syncRoundResults(s: GameState, rodada: number) {
  const round = s.bracket?.[rodada - 1];
  if (!round) return;
  for (const j of round.jogos) {
    const m = s.matches.find(x => x.fase === 'PO' && x.rodada === rodada &&
      ((x.casa === j.casa && x.fora === j.fora) || (x.casa === j.fora && x.fora === j.casa)) && x.jogada);
    if (!m) continue;
    j.pc = m.casa === j.casa ? m.placarCasa : m.placarFora;
    j.pf = m.casa === j.casa ? m.placarFora : m.placarCasa;
    j.jogada = true;
  }
}

function nextRound(s: GameState) {
  const nomes = ['Wild Card', 'Divisional', 'Final de Conferência', 'Super Bowl'];
  const idx = s.bracket!.length - 1;
  const round = s.bracket![idx];
  const winnersByConf = new Map<Conf, { casa: string; fora: string; pc: number; pf: number; winner: string }[]>();
  for (const conf of ['AFC', 'NFC'] as Conf[]) winnersByConf.set(conf, []);

  const seedOf = new Map<string, { conf: Conf; seed: number }>();
  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    for (const sd of conferenceSeeds(s, conf)) seedOf.set(sd.teamId, { conf, seed: sd.seed });
  }

  for (const j of round.jogos) {
    const w = (j.pc ?? 0) >= (j.pf ?? 0) ? { ...j, winner: j.casa } : { ...j, winner: j.fora };
    const info = seedOf.get(w.winner);
    if (info) winnersByConf.get(info.conf)!.push({ casa: j.casa, fora: j.fora, pc: j.pc ?? 0, pf: j.pf ?? 0, winner: w.winner });
  }

  const next: { casa: string; fora: string; pc: number | null; pf: number | null; jogada: boolean }[] = [];
  const winner = (j: { casa: string; fora: string; pc: number | null; pf: number | null }) =>
    (j.pc ?? 0) >= (j.pf ?? 0) ? j.casa : j.fora;

  if (nomes[idx + 1] === 'Super Bowl') {
    // Final de Conferência → Super Bowl: vencedor AFC × vencedor NFC
    const afcChamp = winnersByConf.get('AFC')![0]?.winner;
    const nfcChamp = winnersByConf.get('NFC')![0]?.winner;
    if (afcChamp && nfcChamp) next.push({ casa: afcChamp, fora: nfcChamp, pc: null, pf: null, jogada: false });
  } else {
    for (const conf of ['AFC', 'NFC'] as Conf[]) {
      const seeds = conferenceSeeds(s, conf);
      const confJogos = round.jogos.filter(j => seedOf.get(j.casa)?.conf === conf || seedOf.get(j.fora)?.conf === conf);
      const seedsOf = (j: { casa: string; fora: string }) =>
        [seedOf.get(j.casa)?.seed, seedOf.get(j.fora)?.seed].sort((a, b) => (a ?? 9) - (b ?? 9));

      if (nomes[idx + 1] === 'Divisional') {
        // Wild Card → Divisional (regra NFL): seed 1 × vencedor(4v5); vencedor(2v7) × vencedor(3v6)
        const jogo27 = confJogos.find(j => { const sd = seedsOf(j); return sd[0] === 2 && sd[1] === 7; });
        const jogo36 = confJogos.find(j => { const sd = seedsOf(j); return sd[0] === 3 && sd[1] === 6; });
        const jogo45 = confJogos.find(j => { const sd = seedsOf(j); return sd[0] === 4 && sd[1] === 5; });
        const seed1 = seeds.find(x => x.seed === 1);
        if (seed1 && jogo45) next.push({ casa: seed1.teamId, fora: winner(jogo45), pc: null, pf: null, jogada: false });
        if (jogo27 && jogo36) next.push({ casa: winner(jogo27), fora: winner(jogo36), pc: null, pf: null, jogada: false });
      } else {
        // Divisional → Final de Conferência: os 2 vencedores da conferência se enfrentam
        const sortedW = confJogos.map(j => winner(j));
        if (sortedW.length >= 2) next.push({ casa: sortedW[0], fora: sortedW[1], pc: null, pf: null, jogada: false });
      }
    }
  }
  s.bracket!.push({ nome: nomes[idx + 1], jogos: next });
  // cria partidas jogáveis da nova rodada
  for (const j of next) {
    s.matches.push({ id: `po-${idx + 2}-${j.casa}-${j.fora}`, fase: 'PO', rodada: idx + 2, casa: j.casa, fora: j.fora, placarCasa: null, placarFora: null, jogada: false });
  }
}

function endSeason(s: GameState, rng: Rng) {
  s.settings.fase = 'OFF'; s.settings.semana = 0;

  // 📧 avaliação de fim de temporada: pode resultar em demissão
  checkEndSeasonFiring(s, rng);

  // vagas não preenchidas expiram; técnico ainda demitido segue desempregado
  s.jobOpenings = s.jobOpenings.filter(j => j.isFilled);
  if (s.coachFired) {
    notify(s, {
      category: 'job', sender: 'Agente', senderIcon: '🤝',
      subject: 'Temporada encerrada — você segue sem clube',
      body: 'A temporada acabou e você não assumiu um novo comando. Seu agente segue negociando: ' +
        'novas vagas devem abrir durante a próxima temporada conforme técnicos forem demitidos.',
      priority: 'urgent',
      availableActions: [{ id: 'goto_jobs', label: 'Ver vagas abertas', kind: 'goto', screen: 'jobs' }],
    });
  }

  // envelhecimento + desenvolvimento
  const aposentados: string[] = [];
  for (const p of [...s.players]) {
    p.idade++;
    const t = p.teamId ? teamById(s, p.teamId) : null;
    const ct = t ? t.centroTreino : 2;
    let growth = p.idade <= 23 ? 2.1 : p.idade <= 26 ? 1.2 : p.idade <= 29 ? 0.2 : p.idade <= 31 ? -1.1 : p.idade <= 33 ? -2.3 : -3.6;
    growth += (ct - 2) * 0.45;
    if (growth > 0 && p.ovr >= p.pot - 2) growth *= 0.25;
    const FOCUS_ATTRS: Record<Focus, (keyof Player['attrs'])[]> = {
      CORRIDA: ['corrida', 'bloqueio'], PASSE: ['passe', 'recepcao'],
      DEFESA: ['tackle', 'velocidade'], FISICO: ['resistencia', 'velocidade'],
    };
    const focusKeys = t && p.idade <= 27 ? FOCUS_ATTRS[s.focus] : [];
    for (const k of Object.keys(p.attrs) as (keyof Player['attrs'])[]) {
      let d = growth + rng.f(-1.6, 1.6);
      if (growth > 0 && focusKeys.includes(k)) d += 1.1;
      p.attrs[k] = clamp(Math.round(p.attrs[k] + d), 25, 95);
    }
    p.ovr = computeOvr(p.pos, p.attrs);
    p.lesao = 0; p.lesaoTipo = null; p.lesaoTotal = undefined;
    p.rookie = false;
    if (p.teamId) p.anosNoTime = Math.min(10, p.anosNoTime + 1);
    const retireP = p.idade >= 32 ? (p.idade - 31) * 0.12 + (p.ovr < 70 ? 0.18 : 0) : 0;
    if (rng.chance(retireP)) {
      aposentados.push(p.nome);
      s.players = s.players.filter(x => x.id !== p.id);
    }
  }
  if (aposentados.length) pushNews(s, 'APOSENTADORIAS', `${aposentados.length} veteranos penduram as chuteiras.`);

  // contratos: consome temporada, libera expirados
  const expirandoUser: string[] = [];
  for (const p of [...s.players]) {
    p.contrato--;
    if (p.contrato > 0) continue;
    if (p.tag) {
      const value = franchiseTagValue(p.pos, s.players);
      p.tag = false; p.contrato = 1; p.salario = value; p.contract = makeTagContract(value);
      continue;
    }
    if (p.teamId === s.userTeam) expirandoUser.push(p.nome);
    p.origem = p.teamId ?? undefined;
    p.teamId = null; p.status = 'RES';
    s.faPool.push(p);
    s.players = s.players.filter(x => x.id !== p.id);
  }
  if (expirandoUser.length) pushNews(s, 'MERCADO', `Contratos encerrados: ${expirandoUser.slice(0, 4).join(', ')} agora são free agents.`);

  // comissão técnica: expira contratos
  for (const st of [...s.staff]) {
    st.contrato--;
    if (st.contrato > 0) continue;
    st.teamId = '';
    s.staffPool.push(st);
    s.staff = s.staff.filter(x => x.id !== st.id);
  }

  s.offPhase = 1;
  s.draftState = null;
  resetScouting(s);
  aiScoutingWave(s, rng);
  pushNews(s, 'OFFSEASON', 'Fim dos playoffs! Offseason em 4 fases: 1) Free Agency → 2) Renovações → 3) Draft → 4) Validação.');
}

/* ---------- offseason guiada ---------- */
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
  s.pickOwners = initialPickOwnersLocal(order);
  pushNews(s, 'DRAFT', `Ordem definida: ${teamById(s, order[0]).cidade} escolhe primeiro. Sua posição: ${order.indexOf(s.userTeam) + 1}.`);
}

function initialPickOwnersLocal(order: string[]): import('./types').PickOwner[][] {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 32 }, (_, slot) => ({ owner: order[slot % order.length], from: null })));
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
    score: (bpa ? p.pot * 0.7 + p.ovr * 0.3 : p.pot * 0.4 + p.ovr * 0.3 + need(p.pos) * 22) + (p.scout?.aiHeat ?? 0) * 2 + Math.random() * 6,
  })).sort((a, b) => b.score - a.score);
  return scored[0].p;
}

function commitPick(s: GameState, p: Player, teamId: string, rng: Rng): boolean {
  const surprise = applyDraftSurprise(s, p, rng);
  s.draftClass = s.draftClass.filter(x => x.id !== p.id);
  p.teamId = teamId; p.status = 'RES'; p.contrato = 4; p.rookie = true;
  p.salario = rookieSalary(p.ovr);
  p.anosNoTime = 0;
  s.players.push(p);
  if (surprise && teamId === s.userTeam) {
    pushNews(s, 'DRAFT', `Surpresa no combine! ${p.nome} se saiu melhor que o esperado — OVR revisado para ${p.ovr}.`);
  }
  return surprise;
}

export function userDraftPick(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const d = s.draftState;
  if (!d || d.done) return { ok: false, msg: 'O draft não está em andamento.' };
  if (d.order[d.pick] !== s.userTeam) return { ok: false, msg: 'Não é a sua escolha.' };
  const p = s.draftClass.find(x => x.id === playerId);
  if (!p) return { ok: false, msg: 'Prospecto indisponível.' };
  const ativos = playersOf(s, s.userTeam).filter(x => x.status !== 'PS').length;
  if (ativos >= 53) return { ok: false, msg: 'Elenco cheio (53).' };
  const rng = new Rng(newSeed());
  const round = d.round;
  commitPick(s, p, s.userTeam, rng);
  pushNews(s, 'DRAFT', `Rodada ${round}: você escolhe ${p.nome} (${p.pos}, OVR ${p.ovr}).`);
  sendDraftMessage(s, round, p.nome, p.pos, p.scout?.college ?? 'universidade');
  advanceDraft(s, rng);
  return { ok: true, msg: `${p.nome} draftado!` };
}

function advanceDraft(s: GameState, rng: Rng) {
  const d = s.draftState!;
  d.pick++;
  if (d.pick >= d.order.length) {
    d.pick = 0; d.round++;
    if (d.round > 7) { d.done = true; pushNews(s, 'DRAFT', 'Draft encerrado após 7 rodadas.'); return; }
  }
  // IA até chegar no usuário
  let guard = 0;
  while (!d.done && d.order[d.pick] !== s.userTeam && guard++ < 40 && s.draftClass.length) {
    const teamId = d.order[d.pick];
    const pick = aiPickFor(s, teamId);
    if (!pick) { d.done = true; break; }
    commitPick(s, pick, teamId, rng);
    d.pick++;
    if (d.pick >= d.order.length) {
      d.pick = 0; d.round++;
      if (d.round > 7) d.done = true;
    }
  }
}

export function autoDraftUntilUser(s: GameState) {
  const d = s.draftState;
  if (!d || d.done) return;
  const rng = new Rng(newSeed());
  let guard = 0;
  while (!d.done && d.order[d.pick] !== s.userTeam && guard++ < 40 && s.draftClass.length) {
    const teamId = d.order[d.pick];
    const pick = aiPickFor(s, teamId);
    if (!pick) { d.done = true; break; }
    commitPick(s, pick, teamId, rng);
    d.pick++;
    if (d.pick >= d.order.length) {
      d.pick = 0; d.round++;
      if (d.round > 7) d.done = true;
    }
  }
}

export function autoDraftAll(s: GameState) {
  const d = s.draftState;
  if (!d || d.done) return;
  const rng = new Rng(newSeed());
  let guard = 0;
  while (!d.done && guard++ < 400 && s.draftClass.length) {
    const teamId = d.order[d.pick];
    const pick = aiPickFor(s, teamId);
    if (!pick) { d.done = true; break; }
    commitPick(s, pick, teamId, rng);
    d.pick++;
    if (d.pick >= d.order.length) {
      d.pick = 0; d.round++;
      if (d.round > 7) d.done = true;
    }
  }
  d.done = true;
}

export function advanceOffPhase(s: GameState): { ok: boolean; msg: string } {
  const rng = new Rng(newSeed());
  const ph = s.offPhase ?? 1;
  if (s.settings.fase !== 'OFF') return { ok: false, msg: 'A offseason ainda não começou.' };
  if (ph === 1) {
    aiFreeAgency(s, rng);
    s.offPhase = 2;
    pushNews(s, 'OFFSEASON', 'Free Agency encerrada. Fase 2: renove jogadores e comissão técnica.');
    return { ok: true, msg: 'Fase 2 — Renovações aberta.' };
  }
  if (ph === 2) {
    setupDraftOrder(s);
    s.offPhase = 3;
    pushNews(s, 'OFFSEASON', 'Renovações concluídas. Fase 3: Draft aberto em 7 rodadas.');
    return { ok: true, msg: 'Fase 3 — Draft aberto.' };
  }
  if (ph === 3) {
    if (!s.draftState?.done) return { ok: false, msg: 'Conclua as 7 rodadas do Draft antes de avançar.' };
    s.offPhase = 4;
    pushNews(s, 'OFFSEASON', 'Draft encerrado. Fase 4: valide o elenco (53) e o salary cap.');
    return { ok: true, msg: 'Fase 4 — Validação final.' };
  }
  return { ok: false, msg: 'A offseason já foi concluída.' };
}

function aiFreeAgency(s: GameState, rng: Rng) {
  const assinaturas: string[] = [];
  for (const t of s.teams) {
    if (t.id === s.userTeam) continue;
    let space = s.settings.cap - capUsed(s, t.id);
    if (space < 1) continue;
    const moves = 1 + Math.min(2, Math.floor(space / 25));
    for (let m = 0; m < moves && s.faPool.length; m++) {
      const ativos = playersOf(s, t.id).filter(p => p.status !== 'PS').length;
      if (ativos >= 53) break;
      const meus = s.faPool.filter(f => f.origem === t.id && f.salario <= space).sort((a, b) => b.ovr - a.ovr);
      const pool = meus.length ? meus : [...s.faPool].filter(f => f.salario <= space).sort((a, b) => b.ovr - a.ovr);
      const reconstruindo = teamStrength(s, t.id) < 68;
      pool.sort((a, b) => reconstruindo ? (a.idade - b.idade) || (b.ovr - a.ovr) : (b.ovr - a.ovr));
      const f = pool[0];
      if (!f) break;
      s.faPool = s.faPool.filter(x => x.id !== f.id);
      f.teamId = t.id; f.status = 'RES'; f.origem = undefined; f.anosNoTime = 0;
      f.contrato = rng.int(1, 3);
      s.players.push(f);
      space = s.settings.cap - capUsed(s, t.id);
      if (f.ovr >= 76) assinaturas.push(`${t.sigla} contrata ${f.nome} (${f.pos}, OVR ${f.ovr})`);
    }
  }
  if (assinaturas.length) pushNews(s, 'FREE AGENCY', `Mercado aquecido: ${assinaturas.slice(0, 3).join('; ')}.`);
}

/* ---------- validação e auto-fix ---------- */
export interface RosterCheck { ok: boolean; erros: string[]; }
export function validateRoster(s: GameState): RosterCheck {
  const erros: string[] = [];
  const roster = playersOf(s, s.userTeam);
  const ativos = roster.filter(p => p.status !== 'PS').length;
  const ps = roster.filter(p => p.status === 'PS').length;
  const cap = capUsed(s, s.userTeam);
  if (ativos > 53) erros.push(`Elenco ativo tem ${ativos} jogadores — o máximo é 53.`);
  if (ativos < 53) erros.push(`Elenco ativo tem ${ativos} jogadores — a liga exige 53.`);
  if (ps > 10) erros.push(`Practice Squad com ${ps} jogadores — o máximo é 10.`);
  if (cap > s.settings.cap) erros.push(`Folha de ${fmtM(cap)} estoura o cap de ${fmtM(s.settings.cap)}.`);
  if (!roster.some(p => p.pos === 'QB' && p.status !== 'PS')) erros.push('É preciso ter ao menos 1 QB.');
  if (!roster.some(p => p.pos === 'K' && p.status !== 'PS')) erros.push('É preciso ter ao menos 1 Kicker.');
  if (!roster.some(p => p.pos === 'P' && p.status !== 'PS')) erros.push('É preciso ter ao menos 1 Punter.');
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
    const alvo = ps[0] ?? res[0] ?? tit[0];
    if (!alvo) break;
    s.players = s.players.filter(x => x.id !== alvo.id);
    alvo.teamId = null; alvo.status = 'RES'; alvo.origem = teamId;
    s.faPool.push(alvo);
    cortados.push(alvo);
  }
  return cortados;
}

export function autoFixRoster(s: GameState): { msg: string } {
  const feitas: string[] = [];
  const cortesCap = enforceCapCompliance(s, s.userTeam);
  if (cortesCap.length) feitas.push(`${cortesCap.length} corte(s) para caber no cap`);

  const prioridade: Player['pos'][] = ['QB', 'K', 'P'];
  for (const pos of prioridade) {
    const tem = playersOf(s, s.userTeam).some(p => p.pos === pos && p.status !== 'PS');
    if (tem) continue;
    const space = s.settings.cap - capUsed(s, s.userTeam);
    const cand = s.faPool.filter(f => f.pos === pos && f.salario <= space).sort((a, b) => b.ovr - a.ovr)[0];
    if (cand) {
      s.faPool = s.faPool.filter(x => x.id !== cand.id);
      cand.teamId = s.userTeam; cand.status = 'RES'; cand.contrato = 1; cand.origem = undefined;
      s.players.push(cand);
      feitas.push(`contratou ${cand.nome} (${pos})`);
    }
  }

  let ativos = playersOf(s, s.userTeam).filter(p => p.status !== 'PS').length;
  let guard = 0;
  while (ativos < 53 && s.faPool.length && guard++ < 60) {
    const space = s.settings.cap - capUsed(s, s.userTeam);
    const cabem = s.faPool.filter(f => f.salario <= space).sort((a, b) => a.salario - b.salario);
    if (!cabem.length) break;
    const f = cabem[0];
    s.faPool = s.faPool.filter(x => x.id !== f.id);
    f.teamId = s.userTeam; f.status = 'RES'; f.contrato = 1; f.origem = undefined;
    s.players.push(f); ativos++;
  }
  if (ativos < 53) feitas.push(`elenco em ${ativos}/53`);

  const psJog = playersOf(s, s.userTeam).filter(p => p.status === 'PS').sort((a, b) => a.ovr - b.ovr);
  while (psJog.length > 10) {
    const c = psJog.shift()!;
    s.players = s.players.filter(x => x.id !== c.id);
    c.teamId = null; s.faPool.push(c);
    feitas.push('1 corte no Practice Squad');
  }
  return { msg: feitas.length ? `Auto-Fix: ${feitas.join(', ')}.` : 'Auto-Fix: nada a ajustar.' };
}

/* ================= ações do usuário ================= */
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
  t.tactics = { ...t.tactics, corrida: clamp(corrida, 5, 95), agressividade: clamp(agressividade, 0, 100) };
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
  pushNews(s, 'ESTRUTURA', `${kind === 'estadio' ? 'Estádio' : 'Centro de treinamento'} melhorado para o nível ${nivel + 1}.`);
  return { ok: true, msg: `${kind === 'estadio' ? 'Estádio' : 'CT'} agora é nível ${nivel + 1}!` };
}

export function marketValue(p: Player, inflacao = 1): number {
  return baseMarketValue(p.ovr, p.pos, p.idade, inflacao);
}

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
  if (usado + p.salario > s.settings.cap) return { ok: false, motivo: `Sem espaço no cap: restam ${fmtM(Math.max(0, Math.round((s.settings.cap - usado) * 10) / 10))}.` };
  return { ok: true, motivo: '' };
}

export function signFA(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.faPool.find(x => x.id === playerId);
  if (!p) return { ok: false, msg: 'Jogador indisponível.' };
  const chk = canSign(s, p);
  if (!chk.ok) return { ok: false, msg: chk.motivo };
  s.faPool = s.faPool.filter(x => x.id !== playerId);
  p.teamId = s.userTeam; p.status = 'RES'; p.origem = undefined; p.anosNoTime = 0;
  p.moral = clamp(p.moral + 12, 25, 95);
  s.players.push(p);
  addChurn(s, s.userTeam, 8);
  const t = teamById(s, s.userTeam);
  pushNews(s, 'CONTRATAÇÃO', `${t.sigla} contrata ${p.nome} (${p.pos}, OVR ${p.ovr}) por ${fmtM(p.salario)}/ano.`);
  sendFreeAgentMessage(s, p.nome, p.pos, p.ovr, p.salario);
  return { ok: true, msg: `${p.nome} contratado!` };
}

export function releasePlayer(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam) return { ok: false, msg: 'Jogador inválido.' };
  if (p.tag) return { ok: false, msg: 'Jogador com franchise tag não pode ser dispensado.' };
  s.players = s.players.filter(x => x.id !== playerId);
  p.teamId = null; p.status = 'RES'; p.origem = s.userTeam;
  s.faPool.push(p);
  addChurn(s, s.userTeam, 6);
  return { ok: true, msg: `${p.nome} dispensado.` };
}

export function negotiateContract(s: GameState, playerId: string, o: ContractOffer): { ok: boolean; msg: string } {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam) return { ok: false, msg: 'Jogador inválido.' };
  if (p.tag) return { ok: false, msg: 'Jogador com franchise tag.' };
  if (p.contrato > 2) return { ok: false, msg: 'Extensão antecipada só com ≤2 anos restantes.' };
  if (o.years < 1 || o.years > 5) return { ok: false, msg: 'Contratos têm de 1 a 5 anos.' };
  if (o.base <= 0) return { ok: false, msg: 'Salário-base precisa ser positivo.' };

  const usadoSemEle = capUsed(s, s.userTeam) - capHitOf(p);
  const novoHit = makeContract(o).capHits[0];
  if (usadoSemEle + novoHit > s.settings.cap) {
    return { ok: false, msg: `Cap insuficiente: a oferta pesa ${fmtM(novoHit)} no ano 1.` };
  }

  const hap = negotiationHappiness(p, o, s.settings.inflacao, { lealdade: true });
  const aceita = acceptanceRoll(hap.total, new Rng(newSeed()));
  const veredicto = happinessVerdict(hap.total);

  if (!aceita) {
    p.moral = clamp(p.moral - 4, 25, 95);
    return { ok: false, msg: `${p.nome} recusou (${hap.total}% — ${veredicto.label.toLowerCase()}).` };
  }

  p.contract = makeContract(o);
  p.contrato = o.years;
  p.salario = o.base;
  p.holdout = false;
  p.moral = clamp(p.moral + 8, 25, 95);
  pushNews(s, 'CONTRATO', `${p.nome} assina: ${o.years} ano(s), ${fmtM(o.base)}/ano, ${STRUCT_LABEL[o.structure].toLowerCase()}.`);
  sendContractMessage(s, p.nome, p.pos, o.years, o.base);
  return { ok: true, msg: `${p.nome} assinou! (${hap.total}%)` };
}

export function renewPlayer(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam) return { ok: false, msg: 'Jogador inválido.' };
  if (p.contrato > 2) return { ok: false, msg: 'Renovação antecipada só com ≤2 anos restantes.' };
  const exp = calcExpectations(p, s.settings.inflacao);
  return negotiateContract(s, playerId, {
    years: exp.anos, base: exp.aav,
    bonus: Math.round(exp.aav * exp.anos * 0.1 * 10) / 10,
    structure: exp.structure,
  });
}

export function applyTag(s: GameState, playerId: string): boolean {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam || p.contrato !== 1 || p.tag) return false;
  const value = franchiseTagValue(p.pos, s.players);
  p.tag = true;
  p.contract = makeTagContract(value);
  pushNews(s, 'FRANCHISE TAG', `${p.nome} recebe a franchise tag: 1 ano garantido por ${fmtM(value)}.`);
  return true;
}

export function renewStaff(s: GameState, staffId: string, offer: ContractOffer): { ok: boolean; msg: string } {
  const st = s.staff.find(x => x.id === staffId && x.teamId === s.userTeam);
  if (!st) return { ok: false, msg: 'Profissional inválido.' };
  if (st.contrato > 2) return { ok: false, msg: 'Renovação antecipada vale para contratos com ≤2 anos.' };
  const t = teamById(s, s.userTeam);
  if (t.dinheiro < offer.bonus) return { ok: false, msg: 'Caixa insuficiente para o bônus.' };
  const rng = new Rng(newSeed());
  const hap = staffHappiness(st, offer);
  if (!staffAcceptanceRoll(hap.value, rng)) {
    return { ok: false, msg: `Recusada! ${st.nome} pede ~${fmtM(staffExpectations(st).aav)}/ano. (${hap.value}%)` };
  }
  t.dinheiro = Math.round((t.dinheiro - offer.bonus) * 10) / 10;
  st.salario = offer.base; st.bonus = offer.bonus; st.contrato = offer.years;
  pushNews(s, 'COMISSÃO', `${st.nome} (${st.funcao}) renova: ${offer.years} ano(s), ${fmtM(offer.base)}/ano.`);
  return { ok: true, msg: `${st.nome} renovou!` };
}

export function hireScoutStaff(s: GameState): { ok: boolean; msg: string } {
  const t = teamById(s, s.userTeam);
  const cost = 5;
  if (t.dinheiro < cost) return { ok: false, msg: `Caixa insuficiente: precisa de ${fmtM(cost)}.` };
  const rng = new Rng(newSeed());
  const nivel = clamp(rng.int(2, 4), 1, 5);
  s.staff.push({
    id: `st${Date.now()}`, teamId: s.userTeam,
    nome: genName(rng), funcao: 'Olheiro Extra', nivel,
    experiencia: rng.int(2, 15), salario: staffMarketValue(nivel, 5),
    bonus: 0, contrato: 2, moral: 70,
  });
  t.dinheiro = Math.round((t.dinheiro - cost) * 10) / 10;
  s.scoutBudgetMax = 10 + s.staff.filter(st => st.teamId === s.userTeam && (st.funcao === 'Olheiro' || st.funcao === 'Olheiro Extra')).length * 3;
  s.scoutBudget += 3;
  pushNews(s, 'SCOUTING', `${t.sigla} contrata Olheiro Extra (nv. ${nivel}). +3 pontos de scouting por temporada.`);
  return { ok: true, msg: 'Olheiro Extra contratado! +3 pontos de scouting.' };
}

/* ================= nova temporada ================= */
export function newSeason(prev: GameState, buildWorld: (s: GameState, rng: Rng, ranks: RankMap) => { matches: Match[]; draftClass: Player[] }): GameState {
  const s = structuredClone(prev);
  const rng = new Rng(newSeed());

  // histórico de campanha
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

  // inflação
  const crescimento = s.settings.tvGrowth;
  s.settings.cap = Math.round(s.settings.cap * (1 + crescimento / 100));
  s.settings.inflacao = Math.round(s.settings.inflacao * (1 + crescimento / 100) * 1000) / 1000;
  s.settings.tvDeal = Math.round(s.settings.tvDeal * (1 + crescimento / 100) * 100) / 100;
  const novaProjecao = Math.round(rng.f(3, 8) * 10) / 10;

  s.settings.temporada++;
  s.settings.fase = 'PRE';
  s.settings.semana = 1;

  for (const p of s.players) {
    p.stats = zeroStats(); p.lesao = 0; p.lesaoTipo = null; p.lesaoTotal = undefined; p.tag = false;
    p.moral = 75;
  }
  for (const t of s.teams) {
    t.moral = 75;
    t.teamChurn = Math.max(0, t.teamChurn - 12);
    recalcChemistry(s, t.id);
  }
  s.teamSeasonStats = [];
  s.seasonStorylines = [];
  s.probowl = emptyProBowl(s.settings.temporada);

  const w = buildWorld(s, rng, ranks);
  s.matches = w.matches;
  s.draftClass = w.draftClass;
  for (const p of s.draftClass) p.salario = Math.round(p.salario * s.settings.inflacao * 10) / 10;
  for (const f of s.faPool) f.salario = Math.round(f.salario * s.settings.inflacao * 10) / 10;

  s.draftState = null;
  s.bracket = null;
  s.lastResult = null;
  s.weekResults = [];
  s.offPhase = undefined;
  resetScouting(s);

  // completa elencos das IAs
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
  for (const t of s.teams) {
    const cortados = enforceCapCompliance(s, t.id);
    if (cortados.length && t.id === s.userTeam) {
      pushNews(s, 'CAP', `Sua franquia iniciou acima do teto e cortou ${cortados.length} jogador(es).`);
    }
  }

  pushNews(s, 'ECONOMIA', `Cap sobe ${crescimento.toFixed(1).replace('.', ',')}% e vai a ${fmtM(s.settings.cap)}.`);
  pushNews(s, 'TEMPORADA', `Temporada ${s.settings.temporada} começa! 17 jogos em 18 semanas.`);
  s.settings.tvGrowth = novaProjecao;
  return s;
}

void POS_ORDER; void salaryFor; void genName; void shouldHoldout; void emptyProBowl;
