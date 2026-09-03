/* ============================================================
 * Orquestração da temporada: calendário oficial NFL, tabela,
 * avanço de semanas, playoffs, offseason guiada (4 fases),
 * free agency, draft, validação e economia (inflação da TV).
 * ============================================================ */

import type {
  Conf, ContractOffer, Focus, GameResult, GameState, Match, Player, Staff, Team,
} from './types';
import { zeroStats } from './types';
import type { Side } from './engine';
import { Rng, clamp, newSeed } from './rng';
import { computeOvr, genName, POS_ORDER, rookieSalary, salaryFor } from './data';
import { NFLMatchEngine } from './engine';
import { acceptanceRoll, makeContract, playerExpectations, playerHappiness, staffExpectations, staffHappiness, STRUCT_LABEL } from './negotiations';

/* ================= helpers ================= */
export const teamById = (s: GameState, id: string): Team => s.teams.find(t => t.id === id)!;
export const playersOf = (s: GameState, teamId: string): Player[] => s.players.filter(p => p.teamId === teamId);
export const staffOf = (s: GameState, teamId: string): Staff[] => s.staff.filter(st => st.teamId === teamId);
export const fmtM = (v: number) => `$${v.toFixed(1).replace('.', ',')}M`;

export const capHitOf = (p: Player) => {
  // contrato estruturado: cap hit do ano corrente já inclui o bônus amortizado
  if (p.contract && p.contract.capHits.length) return p.contract.capHits[0];
  const bonus = p.contract?.bonus ?? 0;
  return p.salario + (bonus > 0 && p.contrato > 0 ? bonus / p.contrato : 0);
};
export const capUsed = (s: GameState, teamId: string) =>
  Math.round(playersOf(s, teamId).reduce((sum, p) => sum + capHitOf(p), 0) * 10) / 10;

