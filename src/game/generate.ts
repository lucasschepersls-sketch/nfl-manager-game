/* ============================================================
 * Geração de mundo: 32 franquias, elencos 53 + PS de 10,
 * comissão técnica, mercado de técnicos, free agents, classe do
 * draft e calendário oficial (generateNFLSchedule).
 * ============================================================ */

import type { Attrs, GameState, Match, Player, Pos, Staff, StaffRole, Team } from './types';
import { zeroStats } from './types';
import { Rng, clamp } from './rng';
import {
  CAP_BASE, HOSTILITY, PS_MAX, ROSTER_COUNTS, STARTER_SLOTS, TEAMS_DEF,
  genName, rookieSalary, salaryFor, computeOvr,
} from './data';
import { generateNFLSchedule, initialRanks, type RankMap, type SchedTeam } from './season';

const ATTR_LIST: (keyof Attrs)[] = ['passe', 'corrida', 'recepcao', 'bloqueio', 'tackle', 'chute', 'velocidade', 'resistencia'];

let uid = 0;
const nid = (p: string) => `${p}${++uid}`;

function genAttrs(q: number, rng: Rng): Attrs {
  const a = {} as Attrs;
  for (const k of ATTR_LIST) a[k] = Math.round(Math.min(95, Math.max(28, (46 + rng.f(0, 46)) * q)));
  return a;
}

function mkPlayer(pos: Pos, q: number, idade: number, teamId: string | null, rng: Rng, opts?: Partial<Player>): Player {
  const attrs = genAttrs(q, rng);
  if (pos === 'QB') attrs.passe = clamp(attrs.passe + rng.int(3, 9), 28, 96);
  const ovr = computeOvr(pos, attrs);
  return {
    id: nid('p'), teamId, nome: genName(rng), pos, idade,
    attrs, ovr,
    pot: Math.min(97, ovr + rng.int(idade < 25 ? 4 : 0, idade < 25 ? 20 : 6)),
    salario: salaryFor(ovr, rng), bonus: 0,
    contrato: rng.weighted([1, 2, 3, 4, 5], [22, 28, 25, 15, 10]),
    jogosCarreira: idade > 23 ? rng.int(4, (idade - 22) * 14) : 0,
    status: 'RES', lesao: 0, lesaoTipo: null,
    moral: rng.int(55, 78), tag: false, rookie: false,
    stats: zeroStats(),
    ...opts,
  };
}

function buildRoster(team: Team, forca: number, rng: Rng): Player[] {
  const base = (58 + forca * 3.1 + rng.f(0, 4)) / 75;
  const out: Player[] = [];
  for (const [pos, count] of ROSTER_COUNTS) {
    const slots = STARTER_SLOTS[pos] ?? 1;
    for (let i = 0; i < count; i++) {
      const tit = i < slots;
      const deep = i >= slots + 2;
      const q = tit ? base * rng.f(1.12, 1.26) : deep ? base * rng.f(0.78, 0.9) : base * rng.f(0.95, 1.1);
      let idade = tit ? rng.int(24, 33) : rng.int(22, 29);
      if (rng.chance(0.07)) idade = rng.int(34, 38);
      idade = clamp(idade, 22, 38);
      out.push(mkPlayer(pos, q, idade, team.id, rng, { status: tit ? 'TIT' : 'RES' }));
    }
  }
  const psPos: Pos[] = ['QB', 'RB', 'WR', 'WR', 'OL', 'OL', 'DL', 'LB', 'CB', 'S'];
  for (let i = 0; i < Math.min(PS_MAX, psPos.length); i++) {
    out.push(mkPlayer(psPos[i], base * rng.f(0.62, 0.76), rng.int(22, 23), team.id, rng, {
      status: 'PS', contrato: rng.weighted([1, 2], [60, 40]), jogosCarreira: 0,
    }));
  }
  return out;
}

const STAFF_FUNCS: StaffRole[] = ['Head Coach', 'Coordenador Ofensivo', 'Coordenador Defensivo', 'Médico', 'Preparador Físico', 'Olheiro'];

