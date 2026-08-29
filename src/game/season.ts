/* ============================================================
 * Orquestração da temporada: calendário oficial NFL, tabela,
 * avanço de semanas, playoffs, offseason guiada, cap compliance.
 * ============================================================ */

import type {
  Conf, ContractOffer, Focus, GameResult, GameState, Match, Player, Screen, Staff, Team,
} from './types';
import { zeroStats } from './types';
import { Rng, clamp, newSeed } from './rng';
import { computeOvr, genName, POS_ORDER, rookieSalary, salaryFor } from './data';
import type { Side } from './engine';
import { NFLMatchEngine } from './engine';

/* ================= helpers ================= */
export const teamById = (s: GameState, id: string): Team => s.teams.find(t => t.id === id)!;
export const playersOf = (s: GameState, teamId: string): Player[] => s.players.filter(p => p.teamId === teamId);
export const staffOf = (s: GameState, teamId: string): Staff[] => s.staff.filter(st => st.teamId === teamId);
export const fmtM = (v: number) => `$${v.toFixed(1).replace('.', ',')}M`;

export const capHitOf = (p: Player) =>
  p.salario + (p.bonus > 0 && p.contrato > 0 ? p.bonus / p.contrato : 0);
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
 * CALENDÁRIO OFICIAL DA NFL — 17 jogos (18 semanas, 1 bye)
 *   6 divisão · 4 intraconferência (3a) · 4 interconferência (4a)
 *   2 mesma conferência p/ colocação · 1 extra p/ colocação
 * ============================================================ */
export interface SchedTeam { id: string; conf: Conf; div: number; }
interface Game { casa: string; fora: string; isDiv: boolean; }
export type RankMap = Map<string, number>;

const ROT3: [number, number][][] = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
const pairs3 = (step: number) => ROT3[((step % 3) + 3) % 3];

/**
 * Gera os confrontos da temporada regular seguindo a fórmula oficial da NFL.
 * Cada franquia joga 17 partidas:
 *   6 vs. a própria divisão (ida e volta)
 *   4 vs. UMA divisão da mesma conferência (confronto completo, ciclo de 3 anos)
 *   4 vs. UMA divisão da outra conferência (confronto completo, ciclo de 4 anos)
 *   2 vs. times da mesma conferência que ficaram na mesma colocação (1 de cada
 *       uma das 2 divisões que NÃO são o par da rotação)
 *   1 "17º jogo" vs. a outra conferência, pela mesma colocação
 * O mando dos confrontos completos alterna por (linha+coluna+ano), o que dá a
 * cada time exatamente 2 mandos em cada bloco 4×4 → 8-9 jogos em casa no total.
 */
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

  const intra = pairs3(year);               // 2 pares de divisões da mesma conferência
  const parity = year % 2;                  // alterna o mando a cada ano

  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    // 6 jogos de divisão (ida e volta)
    for (let d = 0; d < 4; d++) {
      const div = divOf(conf, d);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        games.push({ casa: div[i].id, fora: div[j].id, isDiv: true });
        games.push({ casa: div[j].id, fora: div[i].id, isDiv: true });
      }
    }
    // 4 jogos de rotação intraconferência: confronto COMPLETO divisão × divisão
    for (const [da, db] of intra) {
      const A = divByRank(conf, da); const B = divByRank(conf, db);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const aHosts = (i + j + parity) % 2 === 0;
        games.push(aHosts ? { casa: A[i].id, fora: B[j].id, isDiv: false } : { casa: B[j].id, fora: A[i].id, isDiv: false });
      }
    }
    // 2 jogos pela mesma colocação: 1 vs. cada divisão que NÃO é o par da rotação.
    // Os 4 pares "não-parceiros" formam um 4-ciclo; orientamos cada um uma vez,
    // de modo que cada divisão mande 1 e visite 1.
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

  // 4 jogos interconferência: confronto COMPLETO divisão × divisão (ciclo de 4 anos)
  for (let d = 0; d < 4; d++) {
    const oppDiv = (d + year) % 4;
    const A = divByRank('AFC', d); const B = divByRank('NFC', oppDiv);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const aHosts = (i + j + parity) % 2 === 0;
      games.push(aHosts ? { casa: A[i].id, fora: B[j].id, isDiv: false } : { casa: B[j].id, fora: A[i].id, isDiv: false });
    }
  }

  // 17º jogo: outra conferência, mesma colocação (mando alterna por conferência)
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

