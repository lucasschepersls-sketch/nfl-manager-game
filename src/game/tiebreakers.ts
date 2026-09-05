/* ============================================================
 * 🏆 Sistema oficial de classificação da NFL — DUAS CAMADAS.
 *
 * CAMADA 1 (SEMPRE): Win Percentage é o critério PRIMÁRIO.
 *   Times com campanhas diferentes NUNCA precisam de desempate.
 * CAMADA 2 (SÓ EM EMPATE): a cascata de critérios só é aplicada
 *   entre times com EXATAMENTE o mesmo Win Percentage.
 *
 *
 * Divisão: 15 critérios sequenciais · Conferência: 10 critérios.
 * Regra de ouro: campeões de divisão SEMPRE à frente de wild cards.
 *  - Strength of Victory / Strength of Schedule recalculados a cada leitura
 *    (tudo é derivado dos resultados — atualização automática após cada jogo)
 * ============================================================ */

import type { Conf, GameState } from './types';

/* ---------- modelo (espelha TeamStanding) ---------- */
export interface TeamStanding {
  teamId: string;
  wins: number; losses: number; ties: number; winPct: number;
  gamesBehind: number;      // jogos atrás do líder (passos de 0.5)
  divWins: number; divLosses: number; divTies: number; divPct: number;
  confWins: number; confLosses: number; confTies: number; confPct: number;
  sov: number;
  sos: number;
  pf: number; pa: number; net: number;
  confPf: number; confPa: number; confNet: number;
  oppNet: number;   // soma do saldo de todos os adversários
  divRank: number;
  confRank: number;
  playoffSeed: number | null;
  isDivisionChampion: boolean;
  isPlayoffTeam: boolean;
  tiebreakKey: string;      // chave curta do critério ('' = sem desempate)
  tiebreakNote: string | null;  // rótulo legível do critério
  tiedAbove: boolean;       // mesma campanha do time imediatamente acima
}

interface GameRow { casa: string; fora: string; pc: number; pf: number; }
interface OppRec { w: number; l: number; t: number; }

/** Códigos curtos para os chips da interface. */
export const CRITERIA_SHORT: Record<string, string> = {
  h2h: 'H2H', div: 'DIV', common: 'COM', conf: 'CONF', sov: 'SOV', sos: 'SOS',
  confPtsRank: 'PTS±C', confPtsFor: 'PTSC+', confPtsAgainst: 'PTSC−',
  leaguePtsRank: 'PTS±', ptsFor: 'PTS+', ptsAgainst: 'PTS−', net: 'NET',
  oppNet: 'NET·ADV', coin: 'SORTE',
};

const pctOf = (w: number, l: number, t: number) => {
  const g = w + l + t;
  return g === 0 ? 0 : (w + 0.5 * t) / g;
};
/** formato NFL: .750 */
export const fmtPct = (p: number) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));
/** Games behind no formato NFL: "—" para o líder, senão "2.0" / "0.5". */
export const fmtGB = (gb: number) => (gb <= 0 ? '—' : (Math.round(gb * 10) / 10).toFixed(1));
/** Win % no formato NFL: ".647" (sem o zero à esquerda). Alias p/ compat. */
export const fmtWinPct = fmtPct;

const hashIds = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

function regGames(s: GameState): GameRow[] {
  return s.matches
    .filter(m => m.fase === 'REG' && m.jogada && m.placarCasa != null && m.placarFora != null)
    .map(m => ({ casa: m.casa, fora: m.fora, pc: m.placarCasa!, pf: m.placarFora! }));
}

