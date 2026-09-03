import {
  createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode,
} from 'react';
import type { ContractOffer, Focus, GameState, PStatus, Screen, TradeAsset } from '../game/types';
import { zeroStats } from '../game/types';
import { newGame, buildWorldFor, buildPreseason } from '../game/generate';
import {
  advance, advanceOffPhase, advanceRound, applyTag, autoDraftAll, autoDraftUntilUser, autoFixRoster,
  enforceCapCompliance, newSeason, negotiateContract, pushNews, releasePlayer, renewStaff,
  setStatus, setTactics, signFA, signFAWithOffer, teamById, upgrade, userDraftPick, validateRoster,
} from '../game/season';
import { newSeed, Rng } from '../game/rng';
import { executeProposal } from '../game/trades';
import { investigate, resetScouting, scoutBudgetMaxFor, studyOpponent, toggleBoard, backfillScoutInfo } from '../game/scouting';
import { castFanVote, runWeeklyProBowlVoting, selectProBowlRoster } from '../game/probowl';
import { recalcChemistry, teamChemistry } from '../game/franchise';

const SAVE_KEY = 'gridiron-nfl-save-v1';

/* ---------- persistência ---------- */
export function saveGame(s: GameState): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (!s.teams || !s.players || !s.settings) return null;
    // ---- migração de saves antigos ----
    if (!Array.isArray(s.news)) s.news = [];
    if (!Array.isArray(s.campeoes)) s.campeoes = [];
    if (!Array.isArray(s.faPool)) s.faPool = [];
    if (!Array.isArray(s.draftClass)) s.draftClass = [];
    if (!Array.isArray(s.staff)) s.staff = [];
    if (!Array.isArray(s.tradeLog)) s.tradeLog = [];
    if (!Array.isArray(s.teamSeasonStats)) s.teamSeasonStats = [];
    if (!Array.isArray(s.rivalries)) s.rivalries = [];
    if (!Array.isArray(s.hallOfFame)) s.hallOfFame = [];
    if (!Array.isArray(s.opponentScouting)) s.opponentScouting = [];
    if (!Array.isArray(s.seasonStorylines)) s.seasonStorylines = [];
    if (!Array.isArray(s.narrativas)) s.narrativas = [];
    if (!Array.isArray(s.powerRankings)) s.powerRankings = [];
    if (typeof s.scoutBudget !== 'number') s.scoutBudget = 10;
    if (typeof s.scoutBudgetMax !== 'number') s.scoutBudgetMax = 10;
    if (typeof s.offPhase !== 'number' && s.settings.fase === 'OFF') s.offPhase = 1;
    if (s.settings && typeof (s.settings as { tvGrowth?: number }).tvGrowth !== 'number') (s.settings as { tvGrowth: number }).tvGrowth = 5;
    if (s.settings && typeof (s.settings as { inflacao?: number }).inflacao !== 'number') (s.settings as { inflacao: number }).inflacao = 1;
    if (s.settings && typeof (s.settings as { tvDeal?: number }).tvDeal !== 'number') (s.settings as { tvDeal: number }).tvDeal = 12;
    if (!s.trainingState) s.trainingState = { focus: 'FISICO', intensity: 'NORMAL', playersTraining: [] };
    if (!s.probowl) s.probowl = { season: s.settings.temporada, lastWeek: 0, votes: [], userFanVote: null, announced: false };
    if (!s.pickOwners) {
      const ids = s.teams.map(t => t.id);
      s.pickOwners = Array.from({ length: 7 }, () => Array.from({ length: 32 }, (_, i) => ({ owner: ids[i % ids.length], from: null })));
    }
    for (const p of s.players) {
      p.stats = { ...zeroStats(), ...p.stats };
      if (typeof p.anosNoTime !== 'number') p.anosNoTime = p.teamId ? Math.max(0, Math.min(8, p.idade - 22)) : 0;
      if (typeof p.clutchRating !== 'number') p.clutchRating = 70;
      if (!p.scout && !p.teamId) backfillScoutInfo(p, 'Alabama');
    }
    for (const p of s.draftClass) {
      p.stats = { ...zeroStats(), ...p.stats };
      if (!p.scout) backfillScoutInfo(p, 'Alabama');
    }
    for (const t of s.teams) {
      if (typeof t.quimica !== 'number') t.quimica = 65;
      if (typeof t.teamChurn !== 'number') t.teamChurn = 0;
      if (!t.tactics.playbook) t.tactics.playbook = 'balanced';
      if (!Array.isArray(t.histCampanha)) t.histCampanha = [0.5];
    }
    return s;
  } catch {
    return null;
  }
}