/** Validação rigorosa: 17 jogos, 8-9 em casa, 6 de divisão (2× vs cada rival)
 *  e nenhum par de times se enfrentando mais de 2 vezes (3× é impossível). */
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
  // nenhum confronto pode se repetir mais de 2 vezes (ida e volta de divisão)
  for (const [pk, n] of pairCount) {
    if (n > 2) return `confronto ${pk.replace('|', ' × ')} acontece ${n}x (máx. 2)`;
    const [a, b] = pk.split('|');
    const ta = teams.find(t => t.id === a)!; const tb = teams.find(t => t.id === b)!;
    const sameDiv = ta.conf === tb.conf && ta.div === tb.div;
    if (n === 2 && !sameDiv) return `confronto não-divisão ${pk.replace('|', ' × ')} acontece 2x`;
  }
  // jogos interconferência por time (fórmula NFL: 4 de rotação + 1 extra = 5)
  const interconf = new Map<string, number>();
  const teamById_ = new Map(teams.map(t => [t.id, t]));
  for (const g of games) {
    const a = teamById_.get(g.casa)!; const b = teamById_.get(g.fora)!;
    if (a.conf !== b.conf) {
      interconf.set(g.casa, (interconf.get(g.casa) ?? 0) + 1);
      interconf.set(g.fora, (interconf.get(g.fora) ?? 0) + 1);
    }
  }
  for (const t of teams) {
    const n = count.get(t.id) ?? 0;
    if (n !== 17) return `${t.id} tem ${n} jogos (esperado 17)`;
    const h = home.get(t.id) ?? 0;
    if (h < 8 || h > 9) return `${t.id} tem ${h} jogos em casa (esperado 8-9)`;
    const ic = interconf.get(t.id) ?? 0;
    if (ic !== 5) return `${t.id} tem ${ic} jogos interconferência (esperado 5)`;
    const mo = divVs.get(t.id) ?? new Map();
    if ([...mo.values()].reduce((a, b) => a + b, 0) !== 6) return `${t.id} sem 6 jogos de divisão`;
    for (const r of teams) {
      if (r.id === t.id || r.conf !== t.conf || r.div !== t.div) continue;
      if ((mo.get(r.id) ?? 0) !== 2) return `${t.id} joga ${mo.get(r.id) ?? 0}x vs ${r.id}`;
    }
  }
  return null;
}

/** Repara mandos para 8-9 em casa invertendo jogos não-divisão. Nunca lança. */
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
      if (low && g.fora === low.id && (h.get(g.casa) ?? 0) <= 9) {
        games[i] = { ...g, casa: g.fora, fora: g.casa }; flipped = true; break;
      }
      if (high && g.casa === high.id && (h.get(g.fora) ?? 0) <= 8) {
        games[i] = { ...g, casa: g.fora, fora: g.casa }; flipped = true; break;
      }
    }
    if (!flipped) break;
  }
  return games;
}

/** Fallback que PRESERVA os 6 jogos de divisão. */
function fallbackSchedule(teams: SchedTeam[]): Game[] {
  const games: Game[] = [];
  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    const arr = teams.filter(t => t.conf === conf);
    const byDiv = [0, 1, 2, 3].map(d => arr.filter(t => t.div === d));
    // 6 de divisão (ida e volta) — cada rival exatamente 2x
    for (const div of byDiv) {
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        games.push({ casa: div[i].id, fora: div[j].id, isDiv: true });
        games.push({ casa: div[j].id, fora: div[i].id, isDiv: true });
      }
    }
    // 11 de conferência: todos os pares NÃO-divisão, menos um perfect matching
    // (cada time pula exatamente 1 adversário de conferência fora da divisão)
    const skip = new Set<string>();
    const pairKey = (a: string, b: string) => [a, b].sort().join('|');
    for (let i = 0; i < 4; i++) {
      skip.add(pairKey(byDiv[0][i].id, byDiv[1][i].id));
      skip.add(pairKey(byDiv[2][i].id, byDiv[3][i].id));
    }
    for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) {
      const a = arr[i]; const b = arr[j];
      if (a.div === b.div) continue;                 // divisão já coberta acima
      if (skip.has(pairKey(a.id, b.id))) continue;  // adversário pulado deste ano
      games.push((i + j) % 2 === 0 ? { casa: a.id, fora: b.id, isDiv: false } : { casa: b.id, fora: a.id, isDiv: false });
    }
  }
  return games;
}

/**
 * Distribui a semana de folga (bye) de cada franquia entre as semanas 5-14
 * (índices 4..13), no padrão da NFL: sem folga nas semanas 1-4 e 15-18,
 * rivais de divisão preferencialmente em semanas distintas e carga equilibrada.
 */
function assignByeWeeks(teams: SchedTeam[], rng: Rng): Map<string, number> {
  const bye = new Map<string, number>();
  const load = new Map<number, number>();
  for (let w = 4; w <= 13; w++) load.set(w, 0);
  const byDiv = new Map<string, SchedTeam[]>();
  for (const t of teams) {
    const k = `${t.conf}-${t.div}`;
    byDiv.set(k, [...(byDiv.get(k) ?? []), t]);
  }
  for (const key of rng.shuffle([...byDiv.keys()])) {
    const usedByDiv = new Set<number>();
    for (const t of rng.shuffle(byDiv.get(key)!)) {
      const weeks = [...Array(10)].map((_, i) => i + 4)
        .filter(w => !usedByDiv.has(w))
        .sort((a, b) => (load.get(a)! - load.get(b)!) || (rng.next() - 0.5));
      const w = weeks[0] ?? [...Array(10)].map((_, i) => i + 4).sort((a, b) => load.get(a)! - load.get(b)!)[0];
      bye.set(t.id, w);
      usedByDiv.add(w);
      load.set(w, load.get(w)! + 1);
    }
  }
  return bye;
}