/* ---------- cálculo das métricas (update_standings + recalculate_strength) ---------- */
export function computeStandings(s: GameState): Map<string, TeamStanding> {
  const games = regGames(s);
  const confOf = new Map<string, Conf>();
  const divOf = new Map<string, number>();
  for (const t of s.teams) { confOf.set(t.id, t.conf); divOf.set(t.id, t.div); }

  const st = new Map<string, TeamStanding>();
  for (const t of s.teams) {
    st.set(t.id, {
      teamId: t.id, wins: 0, losses: 0, ties: 0, winPct: 0, gamesBehind: 0,
      divWins: 0, divLosses: 0, divTies: 0, divPct: 0,
      confWins: 0, confLosses: 0, confTies: 0, confPct: 0,
      sov: 0, sos: 0, pf: 0, pa: 0, net: 0, confPf: 0, confPa: 0, confNet: 0, oppNet: 0,
      divRank: 0, confRank: 0, playoffSeed: null,
      isDivisionChampion: false, isPlayoffTeam: false, tiebreakKey: '', tiebreakNote: null, tiedAbove: false,
    });
  }

  // recorde por adversário (para SoV / SoS / saldo dos adversários)
  const perOpp = new Map<string, Map<string, OppRec>>();
  const track = (team: string, opp: string, w: boolean, l: boolean, tie: boolean) => {
    let m = perOpp.get(team);
    if (!m) { m = new Map(); perOpp.set(team, m); }
    const r = m.get(opp) ?? { w: 0, l: 0, t: 0 };
    if (w) r.w++; else if (l) r.l++; else r.t++;
    m.set(opp, r);
  };

  for (const g of games) {
    const A = st.get(g.casa)!; const B = st.get(g.fora)!;
    const aWin = g.pc > g.pf; const bWin = g.pf > g.pc; const tie = !aWin && !bWin;
    if (aWin) { A.wins++; B.losses++; } else if (bWin) { B.wins++; A.losses++; } else { A.ties++; B.ties++; }
    A.pf += g.pc; A.pa += g.pf; B.pf += g.pf; B.pa += g.pc;
    const sameConf = confOf.get(g.casa) === confOf.get(g.fora);
    if (sameConf) {
      if (aWin) { A.confWins++; B.confLosses++; } else if (bWin) { B.confWins++; A.confLosses++; } else { A.confTies++; B.confTies++; }
      A.confPf += g.pc; A.confPa += g.pf; B.confPf += g.pf; B.confPa += g.pc;
    }
    if (sameConf && divOf.get(g.casa) === divOf.get(g.fora)) {
      if (aWin) { A.divWins++; B.divLosses++; } else if (bWin) { B.divWins++; A.divLosses++; } else { A.divTies++; B.divTies++; }
    }
    track(g.casa, g.fora, aWin, bWin, tie);
    track(g.fora, g.casa, bWin, aWin, tie);
  }

  for (const A of st.values()) {
    A.winPct = pctOf(A.wins, A.losses, A.ties);
    A.divPct = pctOf(A.divWins, A.divLosses, A.divTies);
    A.confPct = pctOf(A.confWins, A.confLosses, A.confTies);
    A.net = A.pf - A.pa;
    A.confNet = A.confPf - A.confPa;
  }

  // Strength of Victory / Schedule / saldo dos adversários
  for (const [id, A] of st) {
    const m = perOpp.get(id);
    if (!m) continue;
    let sosSum = 0, sosG = 0, sovSum = 0, sovW = 0, oppNetSum = 0;
    for (const [oid, r] of m) {
      const O = st.get(oid)!;
      const gms = r.w + r.l + r.t;
      sosSum += O.winPct * gms; sosG += gms;
      sovSum += O.winPct * r.w; sovW += r.w;
      oppNetSum += O.net;
    }
    A.sos = sosG ? sosSum / sosG : 0;
    A.sov = sovW ? sovSum / sovW : 0;
    A.oppNet = oppNetSum;
  }

  return st;
}

/* ---------- critérios ---------- */
type Crit =
  | { kind: 'h2h' }
  | { kind: 'common' }
  | { kind: 'coin' }
  | { kind: 'num'; key: string; label: string; get: (t: TeamStanding) => number; lower?: boolean };