export const sideOf = (s: GameState, teamId: string): Side => ({
  team: teamById(s, teamId),
  players: playersOf(s, teamId),
  staff: staffOf(s, teamId),
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
 *  6 divisão · 4 intraconferência (3 anos) · 4 interconferência (4 anos)
 *  2 mesma conferência p/ colocação · 1 extra p/ colocação
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
  const intraHosts = year % 2 === 0;

  for (const conf of ['AFC', 'NFC'] as Conf[]) {
    // 6 de divisão (ida e volta)
    for (let d = 0; d < 4; d++) {
      const div = divOf(conf, d);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        games.push({ casa: div[i].id, fora: div[j].id, isDiv: true });
        games.push({ casa: div[j].id, fora: div[i].id, isDiv: true });
      }
    }
    // 4 de rotação intraconferência (ciclo de 3 anos)
    for (const [da, db] of intra) {
      const A = divOf(conf, da); const B = divOf(conf, db);
      for (let k = 0; k < 4; k++)
        games.push(intraHosts ? { casa: A[k].id, fora: B[k].id, isDiv: false } : { casa: B[k].id, fora: A[k].id, isDiv: false });
    }
    // 2 vs. mesma conferência, mesma colocação (bipartido entre os pares da rotação)
    const [pp0, pp1] = intra;
    const flip = year % 2 === 1;
    const edges: [number, number][] = flip
      ? [[pp1[0], pp0[0]], [pp0[0], pp1[1]], [pp1[1], pp0[1]], [pp0[1], pp1[0]]]
      : [[pp0[0], pp1[0]], [pp1[0], pp0[1]], [pp0[1], pp1[1]], [pp1[1], pp0[0]]];
    for (const [dh, da] of edges) {
      const H = divByRank(conf, dh); const A = divByRank(conf, da);
      for (let r = 0; r < 4; r++) {
        const h = H[r]; const a = A[r];
        if (h && a) games.push({ casa: h.id, fora: a.id, isDiv: false });
      }
    }
  }

  // 4 interconferência (ciclo real de 4 anos)
  for (let d = 0; d < 4; d++) {
    const oppDiv = (d + year) % 4;
    const A = divOf('AFC', d); const B = divOf('NFC', oppDiv);
    const aHosts = (d + year) % 2 === 0;
    for (let k = 0; k < 4; k++)
      games.push(aHosts ? { casa: A[k].id, fora: B[k].id, isDiv: false } : { casa: B[k].id, fora: A[k].id, isDiv: false });
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

function assignWeeks(teams: SchedTeam[], games: Game[], rng: Rng): { weeks: Game[][]; week18: Game[] } {
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
  // semana 18: perfect matching dentro de cada divisão
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

  // byes pré-designadas (semanas 5–14, número par por semana, sem rivais juntos)
  const byeWeekOf = new Map<string, number>();
  {
    const slots: number[] = [];
    for (let w = 5; w <= 14; w++) for (let i = 0; i < 4; i += 2) { slots.push(w); slots.push(w); }
    // 32 byes: 4 por semana em 8 semanas (5–12)… distribui 5–14
    const weeksPool: number[] = [];
    for (let w = 5; w <= 14; w++) { weeksPool.push(w, w, w, w); }
    const shuffled = new Rng(rng.int(1, 0x7fffffff)).shuffle(weeksPool).slice(0, 32);
    const used = new Map<string, Set<number>>();
    teams.forEach((t, i) => {
      let w = shuffled[i];
      const divMates = teams.filter(x => x.conf === t.conf && x.div === t.div).map(x => x.id);
      let guard = 0;
      while (divMates.some(m => used.get(m)?.has(w)) && guard++ < 40) w = 5 + ((w - 5 + 1) % 10);
      byeWeekOf.set(t.id, w);
      used.set(t.id, new Set([w]));
    });
    void slots;
  }

  // guloso semanas 1–17 respeitando byes
  let best: Game[][] | null = null;
  for (let attempt = 0; attempt < 100 && !best; attempt++) {
    const r2 = new Rng((rng.int(1, 0x7fffffff) + attempt * 7919) >>> 0);
    const weeks: Game[][] = Array.from({ length: 17 }, () => []);
    const remaining = [...rest];
    for (let w = 0; w < 17 && remaining.length; w++) {
      const booked = new Set<string>();
      let progress = true;
      while (progress) {
        progress = false;
        const avail = new Map<string, Game[]>();
        for (const g of remaining) {
          if (booked.has(g.casa) || booked.has(g.fora)) continue;
          if (byeWeekOf.get(g.casa) === w + 1 || byeWeekOf.get(g.fora) === w + 1) continue;
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
        if (byeWeekOf.get(g.casa) === w + 1 || byeWeekOf.get(g.fora) === w + 1) continue;
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
  const byDiv = new Map<string, { id: string; s: number }[]>();
  for (const t of teams) {
    const k = `${t.conf}-${t.div}`;
    byDiv.set(k, [...(byDiv.get(k) ?? []), { id: t.id, s: t.s * 10 + rng.f(0, 1.4) }]);
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

/* ================= classificação (só temporada regular) ================= */
export interface TableRow {
  teamId: string; j: number; v: number; e: number; d: number;
  pf: number; pc: number; net: number; seq: string;
}
export function standings(s: GameState): TableRow[] {
  const rows: TableRow[] = s.teams.map(t => ({ teamId: t.id, j: 0, v: 0, e: 0, d: 0, pf: 0, pc: 0, net: 0, seq: '' }));
  const byId = new Map(rows.map(r => [r.teamId, r]));
  for (const m of s.matches) {
    if (m.fase !== 'REG' || !m.jogada || m.placarCasa == null || m.placarFora == null) continue;
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

/** Zera o que a pré-temporada acumulou (stats + caixa de notícias de jogo). */
export function resetPreseasonStats(s: GameState): void {
  for (const p of s.players) p.stats = zeroStats();
}

/* ================= avanço de semana ================= */
export interface AdvanceOutcome { match?: GameResult; eliminado?: boolean; }

function mergeStats(s: GameState, r: GameResult) {
  for (const [pid, delta] of Object.entries(r.statDeltas)) {
    const p = s.players.find(x => x.id === pid);
    if (!p) continue;
    for (const [k, v] of Object.entries(delta)) (p.stats as unknown as Record<string, number>)[k] = ((p.stats as unknown as Record<string, number>)[k] ?? 0) + v;
  }
  for (const pid of r.participantes) {
    const p = s.players.find(x => x.id === pid);
    if (p) { p.stats.jogos++; p.jogosCarreira++; }
  }
  for (const inj of r.lesoes) {
    const p = s.players.find(x => x.id === inj.playerId);
    if (p && p.lesao === 0) { p.lesao = inj.semanas; p.lesaoTipo = inj.tipo; }
  }
  const winner = r.placarCasa > r.placarFora ? r.casaId : r.placarFora > r.placarCasa ? r.foraId : null;
  for (const id of [r.casaId, r.foraId]) {
    const t = teamById(s, id);
    t.moral = clamp(t.moral + (id === winner ? 4 : winner ? -3 : 0), 25, 95);
    for (const p of playersOf(s, id)) p.moral = clamp(p.moral + (id === winner ? 3 : winner ? -2 : 0), 25, 95);
  }
}

export function advance(s0: GameState): { state: GameState; out: AdvanceOutcome } {
  const s = structuredClone(s0);
  const prev = s0;
  const out: AdvanceOutcome = {};
  const { fase, semana } = s.settings;

  const isUser = (m: Match) => m.casa === s.userTeam || m.fora === s.userTeam;
  const weekMatches = s.matches.filter(m => m.fase === fase && m.rodada === semana && !m.jogada);

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
  }
  s.weekResults = results.filter(m => !isUser(m));
  s.lastResult = userRes;

  if (fase === 'PRE') {
    if (semana >= 2) {
      resetPreseasonStats(s);
      s.settings.fase = 'REG'; s.settings.semana = 1;
      pushNews(s, 'TEMPORADA REGULAR', 'A pré-temporada acabou! Estatísticas zeradas — 18 semanas valem a vaga nos playoffs. Semana 18 é 100% divisão.');
    } else s.settings.semana++;
  } else if (fase === 'REG') {
    if (semana >= 18) startPlayoffs(s);
    else s.settings.semana++;
  } else if (fase === 'PO') {
    const stillIn = userStillAlive(s);
    if (prev.bracket && !stillIn && bracketHadUser(prev, s.userTeam)) {
      out.eliminado = true;
      const t = teamById(s, s.userTeam);
      pushNews(s, 'ELIMINAÇÃO', `Fim de sonho: ${t.cidade} ${t.nome} cai nos playoffs.`);
    }
    s.settings.semana++;
    if (s.settings.semana > (s.bracket?.length ?? 4)) endSeason(s, rng);
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
        const two = seeds[1].teamId;
        next.push({ casa: one, fora: wLow, pc: null, pf: null, jogada: false });
        next.push({ casa: wHigh === two ? wHigh : two, fora: wHigh === two ? wHigh : wHigh, pc: null, pf: null, jogada: false });
      } else {
        const sorted = [...ws].sort((a, b) => seedOf.get(a)! - seedOf.get(b)!);
        next.push({ casa: sorted[0], fora: sorted[1], pc: null, pf: null, jogada: false });
      }
    }
  }
  s.bracket!.push({ nome: nomes[idx + 1], jogos: next });
}

export function advanceRound(s0: GameState): { state: GameState; out: AdvanceOutcome } {
  const s = structuredClone(s0);
  const out: AdvanceOutcome = {};
  const { fase, semana } = s.settings;

  if (fase === 'PO' && s.bracket) {
    const rd = s.bracket[Math.min(semana - 1, s.bracket.length - 1)];
    for (const j of rd.jogos) {
      const exists = s.matches.some(m => m.fase === 'PO' && m.rodada === semana && ((m.casa === j.casa && m.fora === j.fora) || (m.casa === j.fora && m.fora === j.casa)));
      if (!exists) s.matches.push({ id: `po-${semana}-${j.casa}-${j.fora}`, fase: 'PO', rodada: semana, casa: j.casa, fora: j.fora, placarCasa: null, placarFora: null, jogada: false });
    }
  }

  const r = advance(s);
  if (r.state.settings.fase === 'PO' && fase === 'PO' && r.state.bracket) {
    const idx = semana - 1;
    const round = r.state.bracket[idx];
    if (round) {
      for (const j of round.jogos) {
        const m = r.state.matches.find(x => x.fase === 'PO' && x.rodada === semana && ((x.casa === j.casa && x.fora === j.fora) || (x.casa === j.fora && x.fora === j.casa)) && x.jogada);
        if (!m) continue;
        j.pc = m.casa === j.casa ? m.placarCasa : m.placarFora;
        j.pf = m.casa === j.casa ? m.placarFora : m.placarCasa;
        j.jogada = true;
      }
      if (idx === r.state.bracket.length - 1 && r.state.settings.semana <= r.state.bracket.length) {
        if (round.nome === 'Super Bowl') {
          const sb = round.jogos[0];
          if (sb.jogada) {
            const champ = (sb.pc ?? 0) >= (sb.pf ?? 0) ? sb.casa : sb.fora;
            r.state.campeoes.push({ temporada: r.state.settings.temporada, teamId: champ });
            const c = teamById(r.state, champ);
            pushNews(r.state, 'SUPER BOWL', `${c.cidade} ${c.nome} é o CAMPEÃO da temporada ${r.state.settings.temporada}! 🏆`);
          }
        } else {
          nextRound(r.state);
        }
      }
    }
  }
  return { ...r, out: { ...r.out, ...out } };
}

/* ================= fim de temporada → offseason ================= */
const FOCUS_ATTRS: Record<Focus, (keyof Player['attrs'])[]> = {
  CORRIDA: ['corrida', 'bloqueio'],
  PASSE: ['passe', 'recepcao'],
  DEFESA: ['tackle', 'velocidade'],
  FISICO: ['resistencia', 'velocidade'],
};
export const FOCUS_INFO: Record<Focus, { label: string; desc: string }> = {
  CORRIDA: { label: 'Jogo terrestre', desc: '+Corrida e +Bloqueio dos jovens na offseason' },
  PASSE: { label: 'Jogo aéreo', desc: '+Passe e +Recepção dos jovens na offseason' },
  DEFESA: { label: 'Defesa', desc: '+Tackle e +Velocidade dos jovens na offseason' },
  FISICO: { label: 'Condicionamento', desc: '+Resistência e +Velocidade, base para todos' },
};

function endSeason(s: GameState, rng: Rng) {
  s.settings.fase = 'OFF'; s.settings.semana = 0;

  // envelhecimento + desenvolvimento (playing time + foco + CT)
  const aposentados: string[] = [];
  for (const p of [...s.players]) {
    p.idade++;
    const t = p.teamId ? teamById(s, p.teamId) : null;
    const ct = t ? t.centroTreino : 2;
    let growth = p.idade <= 23 ? 2.1 : p.idade <= 26 ? 1.2 : p.idade <= 29 ? 0.2 : p.idade <= 31 ? -1.1 : p.idade <= 33 ? -2.3 : -3.6;
    growth += (ct - 2) * 0.45;
    if (growth > 0 && p.ovr >= p.pot - 2) growth *= 0.25;
    // playing time: jovens que jogam evoluem até 1.3×; no banco, 0.5×
    if (growth > 0 && p.idade <= 26) {
      const tempo = clamp(p.stats.jogos / 17, 0, 1);
      growth *= 0.5 + 0.8 * tempo;
    }
    const focusKeys = t && p.idade <= 27 ? FOCUS_ATTRS[s.focus] : [];
    for (const k of Object.keys(p.attrs) as (keyof Player['attrs'])[]) {
      let d = growth + rng.f(-1.6, 1.6);
      if (growth > 0 && focusKeys.includes(k)) d += 1.1;
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
      continue;
    }
    if (p.teamId === s.userTeam) expirandoUser.push(p.nome);
    p.origem = p.teamId ?? undefined;
    p.teamId = null; p.status = 'RES'; p.contract = undefined;
    s.faPool.push(p);
    s.players = s.players.filter(x => x.id !== p.id);
  }
  if (expirandoUser.length)
    pushNews(s, 'MERCADO', `Contratos encerrados: ${expirandoUser.slice(0, 4).join(', ')}${expirandoUser.length > 4 ? '…' : ''} agora são free agents.`);

  // comissão técnica: contratos expiram (mantidos na franquia no schema atual)
  for (const st of [...s.staff]) {
    st.contrato--;
    if (st.contrato <= 0) st.contrato = 1;
  }

  s.offPhase = 1;
  s.draftState = null;
  pushNews(s, 'OFFSEASON', 'Fim dos playoffs! Offseason em 4 fases: 1) Free Agency → 2) Renovações → 3) Draft → 4) Validação.');
}

/* ---------- offseason guiada ---------- */
export const OFF_PHASES: { n: 1 | 2 | 3 | 4; titulo: string; desc: string }[] = [
  { n: 1, titulo: 'Free Agency', desc: 'O mercado abre: 31 franquias disputam os agentes livres.' },
  { n: 2, titulo: 'Renovações', desc: 'Garanta suas estrelas e sua comissão técnica.' },
  { n: 3, titulo: 'Draft', desc: '7 rodadas para construir o futuro. Ordem pela campanha.' },
  { n: 4, titulo: 'Validação', desc: 'Feche com 53 jogadores e dentro do cap para iniciar.' },
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
  pushNews(s, 'DRAFT', `Ordem definida: ${teamById(s, order[0]).cidade} ${teamById(s, order[0]).nome} escolhe primeiro. Sua posição: ${order.indexOf(s.userTeam) + 1}.`);
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
    score: (bpa ? p.pot * 0.7 + p.ovr * 0.3 : p.pot * 0.4 + p.ovr * 0.3 + need(p.pos) * 22) + Math.random() * 6,
  })).sort((a, b) => b.score - a.score);
  return scored[0].p;
}

function commitPick(s: GameState, p: Player, teamId: string) {
  s.draftClass = s.draftClass.filter(x => x.id !== p.id);
  p.teamId = teamId; p.status = 'RES'; p.contrato = 4; p.contract = undefined;
  p.salario = rookieSalary(p.ovr);
  p.anosNoTime = 0;
  s.players.push(p);
}

function advanceDraft(s: GameState) {
  const d = s.draftState!;
  if (!s.draftClass.length) { d.done = true; pushNews(s, 'DRAFT', 'Classe esgotada — draft encerrado.'); return; }
  d.pick++;
  if (d.pick >= 32) {
    d.pick = 0; d.round++;
    if (d.round > 7) { d.done = true; pushNews(s, 'DRAFT', `Draft encerrado após 7 rodadas.`); return; }
  }
  runAiPicks(s);
}

function runAiPicks(s: GameState, untilUser = false) {
  const d = s.draftState!;
  let guard = 0;
  while (!d.done && s.draftClass.length && guard++ < 400) {
    if (untilUser && d.order[d.pick] === s.userTeam) return;
    const teamId = d.order[d.pick];
    const pick = aiPickFor(s, teamId);
    if (!pick) { d.done = true; break; }
    commitPick(s, pick, teamId);
    d.pick++;
    if (d.pick >= 32) {
      d.pick = 0; d.round++;
      if (d.round > 7) d.done = true;
    }
  }
  if (!d.done && d.order[d.pick] !== s.userTeam && !untilUser) d.done = true;
}

export function userDraftPick(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const d = s.draftState;
  if (!d || d.done) return { ok: false, msg: 'O draft não está em andamento.' };
  if (d.order[d.pick] !== s.userTeam) return { ok: false, msg: 'Não é a sua escolha.' };
  const p = s.draftClass.find(x => x.id === playerId);
  if (!p) return { ok: false, msg: 'Prospecto indisponível.' };
  const ativos = playersOf(s, s.userTeam).filter(x => x.status !== 'PS').length;
  if (ativos >= 53) return { ok: false, msg: 'Elenco cheio (53). Dispense alguém antes de draftar.' };
  commitPick(s, p, s.userTeam);
  pushNews(s, 'DRAFT', `Rodada ${d.round}: ${teamById(s, s.userTeam).sigla} escolhe ${p.nome} (${p.pos}, OVR ${p.ovr}).`);
  advanceDraft(s);
  return { ok: true, msg: `${p.nome} draftado!` };
}
export function autoDraftUntilUser(s: GameState) {
  const d = s.draftState;
  if (!d || d.done) return;
  runAiPicks(s, true);
}
export function autoDraftAll(s: GameState) {
  const d = s.draftState;
  if (!d || d.done) return;
  runAiPicks(s);
  d.done = true;
}

/* ---------- free agency da IA (fim da Fase 1) ---------- */
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
      f.teamId = t.id; f.status = 'RES'; f.origem = undefined; f.contract = undefined;
      f.contrato = rng.int(1, 3);
      f.anosNoTime = 0;
      s.players.push(f);
      space = s.settings.cap - capUsed(s, t.id);
      if (f.ovr >= 76) assinaturas.push(`${t.sigla} contrata ${f.nome} (${f.pos}, OVR ${f.ovr})`);
    }
  }
  if (assinaturas.length)
    pushNews(s, 'FREE AGENCY', `Mercado aquecido: ${assinaturas.slice(0, 3).join('; ')}${assinaturas.length > 3 ? `… e mais ${assinaturas.length - 3}.` : '.'}`);
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

/* ---------- validação e auto-fix ---------- */
export interface RosterCheck { ok: boolean; erros: string[]; }
export function validateRoster(s: GameState): RosterCheck {
  const erros: string[] = [];
  const roster = playersOf(s, s.userTeam);
  const ativos = roster.filter(p => p.status !== 'PS').length;
  const ps = roster.filter(p => p.status === 'PS').length;
  const cap = capUsed(s, s.userTeam);
  if (ativos > 53) erros.push(`Elenco ativo tem ${ativos} jogadores — o máximo é 53. Corte ${ativos - 53}.`);
  if (ativos < 53) erros.push(`Elenco ativo tem ${ativos} jogadores — a liga exige 53. Contrate ${53 - ativos} free agent(s).`);
  if (ps > 10) erros.push(`Practice Squad com ${ps} jogadores — o máximo é 10.`);
  if (cap > s.settings.cap)
    erros.push(`Folha de ${fmtM(cap)} estoura o cap de ${fmtM(s.settings.cap)} em ${fmtM(Math.round((cap - s.settings.cap) * 10) / 10)}.`);
  if (!roster.some(p => p.pos === 'QB' && p.status !== 'PS'))
    erros.push('É preciso ter ao menos 1 QB no elenco ativo.');
  if (!roster.some(p => p.pos === 'K' && p.status !== 'PS'))
    erros.push('É preciso ter ao menos 1 Kicker (K) no elenco ativo.');
  if (!roster.some(p => p.pos === 'P' && p.status !== 'PS'))
    erros.push('É preciso ter ao menos 1 Punter (P) no elenco ativo.');
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
    alvo.teamId = null; alvo.status = 'RES'; alvo.origem = teamId; alvo.contract = undefined;
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
  if (ativos < 53) feitas.push(`elenco em ${ativos}/53 (faltam free agents baratos)`);

  const psJog = playersOf(s, s.userTeam).filter(p => p.status === 'PS').sort((a, b) => a.ovr - b.ovr);
  while (psJog.length > 10) {
    const c = psJog.shift()!;
    s.players = s.players.filter(x => x.id !== c.id);
    c.teamId = null; s.faPool.push(c);
    feitas.push('1 corte no Practice Squad');
  }
  return { msg: feitas.length ? `Auto-Fix: ${feitas.join(', ')}.` : 'Auto-Fix: nada a ajustar — elenco e cap em ordem.' };
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
  t.tactics.corrida = clamp(corrida, 5, 95);
  t.tactics.agressividade = clamp(agressividade, 0, 100);
}

export function upgrade(s: GameState, kind: 'estadio' | 'centroTreino'): { ok: boolean; msg: string } {
  const t = teamById(s, s.userTeam);
  const nivel = t[kind];
  if (nivel >= 5) return { ok: false, msg: 'Estrutura já está no nível máximo.' };
  const custo = 15 + nivel * 10;
  if (t.dinheiro < custo) return { ok: false, msg: `Caixa insuficiente: precisa de ${fmtM(custo)}, tem ${fmtM(t.dinheiro)}.` };
  t.dinheiro = Math.round((t.dinheiro - custo) * 10) / 10;
  t[kind] = nivel + 1;
  pushNews(s, 'ESTRUTURA', `${t.cidade} ${t.nome} ${kind === 'estadio' ? 'reforma o estádio' : 'moderniza o centro de treinamento'} (nível ${nivel + 1}).`);
  return { ok: true, msg: `${kind === 'estadio' ? 'Estádio' : 'Centro de treinamento'} agora no nível ${nivel + 1}.` };
}

export function canSign(s: GameState, p: Player): { ok: boolean; motivo: string } {
  const ativos = playersOf(s, s.userTeam).filter(x => x.status !== 'PS').length;
  if (ativos >= 53) return { ok: false, motivo: 'Elenco cheio (53). Dispense alguém antes.' };
  const cap = capUsed(s, s.userTeam) + capHitOf(p);
  if (cap > s.settings.cap) return { ok: false, motivo: `Estouraria o cap (${fmtM(cap)} > ${fmtM(s.settings.cap)}).` };
  return { ok: true, motivo: '' };
}

export function signFA(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.faPool.find(x => x.id === playerId);
  if (!p) return { ok: false, msg: 'Jogador indisponível.' };
  const chk = canSign(s, p);
  if (!chk.ok) return { ok: false, msg: chk.motivo };
  s.faPool = s.faPool.filter(x => x.id !== playerId);
  p.teamId = s.userTeam; p.status = 'RES'; p.origem = undefined;
  p.moral = clamp(p.moral + 12, 25, 95);
  s.players.push(p);
  const t = teamById(s, s.userTeam);
  pushNews(s, 'CONTRATAÇÃO', `${t.cidade} ${t.nome} contrata ${p.nome} (${p.pos}, OVR ${p.ovr}) por ${fmtM(p.salario)}/ano.`);
  return { ok: true, msg: `${p.nome} contratado!` };
}

export function releasePlayer(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam) return { ok: false, msg: 'Jogador inválido.' };
  if (p.tag) return { ok: false, msg: 'Jogador com franchise tag não pode ser dispensado.' };
  s.players = s.players.filter(x => x.id !== playerId);
  p.teamId = null; p.status = 'RES'; p.origem = s.userTeam; p.contract = undefined;
  s.faPool.push(p);
  return { ok: true, msg: `${p.nome} dispensado — agora é free agent.` };
}

export function applyTag(s: GameState, playerId: string): boolean {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam || p.contrato !== 1 || p.tag) return false;
  p.tag = true;
  pushNews(s, 'FRANCHISE TAG', `${p.nome} recebe a franchise tag: garantido por mais 1 temporada.`);
  return true;
}

