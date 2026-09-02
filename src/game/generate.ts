/* ============================================================
 * Geração de mundo: 32 franquias, elencos 53 + practice squad,
 * comissão técnica (contratada + mercado), free agents, classe
 * do draft e calendário oficial de 17 jogos.
 * ============================================================ */

import type { Attrs, GameState, Match, Player, Pos, Staff, StaffRole, Team } from './types';
import { zeroStats } from './types';
import { Rng, clamp } from './rng';
import {
  CAP_BASE, ROSTER_COUNTS, STARTER_SLOTS, TEAMS_DEF,
  genName, rookieSalary, salaryFor, computeOvr,
} from './data';
import { generateNFLSchedule, initialRanks, type RankMap, type SchedTeam } from './season';

let uid = 0;
const nid = (p: string) => `${p}${++uid}`;

const ATTR_LIST: (keyof Attrs)[] = ['passe', 'corrida', 'recepcao', 'bloqueio', 'tackle', 'chute', 'velocidade', 'resistencia'];

function genAttrs(q: number, rng: Rng): Attrs {
  const a = {} as Attrs;
  for (const k of ATTR_LIST) a[k] = Math.round(clamp((46 + rng.f(0, 46)) * q, 28, 95));
  return a;
}

export function mkPlayer(pos: Pos, q: number, idade: number, teamId: string | null, rng: Rng, opts?: Partial<Player>): Player {
  const attrs = genAttrs(q, rng);
  if (pos === 'QB') attrs.passe = clamp(attrs.passe + rng.int(3, 9), 28, 96);
  const ovr = computeOvr(pos, attrs);
  return {
    id: nid('p'), teamId, nome: genName(rng), pos, idade,
    attrs, ovr,
    pot: Math.min(97, ovr + rng.int(idade < 25 ? 4 : 0, idade < 25 ? 20 : 6)),
    salario: salaryFor(ovr, rng),
    bonus: 0,
    contrato: rng.weighted([1, 2, 3, 4, 5], [22, 28, 25, 15, 10]),
    jogosCarreira: rng.int(0, 60),
    status: 'RES', lesao: 0, lesaoTipo: null,
    moral: rng.int(55, 78), tag: false, rookie: false,
    stats: zeroStats(),
    ...opts,
  };
}

function buildRoster(team: Team, forca: number, rng: Rng): Player[] {
  const base = (57 + forca * 3.4 + rng.f(0, 4)) / 75;
  const out: Player[] = [];
  for (const [pos, count] of ROSTER_COUNTS) {
    const slots = STARTER_SLOTS[pos] ?? 1;
    for (let i = 0; i < count; i++) {
      const tit = i < slots;
      const q = tit ? base * rng.f(1.1, 1.24) : base * rng.f(0.85, 1.02);
      const idade = tit ? rng.int(24, 32) : rng.int(22, 29);
      out.push(mkPlayer(pos, q, clamp(idade, 22, 38), team.id, rng, { status: tit ? 'TIT' : 'RES' }));
    }
  }
  const psPos: Pos[] = ['QB', 'RB', 'WR', 'WR', 'OL', 'OL', 'DL', 'LB', 'CB', 'S'];
  for (let i = 0; i < psPos.length; i++) {
    out.push(mkPlayer(psPos[i], base * rng.f(0.62, 0.76), rng.int(22, 23), team.id, rng, {
      status: 'PS', contrato: rng.weighted([1, 2], [60, 40]), jogosCarreira: 0,
    }));
  }
  return out;
}

const STAFF_ROLES: StaffRole[] = ['Head Coach', 'Coordenador Ofensivo', 'Coordenador Defensivo', 'Médico', 'Preparador Físico', 'Olheiro'];