/** 15 tiebreakers oficiais de DIVISÃO. */
export const DIVISION_CRITERIA: Crit[] = [
  { kind: 'h2h' },
  { kind: 'num', key: 'div', label: '% de vitórias na divisão', get: t => t.divPct },
  { kind: 'common' },
  { kind: 'num', key: 'conf', label: '% de vitórias na conferência', get: t => t.confPct },
  { kind: 'num', key: 'sov', label: 'Strength of Victory', get: t => t.sov },
  { kind: 'num', key: 'sos', label: 'Strength of Schedule', get: t => t.sos },
  { kind: 'num', key: 'confPtsRank', label: 'saldo de pontos na conferência', get: t => t.confNet },
  { kind: 'num', key: 'confPtsFor', label: 'pontos marcados na conferência', get: t => t.confPf },
  { kind: 'num', key: 'confPtsAgainst', label: 'pontos sofridos na conferência', get: t => t.confPa, lower: true },
  { kind: 'num', key: 'leaguePtsRank', label: 'saldo de pontos na liga', get: t => t.net },
  { kind: 'num', key: 'ptsFor', label: 'pontos marcados na liga', get: t => t.pf },
  { kind: 'num', key: 'ptsAgainst', label: 'pontos sofridos na liga', get: t => t.pa, lower: true },
  { kind: 'num', key: 'net', label: 'net points na liga', get: t => t.net },
  { kind: 'num', key: 'oppNet', label: 'saldo de todos os adversários', get: t => t.oppNet },
  { kind: 'coin' },
];

/** 10 tiebreakers oficiais de CONFERÊNCIA (wild cards). */
export const CONFERENCE_CRITERIA: Crit[] = [
  { kind: 'h2h' },
  { kind: 'num', key: 'conf', label: '% de vitórias na conferência', get: t => t.confPct },
  { kind: 'common' },
  { kind: 'num', key: 'sov', label: 'Strength of Victory', get: t => t.sov },
  { kind: 'num', key: 'sos', label: 'Strength of Schedule', get: t => t.sos },
  { kind: 'num', key: 'confPtsRank', label: 'saldo de pontos na conferência', get: t => t.confNet },
  { kind: 'num', key: 'confPtsFor', label: 'pontos marcados na conferência', get: t => t.confPf },
  { kind: 'num', key: 'confPtsAgainst', label: 'pontos sofridos na conferência', get: t => t.confPa, lower: true },
  { kind: 'num', key: 'net', label: 'net points na liga', get: t => t.net },
  { kind: 'coin' },
];

interface Ctx { games: GameRow[]; perOpp: (id: string) => Map<string, OppRec> | undefined; }

/** head-to-head do grupo: % de vitórias nos jogos ENTRE os empatados. */
function groupH2H(group: TeamStanding[], ctx: Ctx): Map<string, number> | null {
  const ids = new Set(group.map(t => t.teamId));
  const rec = new Map(group.map(t => [t.teamId, { w: 0, l: 0, t: 0, g: 0 }]));
  for (const g of ctx.games) {
    if (!ids.has(g.casa) || !ids.has(g.fora)) continue;
    const a = rec.get(g.casa)!; const b = rec.get(g.fora)!;
    a.g++; b.g++;
    if (g.pc > g.pf) { a.w++; b.l++; } else if (g.pf > g.pc) { b.w++; a.l++; } else { a.t++; b.t++; }
  }
  if (group.some(t => rec.get(t.teamId)!.g === 0)) return null; // nem todos se enfrentaram
  return new Map(group.map(t => {
    const r = rec.get(t.teamId)!;
    return [t.teamId, pctOf(r.w, r.l, r.t)] as const;
  }));
}

/** adversários comuns: oponentes enfrentados por TODOS os empatados (mín. 4 jogos). */
function groupCommon(group: TeamStanding[], ctx: Ctx): Map<string, number> | null {
  const ids = new Set(group.map(t => t.teamId));
  const faced = group.map(t => ctx.perOpp(t.teamId) ?? new Map<string, OppRec>());
  const common = [...faced[0].keys()].filter(oid => !ids.has(oid) && faced.every(f => f.has(oid)));
  if (common.length === 0) return null;
  const out = new Map<string, number>();
  let minGames = Infinity;
  for (let i = 0; i < group.length; i++) {
    let w = 0, l = 0, t = 0;
    for (const oid of common) {
      const r = faced[i].get(oid)!;
      w += r.w; l += r.l; t += r.t;
    }
    minGames = Math.min(minGames, w + l + t);
    out.set(group[i].teamId, pctOf(w, l, t));
  }
  return minGames >= 4 ? out : null;
}

