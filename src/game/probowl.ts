/* ============================================================
 * 🏆 Pro Bowl — votação semanal (fãs 75% + jogadores 25% + técnicos 25%).
 * ============================================================ */

import type { GameState, Player, Pos, ProBowlState, RichBox } from './types';
import { Rng, clamp } from './rng';
import { passerRatingOf } from './seasonStats';

export type WeekBox = RichBox;

export const emptyProBowl = (season: number): ProBowlState => ({
  season, lastWeek: 0, votes: [], userFanVote: null, announced: false,
});

/** Votos semanais baseados na performance da semana + rating + momentum. */
export function runWeeklyProBowlVoting(s: GameState, week: number, boxes: WeekBox[]): void {
  if (s.probowl.lastWeek >= week) return;
  const rng = new Rng(week * 7919 + s.settings.temporada);
  const performance = new Map<string, number>();
  const momentum = new Set<string>();

  for (const box of boxes) {
    for (const l of box.lines) {
      const score = (l.py ?? 0) + 25 * (l.ptd ?? 0) - 30 * (l.int ?? 0)
        + (l.ry ?? 0) + 20 * (l.rtd ?? 0) + (l.recYds ?? 0) + 20 * (l.recTD ?? 0)
        + 10 * (l.sacks ?? 0) + 3 * (l.tackles ?? 0) + 45 * (l.intDef ?? 0) + 15 * (l.fgM ?? 0);
      performance.set(l.id, (performance.get(l.id) ?? 0) + score);
      const p = s.players.find(x => x.id === l.id);
      if (p && score >= 60) momentum.add(l.id);
    }
  }

  for (const p of s.players) {
    if (!p.teamId) continue;
    const perf = performance.get(p.id) ?? 0;
    if (perf <= 0 && p.ovr < 80) continue;
    const ratingBonus = p.ovr * 1.2;
    const momentumBonus = momentum.has(p.id) ? 40 : 0;
    const total = perf + ratingBonus + momentumBonus;
    if (total <= 0) continue;

    let vote = s.probowl.votes.find(v => v.playerId === p.id && v.season === s.settings.temporada);
    if (!vote) {
      vote = {
        playerId: p.id, season: s.settings.temporada, week,
        fanVotes: 0, playerVotes: 0, coachVotes: 0, totalWeighted: 0,
        rankInPosition: 0, momentum: false,
        summary: { yards: 0, tds: 0, rating: 0 },
      };
      s.probowl.votes.push(vote);
    }
    const fan = Math.round(total * rng.f(0.8, 1.2));
    const pl = Math.round(total * 0.6 * rng.f(0.7, 1.0));
    const co = Math.round(total * 0.6 * rng.f(0.7, 1.0));
    vote.fanVotes += fan;
    vote.playerVotes += pl;
    vote.coachVotes += co;
    vote.totalWeighted = Math.round(vote.fanVotes * 0.75 + vote.playerVotes * 0.25 + vote.coachVotes * 0.25);
    vote.week = week;
    vote.momentum = momentum.has(p.id);
    vote.summary = {
      yards: p.stats.py + p.stats.ry + p.stats.recYds,
      tds: p.stats.ptd + p.stats.rtd + p.stats.recTD,
      rating: p.pos === 'QB' ? passerRatingOf(p) : p.ovr,
    };
  }

  // ranking por posição
  const byPos = new Map<Pos, typeof s.probowl.votes>();
  for (const v of s.probowl.votes) {
    if (v.season !== s.settings.temporada) continue;
    const p = s.players.find(x => x.id === v.playerId);
    if (!p) continue;
    if (!byPos.has(p.pos)) byPos.set(p.pos, []);
    byPos.get(p.pos)!.push(v);
  }
  for (const [, votes] of byPos) {
    votes.sort((a, b) => b.totalWeighted - a.totalWeighted);
    votes.forEach((v, i) => { v.rankInPosition = i + 1; });
  }

  s.probowl.lastWeek = week;
}

/** Voto do usuário (1 por semana). */
export function castFanVote(s: GameState, playerId: string): { ok: boolean; msg: string } {
  const week = s.settings.semana;
  if (s.probowl.userFanVote?.week === week) return { ok: false, msg: 'Você já votou nesta semana.' };
  const vote = s.probowl.votes.find(v => v.playerId === playerId && v.season === s.settings.temporada);
  if (!vote) return { ok: false, msg: 'Este jogador ainda não entrou na votação.' };
  vote.fanVotes += 5000;
  vote.totalWeighted = Math.round(vote.fanVotes * 0.75 + vote.playerVotes * 0.25 + vote.coachVotes * 0.25);
  s.probowl.userFanVote = { week, playerId };
  return { ok: true, msg: 'Voto computado! +5000 votos de fã.' };
}

/** Seleção final: líder de cada posição por conferência (titular) + reservas. */
export function selectProBowlRoster(s: GameState): void {
  if (s.probowl.announced) return;
  const teamConf = new Map(s.teams.map(t => [t.id, t.conf]));
  const seasonVotes = s.probowl.votes.filter(v => v.season === s.settings.temporada);
  const positions: Pos[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

  for (const pos of positions) {
    for (const conf of ['AFC', 'NFC'] as const) {
      const candidates = seasonVotes
        .filter(v => {
          const p = s.players.find(x => x.id === v.playerId);
          return p && p.pos === pos && p.teamId && teamConf.get(p.teamId) === conf;
        })
        .sort((a, b) => b.totalWeighted - a.totalWeighted);
      if (candidates[0]) candidates[0].isStarter = true;
      for (const r of candidates.slice(1, 4)) r.isReserve = true;
    }
  }
  s.probowl.announced = true;
}

export const probowlVotes = (s: GameState) =>
  s.probowl.votes.filter(v => v.season === s.settings.temporada);