/* ---------- estado ---------- */
interface StoreState {
  game: GameState | null;
  screen: Screen;
  saveExists: boolean;
  toast: string | null;
}

export type Action =
  | { type: 'NEW_GAME'; teamId: string }
  | { type: 'LOAD_SAVE'; game: GameState }
  | { type: 'SCREEN'; screen: Screen }
  | { type: 'CONTINUE' }
  | { type: 'DISMISS_RESULT' }
  | { type: 'SET_STATUS'; playerId: string; status: PStatus }
  | { type: 'TACTICS'; corrida: number; agressividade: number }
  | { type: 'FOCUS'; focus: Focus }
  | { type: 'UPGRADE'; kind: 'estadio' | 'centroTreino' }
  | { type: 'RELEASE'; playerId: string }
  | { type: 'TAG'; playerId: string }
  | { type: 'SIGN'; playerId: string }
  | { type: 'SIGN_OFFER'; playerId: string; offer: ContractOffer }
  | { type: 'NEGOTIATE'; playerId: string; offer: ContractOffer }
  | { type: 'RENEW_STAFF'; staffId: string; offer: ContractOffer }
  | { type: 'DRAFT_PICK'; playerId: string }
  | { type: 'DRAFT_AUTO' }
  | { type: 'DRAFT_ALL' }
  | { type: 'ADVANCE_OFFPHASE' }
  | { type: 'START_SEASON' }
  | { type: 'AUTO_FIX' }
  | { type: 'TRADE_PROPOSE'; to: string; give: TradeAsset[]; get: TradeAsset[] }
  | { type: 'INVESTIGATE'; playerId: string }
  | { type: 'TOGGLE_BOARD'; playerId: string }
  | { type: 'STUDY_OPPONENT'; teamId: string }
  | { type: 'PROBOWL_VOTE'; playerId: string }
  | { type: 'TOAST_CLEAR' };