const coinOrder = (group: TeamStanding[]) =>
  [...group].sort((a, b) => hashIds(a.teamId) - hashIds(b.teamId));

/** Resolve o critério p/ anotar no time (chave curta + nota legível). */
function critVals(c: Crit, remaining: TeamStanding[], ctx: Ctx): Map<string, number> | null {
  if (c.kind === 'h2h') return groupH2H(remaining, ctx);
  if (c.kind === 'common') return groupCommon(remaining, ctx);
  if (c.kind === 'coin') return null;
  return new Map(remaining.map(t => [t.teamId, c.get(t)]));
}
function critKey(c: Crit): string {
  if (c.kind === 'h2h') return 'h2h';
  if (c.kind === 'common') return 'common';
  if (c.kind === 'coin') return 'coin';
  return c.key;
}
function critLabel(c: Crit): string {
  if (c.kind === 'h2h') return 'confronto direto (head-to-head)';
  if (c.kind === 'common') return 'adversários comuns (mín. 4 jogos)';
  if (c.kind === 'coin') return 'sorteio (cara ou coroa)';
  return c.label;
}

/**
 * Cascata de tiebreakers (regra NFL p/ 2+ times EMPATADOS): a cada critério,
 * quem é o melhor isolado avança; quem é o pior isolado cai para o fim; e os
 * critérios RECOMEÇAM do 1º para o subgrupo restante.
 * ⚠️ Deve receber APENAS times com o MESMO winPct (agrupados pelo rankGroup).
 */
function cascadeTiebreaks(group: TeamStanding[], crits: Crit[], ctx: Ctx): TeamStanding[] {
  if (group.length <= 1) return [...group];
  const front: TeamStanding[] = [];
  const back: TeamStanding[] = [];
  let remaining = [...group];
  let lastSplitCrit: Crit | null = null;

  while (remaining.length > 1) {
    let split = false;
    for (const c of crits) {
      if (c.kind === 'coin') break;
      const vals = critVals(c, remaining, ctx);
      if (!vals) continue;
      let bestV = -Infinity, worstV = Infinity;
      for (const t of remaining) {
        const v = vals.get(t.teamId)!;
        bestV = Math.max(bestV, v); worstV = Math.min(worstV, v);
      }
      if (bestV === worstV) continue; // não separa
      const best = remaining.filter(t => vals.get(t.teamId) === bestV);
      const worst = remaining.filter(t => vals.get(t.teamId) === worstV);
      if (best.length === 1) {
        best[0].tiedAbove = remaining.length > 1;
        best[0].tiebreakKey = critKey(c); best[0].tiebreakNote = critLabel(c);
        front.push(best[0]); remaining = remaining.filter(t => t !== best[0]);
        lastSplitCrit = c; split = true; break;
      }
      if (worst.length === 1) {
        worst[0].tiedAbove = true;
        worst[0].tiebreakKey = critKey(c); worst[0].tiebreakNote = critLabel(c);
        back.unshift(worst[0]); remaining = remaining.filter(t => t !== worst[0]);
        lastSplitCrit = c; split = true; break;
      }
    }
    if (!split) {
      const order = coinOrder(remaining);
      order.forEach((t, i) => {
        if (i > 0) { t.tiedAbove = true; t.tiebreakKey = 'coin'; t.tiebreakNote = 'sorteio (cara ou coroa)'; }
      });
      return [...front, ...order, ...back];
    }
  }
  if (remaining.length === 1) {
    remaining[0].tiedAbove = front.length > 0 || back.length > 0 || lastSplitCrit != null;
    front.push(remaining[0]);
  }
  return [...front, ...back];
}

