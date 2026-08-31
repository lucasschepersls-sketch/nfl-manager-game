/* ============================================================
 * Sistema de Votação do Pro Bowl
 * Votos semanais (fãs 75% · jogadores 25% · técnicos 25%),
 * 4 fatores: performance da semana (40%) + stats da temporada
 * (35%) + rating (15%) + reputação (10%). Bônus de momentum
 * (+25%) em semanas excepcionais. Seleção final: líder de cada
 * posição por conferência (titular) + 3 reservas por posição.
 * ============================================================ */

import type { Conf, GameState, Pos, ProBowlState, ProBowlVote, RichBox, Team } from './types';
import { Rng } from './rng';
import { passerRating } from './seasonStats';

/** Box rico acompanhado dos IDs das franquias (casa × fora). */
export interface WeekBox { casaId: string; foraId: string; rich: RichBox; }

const teamOf = (s: GameState, id: string): Team | null => s.teams.find(t => t.id === id) ?? null;

/** Posições que participam da votação (com titulares no jogo do Pro Bowl). */
export const PROBOWL_POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
/** Posições com reservas na seleção final. */
const RESERVE_POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'CB', 'S'];

export const emptyProBowl = (season: number): ProBowlState => ({
  season, lastWeek: 0, votes: [], userFanVote: null, announced: false,
});

/* ---------- FATOR 1: performance da SEMANA (peso 40%) ---------- */
interface WeekLine {
  cmp: number; att: number; py: number; ptd: number; int: number;
  car: number; ry: number; rtd: number;
  rec: number; recYds: number; recTD: number;
  tackles: number; sacks: number; intDef: number; ff: number;
  fgM: number; fgT: number;
}
const zl = (): WeekLine => ({
  cmp: 0, att: 0, py: 0, ptd: 0, int: 0, car: 0, ry: 0, rtd: 0,
  rec: 0, recYds: 0, recTD: 0, tackles: 0, sacks: 0, intDef: 0, ff: 0, fgM: 0, fgT: 0,
});

export function weeklyPerformance(pos: Pos, w: WeekLine, ovr: number, teamYds: number): number {
  switch (pos) {
    case 'QB': {
      const rating = passerRating(w.cmp, w.att, w.py, w.ptd, w.int);
      return Math.max(0, rating + w.py * 0.05 + w.ptd * 15 - w.int * 10);
    }
    case 'RB': {
      const total = w.ry + w.recYds;
      const ypc = w.ry / Math.max(1, w.car);
      return total + ypc * 10 + w.rtd * 20 + w.recTD * 15;
    }
    case 'WR':
    case 'TE':
      return w.rec * 5 + w.recYds + w.recTD * 25;
    case 'OL':
      return ovr * 0.6 + teamYds * 0.015;
    case 'DL':
    case 'LB':
    case 'CB':
    case 'S':
      return w.tackles * 2 + w.sacks * 10 + w.intDef * 15 + w.ff * 10;
    case 'K':
      return w.fgM * 10 + (w.fgT > 0 ? (w.fgM / w.fgT) * 100 * 0.5 : 0);
    case 'P':
      return ovr * 0.4;
  }
}

/* ---------- FATOR 2: stats acumuladas da TEMPORADA (peso 35%) ---------- */
function seasonScore(pos: Pos, s: GameState, playerId: string): number {
  const p = s.players.find(x => x.id === playerId);
  if (!p) return 0;
  const st = p.stats;
  const g = Math.max(1, st.jogos);
  switch (pos) {
    case 'QB': {
      const ypg = st.py / g;
      const tdp = st.ptd / g;
      const intRatio = st.int / Math.max(1, st.att);
      return ypg * 0.5 + tdp * 30 - intRatio * 100;
    }
    case 'RB':
      return ((st.ry + st.recYds) / g) * 0.6 + ((st.rtd + st.recTD) / g) * 25;
    case 'WR':
    case 'TE':
      return (st.recYds / g) * 0.5 + (st.rec / g) * 10 + (st.recTD / g) * 25;
    case 'OL':
      return p.ovr * 0.5;
    case 'DL':
    case 'LB':
    case 'CB':
    case 'S':
      return (st.tackles / g) * 3 + (st.sacks / g) * 25 + (st.intDef / g) * 30 + (st.ff / g) * 12;
    case 'K':
      return (st.fgM / g) * 20 + (st.fgT > 0 ? (st.fgM / st.fgT) * 50 : 0);
    case 'P':
      return p.ovr * 0.35;
  }
}

/* ---------- momentum: semana excepcional → +25% nos votos ---------- */
function hasMomentum(pos: Pos, w: WeekLine): boolean {
  const yds = w.py + w.ry + w.recYds;
  const tds = w.ptd + w.rtd + w.recTD;
  if (pos === 'QB') return yds >= 350 || tds >= 4;
  if (pos === 'RB' || pos === 'WR' || pos === 'TE') return yds >= 200 || tds >= 3;
  if (pos === 'DL' || pos === 'LB' || pos === 'CB' || pos === 'S') return w.sacks >= 2 || w.intDef >= 2 || w.tackles >= 12;
  if (pos === 'K') return w.fgM >= 4;
  return false;
}