/** Aloca nas 18 semanas: guloso com byes (semanas 5-14) + semana 18 = divisão. */
function assignWeeks(teams: SchedTeam[], games: Game[], rng: Rng): { weeks: Game[][]; week18: Game[] } {
  // semana 18: perfect matching dentro de cada divisão
  const divPairs = new Map<string, Game[]>();
  for (const g of games.filter(g => g.isDiv)) {
    const key = [g.casa, g.fora].sort().join('|');
    divPairs.set(key, [...(divPairs.get(key) ?? []), g]);
  }
  const byDiv = new Map<string, SchedTeam[]>();
  for (const t of teams) {
    const k = `${t.conf}-${t.div}`;
    byDiv.set(k, [...(byDiv.get(k) ?? []), t]);
  }
  const week18: Game[] = [];
  const w18Keys = new Set<string>();
  for (const [key, tms] of byDiv) {
    if (tms.length < 4) continue;
    const flip = (key.length + tms[0].id.length) % 2 === 1;
    const pairs: [SchedTeam, SchedTeam][] = flip
      ? [[tms[0], tms[2]], [tms[1], tms[3]]]
      : [[tms[0], tms[1]], [tms[2], tms[3]]];
    for (const [a, b] of pairs) {
      const legs = divPairs.get([a.id, b.id].sort().join('|')) ?? [];
      if (!legs.length) continue;
      const pick = legs[(a.id.length + b.id.length) % legs.length];
      week18.push(pick);
      w18Keys.add(`${pick.casa}>${pick.fora}`);
    }
  }
  const rest = games.filter(g => !w18Keys.has(`${g.casa}>${g.fora}`));

  // BYE WEEKS no padrão NFL: cada franquia folga exatamente 1 semana entre as
  // semanas 5 e 14 (índices 4..13); nunca nas semanas 1-4 nem 15-18. Rivais de
  // divisão evitam folgar na mesma semana e a carga fica ~3-4 times por semana.
  const bye = assignByeWeeks(teams, rng);

  // guloso semanas 1..17
  let best: Game[][] | null = null;
  for (let attempt = 0; attempt < 100 && !best; attempt++) {
    const r2 = new Rng((rng.int(1, 0x7fffffff) + attempt * 7919) >>> 0);
    const weeks: Game[][] = Array.from({ length: 17 }, () => []);
    const remaining = [...rest];
    for (let w = 0; w < 17 && remaining.length; w++) {
      const booked = new Set<string>();
      // times de folga nesta semana ficam indisponíveis
      for (const t of teams) if (bye.get(t.id) === w) booked.add(t.id);
      let progress = true;
      while (progress) {
        progress = false;
        const avail = new Map<string, Game[]>();
        for (const g of remaining) {
          if (booked.has(g.casa) || booked.has(g.fora)) continue;
          avail.set(g.casa, [...(avail.get(g.casa) ?? []), g]);
          avail.set(g.fora, [...(avail.get(g.fora) ?? []), g]);
        }
        const free = [...avail.keys()].sort((a, b) => avail.get(a)!.length - avail.get(b)!.length);
        for (const tm of free) {
          if (booked.has(tm)) continue;
          const opts = (avail.get(tm) ?? []).filter(g => !booked.has(g.casa) && !booked.has(g.fora));
          if (!opts.length) { booked.add(tm); continue; }
          const late = w >= 13; const early = w <= 4;
          const scored = opts.map(g => {
            let sc = r2.f(0, 1);
            if (g.isDiv && late) sc += 3;
            if (g.isDiv && early) sc -= 2;
            return { g, sc };
          }).sort((a, b) => b.sc - a.sc);
          const pick = scored[0].g;
          weeks[w].push(pick);
          remaining.splice(remaining.indexOf(pick), 1);
          booked.add(pick.casa); booked.add(pick.fora);
          progress = true;
        }
      }
    }
    if (remaining.length === 0) best = weeks;
  }
  if (!best) {
    const weeks: Game[][] = Array.from({ length: 17 }, () => []);
    const remaining = [...rest];
    for (let w = 0; w < 17 && remaining.length; w++) {
      const booked = new Set<string>();
      for (let i = remaining.length - 1; i >= 0; i--) {
        const g = remaining[i];
        if (booked.has(g.casa) || booked.has(g.fora)) continue;
        weeks[w].push(g); booked.add(g.casa); booked.add(g.fora);
        remaining.splice(i, 1);
      }
    }
    for (const g of remaining) {
      for (let w = 0; w < 17; w++) {
        const busy = new Set(weeks[w].flatMap(x => [x.casa, x.fora]));
        if (!busy.has(g.casa) && !busy.has(g.fora)) { weeks[w].push(g); break; }
      }
    }
    best = weeks;
  }
  return { weeks: best, week18 };
}