/**
 * CAMADA 1 (regra de ouro da NFL): a campanha (winPct) é SEMPRE o critério
 * primário. Times com campanhas diferentes NUNCA são comparados por tiebreaker.
 *
 * Agrupa os times por winPct idêntico, ordena os blocos de forma descendente e,
 * somente DENTRO de cada bloco com 2+ times empatados, aplica a cascata de
 * tiebreakers (CAMADA 2). Isso garante que um time 1-0 (1.000) jamais fique
 * atrás de um time 0-10-1 (.000), não importando H2H ou qualquer outro critério.
 */
function rankGroup(group: TeamStanding[], crits: Crit[], ctx: Ctx): TeamStanding[] {
  if (group.length <= 1) {
    if (group.length === 1) group[0].tiedAbove = false;
    return [...group];
  }

  // zera as anotações de desempate antes de recalcular
  for (const t of group) { t.tiedAbove = false; t.tiebreakKey = ''; t.tiebreakNote = ''; }

  // CAMADA 1 — agrupa por winPct idêntico (tolerância de ponto flutuante)
  const EPS = 1e-9;
  const sorted = [...group].sort((a, b) => b.winPct - a.winPct);
  const blocks: TeamStanding[][] = [];
  for (const t of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && Math.abs(last[0].winPct - t.winPct) <= EPS) last.push(t);
    else blocks.push([t]);
  }

  // CAMADA 2 — cascata de tiebreakers apenas dentro de cada bloco de empatados
  const result: TeamStanding[] = [];
  for (const block of blocks) {
    result.push(...cascadeTiebreaks(block, crits, ctx));
  }

  // passada final: tiedAbove = mesma campanha do time imediatamente acima;
  // limpa o chip de desempate de quem não está empatado com o de cima
  result[0].tiedAbove = false;
  for (let i = 1; i < result.length; i++) {
    result[i].tiedAbove = Math.abs(result[i].winPct - result[i - 1].winPct) <= EPS;
    if (!result[i].tiedAbove) { result[i].tiebreakKey = ''; result[i].tiebreakNote = ''; }
  }

  return result;
}

/* ---------- Games Behind em relação ao líder do grupo ---------- */
function applyGamesBehind(ordered: TeamStanding[]): void {
  const leader = ordered[0];
  if (!leader) return;
  for (const r of ordered) {
    r.gamesBehind = Math.max(0, ((leader.wins - r.wins) + (r.losses - leader.losses)) / 2);
  }
}

/* ---------- ranking de DIVISÃO (1º ao 4º) ---------- */
export function rankDivision(s: GameState, conf: Conf, div: number, stMap?: Map<string, TeamStanding>): TeamStanding[] {
  const st = stMap ?? computeStandings(s);
  const ctx: Ctx = { games: regGames(s), perOpp: id => perOppOf(s, id) };
  const group = s.teams.filter(t => t.conf === conf && t.div === div).map(t => st.get(t.id)!);
  const ordered = rankGroup(group, DIVISION_CRITERIA, ctx);
  ordered.forEach((t, i) => {
    t.divRank = i + 1;
    t.isDivisionChampion = i === 0;
  });
  applyGamesBehind(ordered);
  return ordered;
}

/* ---------- ranking de CONFERÊNCIA (seeds + wild cards) ---------- */
export function conferenceOrder(s: GameState, conf: Conf, stMap?: Map<string, TeamStanding>): TeamStanding[] {
  const st = stMap ?? computeStandings(s);
  const ctx: Ctx = { games: regGames(s), perOpp: id => perOppOf(s, id) };

  // 1) campeões de divisão decididos pelos tiebreakers de DIVISÃO
  const champs: TeamStanding[] = [];
  for (let d = 0; d < 4; d++) {
    const ordered = rankDivision(s, conf, d, st);
    champs.push(ordered[0]);
  }
  // 2) seeds 1–4 entre os campeões (critérios de conferência)
  const champsRanked = rankGroup(champs, CONFERENCE_CRITERIA, ctx);
  champsRanked.forEach((t, i) => {
    t.playoffSeed = i + 1;
    t.confRank = i + 1;
    t.isPlayoffTeam = true;
  });

  // 3) os 12 restantes → wild cards 5–7 (critérios de conferência)
  const champIds = new Set(champs.map(c => c.teamId));
  const rest = s.teams.filter(t => t.conf === conf && !champIds.has(t.id)).map(t => st.get(t.id)!);
  const restRanked = rankGroup(rest, CONFERENCE_CRITERIA, ctx);
  restRanked.forEach((t, i) => {
    t.confRank = 5 + i;
    if (i < 3) { t.playoffSeed = 5 + i; t.isPlayoffTeam = true; }
  });

  const all = [...champsRanked, ...restRanked];
  applyGamesBehind(all); // GB em relação ao seed #1
  return all;
}

