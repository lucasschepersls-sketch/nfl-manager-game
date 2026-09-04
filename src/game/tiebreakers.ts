/* ============================================================
 * 🏆 Sistema oficial de classificação da NFL — DUAS CAMADAS.
 *
 * CAMADA 1 (SEMPRE): Win Percentage é o critério PRIMÁRIO.
 *   Times com campanhas diferentes NUNCA precisam de desempate.
 * CAMADA 2 (SÓ EM EMPATE): a cascata de critérios só é aplicada
 *   entre times com EXATAMENTE o mesmo Win Percentage.
 *
 * Divisão: 15 critérios sequenciais · Conferência: 10 critérios.
 * Regra de ouro: campeões de divisão SEMPRE à frente de wild cards.
 * ============================================================ */

import type { Conf, GameState, Match } from './types';

export interface TeamStanding {
  teamId: string;
  conf: Conf; div: number;
  wins: number; losses: number; ties: number;
  winPct: number;
  gamesBehind: number;      // jogos atrás do líder (passos de 0.5)
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
  tiebreakKey: string;      // chave do critério que quebrou o empate ('' = sem empate)
  tiebreakNote: string;     // rótulo legível do critério
  tiedAbove: boolean;       // mesma campanha do time imediatamente acima
}

export const DIVISION_CRITERIA_LABELS: Record<string, string> = {
  h2h: 'Head-to-head (confronto direto)',
  div: 'Recorde dentro da divisão',
  common: 'Recorde contra adversários comuns',
  conf: 'Recorde dentro da conferência',
  sov: 'Strength of Victory (campanha dos times que venceu)',
  sos: 'Strength of Schedule (campanha dos times que enfrentou)',
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

/** Códigos curtos para os chips da interface. */
export const CRITERIA_SHORT: Record<string, string> = {
  h2h: 'H2H', div: 'DIV', common: 'COM', conf: 'CONF', sov: 'SOV', sos: 'SOS',
  confPtsRank: 'PTS±C', confPtsFor: 'PTSC+', confPtsAgainst: 'PTSC−',
  leaguePtsRank: 'PTS±', ptsFor: 'PTS+', ptsAgainst: 'PTS−', net: 'NET',
  oppNet: 'NET·ADV', coin: 'SORTE',
};

const pct = (w: number, l: number, t: number) => {
  const g = w + l + t;
  return g === 0 ? 0 : (w + t * 0.5) / g;
};

/** Win % no formato NFL: ".647" (sem o zero à esquerda). */
export const fmtWinPct = (p: number) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));

/** Games behind no formato NFL: "—" para o líder, senão "2.0" / "0.5". */
export const fmtGB = (gb: number) => (gb <= 0 ? '—' : (Math.round(gb * 10) / 10).toFixed(1));