function buildStaff(team: Team, rng: Rng): Staff[] {
  return STAFF_ROLES.map(f => ({
    id: nid('st'), teamId: team.id, nome: genName(rng), funcao: f,
    nivel: Math.min(5, Math.max(1, rng.int(2, 3) + (team.estadio >= 4 ? 1 : 0))),
    experiencia: rng.int(3, 25),
    salario: Math.round(rng.f(1.5, 8) * 10) / 10,
    bonus: 0,
    contrato: rng.weighted([1, 2, 3], [40, 40, 20]),
    moral: rng.int(60, 80),
  }));
}

function buildStaffPool(rng: Rng): Staff[] {
  const out: Staff[] = [];
  const roles: StaffRole[] = ['Coordenador Ofensivo', 'Coordenador Defensivo', 'Médico', 'Preparador Físico', 'Olheiro', 'Olheiro', 'Coordenador Ofensivo', 'Coordenador Defensivo'];
  for (const f of roles) {
    out.push({
      id: nid('stp'), teamId: null, nome: genName(rng), funcao: f,
      nivel: rng.int(2, 5), experiencia: rng.int(2, 20),
      salario: Math.round(rng.f(1, 6) * 10) / 10, bonus: 0,
      contrato: 1, moral: rng.int(60, 75),
    });
  }
  return out;
}

export const COLLEGES = [
  'Alabama', 'Ohio State', 'Georgia', 'Michigan', 'Clemson', 'LSU', 'Oklahoma',
  'Notre Dame', 'Florida State', 'Oregon', 'Penn State', 'Washington', 'Texas',
];

export function buildDraftClass(rng: Rng): Player[] {
  const dist: [Pos, number][] = [
    ['QB', 14], ['RB', 18], ['WR', 30], ['TE', 12], ['OL', 40],
    ['DL', 34], ['LB', 20], ['CB', 22], ['S', 16], ['K', 7], ['P', 7],
  ];
  const out: Player[] = [];
  for (const [pos, n] of dist) {
    for (let i = 0; i < n; i++) {
      const alvo = Math.round(48 + Math.pow(rng.next(), 1.5) * 34);
      const p = mkPlayer(pos, alvo / 75, pos === 'K' || pos === 'P' ? rng.int(22, 23) : rng.int(21, 22), null, rng, {
        contrato: 4, salario: rookieSalary(alvo), rookie: true, jogosCarreira: 0,
      });
      p.pot = Math.min(97, p.ovr + rng.int(8, 26));
      (p as unknown as { college?: string }).college = rng.pick(COLLEGES);
      out.push(p);
    }
  }
  return rng.shuffle(out);
}

function buildFaPool(rng: Rng): Player[] {
  const pos: Pos[] = ['QB', 'QB', 'RB', 'RB', 'RB', 'WR', 'WR', 'WR', 'WR', 'WR', 'TE', 'TE', 'OL', 'OL', 'OL', 'OL', 'OL', 'OL',
    'DL', 'DL', 'DL', 'DL', 'DL', 'LB', 'LB', 'LB', 'LB', 'CB', 'CB', 'CB', 'CB', 'S', 'S', 'S', 'K', 'P'];
  return pos.map(p => mkPlayer(p, rng.f(0.74, 1.04), rng.int(24, 33), null, rng, {
    status: 'RES', contrato: rng.weighted([1, 2, 3], [50, 35, 15]),
  }));
}

function buildPreseason(rng: Rng): Match[] {
  const ms: Match[] = [];
  const ids = TEAMS_DEF.map(t => t.sigla.toLowerCase());
  for (const rodada of [1, 2]) {
    const all = rng.shuffle(ids);
    for (let i = 0; i < 16; i++) {
      ms.push({ id: `pre-${rodada}-${i}`, fase: 'PRE', rodada, casa: all[i * 2], fora: all[i * 2 + 1], placarCasa: null, placarFora: null, jogada: false });
    }
  }
  return ms;
}