function buildStaff(team: Team, rng: Rng): Staff[] {
  return STAFF_FUNCS.map(f => {
    const nivel = Math.min(5, Math.max(1, rng.int(2, 3) + (team.estadio >= 4 ? 1 : 0)));
    return {
      id: nid('st'), teamId: team.id,
      nome: genName(rng), funcao: f, nivel,
      experiencia: rng.int(3, 22),
      salario: Math.round((0.6 + nivel * 1.05 + rng.f(0, 1)) * 10) / 10,
      bonus: 0, contrato: rng.weighted([1, 2, 3], [30, 45, 25]),
      moral: rng.int(58, 80),
    };
  });
}

export function buildStaffPool(rng: Rng): Staff[] {
  const pool: Staff[] = [];
  const dist: [StaffRole, number][] = [
    ['Head Coach', 4], ['Coordenador Ofensivo', 5], ['Coordenador Defensivo', 5],
    ['Médico', 5], ['Preparador Físico', 5], ['Olheiro', 6],
  ];
  for (const [f, n] of dist) {
    for (let i = 0; i < n; i++) {
      const nivel = Math.min(5, Math.max(1, Math.round(2 + Math.pow(rng.next(), 1.6) * 3.4)));
      pool.push({
        id: nid('sp'), teamId: null,
        nome: genName(rng), funcao: f, nivel,
        experiencia: rng.int(2, 25),
        salario: Math.round((0.6 + nivel * 1.05 + rng.f(0, 1.2)) * 10) / 10,
        bonus: 0, contrato: 0, moral: rng.int(55, 80),
      });
    }
  }
  return pool;
}