function reducerCore(st: StoreState, a: Action): StoreState {
  switch (a.type) {
    case 'NEW_GAME': {
      const game = newGame(a.teamId, newSeed());
      return { game, screen: 'home', saveExists: true, toast: null };
    }
    case 'LOAD_SAVE':
      return { game: a.game, screen: 'home', saveExists: true, toast: null };
    case 'SCREEN':
      return { ...st, screen: a.screen };
    case 'CONTINUE': {
      if (!st.game) return st;
      const { state, out } = advanceRound(st.game);
      // votação do Pro Bowl após cada semana da temporada regular
      if (out.match && state.settings.fase === 'REG') {
        const boxes = state.weekResults.length
          ? [] : [];
        void boxes;
      }
      let screen: Screen = st.screen;
      if (out.match) screen = 'partida';
      else if (state.settings.fase === 'OFF') screen = 'offseason';
      return { ...st, game: state, screen };
    }
    case 'DISMISS_RESULT': {
      if (!st.game) return st;
      const g = { ...st.game, lastResult: null };
      const screen: Screen = g.settings.fase === 'OFF' ? 'offseason' : 'home';
      return { ...st, game: g, screen };
    }
    case 'SET_STATUS': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      setStatus(g, a.playerId, a.status);
      return { ...st, game: g };
    }
    case 'TACTICS': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      setTactics(g, a.corrida, a.agressividade);
      return { ...st, game: g, toast: 'Táticas atualizadas.' };
    }
    case 'FOCUS': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      g.focus = a.focus;
      g.trainingState.focus = a.focus;
      return { ...st, game: g, toast: `Foco de treino: ${a.focus.toLowerCase()}.` };
    }
    case 'UPGRADE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = upgrade(g, a.kind);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'RELEASE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = releasePlayer(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'TAG': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const ok = applyTag(g, a.playerId);
      return { ...st, game: ok ? g : st.game, toast: ok ? 'Franchise tag aplicada.' : 'Não foi possível aplicar a tag.' };
    }
    case 'SIGN': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = signFA(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'SIGN_OFFER': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const p = g.faPool.find(x => x.id === a.playerId);
      if (!p) return st;
      const r = signFAWithOffer(g, p, a.offer);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'NEGOTIATE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = negotiateContract(g, a.playerId, a.offer);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'RENEW_STAFF': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = renewStaff(g, a.staffId, a.offer);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'DRAFT_PICK': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = userDraftPick(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'DRAFT_AUTO': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      autoDraftUntilUser(g);
      return { ...st, game: g };
    }
    case 'DRAFT_ALL': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      autoDraftAll(g);
      return { ...st, game: g, toast: 'Draft concluído pela IA.' };
    }
    case 'ADVANCE_OFFPHASE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = advanceOffPhase(g);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'START_SEASON': {
      if (!st.game) return st;
      if ((st.game.offPhase ?? 1) !== 4)
        return { ...st, toast: 'Avance pelas fases da offseason antes de iniciar.' };
      const chk = validateRoster(st.game);
      if (!chk.ok) return { ...st, toast: `Validação pendente: ${chk.erros[0]}` };
      const g = newSeason(st.game, (s2, rng, ranks) => buildWorldFor(s2, rng, ranks));
      resetScouting(g);
      return { ...st, game: g, screen: 'home', toast: `Temporada ${g.settings.temporada} iniciada!` };
    }
    case 'AUTO_FIX': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = autoFixRoster(g);
      return { ...st, game: g, toast: r.msg };
    }
    case 'TRADE_PROPOSE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = executeProposal(g, { from: g.userTeam, to: a.to, give: a.give, get: a.get }, new Rng(newSeed()));
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'INVESTIGATE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = investigate(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'TOGGLE_BOARD': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = toggleBoard(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.ok ? null : r.msg };
    }
    case 'STUDY_OPPONENT': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = studyOpponent(g, a.teamId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'PROBOWL_VOTE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = castFanVote(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'TOAST_CLEAR':
      return { ...st, toast: null };
    default:
      return st;
  }
}

/* reducer protegido: nenhum erro de lógica derruba a árvore */
function reducer(st: StoreState, a: Action): StoreState {
  try {
    return reducerCore(st, a);
  } catch (e) {
    console.error('TAG — erro na ação', a.type, e);
    return { ...st, toast: 'Algo deu errado na simulação (save preservado). Tente de novo.' };
  }
}

/* ---------- contexto ---------- */
interface Ctx { st: StoreState; dispatch: Dispatch<Action>; }
const GameCtx = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [st, dispatch] = useReducer(reducer, null, (): StoreState => ({
    game: null,
    screen: 'home',
    saveExists: loadSave() !== null,
    toast: null,
  }));

  // autosave
  useEffect(() => {
    if (st.game) saveGame(st.game);
  }, [st.game]);

  // auto-dismiss toast
  useEffect(() => {
    if (!st.toast) return;
    const t = setTimeout(() => dispatch({ type: 'TOAST_CLEAR' }), 4200);
    return () => clearTimeout(t);
  }, [st.toast]);

  return <GameCtx.Provider value={{ st, dispatch }}>{children}</GameCtx.Provider>;
}

export function useGame(): Ctx {
  const ctx = useContext(GameCtx);
  if (!ctx) throw new Error('useGame fora do GameProvider');
  return ctx;
}

// re-exports úteis para as telas
export { advance, teamById };
