/* ============================================================
 * Modelo de dados — Gridiron Manager (espelha schema SQLAlchemy)
 * ============================================================ */

export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';
export type Unit = 'OF' | 'DF' | 'ST';
export type Phase = 'PRE' | 'REG' | 'PO' | 'OFF';
export type Conf = 'AFC' | 'NFC';
export type PStatus = 'TIT' | 'RES' | 'PS';
export type Focus = 'CORRIDA' | 'PASSE' | 'DEFESA' | 'FISICO';

export type Screen =
  | 'home' | 'elenco' | 'taticas' | 'calendario' | 'classificacao'
  | 'mercado' | 'draft' | 'financas' | 'dm' | 'partida' | 'scouting'
  | 'offseason' | 'staff' | 'negociacoes' | 'trades';

export interface Attrs {
  passe: number; corrida: number; recepcao: number; bloqueio: number;
  tackle: number; chute: number; velocidade: number; resistencia: number;
}
export type AttrKey = keyof Attrs;

export interface PlayerStats {
  jogos: number; py: number; ptd: number; int: number;
  ry: number; rtd: number; rec: number; recYds: number; recTD: number;
  sacks: number; tackles: number; fgM: number; fgT: number;
}
export const zeroStats = (): PlayerStats => ({
  jogos: 0, py: 0, ptd: 0, int: 0, ry: 0, rtd: 0, rec: 0, recYds: 0,
  recTD: 0, sacks: 0, tackles: 0, fgM: 0, fgT: 0,
});

export type GradeLetter = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';

export interface ProspectInfo {
  college: string;
  reports: number;
  maxReports: number;
  onBoard: boolean;
  aiHeat?: number;   // quantas franquias da IA investigaram este prospecto
}

/* ---------- contratos (Fase: Sistema de Contratos) ---------- */
export type ContractStructure = 'FRONT' | 'BALANCED' | 'BACK';

/** Oferta de contrato: anos, salário-base anual, bônus de assinatura e estrutura. */
export interface ContractOffer {
  years: number;          // 1..5
  base: number;           // $/ano (média)
  bonus: number;          // bônus de assinatura (amortizado igualmente)
  structure: ContractStructure;
}

/** Contrato estruturado vigente. */
export interface PlayerContract {
  years: number;
  total: number;
  bonus: number;
  structure: ContractStructure;
  capHits: number[];      // cap hit por ano (base_i + bônus amortizado)
  guaranteed: number;     // dinheiro garantido (bônus + base do ano 1 protegido)
}

export interface Player {
  id: string;
  teamId: string | null;
  nome: string;
  pos: Pos;
  idade: number;
  attrs: Attrs;
  ovr: number;
  pot: number;
  salario: number;
  contrato: number;
  contract?: PlayerContract;
  status: PStatus;
  lesao: number;
  lesaoTipo: string | null;
  moral: number;
  tag: boolean;
  rookie: boolean;
  jogosCarreira: number;
  holdout?: boolean;
  stats: PlayerStats;
  scout?: ProspectInfo;
  origem?: string;
  rfa?: boolean;   // Restricted FA: time de origem tem direito de match
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
  div: number;
  dinheiro: number;
  moral: number;
  estadio: number;
  estadioNome: string;
  centroTreino: number;
  hostilidade: number;
  histCampanha: number[];
  tactics: Tactics;
}

export type StaffRole =
  | 'Coordenador Ofensivo' | 'Coordenador Defensivo' | 'Médico'
  | 'Preparador Físico' | 'Olheiro' | 'Olheiro Extra' | 'Diretor de Personnel';

export interface Staff {
  id: string;
  teamId: string;
  nome: string;
  funcao: StaffRole;
  nivel: number;
  experiencia: number;
  salario: number;
  bonus: number;
  contrato: number;
  moral: number;
}

/* ---------- partida ---------- */
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
  runYds?: number; passYds?: number; penalties?: number;
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
  cap: number;
  fase: Phase;
  semana: number;
  tvGrowth: number;   // % projetado de crescimento da receita de TV
  inflacao: number;   // índice acumulado (1.0 = base)
  tvDeal: number;     // receita de TV em bilhões
}

export interface NewsItem { id: number; rotulo: string; texto: string; }

export interface BracketJogo { casa: string; fora: string; pc: number | null; pf: number | null; jogada: boolean; }
export interface BracketRound { nome: string; jogos: BracketJogo[]; }

export interface DraftState {
  round: number;
  pick: number;
  order: string[];
  done: boolean;
}

/* ---------- trades ---------- */
/** Posse de uma escolha de draft (permite trocas; `from` indica a franquia original). */
export interface PickOwner {
  owner: string;          // quem detém a escolha agora
  from: string | null;    // franquia original (quando veio de troca)
  consumed?: boolean;     // já foi usada no draft (não pode ser re-trocada)
}

export type TradeAssetKind = 'player' | 'pick';
export interface TradeAsset {
  kind: TradeAssetKind;
  playerId?: string;      // quando kind === 'player'
  round?: number;         // quando kind === 'pick' (1..7)
  slot?: number;          // quando kind === 'pick' (0..31 dentro da rodada)
}

export interface TradeProposal {
  from: string;           // time do usuário
  to: string;             // time parceiro
  give: TradeAsset[];     // o que o usuário entrega
  get: TradeAsset[];      // o que o usuário recebe
}

export interface TradeLogItem {
  id: number;
  temporada: number;
  semana: number;
  fase: Phase;
  a: string; b: string;
  aGives: string;         // descrição legível
  bGives: string;
  aceita: boolean;
}

export type OffPhase = 1 | 2 | 3 | 4;

export interface GameState {
  settings: LeagueSettings;
  teams: Team[];
  staff: Staff[];
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
  offPhase?: OffPhase;
  scoutBudget: number;
  scoutBudgetMax: number;
  pickOwners: PickOwner[][];   // [round-1][slot] → posse atual das escolhas
  tradeLog: TradeLogItem[];
}
