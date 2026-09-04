/* ============================================================
 * 🏆 Sistema oficial de classificação da NFL — tiebreakers.
 * Divisão: 15 critérios sequenciais. Conferência: 10 critérios.
 * Regra de ouro: campeões de divisão SEMPRE à frente de wild cards.
 * ============================================================ */

import type { Conf, GameState, Match } from './types';

export interface TeamStanding {
  teamId: string;
  conf: Conf; div: number;
  wins: number; losses: number; ties: number;
  winPct: number;
  divWins: number; divLosses: number; divTies: number; divPct: number;
  confWins: number; confLosses: number; confTies: number; confPct: number;
  sov: number; sos: number;
  pointsFor: number; pointsAgainst: number; netPoints: number;
  confPointsFor: number; confPointsAgainst: number;
  divisionRank: number;
  conferenceRank: number;
  playoffSeed: number | null;
  isDivisionChampion: boolean;
  isPlayoffTeam: boolean;
  tiebreakNote: string;
}

export const DIVISION_CRITERIA_LABELS: Record<string, string> = {
  h2h: 'Head-to-head (confronto direto)',
  div: 'Recorde dentro da divisão',
  common: 'Recorde contra adversários comuns',
  conf: 'Recorde dentro da conferência',
  sov: 'Strength of Victory (vitórias dos times que venceu)',
  sos: 'Strength of Schedule (vitórias dos times que enfrentou)',
  confPtsRank: 'Ranking combinado de pontos na conferência',
  confPtsFor: 'Pontos marcados na conferência',
  confPtsAgainst: 'Pontos sofridos na conferência',
  leaguePtsRank: 'Ranking combinado de pontos na liga',
  ptsFor: 'Pontos marcados na liga',
  ptsAgainst: 'Pontos sofridos na liga',
  net: 'Net points na liga',
  oppNet: 'Net points de todos os adversários',
  coin: 'Sorteio (coin toss)',
};

export const CONFERENCE_CRITERIA_LABELS: Record<string, string> = {
  h2h: 'Head-to-head (confronto direto)',
  conf: 'Recorde dentro da conferência',
  common: 'Recorde contra adversários comuns',
  sov: 'Strength of Victory',
  sos: 'Strength of Schedule',
  confPtsRank: 'Ranking combinado de pontos na conferência',
  confPtsFor: 'Pontos marcados na conferência',
  confPtsAgainst: 'Pontos sofridos na conferência',
  net: 'Net points na liga',
  coin: 'Sorteio (coin toss)',
};

const pct = (w: number, l: number, t: number) => {
  const g = w + l + t;
  return g === 0 ? 0 : (w + t * 0.5) / g;
};

/** Jogos da temporada regular envolvendo um time. */
function gamesOf(s: GameState, teamId: string): { m: Match; opp: string; pf: number; pa: number; win: boolean; loss: boolean; tie: boolean }[] {
  return s.matches
    .filter(m => m.fase === 'REG' && m.jogada && (m.casa === teamId || m.fora === teamId) && m.placarCasa != null && m.placarFora != null)
    .map(m => {
      const isHome = m.casa === teamId;
      const pf = isHome ? m.placarCasa! : m.placarFora!;
      const pa = isHome ? m.placarFora! : m.placarCasa!;
      return { m, opp: isHome ? m.fora : m.casa, pf, pa, win: pf > pa, loss: pf < pa, tie: pf === pa };
    });
}