/** Mundo para uma NOVA temporada (usado por newSeason). */
export function buildWorld(s: GameState, rng: Rng, ranks: RankMap): { matches: Match[]; draftClass: Player[]; staffPool: Staff[] } {
  const schedTeams: SchedTeam[] = s.teams.map(t => ({ id: t.id, conf: t.conf, div: t.div }));
  return {
    matches: [...buildPreseason(rng), ...generateNFLSchedule(schedTeams, s.settings.temporada, ranks, rng)],
    draftClass: buildDraftClass(rng),
    staffPool: buildStaffPool(rng),
  };
}

/** Jogo novo (temporada inicial). */
export function newGame(userTeamId: string, seed: number): GameState {
  uid = 0;
  const rng = new Rng(seed);

  const teams: Team[] = TEAMS_DEF.map(d => ({
    id: d.sigla.toLowerCase(),
    cidade: d.cidade, nome: d.nome, sigla: d.sigla,
    cor: d.cor, cor2: d.cor2, conf: d.conf, div: d.div,
    estadioNome: d.estadio,
    hostilidade: d.hostilidade ?? 65,
    histCampanha: [d.camp ?? 0.5, d.camp ?? 0.5, d.camp ?? 0.5],
    dinheiro: Math.round(20 + d.forca * 6 + rng.f(0, 20)),
    moral: rng.int(58, 70),
    estadio: Math.min(5, Math.max(1, d.forca + rng.int(-1, 1))),
    centroTreino: Math.min(5, Math.max(1, d.forca + rng.int(-1, 1))),
    tactics: { corrida: d.sigla.toLowerCase() === userTeamId ? 44 : rng.int(38, 55), agressividade: rng.int(35, 70) },
  }));

  const players: Player[] = [];
  const staff: Staff[] = [];
  TEAMS_DEF.forEach((d, i) => {
    players.push(...buildRoster(teams[i], d.forca, rng));
    staff.push(...buildStaff(teams[i], rng));
  });

  // normaliza a folha para ~90% do cap (todos começam dentro do teto)
  const TARGET = 0.9;
  for (const t of teams) {
    const roster = players.filter(p => p.teamId === t.id);
    const total = roster.reduce((s, p) => s + p.salario + (p.bonus > 0 && p.contrato > 0 ? p.bonus / p.contrato : 0), 0);
    if (total > CAP_BASE * TARGET) {
      const f = (CAP_BASE * TARGET) / total;
      for (const p of roster) p.salario = Math.max(0.6, Math.round(p.salario * f * 10) / 10);
    }
  }

  const ranks = initialRanks(TEAMS_DEF.map(d => ({ id: d.sigla.toLowerCase(), conf: d.conf, div: d.div, s: d.forca })), rng);
  const schedTeams: SchedTeam[] = teams.map(t => ({ id: t.id, conf: t.conf, div: t.div }));
  const matches = [...buildPreseason(rng), ...generateNFLSchedule(schedTeams, 2026, ranks, rng)];
  const user = teams.find(t => t.id === userTeamId)!;

  return {
    settings: {
      temporada: 2026, cap: CAP_BASE, fase: 'PRE', semana: 1,
      tvGrowth: Math.round(rng.f(3, 8) * 10) / 10, inflacao: 1, tvDeal: 12,
    },
    teams, staff,
    staffPool: buildStaffPool(rng),
    players,
    faPool: buildFaPool(rng),
    draftClass: buildDraftClass(rng),
    draftState: null,
    matches, bracket: null,
    news: [
      { id: 3, rotulo: 'LIGA', texto: `Temporada 2026 aberta! Salary cap em $${CAP_BASE}M.` },
      { id: 2, rotulo: 'SEU CLUBE', texto: `Você assume o comando do ${user.cidade} ${user.nome}, no ${user.estadioNome}.` },
      { id: 1, rotulo: 'TREINO', texto: 'Defina o foco do Centro de Treinamento: jovens evoluem com playing time + foco + estrutura.' },
      { id: 0, rotulo: 'PRÉ-TEMPORADA', texto: 'Semana 1: amistosos não valem para a classificação.' },
    ],
    userTeam: userTeamId,
    campeoes: [],
    focus: 'FISICO',
    lastResult: null,
    weekResults: [],
  };
}
