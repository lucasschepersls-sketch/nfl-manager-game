/* ============================================================
 * GRIDIRON MANAGER NFL — Modelo de dados
 * ============================================================ */

export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';
export type Unit = 'OF' | 'DF' | 'ST';
export type Phase = 'PRE' | 'REG' | 'PO' | 'OFF';
export type Screen =
  | 'home' | 'elenco' | 'taticas' | 'dm' | 'liga' | 'financas' | 'partida'
  | 'mercado' | 'comissao' | 'draft' | 'offseason' | 'historico';
export type PStatus = 'TIT' | 'RES' | 'PS';
export type Focus = 'CORRIDA' | 'PASSE' | 'DEFESA' | 'FISICO';
export type Conf = 'AFC' | 'NFC';
export type OffPhase = 1 | 2 | 3 | 4;

export interface Attrs {
  passe: number; corrida: number; recepcao: number; bloqueio: number;
  tackle: number; chute: number; velocidade: number; resistencia: number;
}
export type AttrKey = keyof Attrs;

export interface PlayerStats {
  jogos: number;
  py: number; ptd: number; int: number;
  ry: number; rtd: number;
  rec: number; recYds: number; recTD: number;
  sacks: number; tackles: number;
  fgM: number; fgT: number;
}
export const zeroStats = (): PlayerStats => ({
  jogos: 0, py: 0, ptd: 0, int: 0, ry: 0, rtd: 0,
  rec: 0, recYds: 0, recTD: 0, sacks: 0, tackles: 0, fgM: 0, fgT: 0,
});

export interface Player {
  id: string;
  teamId: string | null;   // null = free agent / prospecto do draft
  nome: string;
  pos: Pos;
  idade: number;
  attrs: Attrs;
  ovr: number;
  pot: number;
  salario: number;         // anual, em milhões (AAV)
  bonus: number;           // bônus de assinatura (total)
  contrato: number;        // anos restantes (inclui temporada atual)
  jogosCarreira: number;
  status: PStatus;
  lesao: number;           // semanas fora (0 = saudável)
  lesaoTipo: string | null;
  moral: number;
  tag: boolean;
  rookie: boolean;
  origem?: string;         // time de origem quando vira FA (IA prioriza renovar)
  stats: PlayerStats;
}

export interface Tactics { corrida: number; agressividade: number; }

export interface Team {
  id: string;
  cidade: string;
  nome: string;
  sigla: string;
  cor: string;
  cor2: string;
  conf: Conf;
  div: number;             // 0 Leste · 1 Norte · 2 Sul · 3 Oeste
  estadioNome: string;
  hostilidade: number;     // pressão-base da torcida (10..95)
  histCampanha: number[];  // aproveitamentos recentes (0..1, mais recente primeiro)
  dinheiro: number;        // caixa, em milhões (staff e upgrades saem daqui)
  moral: number;
  estadio: number;         // nível 1..5
  centroTreino: number;    // nível 1..5
  tactics: Tactics;
}

/* ---------- comissão técnica ---------- */
export type StaffRole = 'Head Coach' | 'Coordenador Ofensivo' | 'Coordenador Defensivo'
  | 'Médico' | 'Preparador Físico' | 'Olheiro';

export interface Staff {
  id: string;
  teamId: string | null;   // null = disponível no mercado de técnicos
  nome: string;
  funcao: StaffRole;
  nivel: number;           // 1..5
  experiencia: number;     // anos de estrada
  salario: number;         // pedido/base anual (pago do caixa, não do cap)
  bonus: number;           // bônus de assinatura
  contrato: number;        // anos restantes
  moral: number;
  origem?: string;
}

/** Oferta de contrato — jogadores e técnicos */
export interface ContractOffer { years: number; base: number; bonus: number; }

/* ---------- partida / engine ---------- */
export type LineTipo = 'info' | 'ok' | 'big' | 'score' | 'turn' | 'pen' | 'inj';
export interface PlayLine { t: string; tipo: LineTipo; }