export function initialRanks(teams: { id: string; conf: Conf; div: number; s: number }[], rng: Rng): RankMap {
  const map: RankMap = new Map();
  // ranqueia DENTRO de cada divisão (conf+div) — nunca cruza conferências
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

/* ================= classificação ================= */
export interface TableRow {
  teamId: string; j: number; v: number; e: number; d: number;
  pf: number; pc: number; net: number; seq: string;
}
export function standings(s: GameState): TableRow[] {
  const rows: TableRow[] = s.teams.map(t => ({
    teamId: t.id, j: 0, v: 0, e: 0, d: 0, pf: 0, pc: 0, net: 0, seq: '',
  }));
  const byId = new Map(rows.map(r => [r.teamId, r]));
  for (const m of s.matches) {
    if (!m.jogada || m.placarCasa == null || m.placarFora == null) continue;
    const rc = byId.get(m.casa)!; const rf = byId.get(m.fora)!;
    rc.j++; rf.j++;
    rc.pf += m.placarCasa; rc.pc += m.placarFora;
    rf.pf += m.placarFora; rf.pc += m.placarCasa;
    if (m.placarCasa > m.placarFora) { rc.v++; rf.d++; rc.seq += 'V '; rf.seq += 'D '; }
    else if (m.placarCasa < m.placarFora) { rf.v++; rc.d++; rf.seq += 'V '; rc.seq += 'D '; }
    else { rc.e++; rf.e++; rc.seq += 'E '; rf.seq += 'E '; }
  }
  for (const r of rows) {
    r.net = r.pf - r.pc;
    r.seq = r.seq.trim().split(' ').slice(-5).join(' ');
  }
  return rows;
}
export function divisionTable(s: GameState, conf: Conf, div: number): TableRow[] {
  return standings(s)
    .filter(r => { const t = teamById(s, r.teamId); return t.conf === conf && t.div === div; })
    .sort((a, b) => (b.v + b.e * 0.5) - (a.v + a.e * 0.5) || b.net - a.net);
}
export function conferenceSeeds(s: GameState, conf: Conf): { teamId: string; seed: number }[] {
  const champs: TableRow[] = [];
  const rest: TableRow[] = [];
  for (let d = 0; d < 4; d++) {
    const tbl = divisionTable(s, conf, d);
    champs.push(tbl[0]);
    rest.push(...tbl.slice(1));
  }
  champs.sort((a, b) => (b.v + b.e * 0.5) - (a.v + a.e * 0.5) || b.net - a.net);
  rest.sort((a, b) => (b.v + b.e * 0.5) - (a.v + a.e * 0.5) || b.net - a.net);
  return [...champs, ...rest.slice(0, 3)].map((r, i) => ({ teamId: r.teamId, seed: i + 1 }));
}
export function playoffZone(s: GameState, conf: Conf): Set<string> {
  return new Set(conferenceSeeds(s, conf).map(x => x.teamId));
}

/* ================= avanço de semana ================= */
export interface AdvanceOutcome { match?: GameResult; eliminado?: boolean; }

function mergeStats(s: GameState, r: GameResult) {
  // estatísticas individuais
  for (const [pid, delta] of Object.entries(r.statDeltas)) {
    const p = s.players.find(x => x.id === pid);
    if (!p) continue;
    for (const [k, v] of Object.entries(delta)) (p.stats as unknown as Record<string, number>)[k] = ((p.stats as unknown as Record<string, number>)[k] ?? 0) + v;
  }
  // jogos disputados (uma única vez por participante)
  for (const pid of r.participantes) {
    const p = s.players.find(x => x.id === pid);
    if (p) { p.stats.jogos++; p.jogosCarreira++; }
  }
  // lesões
  for (const inj of r.lesoes) {
    const p = s.players.find(x => x.id === inj.playerId);
    if (p && p.lesao === 0) { p.lesao = inj.semanas; p.lesaoTipo = inj.tipo; }
  }
  // moral
  const winner = r.placarCasa > r.placarFora ? r.casaId : r.placarFora > r.placarCasa ? r.foraId : null;
  for (const id of [r.casaId, r.foraId]) {
    const t = teamById(s, id);
    t.moral = clamp(t.moral + (id === winner ? 4 : winner ? -3 : 0), 25, 95);
    for (const p of playersOf(s, id)) p.moral = clamp(p.moral + (id === winner ? 3 : winner ? -2 : 0), 25, 95);
  }
}

export function advance(s0: GameState): { state: GameState; out: AdvanceOutcome } {
  const s = structuredClone(s0);
  const out: AdvanceOutcome = {};
  const { fase, semana } = s.settings;

  const isUser = (m: Match) => m.casa === s.userTeam || m.fora === s.userTeam;
  const weekMatches = s.matches.filter(m => m.fase === fase && m.rodada === semana && !m.jogada);

  // recupera lesionados
  for (const p of s.players) if (p.lesao > 0) { p.lesao--; if (p.lesao === 0) p.lesaoTipo = null; }

  const rng = new Rng(newSeed());
  const results: Match[] = [];
  let userRes: GameResult | null = null;

  for (const m of weekMatches) {
    const user = isUser(m);
    const engine = new NFLMatchEngine(sideOf(s, m.casa), sideOf(s, m.fora), rng, {
      neutro: fase === 'PO' && semana === 4,
    });
    const faseLabel = fase === 'PRE' ? `Pré-temporada, semana ${semana}` : fase === 'REG' ? `Semana ${semana}` : `Playoffs — ${s.bracket?.[semana - 1]?.nome ?? ''}`;
    const r = engine.simulate(m.id, faseLabel);
    m.placarCasa = r.placarCasa; m.placarFora = r.placarFora; m.jogada = true;
    mergeStats(s, r);
    results.push({ ...m });
    if (user) { userRes = r; out.match = r; }
    else void engine;
  }
  s.weekResults = results.filter(m => !isUser(m));
  s.lastResult = userRes;

  if (fase === 'PRE') {
    if (semana >= 2) {
      s.settings.fase = 'REG'; s.settings.semana = 1;
      pushNews(s, 'TEMPORADA REGULAR', 'A pré-temporada acabou! 18 semanas (17 jogos + 1 bye) valem a vaga nos playoffs. Semana 18 é 100% divisão.');
    } else s.settings.semana++;
  } else if (fase === 'REG') {
    if (semana >= 18) startPlayoffs(s);
    else s.settings.semana++;
  } else if (fase === 'PO') {
    // a orquestração (bracket, eliminação, fim de temporada) é feita pelo advanceRound
    s.settings.semana++;
  }
  return { state: s, out };
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
    pushNews(s, 'PLAYOFFS', `${one.cidade} ${one.nome} é o seed #1 da ${conf} e folga na rodada de Wild Card.`);
  }
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
        // 4 times: seed #1 (bye) + 3 vencedores do Wild Card (ordenados por seed)
        const one = seeds[0].teamId;                    // seed #1
        const w = [...ws].sort((a, b) => seedOf.get(a)! - seedOf.get(b)!); // [melhor, meio, pior]
        next.push({ casa: one, fora: w[w.length - 1], pc: null, pf: null, jogada: false }); // #1 vs pior seed
        next.push({ casa: w[0], fora: w[1], pc: null, pf: null, jogada: false });           // os outros dois
      } else {
        // Final de Conferência: os 2 vencedores do Divisional
        const sorted = [...ws].sort((a, b) => seedOf.get(a)! - seedOf.get(b)!);
        next.push({ casa: sorted[0], fora: sorted[1], pc: null, pf: null, jogada: false });
      }
    }
  }
  s.bracket!.push({ nome: nomes[idx + 1], jogos: next });
}

