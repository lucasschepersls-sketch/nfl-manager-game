import type { AttrKey, Attrs, Conf, Pos, Unit } from './types';
import { Rng, clamp } from './rng';

/* ================= posições ================= */
export const POS_ORDER: Pos[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
export const UNIT_OF: Record<Pos, Unit> = {
  QB: 'OF', RB: 'OF', WR: 'OF', TE: 'OF', OL: 'OF',
  DL: 'DF', LB: 'DF', CB: 'DF', S: 'DF', K: 'ST', P: 'ST',
};
export const POS_LABEL: Record<Pos, string> = {
  QB: 'Quarterback', RB: 'Running Back', WR: 'Wide Receiver', TE: 'Tight End',
  OL: 'Linha Ofensiva', DL: 'Linha Defensiva', LB: 'Linebacker',
  CB: 'Cornerback', S: 'Safety', K: 'Kicker', P: 'Punter',
};
export const ATTR_KEYS: { k: AttrKey; s: string }[] = [
  { k: 'passe', s: 'PAS' }, { k: 'corrida', s: 'COR' }, { k: 'recepcao', s: 'REC' },
  { k: 'bloqueio', s: 'BLO' }, { k: 'tackle', s: 'TAC' }, { k: 'chute', s: 'CHU' },
  { k: 'velocidade', s: 'VEL' }, { k: 'resistencia', s: 'RES' },
];

export const OVR_WEIGHTS: Record<Pos, [AttrKey, number][]> = {
  QB: [['passe', 50], ['corrida', 12], ['velocidade', 10], ['resistencia', 18], ['recepcao', 10]],
  RB: [['corrida', 38], ['recepcao', 20], ['velocidade', 20], ['bloqueio', 12], ['resistencia', 10]],
  WR: [['recepcao', 42], ['velocidade', 30], ['corrida', 14], ['bloqueio', 14]],
  TE: [['recepcao', 34], ['bloqueio', 26], ['corrida', 14], ['velocidade', 14], ['resistencia', 12]],
  OL: [['bloqueio', 52], ['resistencia', 22], ['corrida', 14], ['velocidade', 12]],
  DL: [['tackle', 50], ['velocidade', 16], ['bloqueio', 12], ['resistencia', 22]],
  LB: [['tackle', 44], ['velocidade', 20], ['bloqueio', 12], ['resistencia', 24]],
  CB: [['tackle', 30], ['velocidade', 28], ['recepcao', 24], ['resistencia', 18]],
  S: [['tackle', 38], ['velocidade', 18], ['recepcao', 24], ['resistencia', 20]],
  K: [['chute', 62], ['resistencia', 20], ['velocidade', 18]],
  P: [['chute', 62], ['resistencia', 20], ['velocidade', 18]],
};

export function computeOvr(pos: Pos, a: Attrs): number {
  let s = 0;
  for (const [k, w] of OVR_WEIGHTS[pos]) s += a[k] * w;
  return clamp(Math.round(s / 100), 20, 99);
}

/* ================= lesões ================= */
export const INJ_TYPES: { tipo: string; min: number; max: number }[] = [
  { tipo: 'Entorse de tornozelo', min: 1, max: 3 },
  { tipo: 'Distensão muscular', min: 2, max: 4 },
  { tipo: 'Concussão (protocolo)', min: 1, max: 2 },
  { tipo: 'Lesão no joelho', min: 3, max: 6 },
  { tipo: 'Lesão no ombro', min: 2, max: 5 },
  { tipo: 'Fratura na mão', min: 3, max: 5 },
];

/* ================= nomes ================= */
export const FIRST_NAMES = [
  'Marcus', 'Derrick', 'Tyrell', 'Jalen', 'DeAndre', 'Cameron', 'Malik', 'Travis',
  'Brandon', 'Justin', 'Devonte', 'Kendall', 'Lamar', 'Chris', 'Jordan', 'Andre',
  'Rashad', 'Trevor', 'Darius', 'Kirk', 'Miles', 'Curtis', 'Reggie', 'Omar',
  'Cole', 'Blake', 'Hunter', 'Austin', 'Tanner', 'Dylan', 'Wyatt', 'Grant',
  'Jake', 'Luke', 'Nate', 'Owen', 'Ethan', 'Ryan', 'Tyler', 'Scott',
  'DeShawn', 'Kareem', 'Jamal', 'Terrence', 'Willie', 'Cedric', 'Damon', 'Ellis',
];
export const LAST_NAMES = [
  'Johnson', 'Williams', 'Brown', 'Jackson', 'Davis', 'Wilson', 'Anderson', 'Thomas',
  'Harris', 'Martin', 'Thompson', 'Garcia', 'Martinez', 'Robinson', 'Clark', 'Lewis',
  'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Scott', 'Green',
  'Baker', 'Adams', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner',
  'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Morris',
  'Bell', 'Hayes', 'Brooks', 'Sanders', 'Price', 'Bennett', 'Wood', 'Barnes',
];
export function genName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

/* ================= 32 franquias ================= */
export interface TeamDef {
  cidade: string; nome: string; sigla: string;
  cor: string; cor2: string; conf: Conf; div: number; forca: number; estadio: string;
}
export const DIV_NAMES = ['Leste', 'Norte', 'Sul', 'Oeste'];
export const CONF_LABEL: Record<Conf, string> = {
  AFC: 'AFC — American Football Conference',
  NFC: 'NFC — National Football Conference',
};

export const TEAMS_DEF: TeamDef[] = [
  // ---- AFC LESTE (0) ----
  { cidade: 'Buffalo', nome: 'Bills', sigla: 'BUF', cor: '#00338D', cor2: '#C60C30', conf: 'AFC', div: 0, forca: 5, estadio: 'Highmark Stadium' },
  { cidade: 'Miami', nome: 'Dolphins', sigla: 'MIA', cor: '#008E97', cor2: '#FC4C02', conf: 'AFC', div: 0, forca: 4, estadio: 'Hard Rock Stadium' },
  { cidade: 'New England', nome: 'Patriots', sigla: 'NE', cor: '#002244', cor2: '#C60C30', conf: 'AFC', div: 0, forca: 3, estadio: 'Gillette Stadium' },
  { cidade: 'New York', nome: 'Jets', sigla: 'NYJ', cor: '#125740', cor2: '#000000', conf: 'AFC', div: 0, forca: 2, estadio: 'MetLife Stadium' },
  // ---- AFC NORTE (1) ----
  { cidade: 'Baltimore', nome: 'Ravens', sigla: 'BAL', cor: '#241773', cor2: '#9E7C0C', conf: 'AFC', div: 1, forca: 5, estadio: 'M&T Bank Stadium' },
  { cidade: 'Cincinnati', nome: 'Bengals', sigla: 'CIN', cor: '#FB4F14', cor2: '#000000', conf: 'AFC', div: 1, forca: 4, estadio: 'Paycor Stadium' },
  { cidade: 'Cleveland', nome: 'Browns', sigla: 'CLE', cor: '#311D00', cor2: '#FF3C00', conf: 'AFC', div: 1, forca: 2, estadio: 'Huntington Bank Field' },
  { cidade: 'Pittsburgh', nome: 'Steelers', sigla: 'PIT', cor: '#FFB612', cor2: '#101820', conf: 'AFC', div: 1, forca: 4, estadio: 'Acrisure Stadium' },
  // ---- AFC SUL (2) ----
  { cidade: 'Houston', nome: 'Texans', sigla: 'HOU', cor: '#03202F', cor2: '#A71930', conf: 'AFC', div: 2, forca: 4, estadio: 'NRG Stadium' },
  { cidade: 'Indianapolis', nome: 'Colts', sigla: 'IND', cor: '#002C5F', cor2: '#A2AAAD', conf: 'AFC', div: 2, forca: 3, estadio: 'Lucas Oil Stadium' },
  { cidade: 'Jacksonville', nome: 'Jaguars', sigla: 'JAX', cor: '#006778', cor2: '#D7A22A', conf: 'AFC', div: 2, forca: 3, estadio: 'EverBank Stadium' },
  { cidade: 'Tennessee', nome: 'Titans', sigla: 'TEN', cor: '#4B92DB', cor2: '#0C2340', conf: 'AFC', div: 2, forca: 2, estadio: 'Nissan Stadium' },
  // ---- AFC OESTE (3) ----
  { cidade: 'Denver', nome: 'Broncos', sigla: 'DEN', cor: '#FB4F14', cor2: '#002244', conf: 'AFC', div: 3, forca: 4, estadio: 'Empower Field' },
  { cidade: 'Kansas City', nome: 'Chiefs', sigla: 'KC', cor: '#E31837', cor2: '#FFB81C', conf: 'AFC', div: 3, forca: 5, estadio: 'Arrowhead Stadium' },
  { cidade: 'Las Vegas', nome: 'Raiders', sigla: 'LV', cor: '#A5ACAF', cor2: '#000000', conf: 'AFC', div: 3, forca: 2, estadio: 'Allegiant Stadium' },
  { cidade: 'Los Angeles', nome: 'Chargers', sigla: 'LAC', cor: '#0080C6', cor2: '#FFC20E', conf: 'AFC', div: 3, forca: 4, estadio: 'SoFi Stadium' },
  // ---- NFC LESTE (0) ----
  { cidade: 'Dallas', nome: 'Cowboys', sigla: 'DAL', cor: '#003594', cor2: '#869397', conf: 'NFC', div: 0, forca: 4, estadio: 'AT&T Stadium' },
  { cidade: 'New York', nome: 'Giants', sigla: 'NYG', cor: '#0B2265', cor2: '#A71930', conf: 'NFC', div: 0, forca: 2, estadio: 'MetLife Stadium' },
  { cidade: 'Philadelphia', nome: 'Eagles', sigla: 'PHI', cor: '#004C54', cor2: '#A5ACAF', conf: 'NFC', div: 0, forca: 5, estadio: 'Lincoln Financial Field' },
  { cidade: 'Washington', nome: 'Commanders', sigla: 'WAS', cor: '#773141', cor2: '#FFB612', conf: 'NFC', div: 0, forca: 4, estadio: 'Northwest Stadium' },
  // ---- NFC NORTE (1) ----
  { cidade: 'Chicago', nome: 'Bears', sigla: 'CHI', cor: '#C83803', cor2: '#0B162A', conf: 'NFC', div: 1, forca: 3, estadio: 'Soldier Field' },
  { cidade: 'Detroit', nome: 'Lions', sigla: 'DET', cor: '#0076B6', cor2: '#B0B7BC', conf: 'NFC', div: 1, forca: 5, estadio: 'Ford Field' },
  { cidade: 'Green Bay', nome: 'Packers', sigla: 'GB', cor: '#203731', cor2: '#FFB612', conf: 'NFC', div: 1, forca: 4, estadio: 'Lambeau Field' },
  { cidade: 'Minnesota', nome: 'Vikings', sigla: 'MIN', cor: '#4F2683', cor2: '#FFC62F', conf: 'NFC', div: 1, forca: 4, estadio: 'U.S. Bank Stadium' },
  // ---- NFC SUL (2) ----
  { cidade: 'Atlanta', nome: 'Falcons', sigla: 'ATL', cor: '#A71930', cor2: '#000000', conf: 'NFC', div: 2, forca: 3, estadio: 'Mercedes-Benz Stadium' },
  { cidade: 'Carolina', nome: 'Panthers', sigla: 'CAR', cor: '#0085CA', cor2: '#101820', conf: 'NFC', div: 2, forca: 1, estadio: 'Bank of America Stadium' },
  { cidade: 'New Orleans', nome: 'Saints', sigla: 'NO', cor: '#D3BC8D', cor2: '#101820', conf: 'NFC', div: 2, forca: 2, estadio: 'Caesars Superdome' },
  { cidade: 'Tampa Bay', nome: 'Buccaneers', sigla: 'TB', cor: '#D50A0A', cor2: '#34302B', conf: 'NFC', div: 2, forca: 4, estadio: 'Raymond James Stadium' },
  // ---- NFC OESTE (3) ----
  { cidade: 'Arizona', nome: 'Cardinals', sigla: 'ARI', cor: '#97233F', cor2: '#000000', conf: 'NFC', div: 3, forca: 3, estadio: 'State Farm Stadium' },
  { cidade: 'Los Angeles', nome: 'Rams', sigla: 'LAR', cor: '#003594', cor2: '#FFA300', conf: 'NFC', div: 3, forca: 4, estadio: 'SoFi Stadium' },
  { cidade: 'San Francisco', nome: '49ers', sigla: 'SF', cor: '#AA0000', cor2: '#B3995D', conf: 'NFC', div: 3, forca: 4, estadio: "Levi's Stadium" },
  { cidade: 'Seattle', nome: 'Seahawks', sigla: 'SEA', cor: '#69BE28', cor2: '#002244', conf: 'NFC', div: 3, forca: 4, estadio: 'Lumen Field' },
];

/* pressão-base da torcida (caldeirões no topo) */
export const HOSTILITY: Record<string, number> = {
  GB: 95, SEA: 94, KC: 93, NE: 90, NO: 89, PIT: 88, PHI: 87, DAL: 86,
  BUF: 85, BAL: 84, DEN: 83, CHI: 82, LV: 80, NYJ: 80, CIN: 79, SF: 78,
  MIN: 77, DET: 76, HOU: 75, IND: 74, TB: 73, LAR: 72, CLE: 71, LAC: 70,
  MIA: 69, NYG: 68, JAX: 67, ATL: 66, WAS: 65, TEN: 64, ARI: 63, CAR: 60,
};

/* ================= salários ================= */
export function salaryFor(ovr: number, rng: Rng): number {
  const base = 0.62 + Math.pow(Math.max(0, ovr - 50) / 40, 4.4) * 33;
  const v = base * rng.f(0.86, 1.14);
  return Math.round(v * 10) / 10;
}
export const rookieSalary = (ovr: number) => Math.round((0.72 + Math.max(0, ovr - 45) * 0.055) * 10) / 10;

export const CAP_BASE = 220;
export const ROSTER_MAX = 53;
export const PS_MAX = 10;

/* counts do elenco ativo (total 53) */
export const ROSTER_COUNTS: [Pos, number][] = [
  ['QB', 2], ['RB', 5], ['WR', 6], ['TE', 3], ['OL', 9],
  ['DL', 8], ['LB', 7], ['CB', 6], ['S', 5], ['K', 1], ['P', 1],
];
export const STARTER_SLOTS: Partial<Record<Pos, number>> = {
  QB: 1, RB: 2, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2, K: 1, P: 1,
};