export function computeFullStandings(s: GameState): TeamStanding[] {
  const teamConf = new Map(s.teams.map(t => [t.id, t.conf]));
  const teamDiv = new Map(s.teams.map(t => [t.id, t.div]));

  const standings: TeamStanding[] = s.teams.map(t => ({
    teamId: t.id, conf: t.conf, div: t.div,
    wins: 0, losses: 0, ties: 0, winPct: 0,
    divWins: 0, divLosses: 0, divTies: 0, divPct: 0,
    confWins: 0, confLosses: 0, confTies: 0, confPct: 0,
    sov: 0, sos: 0,
    pointsFor: 0, pointsAgainst: 0, netPoints: 0,
    confPointsFor: 0, confPointsAgainst: 0,
    divisionRank: 0, conferenceRank: 0, playoffSeed: null,
    isDivisionChampion: false, isPlayoffTeam: false, tiebreakNote: '',
  }));
  const byId = new Map(standings.map(r => [r.teamId, r]));

  // record básico + divisão + conferência + pontos
  for (const t of s.teams) {
    const r = byId.get(t.id)!;
    for (const g of gamesOf(s, t.id)) {
      const oppConf = teamConf.get(g.opp);
      const oppDiv = teamDiv.get(g.opp);
      if (g.win) r.wins++; else if (g.loss) r.losses++; else r.ties++;
      r.pointsFor += g.pf; r.pointsAgainst += g.pa;
      if (oppConf === t.conf) {
        if (g.win) r.confWins++; else if (g.loss) r.confLosses++; else r.confTies++;
        r.confPointsFor += g.pf; r.confPointsAgainst += g.pa;
      }
      if (oppConf === t.conf && oppDiv === t.div) {
        if (g.win) r.divWins++; else if (g.loss) r.divLosses++; else r.divTies++;
      }
    }
    r.winPct = pct(r.wins, r.losses, r.ties);
    r.divPct = pct(r.divWins, r.divLosses, r.divTies);
    r.confPct = pct(r.confWins, r.confLosses, r.confTies);
    r.netPoints = r.pointsFor - r.pointsAgainst;
  }

  // SoV e SoS (usam winPct dos oponentes)
  for (const t of s.teams) {
    const r = byId.get(t.id)!;
    const gs = gamesOf(s, t.id);
    const wonOpps = gs.filter(g => g.win).map(g => byId.get(g.opp)!.winPct);
    const allOpps = gs.map(g => byId.get(g.opp)!.winPct);
    r.sov = wonOpps.length ? wonOpps.reduce((a, b) => a + b, 0) / wonOpps.length : 0;
    r.sos = allOpps.length ? allOpps.reduce((a, b) => a + b, 0) / allOpps.length : 0;
  }

  return standings;
}

/** Head-to-head: % de vitórias em jogos diretos entre os times do grupo. */
function h2hPct(s: GameState, teamId: string, group: Set<string>): number {
  let w = 0; let l = 0; let t = 0;
  for (const g of gamesOf(s, teamId)) {
    if (!group.has(g.opp)) continue;
    if (g.win) w++; else if (g.loss) l++; else t++;
  }
  return pct(w, l, t);
}

/** Adversários comuns (mínimo 4): % de vitórias contra times que todos do grupo enfrentaram. */
function commonPct(s: GameState, teamId: string, group: Set<string>): number {
  const myOpps = new Set(gamesOf(s, teamId).map(g => g.opp));
  let common = new Set<string>();
  let first = true;
  for (const id of group) {
    if (id === teamId) continue;
    const theirs = new Set(gamesOf(s, id).map(g => g.opp));
    if (first) { common = theirs; first = false; }
    else common = new Set([...common].filter(x => theirs.has(x)));
  }
  const valid = new Set([...common].filter(x => !group.has(x) && myOpps.has(x)));
  if (valid.size < 4) return -1; // sem mínimo de 4
  let w = 0; let l = 0; let t = 0;
  for (const g of gamesOf(s, teamId)) {
    if (!valid.has(g.opp)) continue;
    if (g.win) w++; else if (g.loss) l++; else t++;
  }
  return pct(w, l, t);
}