/** Registra os resultados da rodada `idx` no bracket e constrói a próxima. */
function finishRound(s: GameState, idx: number, playedWeek: number) {
  const round = s.bracket![idx];
  for (const j of round.jogos) {
    const m = s.matches.find(x => x.fase === 'PO' && x.rodada === playedWeek && ((x.casa === j.casa && x.fora === j.fora) || (x.casa === j.fora && x.fora === j.casa)) && x.jogada);
    if (!m) continue;
    j.pc = m.casa === j.casa ? m.placarCasa : m.placarFora;
    j.pf = m.casa === j.casa ? m.placarFora : m.placarCasa;
    j.jogada = true;
  }
  // constrói a próxima fase do bracket (se acabamos de fechar a última existente)
  if (idx === s.bracket!.length - 1) nextRound(s);

  if (round.nome === 'Super Bowl') {
    const sb = round.jogos[0];
    const champ = (sb.pc ?? 0) >= (sb.pf ?? 0) ? sb.casa : sb.fora;
    s.campeoes.push({ temporada: s.settings.temporada, teamId: champ });
    const c = teamById(s, champ);
    pushNews(s, 'SUPER BOWL', `${c.cidade} ${c.nome} é o CAMPEÃO da temporada ${s.settings.temporada}! 🏆`);
  }
}

const userInRound = (s: GameState, idx: number, uid: string) => {
  const rd = s.bracket![idx];
  return rd ? rd.jogos.some(j => j.casa === uid || j.fora === uid) : false;
};

/**
 * Orquestra os playoffs: garante os jogos da rodada, simula, registra no
 * bracket, detecta eliminação do usuário e encerra a temporada após o Super Bowl.
 */