/** Formata uma fração (0..1) como porcentagem com 1 casa decimal. */
export const fmtPct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`;

const hashStr = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
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
    wins: 0, losses: 0, ties: 0, winPct: 0, gamesBehind: 0,
    divWins: 0, divLosses: 0, divTies: 0, divPct: 0,
    confWins: 0, confLosses: 0, confTies: 0, confPct: 0,
    sov: 0, sos: 0,
    pointsFor: 0, pointsAgainst: 0, netPoints: 0,
    confPointsFor: 0, confPointsAgainst: 0,
    divisionRank: 0, conferenceRank: 0, playoffSeed: null,
    isDivisionChampion: false, isPlayoffTeam: false,
    tiebreakKey: '', tiebreakNote: '', tiedAbove: false,
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

  // SoV e SoS (média do winPct dos oponentes)
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

/** Head-to-head: % de vitórias em jogos diretos contra os times do grupo. */
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
  if (valid.size < 4) return -1; // mínimo de 4 não atingido — critério ignorado
  let w = 0; let l = 0; let t = 0;
  for (const g of gamesOf(s, teamId)) {
    if (!valid.has(g.opp)) continue;
    if (g.win) w++; else if (g.loss) l++; else t++;
  }
  return pct(w, l, t);
}

/**
 * Ordena um grupo pelas regras oficiais — COMPARAÇÃO LEXICOGRÁFICA.
 * winPct é SEMPRE a chave primária; a cascata só distingue times com
 * campanha idêntica. (Correção do bug antigo, que re-ordenava o grupo
 * inteiro a cada critério e podia inverter a ordem da campanha.)
 */
function rankGroup(s: GameState, group: TeamStanding[], labels: Record<string, string>): TeamStanding[] {
  if (!group.length) return [];
  const groupIds = new Set(group.map(g => g.teamId));
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
  ];

  // matriz pré-computada (evita recálculo e mantém o "sorteio" determinístico)
  const vals = new Map<string, number[]>();
  for (const r of group) vals.set(r.teamId, sorters.map(st => st.val(r)));
  const coin = new Map<string, number>();
  for (const r of group) coin.set(r.teamId, (hashStr(r.teamId) % 1000) / 1000);

  const ordered = [...group].sort((a, b) => {
    // CAMADA 1 — campanha é sempre o critério primário
    const dw = b.winPct - a.winPct;
    if (Math.abs(dw) > 1e-9) return dw;
    // CAMADA 2 — cascata somente entre campanhas iguais
    const va = vals.get(a.teamId)!; const vb = vals.get(b.teamId)!;
    for (let i = 0; i < sorters.length; i++) {
      const d = vb[i] - va[i];
      if (Math.abs(d) > 1e-9) return d;
    }
    return coin.get(a.teamId)! - coin.get(b.teamId)!; // sorteio determinístico
  });

  // anota, para cada time empatado, o critério que o separou do time de cima
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i];
    r.tiebreakKey = ''; r.tiebreakNote = ''; r.tiedAbove = false;
    if (i === 0) continue;
    const above = ordered[i - 1];
    if (Math.abs(r.winPct - above.winPct) <= 1e-9) {
      r.tiedAbove = true;
      const va = vals.get(above.teamId)!; const vr = vals.get(r.teamId)!;
      let found = 'coin';
      for (let k = 0; k < sorters.length; k++) {
        if (Math.abs(va[k] - vr[k]) > 1e-9) { found = sorters[k].key; break; }
      }
      r.tiebreakKey = found;
      r.tiebreakNote = labels[found] ?? found;
    }
  }
  return ordered;
}

/** Games behind em relação ao líder do grupo ordenado. */
function applyGamesBehind(ordered: TeamStanding[]): void {
  const leader = ordered[0];
  if (!leader) return;
  for (const r of ordered) {
    r.gamesBehind = Math.max(0, ((leader.wins - r.wins) + (r.losses - leader.losses)) / 2);
  }
}

/** Ranqueia uma divisão (4 times) — 15 tiebreakers oficiais. */
export function rankDivisionTb(s: GameState, conf: Conf, div: number, full: TeamStanding[]): TeamStanding[] {
  const group = full.filter(r => r.conf === conf && r.div === div);
  const ordered = rankGroup(s, group, DIVISION_CRITERIA_LABELS);
  ordered.forEach((r, i) => { r.divisionRank = i + 1; });
  if (ordered[0]) ordered[0].isDivisionChampion = true;
  applyGamesBehind(ordered);
  return ordered;
}

/** Ordena TODA a conferência e atribui seeds 1–7 (campeões sempre à frente). */
export function conferenceOrder(s: GameState, conf: Conf): TeamStanding[] {
  const full = computeFullStandings(s);

  // 1) campeões de divisão (4), ordenados entre si pelos critérios de conferência
  const champs: TeamStanding[] = [];
  for (let d = 0; d < 4; d++) {
    const divOrdered = rankDivisionTb(s, conf, d, full);
    if (divOrdered[0]) champs.push(divOrdered[0]);
  }
  const champIds = new Set(champs.map(c => c.teamId));
  const orderedChamps = rankGroup(s, champs, CONFERENCE_CRITERIA_LABELS);
  orderedChamps.forEach((r, i) => { r.playoffSeed = i + 1; r.conferenceRank = i + 1; r.isPlayoffTeam = true; });

  // 2) wild cards (próximos 3) — regra de ouro: jamais passam um campeão
  const nonChamps = full.filter(r => r.conf === conf && !champIds.has(r.teamId));
  const wcGroup = rankGroup(s, nonChamps, CONFERENCE_CRITERIA_LABELS);
  wcGroup.forEach((r, i) => {
    r.conferenceRank = champs.length + i + 1;
    if (i < 3) { r.playoffSeed = champs.length + i + 1; r.isPlayoffTeam = true; }
  });

  const all = [...orderedChamps, ...wcGroup];
  applyGamesBehind(all); // GB em relação ao seed #1
  return all;
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