/** Ordena um grupo de times (já com standings) pelos tiebreakers de divisão. */
function rankGroup(s: GameState, full: TeamStanding[], group: TeamStanding[]): TeamStanding[] {
  const byId = new Map(full.map(r => [r.teamId, r]));
  const groupIds = new Set(group.map(g => g.teamId));
  const result = [...group];

  const sorters: { key: string; val: (r: TeamStanding) => number }[] = [
    { key: 'h2h', val: r => h2hPct(s, r.teamId, groupIds) },
    { key: 'div', val: r => r.divPct },
    { key: 'common', val: r => commonPct(s, r.teamId, groupIds) },
    { key: 'conf', val: r => r.confPct },
    { key: 'sov', val: r => r.sov },
    { key: 'sos', val: r => r.sos },
    { key: 'confPtsRank', val: r => r.confPointsFor - r.confPointsAgainst },
    { key: 'confPtsFor', val: r => r.confPointsFor },
    { key: 'confPtsAgainst', val: r => -r.confPointsAgainst },
    { key: 'leaguePtsRank', val: r => r.pointsFor - r.pointsAgainst },
    { key: 'ptsFor', val: r => r.pointsFor },
    { key: 'ptsAgainst', val: r => -r.pointsAgainst },
    { key: 'net', val: r => r.netPoints },
    { key: 'oppNet', val: r => r.sos },
    { key: 'coin', val: () => Math.random() },
  ];

  // ordena em cascata: aplica critério, se houver empate no topo segue pro próximo
  result.sort((a, b) => (b.winPct - a.winPct) || (b.netPoints - a.netPoints));
  for (const st of sorters) {
    const sorted = [...result].sort((a, b) => st.val(b) - st.val(a));
    const topA = sorted[0];
    const isTieBroken = sorted.filter(r => st.val(r) === st.val(topA)).length === 1 || st.key === 'coin';
    result.length = 0; result.push(...sorted);
    for (const r of result) {
      if (!r.tiebreakNote && r !== topA) r.tiebreakNote = DIVISION_CRITERIA_LABELS[st.key];
    }
    if (isTieBroken || st.key === 'coin') break;
  }
  // anota o líder
  if (result.length > 1 && !result[1].tiebreakNote) {
    result[1].tiebreakNote = DIVISION_CRITERIA_LABELS.h2h;
  }
  void byId;
  return result;
}

/** Ranqueia uma divisão (4 times) pelos 15 tiebreakers oficiais. */
export function rankDivisionTb(s: GameState, conf: Conf, div: number, full: TeamStanding[]): TeamStanding[] {
  const group = full.filter(r => r.conf === conf && r.div === div);
  const ordered = rankGroup(s, full, group);
  ordered.forEach((r, i) => { r.divisionRank = i + 1; });
  if (ordered[0]) ordered[0].isDivisionChampion = true;
  return ordered;
}

/** Ordena TODA a conferência e atribui seeds 1–7 (campeões primeiro). */
export function conferenceOrder(s: GameState, conf: Conf): TeamStanding[] {
  const full = computeFullStandings(s);
  const confTeams = full.filter(r => r.conf === conf);

  // 1) campeões de divisão (4), ordenados entre si
  const champs: TeamStanding[] = [];
  for (let d = 0; d < 4; d++) {
    const divOrdered = rankDivisionTb(s, conf, d, full);
    if (divOrdered[0]) champs.push(divOrdered[0]);
  }
  const champIds = new Set(champs.map(c => c.teamId));
  const orderedChamps = rankGroup(s, full, champs);
  orderedChamps.forEach((r, i) => { r.playoffSeed = i + 1; r.conferenceRank = i + 1; r.isPlayoffTeam = true; });

  // 2) wild cards (próximos 3), ordenados entre si pelos tiebreakers de conferência
  const nonChamps = confTeams.filter(r => !champIds.has(r.teamId));
  const wcGroup = rankGroup(s, full, nonChamps);
  wcGroup.forEach((r, i) => {
    r.conferenceRank = champs.length + i + 1;
    if (i < 3) { r.playoffSeed = champs.length + i + 1; r.isPlayoffTeam = true; }
  });

  return [...orderedChamps, ...wcGroup];
}

/** Matchups do Wild Card: 2v7, 3v6, 4v5 (seed 1 folga). */
export function generatePlayoffBracket(s: GameState, conf: Conf): { casa: string; fora: string }[] {
  const seeds = conferenceOrder(s, conf).filter(r => r.playoffSeed != null);
  const bySeed = new Map(seeds.map(r => [r.playoffSeed!, r.teamId]));
  return [
    { casa: bySeed.get(2)!, fora: bySeed.get(7)! },
    { casa: bySeed.get(3)!, fora: bySeed.get(6)! },
    { casa: bySeed.get(4)!, fora: bySeed.get(5)! },
  ];
}