export function advanceRound(s0: GameState): { state: GameState; out: AdvanceOutcome } {
  const s = structuredClone(s0);
  const out: AdvanceOutcome = {};
  const { fase, semana } = s.settings;
  if (fase !== 'PO') return advance(s);

  const idx = semana - 1;
  const round = s.bracket![idx];
  // cria os jogos desta rodada no calendário, se necessário
  for (const j of round.jogos) {
    const exists = s.matches.some(m => m.fase === 'PO' && m.rodada === semana && ((m.casa === j.casa && m.fora === j.fora) || (m.casa === j.fora && m.fora === j.casa)));
    if (!exists) s.matches.push({ id: `po-${semana}-${j.casa}-${j.fora}`, fase: 'PO', rodada: semana, casa: j.casa, fora: j.fora, placarCasa: null, placarFora: null, jogada: false });
  }

  const userWasIn = userInRound(s, idx, s.userTeam);
  const r = advance(s);
  const stt = r.state;

  // registra os resultados no bracket (roundIdx = rodada que acabou de ser jogada)
  finishRound(stt, idx, semana);

  // eliminação do usuário?
  const nextIdx = Math.min(idx + 1, stt.bracket!.length - 1);
  const userContinues = userInRound(stt, nextIdx, stt.userTeam);
  if (userWasIn && !userContinues) {
    out.eliminado = true;
    const t = teamById(stt, stt.userTeam);
    pushNews(stt, 'ELIMINAÇÃO', `Fim de sonho: ${t.cidade} ${t.nome} cai nos playoffs. Resta torcer e planejar o Draft.`);
  }

  // após o Super Bowl, encerra a temporada e abre a offseason
  if (round.nome === 'Super Bowl') {
    endSeason(stt, new Rng(newSeed()));
  }
  return { state: stt, out };
}

/* ================= fim de temporada → offseason ================= */
function endSeason(s: GameState, rng: Rng) {
  s.settings.fase = 'OFF'; s.settings.semana = 0;

  // envelhecimento + treino + aposentadorias
  const aposentados: string[] = [];
  for (const p of [...s.players]) {
    p.idade++;
    const t = p.teamId ? teamById(s, p.teamId) : null;
    const ct = t ? t.centroTreino : 2;
    let growth = p.idade <= 23 ? 2.1 : p.idade <= 26 ? 1.2 : p.idade <= 29 ? 0.2 : p.idade <= 31 ? -1.1 : p.idade <= 33 ? -2.3 : -3.6;
    growth += (ct - 2) * 0.45;
    if (growth > 0 && p.ovr >= p.pot - 2) growth *= 0.25;
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
    p.lesao = 0; p.lesaoTipo = null;
    p.rookie = false;
    const retireP = p.idade >= 32 ? (p.idade - 31) * 0.12 + (p.ovr < 70 ? 0.18 : 0) : 0;
    if (rng.chance(retireP)) {
      aposentados.push(p.nome);
      s.players = s.players.filter(x => x.id !== p.id);
    }
  }
  if (aposentados.length)
    pushNews(s, 'APOSENTADORIAS', `${aposentados.length} veteranos penduram as chuteiras, incluindo ${aposentados.slice(0, 2).join(' e ')}.`);

  // contratos: consome a temporada e libera quem expirou
  const expirandoUser: string[] = [];
  for (const p of [...s.players]) {
    p.contrato--;
    if (p.contrato > 0) continue;
    if (p.tag) {
      p.contrato = 1;
      p.salario = Math.max(Math.round(p.salario * 1.2 * 10) / 10, 8);
      p.tag = false;
      if (p.teamId === s.userTeam) pushNews(s, 'FRANCHISE TAG', `${p.nome} joga a próxima temporada sob a franchise tag (${fmtM(p.salario)}).`);
      continue;
    }
    if (p.teamId === s.userTeam) expirandoUser.push(p.nome);
    p.origem = p.teamId ?? undefined;
    p.teamId = null; p.status = 'RES'; p.bonus = 0;
    p.salario = Math.max(0.7, Math.round(p.salario * rng.f(0.7, 1.0) * 10) / 10);
    s.faPool.push(p);
    s.players = s.players.filter(x => x.id !== p.id);
  }
  if (expirandoUser.length)
    pushNews(s, 'MERCADO', `Contratos encerrados: ${expirandoUser.slice(0, 4).join(', ')}${expirandoUser.length > 4 ? '…' : ''} agora são free agents.`);

  s.offPhase = 1;
  s.draftState = null;
  pushNews(s, 'OFFSEASON', 'Fim dos playoffs! Offseason em 4 fases: 1) Free Agency → 2) Renovações → 3) Draft → 4) Validação. Ajuste elenco e cap antes da nova temporada.');
}

/* ---------- offseason guiada ---------- */
export const OFF_PHASES: { n: 1 | 2 | 3 | 4; titulo: string; desc: string; destino: Screen }[] = [
  { n: 1, titulo: 'Free Agency', desc: 'O mercado abre: 31 franquias disputam os agentes livres.', destino: 'mercado' },
  { n: 2, titulo: 'Renovações & Comissão', desc: 'Garanta suas estrelas e renove sua comissão técnica.', destino: 'comissao' },
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
  pushNews(s, 'DRAFT', `Ordem do Draft ${s.settings.temporada + 1} definida: ${teamById(s, order[0]).cidade} ${teamById(s, order[0]).nome} escolhe primeiro. Sua posição: ${order.indexOf(s.userTeam) + 1}.`);
}

