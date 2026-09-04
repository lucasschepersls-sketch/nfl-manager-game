/* ============================================================
 * ⚖️ SISTEMA OFICIAL DE TIEBREAKERS DA NFL
 *  - Divisão: 15 critérios sequenciais (head-to-head → sorteio)
 *  - Conferência (wild cards): 10 critérios
 *  - Regra de ouro: campeões de divisão SEMPRE à frente de wild cards
 *  - Strength of Victory / Strength of Schedule recalculados a cada leitura
 *    (tudo é derivado dos resultados — atualização automática após cada jogo)
 * ============================================================ */

import type { Conf, GameState } from './types';

/* ---------- modelo (espelha TeamStanding) ---------- */
export interface TeamStanding {
  teamId: string;
  wins: number; losses: number; ties: number; winPct: number;
  divWins: number; divLosses: number; divTies: number; divPct: number;
  confWins: number; confLosses: number; confTies: number; confPct: number;
  sov: number;      // % de vitórias dos times vencidos
  sos: number;      // % de vitórias dos times enfrentados
  pf: number; pa: number; net: number;
  confPf: number; confPa: number; confNet: number;
  oppNet: number;   // soma do saldo de todos os adversários
  divRank: number;
  confRank: number;
  playoffSeed: number | null;
  isDivisionChampion: boolean;
  isPlayoffTeam: boolean;
  tiebreakNote: string | null;
}

interface GameRow { casa: string; fora: string; pc: number; pf: number; }
interface OppRec { w: number; l: number; t: number; }

const pctOf = (w: number, l: number, t: number) => {
  const g = w + l + t;
  return g === 0 ? 0 : (w + 0.5 * t) / g;
};
/** formato NFL: .750 */
export const fmtPct = (p: number) => p.toFixed(3).replace(/^0+/, '');
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
      teamId: t.id, wins: 0, losses: 0, ties: 0, winPct: 0,
      divWins: 0, divLosses: 0, divTies: 0, divPct: 0,
      confWins: 0, confLosses: 0, confTies: 0, confPct: 0,
      sov: 0, sos: 0, pf: 0, pa: 0, net: 0, confPf: 0, confPa: 0, confNet: 0, oppNet: 0,
      divRank: 0, confRank: 0, playoffSeed: null,
      isDivisionChampion: false, isPlayoffTeam: false, tiebreakNote: null,
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
  | { kind: 'num'; label: string; get: (t: TeamStanding) => number; lower?: boolean };

/** 15 tiebreakers oficiais de DIVISÃO. */
export const DIVISION_CRITERIA: Crit[] = [
  { kind: 'h2h' },
  { kind: 'num', label: '% de vitórias na divisão', get: t => t.divPct },
  { kind: 'common' },
  { kind: 'num', label: '% de vitórias na conferência', get: t => t.confPct },
  { kind: 'num', label: 'Strength of Victory', get: t => t.sov },
  { kind: 'num', label: 'Strength of Schedule', get: t => t.sos },
  { kind: 'num', label: 'saldo de pontos na conferência', get: t => t.confNet },
  { kind: 'num', label: 'pontos marcados na conferência', get: t => t.confPf },
  { kind: 'num', label: 'pontos sofridos na conferência', get: t => t.confPa, lower: true },
  { kind: 'num', label: 'saldo de pontos na liga', get: t => t.net },
  { kind: 'num', label: 'pontos marcados na liga', get: t => t.pf },
  { kind: 'num', label: 'pontos sofridos na liga', get: t => t.pa, lower: true },
  { kind: 'num', label: 'saldo de pontos (net)', get: t => t.net },
  { kind: 'num', label: 'saldo de todos os adversários', get: t => t.oppNet },
  { kind: 'coin' },
];