/* ---------- votação semanal (chamada após cada semana da temporada regular) ---------- */
export function runWeeklyProBowlVoting(s: GameState, week: number, boxes: WeekBox[]): void {
  if (s.probowl.lastWeek >= week) return; // já processada
  const rng = new Rng(week * 7919 + s.settings.temporada);

  // linhas da semana por jogador + jardas do time de cada um
  const weekLines = new Map<string, WeekLine>();
  const teamYdsOf = new Map<string, number>();
  for (const { casaId, foraId, rich } of boxes) {
    teamYdsOf.set(casaId, rich.casa.yds);
    teamYdsOf.set(foraId, rich.fora.yds);
    for (const l of rich.lines) {
      const w = weekLines.get(l.id) ?? zl();
      w.cmp += l.cmp ?? 0; w.att += l.att ?? 0; w.py += l.py ?? 0;
      w.ptd += l.ptd ?? 0; w.int += l.int ?? 0;
      w.car += l.rAtt ?? 0; w.ry += l.ry ?? 0; w.rtd += l.rtd ?? 0;
      w.rec += l.rec ?? 0; w.recYds += l.recYds ?? 0; w.recTD += l.recTD ?? 0;
      w.tackles += l.tackles ?? 0; w.sacks += l.sacks ?? 0;
      w.intDef += l.intDef ?? 0; w.ff += l.ff ?? 0;
      w.fgM += l.fgM ?? 0; w.fgT += l.fgT ?? 0;
      weekLines.set(l.id, w);
    }
  }

  const tm = new Map(s.teams.map(t => [t.id, t]));
  const stRows = standingsFast(s);
  let votados = 0;

  for (const p of s.players) {
    if (!p.teamId || !PROBOWL_POSITIONS.includes(p.pos)) continue;
    const w = weekLines.get(p.id);
    if (!w && p.stats.jogos === 0) continue;
    const wl = w ?? zl();
    const team = tm.get(p.teamId);
    const wins = team ? (stRows.get(p.teamId)?.v ?? 0) : 0;

    // FATOR 1–4
    const f1 = weeklyPerformance(p.pos, wl, p.ovr, team ? (teamYdsOf.get(p.teamId) ?? 0) : 0);
    const f2 = seasonScore(p.pos, s, p.id);
    const f3 = p.ovr * 1.5;
    const f4 = (p.jogosCarreira / 17) * 8 + wins * 5;
    let total = f1 * 0.40 + f2 * 0.35 + f3 * 0.15 + f4 * 0.10;
    if (total <= 0) continue;

    const momentum = w ? hasMomentum(p.pos, wl) : false;
    if (momentum) total *= 1.25;

    // conversão em votos (escala p/ números realistas de milhares)
    const fan = Math.round(total * 25 * rng.f(0.8, 1.2));
    const pl = Math.round(total * 0.6 * 8 * rng.f(0.7, 1.0));
    const co = Math.round(total * 0.6 * 8 * rng.f(0.7, 1.0));

    let v = s.probowl.votes.find(x => x.playerId === p.id);
    if (!v) {
      v = {
        playerId: p.id, season: s.settings.temporada, week,
        fanVotes: 0, playerVotes: 0, coachVotes: 0, totalWeighted: 0,
        rankInPosition: 0, momentum: false,
        summary: { yards: 0, tds: 0, rating: p.ovr },
      };
      s.probowl.votes.push(v);
    }
    v.fanVotes += fan; v.playerVotes += pl; v.coachVotes += co;
    v.totalWeighted = Math.round(v.fanVotes * 0.75 + v.playerVotes * 0.25 + v.coachVotes * 0.25);
    v.week = week;
    v.momentum = momentum;
    v.summary = {
      yards: p.stats.py + p.stats.ry + p.stats.recYds,
      tds: p.stats.ptd + p.stats.rtd + p.stats.recTD,
      rating: p.pos === 'QB' ? passerRating(p.stats.cmp, p.stats.att, p.stats.py, p.stats.ptd, p.stats.int) : p.ovr,
    };
    votados++;
  }

  updateRankings(s);
  s.probowl.lastWeek = week;
  if (votados > 0) {
    pushNewsPb(s, 'PRO BOWL', `Votação da semana ${week} encerrada: ${votados} jogadores receberam votos. Acompanhe o Top 10 de cada posição.`);
  }
}

/* ---------- ranking por posição ---------- */
export function updateRankings(s: GameState): void {
  for (const pos of PROBOWL_POSITIONS) {
    const ids = new Set(
      s.players.filter(p => p.pos === pos && p.teamId).map(p => p.id),
    );
    const group = s.probowl.votes
      .filter(v => ids.has(v.playerId))
      .sort((a, b) => b.totalWeighted - a.totalWeighted);
    group.forEach((v, i) => { v.rankInPosition = i + 1; });
  }
}