export function aiFreeAgency(s: GameState, rng: Rng) {
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
      const wasMine = f.origem === t.id;
      f.teamId = t.id; f.status = 'RES'; f.origem = undefined;
      f.contrato = wasMine ? rng.int(1, 3) : 1;
      s.players.push(f);
      space = s.settings.cap - capUsed(s, t.id);
      if (f.ovr >= 76) assinaturas.push(`${t.sigla} ${wasMine ? 'renova com' : 'contrata'} ${f.nome} (${f.pos}, OVR ${f.ovr}) por ${fmtM(f.salario)}/ano`);
    }
  }
  if (assinaturas.length)
    pushNews(s, 'FREE AGENCY', `Mercado aquecido: ${assinaturas.slice(0, 3).join('; ')}${assinaturas.length > 3 ? `… e mais ${assinaturas.length - 3} movimento(s).` : '.'}`);
}

export function advanceOffPhase(s: GameState): { ok: boolean; msg: string } {
  const rng = new Rng(newSeed());
  const ph = s.offPhase ?? 1;
  if (s.settings.fase !== 'OFF') return { ok: false, msg: 'A offseason ainda não começou.' };
  if (ph === 1) {
    aiFreeAgency(s, rng);
    s.offPhase = 2;
    pushNews(s, 'OFFSEASON', 'Free Agency encerrada. Fase 2 aberta: renove jogadores e comissão técnica.');
    return { ok: true, msg: 'Fase 2 — Renovações & Comissão aberta.' };
  }
  if (ph === 2) {
    setupDraftOrder(s);
    s.offPhase = 3;
    pushNews(s, 'OFFSEASON', 'Renovações concluídas. Fase 3 aberta: Draft de novatos em 7 rodadas.');
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

/* ---------- validação e auto-fix ---------- */
export interface RosterCheck { ok: boolean; erros: string[]; }
export function validateRoster(s: GameState): RosterCheck {
  const erros: string[] = [];
  const roster = playersOf(s, s.userTeam);
  const ativos = roster.filter(p => p.status !== 'PS').length;
  const ps = roster.filter(p => p.status === 'PS').length;
  const cap = capUsed(s, s.userTeam);
  if (ativos !== 53) erros.push(`Elenco ativo tem ${ativos} jogadores — a liga exige exatamente 53.`);
  if (ps > 10) erros.push(`Practice Squad com ${ps} jogadores — o máximo é 10.`);
  if (cap > s.settings.cap)
    erros.push(`Folha de ${fmtM(cap)} estoura o cap de ${fmtM(s.settings.cap)} em ${fmtM(Math.round((cap - s.settings.cap) * 10) / 10)}.`);
  if (!roster.some(p => p.pos === 'QB' && p.status !== 'PS'))
    erros.push('É preciso ter ao menos 1 QB no elenco ativo.');
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
    let alvo = ps[0] ?? res[0] ?? (ativos > 44 ? tit[0] : undefined);
    if (!alvo) break;
    s.players = s.players.filter(x => x.id !== alvo!.id);
    alvo.teamId = null; alvo.status = 'RES'; alvo.origem = teamId; alvo.bonus = 0;
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
  if (ativos > 0) feitas.push(`elenco ativo em ${playersOf(s, s.userTeam).filter(p => p.status !== 'PS').length}/53`);
  const psJog = playersOf(s, s.userTeam).filter(p => p.status === 'PS').sort((a, b) => a.ovr - b.ovr);
  while (psJog.length > 10) {
    const c = psJog.shift()!;
    s.players = s.players.filter(x => x.id !== c.id);
    c.teamId = null; s.faPool.push(c);
    feitas.push('1 corte no Practice Squad');
  }
  return { msg: feitas.length ? `Auto-Fix aplicado: ${feitas.join(', ')}.` : 'Auto-Fix: nada a ajustar — elenco e cap já estão em ordem.' };
}

/* ---------- draft ---------- */
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
    score: (bpa ? p.pot * 0.7 + p.ovr * 0.3 : p.pot * 0.4 + p.ovr * 0.3 + need(p.pos) * 22) + Math.random() * 6,
  })).sort((a, b) => b.score - a.score);
  return scored[0].p;
}

export function userDraftPick(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const d = s.draftState;
  if (!d || d.done) return { ok: false, msg: 'O draft não está em andamento.' };
  if (d.order[d.pick] !== s.userTeam) return { ok: false, msg: 'Não é a sua escolha.' };
  const p = s.draftClass.find(x => x.id === playerId);
  if (!p) return { ok: false, msg: 'Prospecto indisponível.' };
  const ativos = playersOf(s, s.userTeam).filter(x => x.status !== 'PS').length;
  if (ativos >= 53) return { ok: false, msg: 'Elenco cheio (53). Dispense alguém antes de draftar.' };
  s.draftClass = s.draftClass.filter(x => x.id !== playerId);
  p.teamId = s.userTeam; p.status = 'RES'; p.contrato = 4; p.salario = rookieSalary(p.ovr);
  s.players.push(p);
  pushNews(s, 'DRAFT', `Rodada ${d.round}: ${teamById(s, s.userTeam).sigla} escolhe ${p.nome} (${p.pos}, OVR ${p.ovr}).`);
  advanceDraft(s);
  return { ok: true, msg: `${p.nome} draftado!` };
}