/** 10 tiebreakers oficiais de CONFERÊNCIA (wild cards). */
export const CONFERENCE_CRITERIA: Crit[] = [
  { kind: 'h2h' },
  { kind: 'num', label: '% de vitórias na conferência', get: t => t.confPct },
  { kind: 'common' },
  { kind: 'num', label: 'Strength of Victory', get: t => t.sov },
  { kind: 'num', label: 'Strength of Schedule', get: t => t.sos },
  { kind: 'num', label: 'saldo de pontos na conferência', get: t => t.confNet },
  { kind: 'num', label: 'pontos marcados na conferência', get: t => t.confPf },
  { kind: 'num', label: 'pontos sofridos na conferência', get: t => t.confPa, lower: true },
  { kind: 'num', label: 'saldo de pontos na liga', get: t => t.net },
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

/**
 * Ordena um grupo aplicando os critérios EM CASCATA (regra NFL): a cada
 * critério, quem é o melhor isolado avança; quem é o pior isolado cai para o
 * fim; e os critérios RECOMEÇAM do 1º para o subgrupo restante.
 */
function rankGroup(group: TeamStanding[], crits: Crit[], ctx: Ctx): TeamStanding[] {
  if (group.length <= 1) return [...group];
  const front: TeamStanding[] = [];
  const back: TeamStanding[] = [];
  let remaining = [...group];

  while (remaining.length > 1) {
    let split = false;
    for (const c of crits) {
      if (c.kind === 'coin') break;
      const vals = c.kind === 'h2h' ? groupH2H(remaining, ctx)
        : c.kind === 'common' ? groupCommon(remaining, ctx)
          : new Map(remaining.map(t => [t.teamId, c.get(t)]));
      if (!vals) continue;
      const lower = c.kind === 'num' && c.lower;
      let bestV = -Infinity, worstV = Infinity;
      for (const t of remaining) {
        const v = vals.get(t.teamId)!;
        bestV = Math.max(bestV, v); worstV = Math.min(worstV, v);
      }
      if (bestV === worstV) continue; // não separa
      const best = remaining.filter(t => vals.get(t.teamId) === bestV);
      const worst = remaining.filter(t => vals.get(t.teamId) === worstV);
      if (best.length === 1) { front.push(best[0]); remaining = remaining.filter(t => t !== best[0]); split = true; break; }
      if (worst.length === 1) { back.unshift(worst[0]); remaining = remaining.filter(t => t !== worst[0]); split = true; break; }
      void lower;
    }
    if (!split) {
      const order = coinOrder(remaining);
      order.forEach((t, i) => { if (i > 0) t.tiebreakNote = 'Desempate por sorteio (cara ou coroa)'; });
      return [...front, ...order, ...back];
    }
  }
  if (remaining.length === 1) front.push(remaining[0]);
  return [...front, ...back];
}

/* ---------- decisivo entre dois times (para o tooltip) ---------- */
export function decisiveBetween(a: TeamStanding, b: TeamStanding, ctx: Ctx, crits: Crit[]): string {
  for (const c of crits) {
    if (c.kind === 'coin') return 'sorteio (cara ou coroa)';
    if (c.kind === 'h2h') {
      const direct = ctx.games.filter(g =>
        (g.casa === a.teamId && g.fora === b.teamId) || (g.casa === b.teamId && g.fora === a.teamId));
      if (!direct.length) continue;
      const rec = (id: string) => {
        let w = 0, l = 0, t = 0;
        for (const g of direct) {
          if (g.casa === id) { if (g.pc > g.pf) w++; else if (g.pc < g.pf) l++; else t++; }
          else { if (g.pf > g.pc) w++; else if (g.pf < g.pc) l++; else t++; }
        }
        return pctOf(w, l, t);
      };
      const va = rec(a.teamId); const vb = rec(b.teamId);
      if (va !== vb) return `confronto direto (${fmtPct(va)} × ${fmtPct(vb)})`;
      continue;
    }
    if (c.kind === 'common') {
      const vals = groupCommon([a, b], ctx);
      if (!vals) continue;
      const va = vals.get(a.teamId)!; const vb = vals.get(b.teamId)!;
      if (va !== vb) return `adversários comuns (${fmtPct(va)} × ${fmtPct(vb)})`;
      continue;
    }
    const va = c.get(a); const vb = c.get(b);
    if (va !== vb) {
      const fmt = (v: number) => (c.label.startsWith('%') || c.label === 'Strength of Victory' || c.label === 'Strength of Schedule')
        ? fmtPct(v) : String(v);
      return `${c.label} (${fmt(va)} × ${fmt(vb)})`;
    }
  }
  return 'sorteio (cara ou coroa)';
}

/* ---------- ranking de DIVISÃO (1º ao 4º) ---------- */
export function rankDivision(s: GameState, conf: Conf, div: number, stMap?: Map<string, TeamStanding>): TeamStanding[] {
  const st = stMap ?? computeStandings(s);
  const ctx: Ctx = { games: regGames(s), perOpp: id => perOppOf(s, id) };
  const group = s.teams.filter(t => t.conf === conf && t.div === div).map(t => st.get(t.id)!);
  const ordered = rankGroup(group, DIVISION_CRITERIA, ctx);
  // notas de desempate entre vizinhos
  for (let i = 1; i < ordered.length; i++) {
    const above = ordered[i - 1]; const below = ordered[i];
    const sigAbove = s.teams.find(t => t.id === above.teamId)!.sigla;
    below.tiebreakNote = below.tiebreakNote
      ?? `Atrás de ${sigAbove}: ${decisiveBetween(above, below, ctx, DIVISION_CRITERIA)}`;
  }
  ordered.forEach((t, i) => {
    t.divRank = i + 1;
    t.isDivisionChampion = i === 0;
  });
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
  for (let i = 1; i < champsRanked.length; i++) {
    const above = champsRanked[i - 1]; const below = champsRanked[i];
    const sigAbove = s.teams.find(t => t.id === above.teamId)!.sigla;
    below.tiebreakNote = below.tiebreakNote
      ?? `Seed atrás de ${sigAbove}: ${decisiveBetween(above, below, ctx, CONFERENCE_CRITERIA)}`;
  }

  // 3) os 12 restantes → wild cards 5–7 (critérios de conferência)
  const champIds = new Set(champs.map(c => c.teamId));
  const rest = s.teams.filter(t => t.conf === conf && !champIds.has(t.id)).map(t => st.get(t.id)!);
  const restRanked = rankGroup(rest, CONFERENCE_CRITERIA, ctx);
  restRanked.forEach((t, i) => {
    t.confRank = 5 + i;
    if (i < 3) { t.playoffSeed = 5 + i; t.isPlayoffTeam = true; }
  });
  for (let i = 1; i < restRanked.length; i++) {
    const above = restRanked[i - 1]; const below = restRanked[i];
    const sigAbove = s.teams.find(t => t.id === above.teamId)!.sigla;
    if (i < 3) {
      below.tiebreakNote = below.tiebreakNote
        ?? `Wild card atrás de ${sigAbove}: ${decisiveBetween(above, below, ctx, CONFERENCE_CRITERIA)}`;
    } else if (i === 3) {
      const sigLast = s.teams.find(t => t.id === restRanked[2].teamId)!.sigla;
      below.tiebreakNote = below.tiebreakNote
        ?? `Fora do G7 — perde para ${sigLast}: ${decisiveBetween(restRanked[2], below, ctx, CONFERENCE_CRITERIA)}`;
    }
  }

  return [...champsRanked, ...restRanked];
}

/* ---------- chave dos playoffs (matchups do Wild Card) ---------- */
export interface PlayoffMatchup { seedCasa: number; seedFora: number; casaId: string; foraId: string; }
export function generatePlayoffBracket(s: GameState, conf: Conf): { bye: TeamStanding; matchups: PlayoffMatchup[] } {
  const order = conferenceOrder(s, conf).filter(t => t.playoffSeed != null);
  const bySeed = new Map(order.map(t => [t.playoffSeed!, t]));
  const bye = bySeed.get(1)!;
  const matchups: PlayoffMatchup[] = [
    { seedCasa: 2, seedFora: 7, casaId: bySeed.get(2)!.teamId, foraId: bySeed.get(7)!.teamId },
    { seedCasa: 3, seedFora: 6, casaId: bySeed.get(3)!.teamId, foraId: bySeed.get(6)!.teamId },
    { seedCasa: 4, seedFora: 5, casaId: bySeed.get(4)!.teamId, foraId: bySeed.get(5)!.teamId },
  ];
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
  'Saldo de pontos (net)',
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
  'Saldo de pontos na liga',
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