/* ---------- negociações (jogadores) ---------- */
export function negotiateContract(s: GameState, playerId: string, offer: ContractOffer): { ok: boolean; msg: string } {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam) {
    const fa = s.faPool.find(x => x.id === playerId);
    if (!fa) return { ok: false, msg: 'Jogador inválido.' };
    return signFAWithOffer(s, fa, offer);
  }
  if (p.contrato > 2) return { ok: false, msg: 'Renovação antecipada vale para contratos com ≤2 anos restantes.' };
  if (p.tag) return { ok: false, msg: 'Jogador com franchise tag — a tag já garante 1 ano.' };
  const rng = new Rng(newSeed());
  const hap = playerHappiness(p, offer, s.settings.inflacao);
  const ativos = playersOf(s, s.userTeam).filter(x => x.status !== 'PS').length;
  const novoCap = capUsed(s, s.userTeam) - capHitOf(p) + offer.base + offer.bonus / Math.max(1, offer.years);
  if (novoCap > s.settings.cap) return { ok: false, msg: `A oferta estouraria o cap (${fmtM(novoCap)}).` };
  if (!acceptanceRoll(hap.value, rng))
    return { ok: false, msg: `Recusada! ${p.nome} quer se aproximar do pedido (${fmtM(playerExpectations(p, s.settings.inflacao).aav)}/ano). Felicidade: ${hap.value}%.` };
  p.contract = makeContract(offer);
  p.salario = offer.base; p.contrato = offer.years; p.tag = false;
  p.moral = clamp(p.moral + 8, 25, 95);
  void ativos;
  pushNews(s, 'RENOVAÇÃO', `${p.nome} (${p.pos}, OVR ${p.ovr}) renova: ${offer.years} ano(s) ${STRUCT_LABEL[offer.structure]}, ${fmtM(offer.base)}/ano + ${fmtM(offer.bonus)} de luvas.`);
  return { ok: true, msg: `✍️ ${p.nome} renovou! (${hap.value}% de felicidade)` };
}