function advanceDraft(s: GameState) {
  const d = s.draftState!;
  if (!s.draftClass.length) { d.done = true; pushNews(s, 'DRAFT', 'Classe esgotada — draft encerrado.'); return; }
  d.pick++;
  if (d.pick >= 32) {
    d.pick = 0; d.round++;
    if (d.round > 7) {
      d.done = true;
      pushNews(s, 'DRAFT', `Draft ${s.settings.temporada + 1} encerrado após 7 rodadas.`);
      return;
    }
    pushNews(s, 'DRAFT', `Rodada ${d.round} do Draft iniciada.`);
  }
  // picks da IA em sequência
  let guard = 0;
  while (!d.done && d.order[d.pick] !== s.userTeam && guard++ < 400 && s.draftClass.length) {
    const teamId = d.order[d.pick];
    const pick = aiPickFor(s, teamId);
    if (!pick) { d.done = true; break; }
    s.draftClass = s.draftClass.filter(x => x.id !== pick.id);
    pick.teamId = teamId; pick.status = 'RES'; pick.contrato = 4;
    s.players.push(pick);
    d.pick++;
    if (d.pick >= 32) {
      d.pick = 0; d.round++;
      if (d.round > 7) { d.done = true; pushNews(s, 'DRAFT', `Draft ${s.settings.temporada + 1} encerrado após 7 rodadas.`); }
    }
  }
}

export function autoDraftUntilUser(s: GameState) {
  const d = s.draftState;
  if (!d || d.done) return;
  let guard = 0;
  while (!d.done && d.order[d.pick] !== s.userTeam && guard++ < 400 && s.draftClass.length) {
    const teamId = d.order[d.pick];
    const pick = aiPickFor(s, teamId);
    if (!pick) { d.done = true; break; }
    s.draftClass = s.draftClass.filter(x => x.id !== pick.id);
    pick.teamId = teamId; pick.status = 'RES'; pick.contrato = 4;
    s.players.push(pick);
    d.pick++;
    if (d.pick >= 32) { d.pick = 0; d.round++; if (d.round > 7) { d.done = true; } }
  }
}
export function autoDraftAll(s: GameState) {
  const d = s.draftState;
  if (!d || d.done) return;
  let guard = 0;
  while (!d.done && guard++ < 300 && s.draftClass.length) {
    const teamId = d.order[d.pick];
    const pick = aiPickFor(s, teamId);
    if (!pick) { d.done = true; break; }
    s.draftClass = s.draftClass.filter(x => x.id !== pick.id);
    pick.teamId = teamId; pick.status = 'RES'; pick.contrato = 4;
    s.players.push(pick);
    d.pick++;
    if (d.pick >= 32) { d.pick = 0; d.round++; if (d.round > 7) d.done = true; }
  }
  d.done = true;
}

/* ================= nova temporada ================= */
export function newSeason(prev: GameState, buildWorld: (s: GameState, rng: Rng, ranks: RankMap) => { matches: Match[]; draftClass: Player[]; staffPool: Staff[] }): GameState {
  const s = structuredClone(prev);
  const rng = new Rng(newSeed());

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

  /* economia: inflação movida pela TV */
  const crescimento = s.settings.tvGrowth;
  s.settings.cap = Math.round(s.settings.cap * (1 + crescimento / 100));
  s.settings.inflacao = Math.round(s.settings.inflacao * (1 + crescimento / 100) * 1000) / 1000;
  s.settings.tvDeal = Math.round(s.settings.tvDeal * (1 + crescimento / 100) * 100) / 100;
  const novaProjecao = Math.round(rng.f(3, 8) * 10) / 10;
  s.settings.temporada++;
  s.settings.fase = 'PRE';
  s.settings.semana = 1;

  for (const p of s.players) {
    p.stats = zeroStats(); p.lesao = 0; p.lesaoTipo = null; p.tag = false;
    p.moral = clamp(p.moral + rng.int(-3, 5), 40, 90);
  }
  for (const t of s.teams) t.moral = clamp(60 + rng.int(-5, 8), 30, 90);

  const w = buildWorld(s, rng, ranks);
  s.matches = w.matches;
  s.draftClass = w.draftClass;
  s.staffPool = w.staffPool;
  for (const p of s.draftClass) p.salario = Math.round(p.salario * s.settings.inflacao * 10) / 10;
  s.draftState = null;
  s.bracket = null;
  s.lastResult = null;
  s.weekResults = [];
  s.offPhase = undefined;

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

  pushNews(s, 'ECONOMIA', `Acordo de TV rende $${s.settings.tvDeal.toFixed(1).replace('.', ',')}B/ano: cap sobe ${crescimento.toFixed(1).replace('.', ',')}% e vai a ${fmtM(s.settings.cap)}. Projeção p/ ${s.settings.temporada + 1}: +${novaProjecao.toFixed(1).replace('.', ',')}%.`);
  pushNews(s, 'TEMPORADA', `Temporada ${s.settings.temporada} começa! Calendário oficial: 17 jogos em 18 semanas (semana 18 é 100% divisão).`);
  s.settings.tvGrowth = novaProjecao;
  return s;
}
