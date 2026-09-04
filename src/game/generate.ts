import type { AttrKey, GameState, Player, Pos, Staff } from './types';
import { zeroStats, zeroTeamStats } from './types';
import { Rng, clamp } from './rng';
import {
  TEAMS_DEF, ROSTER_COUNTS, STARTER_SLOTS, HOSTILITY, CAP_BASE,
  genName, salaryFor, rookieSalary, computeOvr,
} from './data';
import { generateNFLSchedule, initialRanks } from './season';
import { initialPickOwners } from './trades';
import { emptyProBowl } from './probowl';

const ATTR_KEYS: AttrKey[] = ['passe', 'corrida', 'recepcao', 'bloqueio', 'tackle', 'chute', 'velocidade', 'resistencia'];

function genAttrs(rng: Rng, base: number, spread: number): Player['attrs'] {
  const a = {} as Player['attrs'];
  for (const k of ATTR_KEYS) a[k] = clamp(Math.round(base + rng.f(-spread, spread)), 30, 95);
  return a;
}

function makePlayer(rng: Rng, pos: Pos, teamId: string, base: number, idade: number, opts: Partial<Player> = {}): Player {
  const attrs = genAttrs(rng, base, 9);
  const ovr = computeOvr(pos, attrs);
  return {
    id: `p${Math.floor(rng.next() * 1e9).toString(36)}`,
    teamId, nome: genName(rng), pos, idade,
    attrs, ovr, pot: clamp(ovr + rng.int(0, idade < 25 ? 12 : 4), ovr, 99),
    salario: salaryFor(ovr, rng), contrato: rng.int(1, 4),
    status: 'RES', lesao: 0, lesaoTipo: null, moral: rng.int(55, 80),
    clutchRating: rng.int(40, 90), tag: false, rookie: idade <= 23,
    jogosCarreira: Math.max(0, (idade - 22)) * 16 + rng.int(0, 10),
    stats: zeroStats(), anosNoTime: rng.int(0, 4),
    ...opts,
  };
}

function buildRoster(rng: Rng, teamId: string, forca: number): Player[] {
  const roster: Player[] = [];
  const base = 62 + forca * 4; // 66..82 conforme força da franquia
  for (const [pos, count] of ROSTER_COUNTS) {
    const starters = STARTER_SLOTS[pos] ?? 1;
    for (let i = 0; i < count; i++) {
      const isStarter = i < starters;
      const idade = rng.int(22, 33);
      const p = makePlayer(rng, pos, teamId, isStarter ? base + 6 : base - 6, idade, {
        status: isStarter ? 'TIT' : i < count - 2 ? 'RES' : 'PS',
      });
      roster.push(p);
    }
  }
  return roster;
}

const STAFF_ROLES: Staff['funcao'][] = ['Coordenador Ofensivo', 'Coordenador Defensivo', 'Médico', 'Preparador Físico', 'Olheiro'];

function buildStaff(rng: Rng, teamId: string): Staff[] {
  return STAFF_ROLES.map(funcao => ({
    id: `s${Math.floor(rng.next() * 1e9).toString(36)}`,
    teamId, nome: genName(rng), funcao,
    nivel: rng.int(2, 5), experiencia: rng.int(2, 20),
    salario: rng.int(1, 4), bonus: 0, contrato: rng.int(1, 3), moral: rng.int(55, 80),
  }));
}

export function newGame(userTeamId: string, seed: number): GameState {
  const rng = new Rng(seed);

  const teams = TEAMS_DEF.map(d => ({
    id: d.sigla.toLowerCase(),
    cidade: d.cidade, nome: d.nome, sigla: d.sigla,
    cor: d.cor, cor2: d.cor2, conf: d.conf, div: d.div,
    dinheiro: rng.int(20, 60), moral: rng.int(55, 80),
    estadio: rng.int(2, 5), estadioNome: d.estadio,
    centroTreino: rng.int(1, 4), hostilidade: HOSTILITY[d.sigla] ?? 65,
    histCampanha: [d.camp, clamp(d.camp + rng.f(-0.1, 0.1), 0, 1)],
    tactics: { corrida: rng.int(35, 60), agressividade: rng.int(35, 70), playbook: 'balanced' as const },
    quimica: rng.int(50, 80), teamChurn: 0,
  }));

  const players: Player[] = [];
  const staff: Staff[] = [];
  for (const t of teams) {
    const def = TEAMS_DEF.find(d => d.sigla.toLowerCase() === t.id)!;
    players.push(...buildRoster(rng, t.id, def.forca));
    staff.push(...buildStaff(rng, t.id));
  }

  // free agents
  const faPool: Player[] = [];
  for (let i = 0; i < 60; i++) {
    const pos = (['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'] as Pos[])[rng.int(0, 10)];
    faPool.push(makePlayer(rng, pos, null as unknown as string, rng.int(58, 78), rng.int(23, 32), {
      teamId: null, status: 'RES',
    }));
  }

  // classe do draft
  const draftClass: Player[] = [];
  for (let i = 0; i < 120; i++) {
    const pos = (['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'] as Pos[])[rng.int(0, 10)];
    draftClass.push(makePlayer(rng, pos, null as unknown as string, rng.int(55, 82), rng.int(21, 23), {
      teamId: null, status: 'RES', rookie: true, contrato: 4, salario: rookieSalary(rng.int(55, 82)),
    }));
  }

  const ranks = initialRanks(
    TEAMS_DEF.map(d => ({ id: d.sigla.toLowerCase(), conf: d.conf, div: d.div, s: d.camp })),
    rng,
  );
  const matches = generateNFLSchedule(
    teams.map(t => ({ id: t.id, conf: t.conf, div: t.div })),
    2026, ranks, rng,
  );

  return {
    settings: { temporada: 2026, cap: CAP_BASE, fase: 'PRE', semana: 1, tvGrowth: rng.int(3, 8), inflacao: 1, tvDeal: 10 },
    teams, staff, staffPool: [], players, faPool, draftClass,
    draftState: null, matches, bracket: null,
    news: [{ id: 1, rotulo: 'BEM-VINDO', texto: `Você assumiu o comando. Boa sorte na temporada 2026!` }],
    hallOfFame: [], seasonStorylines: [], opponentScouting: [], rivalries: [], narrativas: [],
    userTeam: userTeamId, campeoes: [], focus: 'FISICO',
    lastResult: null, weekResults: [],
    offPhase: undefined, scoutBudget: 8, scoutBudgetMax: 8,
    pickOwners: initialPickOwners(teams.map(t => t.id)),
    tradeLog: [],
    teamSeasonStats: teams.map(t => zeroTeamStats(t.id, 2026)),
    powerRankings: [],
    probowl: emptyProBowl(2026),
    trainingState: { focus: 'resistencia', intensity: 'NORMAL', playersTraining: [] },
  };
}