export function signFAWithOffer(s: GameState, p: Player, offer: ContractOffer): { ok: boolean; msg: string } {
  const chk = canSign(s, p);
  if (!chk.ok) return { ok: false, msg: chk.motivo };
  const rng = new Rng(newSeed());
  const hap = playerHappiness(p, offer, s.settings.inflacao);
  if (!acceptanceRoll(hap.value, rng))
    return { ok: false, msg: `Recusada! ${p.nome} pede ~${fmtM(playerExpectations(p, s.settings.inflacao).aav)}/ano. Felicidade: ${hap.value}%.` };
  s.faPool = s.faPool.filter(x => x.id !== p.id);
  p.teamId = s.userTeam; p.status = 'RES'; p.origem = undefined;
  p.contract = makeContract(offer);
  p.salario = offer.base; p.contrato = offer.years;
  p.anosNoTime = 0;
  p.moral = clamp(p.moral + 12, 25, 95);
  s.players.push(p);
  pushNews(s, 'CONTRATAÇÃO', `${teamById(s, s.userTeam).sigla} contrata ${p.nome} (${p.pos}, OVR ${p.ovr}): ${offer.years} ano(s) ${STRUCT_LABEL[offer.structure]}, ${fmtM(offer.base)}/ano.`);
  return { ok: true, msg: `✍️ ${p.nome} contratado!` };
}