export function buildDraftClass(rng: Rng): Player[] {
  const dist: [Pos, number][] = [
    ['QB', 14], ['RB', 18], ['WR', 30], ['TE', 12], ['OL', 40],
    ['DL', 34], ['LB', 20], ['CB', 22], ['S', 16], ['K', 7], ['P', 7],
  ];
  const out: Player[] = [];
  for (const [pos, n] of dist) {
    for (let i = 0; i < n; i++) {
      const alvo = Math.round(48 + Math.pow(rng.next(), 1.5) * 34);
      const attrs = genAttrs(alvo / 75, rng);
      if (pos === 'QB') attrs.passe = clamp(attrs.passe + rng.int(2, 8), 28, 95);
      const ovr = computeOvr(pos, attrs);
      out.push({
        id: nid('d'), teamId: null, nome: genName(rng), pos,
        idade: pos === 'K' || pos === 'P' ? rng.int(22, 23) : rng.int(21, 22),
        attrs, ovr,
        pot: Math.min(97, ovr + rng.int(8, 26)),
        salario: rookieSalary(ovr), bonus: 0, contrato: 4,
        jogosCarreira: 0,
        status: 'RES', lesao: 0, lesaoTipo: null,
        moral: 70, tag: false, rookie: true,
        stats: zeroStats(),
      });
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

export function buildPreseason(rng: Rng): Match[] {
  const ms: Match[] = [];
  for (const rodada of [1, 2]) {
    const all = rng.shuffle(TEAMS_DEF.map(t => t.sigla.toLowerCase()));
    for (let i = 0; i < 16; i++)
      ms.push({ id: `pre-${rodada}-${i}`, fase: 'PRE', rodada, casa: all[i * 2], fora: all[i * 2 + 1], placarCasa: null, placarFora: null, jogada: false });
  }
  return ms;
}

/** Grade simples infalível (método do círculo) — só usada se o calendário oficial lançar exceção. */
function simpleGrid(teams: SchedTeam[]): Match[] {
  const ms: Match[] = [];
  for (const conf of ['AFC', 'NFC'] as const) {
    const arr = teams.filter(t => t.conf === conf).map(t => t.id);
    const rest = arr.slice(1);
    for (let r = 0; r < 15; r++) {
      const round = [arr[0], ...rest];
      for (let j = 0; j < 8; j++) {
        const a = round[j]; const b = round[15 - j];
        const home = (r + j) % 2 === 0 ? a : b;
        ms.push({ id: `reg-${r + 1}-${home}-${j}`, fase: 'REG', rodada: r + 1, casa: home, fora: home === a ? b : a, placarCasa: null, placarFora: null, jogada: false });
      }
      rest.push(rest.shift()!);
    }
  }
  return ms;
}

/* -------- jogo novo -------- */
export function newGame(userTeamId: string, seed: number): GameState {
  uid = 0;
  const rng = new Rng(seed);
  const teams: Team[] = TEAMS_DEF.map(d => ({
    id: d.sigla.toLowerCase(),
    cidade: d.cidade, nome: d.nome, sigla: d.sigla,
    cor: d.cor, cor2: d.cor2, conf: d.conf, div: d.div,
    estadioNome: d.estadio,
    hostilidade: HOSTILITY[d.sigla] ?? 65,
    histCampanha: [0.5, 0.5, 0.5],
    dinheiro: Math.round(28 + d.forca * 5 + rng.f(0, 18)),
    moral: rng.int(58, 70),
    estadio: Math.min(4, Math.max(1, d.forca + rng.int(-1, 0))),
    centroTreino: Math.min(4, Math.max(1, d.forca + rng.int(-1, 1))),
    tactics: { corrida: d.sigla.toLowerCase() === userTeamId ? 52 : rng.int(38, 64), agressividade: rng.int(35, 70) },
  }));

  const players: Player[] = [];
  const staff: Staff[] = [];
  TEAMS_DEF.forEach((d, i) => {
    players.push(...buildRoster(teams[i], d.forca, rng));
    staff.push(...buildStaff(teams[i], rng));
  });

  // Salários compatíveis com o teto: cada franquia começa com a folha em ~90%
  // do cap — mantém os 53 + 10 em campo e o cap ABAIXO do limite, sem cortes.
  const TARGET = 0.9;
  for (const t of teams) {
    const roster = players.filter(p => p.teamId === t.id);
    const total = roster.reduce((s, p) => s + p.salario, 0);
    if (total > CAP_BASE * TARGET) {
      const f = (CAP_BASE * TARGET) / total;
      for (const p of roster) p.salario = Math.max(0.6, Math.round(p.salario * f * 10) / 10);
    }
  }

  const ranks = initialRanks(TEAMS_DEF.map(d => ({ id: d.sigla.toLowerCase(), div: d.div, forca: d.forca })), rng);
  const schedTeams = teams.map(t => ({ id: t.id, conf: t.conf, div: t.div }));
  let regSeason: Match[];
  try {
    regSeason = generateNFLSchedule(schedTeams, 2026, ranks, rng);
  } catch (e) {
    console.error('Calendário oficial falhou — usando grade simples:', e);
    regSeason = simpleGrid(schedTeams);
  }
  const matches = [...buildPreseason(rng), ...regSeason];

  const user = teams.find(t => t.id === userTeamId)!;
  return {
    settings: {
      temporada: 2026, cap: CAP_BASE, fase: 'PRE', semana: 1,
      tvGrowth: Math.round(rng.f(3, 8) * 10) / 10,
      inflacao: 1, tvDeal: 12,
    },
    teams, staff,
    staffPool: buildStaffPool(rng),
    players,
    faPool: buildFaPool(rng),
    draftClass: buildDraftClass(rng),
    draftState: null,
    matches,
    bracket: null,
    news: [
      { id: 2, rotulo: 'LIGA', texto: `Temporada 2026 aberta! Salary cap em $${CAP_BASE}M, impulsionado pelo acordo de TV de $12B/ano.` },
      { id: 1, rotulo: 'SUA FRANQUIA', texto: `Você assume o comando do ${user.cidade} ${user.nome}, no ${user.estadioNome}. A diretoria liberou $${user.dinheiro}M em caixa.` },
      { id: 0, rotulo: 'PRÉ-TEMPORADA', texto: 'Semana 1 de pré-temporada: 2 amistosos para testar o elenco antes das 18 semanas oficiais.' },
    ],
    userTeam: userTeamId,
    campeoes: [],
    focus: 'FISICO',
    lastResult: null,
    weekResults: [],
  };
}