export interface LiveEvent {
  kind: 'info' | 'play' | 'turnover' | 'score' | 'quarter' | 'qb' | 'qbinj' | 'nerves' | 'end';
  texto: string;
  tipo?: LineTipo;
  ball?: number; down?: number; toGo?: number;
  posse?: 'casa' | 'fora';
  placarCasa?: number; placarFora?: number;
  quarter?: number; clock: number;
  /** estatísticas agregadas do segmento (para a aba de Estatísticas ao vivo) */
  runYds?: number;
  passYds?: number;
  penalties?: number;
}

export interface BoxScore {
  quartos: { casa: number[]; fora: number[] };
  yds: { casa: number; fora: number };
  rush: { casa: number; fora: number };
  pass: { casa: number; fora: number };
  tos: { casa: number; fora: number };
  faltas: { casa: number; fora: number };
  leaders: { label: string; casa: string; fora: string }[];
}

export interface InjuryReport {
  playerId: string; nome: string; pos: Pos; semanas: number; tipo: string; teamId: string;
}

export interface GameResult {
  matchId: string;
  casaId: string; foraId: string;
  placarCasa: number; placarFora: number;
  clima: string; climaIcon: string;
  publico: number;
  log: PlayLine[];
  live: LiveEvent[];
  box: BoxScore;
  lesoes: InjuryReport[];
  statDeltas: Record<string, Partial<PlayerStats>>;
  participantes: string[];
}

export interface Match {
  id: string;
  fase: Phase;
  rodada: number;
  casa: string;
  fora: string;
  placarCasa: number | null;
  placarFora: number | null;
  jogada: boolean;
}

/* ---------- liga ---------- */
export interface LeagueSettings {
  temporada: number;
  cap: number;             // salary cap, em milhões
  fase: Phase;
  semana: number;
  tvGrowth: number;        // crescimento da receita de TV (% a.a., 3..8)
  inflacao: number;        // índice acumulado (1.0 = base)
  tvDeal: number;          // receita anual de TV, em bilhões
}

export interface NewsItem { id: number; rotulo: string; texto: string; }

export interface BracketJogo { casa: string; fora: string; pc: number | null; pf: number | null; jogada: boolean; }
export interface BracketRound { nome: string; jogos: BracketJogo[]; }

export interface DraftState {
  round: number;           // 1..7
  pick: number;            // 0..31
  order: string[];         // ordem fixa das 32 franquias
  done: boolean;
}

export interface SeasonRecord {
  temporada: number;
  vitorias: number;
  derrotas: number;
  empates: number;
  pf: number;
  pc: number;
  playoffs: boolean;
  divisionTitle: boolean;
  superBowl: boolean;
}

export interface FranchiseHistory {
  superBowls: number;
  superBowlAppearances: number;
  playoffAppearances: number;
  divisionTitles: number;
  winningSeasons: number;
  losingSeasons: number;
  bestRecord: string;
  worstRecord: string;
  longestWinStreak: number;
  longestLoseStreak: number;
  seasons: SeasonRecord[];
  allTimeLeaders: {
    passingYds: { nome: string; valor: number } | null;
    passingTds: { nome: string; valor: number } | null;
    rushYds: { nome: string; valor: number } | null;
    rushTds: { nome: string; valor: number } | null;
    receivingYds: { nome: string; valor: number } | null;
    sacks: { nome: string; valor: number } | null;
    tackles: { nome: string; valor: number } | null;
  };
}

export interface GameState {
  settings: LeagueSettings;
  teams: Team[];
  staff: Staff[];          // comissão contratada (todas as franquias)
  staffPool: Staff[];      // mercado de técnicos (agentes livres)
  players: Player[];
  faPool: Player[];
  draftClass: Player[];
  draftState: DraftState | null;
  matches: Match[];
  bracket: BracketRound[] | null;
  news: NewsItem[];
  userTeam: string;
  campeoes: { temporada: number; teamId: string }[];
  focus: Focus;
  lastResult: GameResult | null;
  weekResults: Match[];
  offPhase?: OffPhase;     // fase da offseason guiada (1..4)
  historico?: Record<string, FranchiseHistory>; // histórico por franquia
}