/* ---------- comissão técnica ---------- */
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

/* ================= nova temporada ================= */
export function newSeason(prev: GameState, buildWorld: (s: GameState, rng: Rng, ranks: RankMap) => { matches: Match[]; draftClass: Player[] }): GameState {
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
    p.moral = 75;
  }
  for (const t of s.teams) t.moral = 75;

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
  for (const t of s.teams) {
    const cortados = enforceCapCompliance(s, t.id);
    if (cortados.length && t.id === s.userTeam) {
      const pior = [...cortados].sort((a, b) => b.ovr - a.ovr)[0];
      pushNews(s, 'CAP', `Sua franquia iniciou acima do teto e cortou ${cortados.length} jogador(es), incluindo ${pior.nome}.`);
    }
  }

  pushNews(s, 'ECONOMIA', `Acordo de TV rende $${s.settings.tvDeal.toFixed(1).replace('.', ',')}B/ano: cap sobe ${crescimento.toFixed(1).replace('.', ',')}% e vai a ${fmtM(s.settings.cap)}.`);
  pushNews(s, 'TEMPORADA', `Temporada ${s.settings.temporada} começa! Calendário oficial: 17 jogos em 18 semanas.`);
  s.settings.tvGrowth = novaProjecao;
  return s;
}

void POS_ORDER; void salaryFor; void genName;
