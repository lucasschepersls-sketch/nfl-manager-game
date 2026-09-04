/* ============================================================
 * Modelo de dados — The American Game Manager (espelha schema SQLAlchemy)
 * ============================================================ */

import type { TrainingCenterState } from './training';

export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S' | 'K' | 'P';
export type Unit = 'OF' | 'DF' | 'ST';
export type Phase = 'PRE' | 'REG' | 'PO' | 'OFF';
export type Conf = 'AFC' | 'NFC';
export type PStatus = 'TIT' | 'RES' | 'PS';
export type Focus = 'CORRIDA' | 'PASSE' | 'DEFESA' | 'FISICO';

export type Screen =
  | 'home' | 'elenco' | 'taticas' | 'calendario' | 'classificacao'
  | 'mercado' | 'draft' | 'financas' | 'dm' | 'partida' | 'scouting'
  | 'offseason' | 'staff' | 'negociacoes' | 'trades' | 'calendario-liga'
  | 'stats-teams' | 'stats-off' | 'stats-def' | 'stats-st' | 'probowl' | 'hall-of-fame' | 'rivalidades' | 'elencos-liga' | 'comparador' | 'power-rankings' | 'storylines' | 'inbox' | 'jobs';

export type StatsTab = 'teams' | 'off' | 'def' | 'st';

export interface Attrs {
  passe: number; corrida: number; recepcao: number; bloqueio: number;
  tackle: number; chute: number; velocidade: number; resistencia: number;
}
export type AttrKey = keyof Attrs;