/* ---------- chave dos playoffs (matchups do Wild Card) ---------- */
export interface PlayoffMatchup { seedCasa: number; seedFora: number; casaId: string; foraId: string; }
export function generatePlayoffBracket(s: GameState, conf: Conf): { bye: TeamStanding | null; matchups: PlayoffMatchup[] } {
  const order = conferenceOrder(s, conf).filter(t => t.playoffSeed != null);
  const bySeed = new Map(order.map(t => [t.playoffSeed!, t]));
  const bye = bySeed.get(1) ?? null;
  const pair = (a: number, b: number): PlayoffMatchup | null => {
    const ta = bySeed.get(a); const tb = bySeed.get(b);
    if (!ta || !tb) return null;
    return { seedCasa: a, seedFora: b, casaId: ta.teamId, foraId: tb.teamId };
  };
  const matchups: PlayoffMatchup[] = [];
  for (const m of [pair(2, 7), pair(3, 6), pair(4, 5)]) if (m) matchups.push(m);
  return { bye, matchups };
}

/* ---------- descritivos para a UI ---------- */
export const DIVISION_CRITERIA_LABELS = [
  'Confronto direto (head-to-head)',
  '% de vitórias na divisão',
  'Adversários comuns (mín. 4 jogos)',
  '% de vitórias na conferência',
  'Strength of Victory (% de vitórias dos vencidos)',
  'Strength of Schedule (% de vitórias dos enfrentados)',
  'Saldo de pontos na conferência',
  'Pontos marcados na conferência',
  'Pontos sofridos na conferência',
  'Saldo de pontos na liga',
  'Pontos marcados na liga',
  'Pontos sofridos na liga',
  'Net points na liga',
  'Saldo de todos os adversários',
  'Sorteio (cara ou coroa)',
];
export const CONFERENCE_CRITERIA_LABELS = [
  'Confronto direto (se aplicável)',
  '% de vitórias na conferência',
  'Adversários comuns (mín. 4 jogos)',
  'Strength of Victory',
  'Strength of Schedule',
  'Saldo de pontos na conferência',
  'Pontos marcados na conferência',
  'Pontos sofridos na conferência',
  'Net points na liga',
  'Sorteio (cara ou coroa)',
];

/* ---------- cache simples do recorde por adversário ---------- */
const perOppCache = new WeakMap<GameState, Map<string, Map<string, OppRec>>>();
function perOppOf(s: GameState, id: string): Map<string, OppRec> | undefined {
  let cache = perOppCache.get(s);
  if (!cache) {
    cache = new Map();
    for (const g of regGames(s)) {
      const put = (team: string, opp: string, w: boolean, l: boolean, tie: boolean) => {
        let m = cache!.get(team);
        if (!m) { m = new Map(); cache!.set(team, m); }
        const r = m.get(opp) ?? { w: 0, l: 0, t: 0 };
        if (w) r.w++; else if (l) r.l++; else r.t++;
        m.set(opp, r);
      };
      const aWin = g.pc > g.pf; const bWin = g.pf > g.pc; const tie = !aWin && !bWin;
      put(g.casa, g.fora, aWin, bWin, tie);
      put(g.fora, g.casa, bWin, aWin, tie);
    }
    perOppCache.set(s, cache);
  }
  return cache.get(id);
}