/* ---------- voto do fã (usuário): 1 por semana, +2.500 votos ---------- */
export function castFanVote(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const week = s.settings.fase === 'REG' ? s.settings.semana : s.probowl.lastWeek;
  if (week < 1) return { ok: false, msg: 'A votação começa na semana 1 da temporada regular.' };
  if (s.probowl.announced) return { ok: false, msg: 'Votação encerrada — o roster do Pro Bowl já foi anunciado.' };
  if (s.probowl.userFanVote?.week === week)
    return { ok: false, msg: 'Você já votou nesta semana. Novo voto na próxima semana.' };
  const v = s.probowl.votes.find(x => x.playerId === playerId);
  if (!v) return { ok: false, msg: 'Jogador ainda não entrou na votação.' };
  v.fanVotes += 2500;
  v.totalWeighted = Math.round(v.fanVotes * 0.75 + v.playerVotes * 0.25 + v.coachVotes * 0.25);
  s.probowl.userFanVote = { week, playerId };
  updateRankings(s);
  return { ok: true, msg: '🗳️ Voto computado! +2.500 votos de fã.' };
}

/* ---------- seleção final (fim da temporada regular) ---------- */
export function selectProBowlRoster(s: GameState): void {
  if (s.probowl.announced) return;
  const tm = new Map(s.teams.map(t => [t.id, t]));
  const byPosConf = (pos: Pos, conf: Conf) =>
    s.probowl.votes
      .filter(v => {
        const p = s.players.find(x => x.id === v.playerId);
        return p && p.pos === pos && p.teamId && tm.get(p.teamId)?.conf === conf;
      })
      .sort((a, b) => b.totalWeighted - a.totalWeighted);

  let titulares = 0;
  for (const pos of PROBOWL_POSITIONS) {
    for (const conf of ['AFC', 'NFC'] as Conf[]) {
      const leader = byPosConf(pos, conf)[0];
      if (leader) { leader.isStarter = true; titulares++; }
    }
  }
  let reservas = 0;
  for (const pos of RESERVE_POSITIONS) {
    const resto = s.probowl.votes
      .filter(v => {
        const p = s.players.find(x => x.id === v.playerId);
        return p && p.pos === pos && !v.isStarter;
      })
      .sort((a, b) => b.totalWeighted - a.totalWeighted)
      .slice(0, 3);
    for (const r of resto) { r.isReserve = true; reservas++; }
  }
  s.probowl.announced = true;
  pushNewsPb(s, 'PRO BOWL', `Roster anunciado! ${titulares} titulares (líderes por posição/conferência) e ${reservas} reservas representarão a liga no Pro Bowl.`);
}

/** Roster final organizado: AFC × NFC, titulares primeiro. */
export function proBowlRoster(s: GameState): { afc: ProBowlVote[]; nfc: ProBowlVote[] } {
  const tm = new Map(s.teams.map(t => [t.id, t]));
  const picked = s.probowl.votes.filter(v => v.isStarter || v.isReserve);
  const conf = (v: ProBowlVote): Conf | null => {
    const p = s.players.find(x => x.id === v.playerId);
    if (!p || !p.teamId) return null;
    return tm.get(p.teamId)?.conf ?? null;
  };
  const ord = (a: ProBowlVote, b: ProBowlVote) => {
    const pa = s.players.find(x => x.id === a.playerId)!;
    const pb = s.players.find(x => x.id === b.playerId)!;
    const pi = PROBOWL_POSITIONS.indexOf(pa.pos) - PROBOWL_POSITIONS.indexOf(pb.pos);
    if (pi !== 0) return pi;
    return Number(b.isStarter ?? false) - Number(a.isStarter ?? false);
  };
  return {
    afc: picked.filter(v => conf(v) === 'AFC').sort(ord),
    nfc: picked.filter(v => conf(v) === 'NFC').sort(ord),
  };
}

/* ---------- helpers ---------- */
function standingsFast(s: GameState): Map<string, { v: number }> {
  const m = new Map(s.teams.map(t => [t.id, { v: 0 }]));
  for (const mt of s.matches) {
    if (mt.fase !== 'REG' || !mt.jogada || mt.placarCasa == null || mt.placarFora == null) continue;
    if (mt.placarCasa > mt.placarFora) m.get(mt.casa)!.v++;
    else if (mt.placarFora > mt.placarCasa) m.get(mt.fora)!.v++;
  }
  return m;
}

function pushNewsPb(s: GameState, rotulo: string, texto: string): void {
  s.news.unshift({ id: Date.now() + Math.floor(Math.random() * 9999), rotulo, texto });
}

/** Time do jogador (para a UI). */
export function voteTeam(s: GameState, v: ProBowlVote): Team | null {
  const p = s.players.find(x => x.id === v.playerId);
  return p?.teamId ? teamOf(s, p.teamId) : null;
}

export function votePlayer(s: GameState, v: ProBowlVote) {
  return s.players.find(x => x.id === v.playerId) ?? null;
}

export const fmtVotes = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2).replace('.', ',')}M`
    : n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} mil`
      : String(n);