export interface PlayerStats {
  jogos: number; py: number; ptd: number; int: number;
  ry: number; rtd: number; rec: number; recYds: number; recTD: number;
  sacks: number; tackles: number; fgM: number; fgT: number;
  /* acumulados do box score rico (Fase: Estatísticas da Temporada) */
  cmp: number; att: number; car: number;
  intDef: number; ff: number;
  punts: number; puntYds: number;
}
export const zeroStats = (): PlayerStats => ({
  jogos: 0, py: 0, ptd: 0, int: 0, ry: 0, rtd: 0, rec: 0, recYds: 0,
  recTD: 0, sacks: 0, tackles: 0, fgM: 0, fgT: 0,
  cmp: 0, att: 0, car: 0, intDef: 0, ff: 0, punts: 0, puntYds: 0,
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
  restructured?: boolean;
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
  lesaoTotal?: number;
  moral: number;
  clutchRating: number;
  tag: boolean;
  rookie: boolean;
  jogosCarreira: number;
  careerProBowls?: number;
  careerChampionships?: number;
  holdout?: boolean;
  stats: PlayerStats;
  careerStats?: PlayerStats;
  scout?: ProspectInfo;
  origem?: string;
  rfa?: boolean;   // Restricted FA: time de origem tem direito de match
  anosNoTime: number;  // temporadas na franquia atual (base da química)
}

export type PlaybookStyle = 'pass_heavy' | 'run_heavy' | 'balanced' | 'west_coast';
export interface Tactics { corrida: number; agressividade: number; playbook: PlaybookStyle; }

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
  quimica: number;    // entrosamento do vestiário (0-100) — cresce com estabilidade
  teamChurn: number;  // rotatividade recente de elenco (trocas/cortes) — prejudica a química
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
  momentumCasa?: number; momentumFora?: number;
  momentumResult?: string;
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

/* ---------- box score rico (estilo NFL) ---------- */
export interface TeamBox {
  pts: number; yds: number; rushYds: number; passYds: number;
  firstDowns: number;
  thirdAtt: number; thirdConv: number;
  rzAtt: number; rzTd: number;
  tos: number;
  pens: number; penYds: number;
  possSecs: number;
}

export interface PlayerLine {
  id: string; nome: string; pos: Pos; teamId: string;
  cmp?: number; att?: number; py?: number; ptd?: number; int?: number; longPass?: number; rating?: number;
  rAtt?: number; ry?: number; rtd?: number; longRush?: number;
  rec?: number; recYds?: number; recTD?: number; longRec?: number;
  sacks?: number; sackYds?: number; tackles?: number; intDef?: number;
  fgM?: number; fgT?: number;
  ff?: number; punts?: number; puntYds?: number;
  snaps?: number;
}

export interface GameStory {
  mvp: { nome: string; pos: Pos; teamId: string; linha: string } | null;
  jogada: { texto: string; teamId: string } | null;
}

export interface RichBox {
  casa: TeamBox; fora: TeamBox;
  lines: PlayerLine[];
  story: GameStory;
}

export interface InjuryReport {
  playerId: string; nome: string; pos: Pos; semanas: number; tipo: string; teamId: string;
}

/* ---------- Pro Bowl (espelha ProBowlVoting) ---------- */
export interface ProBowlVote {
  playerId: string;
  season: number;
  week: number;                 // última semana processada
  fanVotes: number;             // fãs (peso 75%)
  playerVotes: number;          // jogadores (peso 25%)
  coachVotes: number;           // técnicos (peso 25%)
  totalWeighted: number;        // fan*0.75 + players*0.25 + coaches*0.25
  rankInPosition: number;
  momentum: boolean;            // semana excepcional (bônus aplicado)
  summary: { yards: number; tds: number; rating: number };
  isStarter?: boolean;          // titular do Pro Bowl (líder da conferência)
  isReserve?: boolean;          // reserva selecionado
}

export interface ProBowlState {
  season: number;
  lastWeek: number;             // última semana votada
  votes: ProBowlVote[];
  userFanVote: { week: number; playerId: string } | null;
  announced: boolean;           // roster final divulgado (fim da temporada regular)
}

/* ---------- estatísticas acumuladas da temporada (espelha TeamSeasonStats) ---------- */
export interface TeamSeasonStats {
  teamId: string;
  season: number;
  /* ofensiva */
  pointsScored: number;
  totalYards: number;
  passingYards: number;
  rushingYards: number;
  turnovers: number;
  thirdAtt: number;
  thirdConv: number;
  /* defensiva */
  pointsAllowed: number;
  sacks: number;
  interceptions: number;
}

export interface PowerRankingEntry {
  teamId: string;
  rank: number;
  score: number;
}
export interface PowerRankingSnapshot {
  season: number;
  week: number;
  entries: PowerRankingEntry[];
}
export const zeroTeamStats = (teamId: string, season: number): TeamSeasonStats => ({
  teamId, season,
  pointsScored: 0, totalYards: 0, passingYards: 0, rushingYards: 0,
  turnovers: 0, thirdAtt: 0, thirdConv: 0,
  pointsAllowed: 0, sacks: 0, interceptions: 0,
});

export interface GameResult {
  matchId: string;
  casaId: string; foraId: string;
  placarCasa: number; placarFora: number;
  clima: string; climaIcon: string;
  publico: number;
  log: PlayLine[];
  live: LiveEvent[];
  box: BoxScore;
  rich: RichBox;
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
  publico?: number;
  receitaCasa?: number;
  receitaBilheteria?: number;
  receitaTV?: number;
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

/* ================= Sistema de Mensagens / Inbox ================= */
export type MessageCategory =
  | 'training' | 'front_office' | 'pro_bowl' | 'super_bowl' | 'trade'
  | 'injury' | 'media' | 'scouting' | 'agent' | 'contract' | 'job';
export type MessagePriority = 'urgent' | 'normal' | 'low';

/** Ação disponível dentro de uma mensagem. */
export interface MessageAction {
  id: string;
  label: string;
  kind: 'goto' | 'apply_job' | 'dismiss';
  screen?: Screen;
  jobId?: number;
}

export interface Message {
  id: number;
  season: number;
  week: number;
  category: MessageCategory;
  priority: MessagePriority;
  isRead: boolean;
  isArchived: boolean;
  isStarred: boolean;
  sender: string;
  senderIcon: string;
  subject: string;
  body: string;
  dataPayload?: Record<string, unknown>;
  availableActions?: MessageAction[];
  createdAt: number;   // timestamp (ordenação)
  readAt?: number;
}

export interface CoachPerformance {
  season: number;
  week: number;
  winPctScore: number;        // 0-100
  playoffProgressScore: number;
  playerDevelopmentScore: number;
  capManagementScore: number;
  mediaRelationsScore: number;
  overallRating: number;      // média ponderada
  isFired: boolean;
  fireReason?: string;
}

export interface JobOpening {
  id: number;
  season: number;
  week: number;
  teamId: string;
  reason: string;             // 'fired_coach' | 'contract_ended' | 'promotion'
  teamQuality: 'contender' | 'playoff_team' | 'rebuilding' | 'disaster';
  rosterQuality: 'elite' | 'good' | 'average' | 'poor';
  capSpace: number;
  draftPicks: number[];       // rodadas disponíveis
  expectations: 'win_now' | 'develop_young_players' | 'rebuild';
  pressureLevel: number;      // 1-10
  isFilled: boolean;
  filledByUser: boolean;
}

export interface HallOfFameEntry {
  playerId: string;
  nome: string;
  pos: Pos;
  yearsRetired: number;
  proBowls: number;
  championships: number;
  careerStats: PlayerStats;
  fanVotes: number;
  mediaVotes: number;
  playerVotes: number;
  totalVotes: number;
  inducted: boolean;
  jerseyRetired: boolean;
}
export type SeasonStorylineType = 'strong_division' | 'rookie_record' | 'historic_defense' | 'seed_race';
export interface SeasonStoryline {
  type: SeasonStorylineType;
  description: string;
  affectedTeams: string[];
  weeksActive: number;
}
export interface OpponentScoutingReport {
  teamId: string;
  season: number;
  reports: number;
  strengths: string[];
  weaknesses: string[];
  keyPlayers: string[];
  passRate: number;
  runOnFirstDown: number;
}

export interface Rivalry {
  team1Id: string;
  team2Id: string;
  intensity: number;
  history: 'Divisional' | 'Historical' | 'Recent';
  gamesPlayed: number;
  team1Wins: number;
  team2Wins: number;
  draws: number;
}

export type MediaNarrativeType = 'contract_year' | 'sophomore_slump' | 'championship_or_bust' | 'rookie_qb';
export interface MediaNarrative {
  type: MediaNarrativeType;
  affectedPlayerId?: string;
  teamId: string;
  weeksActive: number;
  pressureLevel: number;
  headline: string;
}

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
  conditional?: ConditionalPick;
}

export type TradeAssetKind = 'player' | 'pick';
export type ConditionalPickCondition = 'player_makes_pro_bowl' | 'team_makes_playoffs';
export interface ConditionalPick {
  baseRound: number;
  condition: ConditionalPickCondition;
  upgradedRound: number;
  conditionPlayerId?: string;
  resolvedRound?: number;
}
export interface TradeAsset {
  kind: TradeAssetKind;
  playerId?: string;      // quando kind === 'player'
  round?: number;         // quando kind === 'pick' (1..7)
  slot?: number;          // quando kind === 'pick' (0..31 dentro da rodada)
  conditional?: ConditionalPick;
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
  hallOfFame: HallOfFameEntry[];
  seasonStorylines: SeasonStoryline[];
  opponentScouting: OpponentScoutingReport[];
  rivalries: Rivalry[];
  narrativas: MediaNarrative[];
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
  teamSeasonStats: TeamSeasonStats[];  // acumuladas a cada partida (Fase: Estatísticas)
  powerRankings: PowerRankingSnapshot[];
  probowl: ProBowlState;               // votação semanal do Pro Bowl
  trainingState: TrainingCenterState;  // estado do centro de treinamento
  messages: Message[];                 // caixa de entrada centralizada
  coachHistory: CoachPerformance[];    // avaliações semanais do técnico
  jobOpenings: JobOpening[];           // vagas de técnico abertas
  coachFired: boolean;                 // usuário foi demitido (aguardando recolocação)
}
