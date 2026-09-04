import { createContext, useContext, useEffect, useReducer, type ReactNode, type Dispatch } from 'react';
import type { ContractOffer, Focus, GameState, PStatus, Screen, TradeProposal } from '../game/types';
import { newGame } from '../game/generate';
import { newSeed, Rng } from '../game/rng';
import {
  advance, advanceOffPhase, applyTag, autoDraftAll, autoDraftUntilUser,
  negotiateContract, releasePlayer, renewStaff, setTactics, setStatus,
  signFA, upgrade, userDraftPick,
} from '../game/season';
import { executeProposal } from '../game/trades';
import { castFanVote } from '../game/probowl';
import { studyOpponent } from '../game/scouting';
import {
  markRead, toggleStar, toggleArchive, removeMessage, markAllRead, applyToJob,
} from '../game/messaging';

const SAVE_KEY = 'tag-manager-save-v1';

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as GameState;
    // migração para saves antigos (antes do sistema de mensagens)
    if (!Array.isArray(g.messages)) g.messages = [];
    if (!Array.isArray(g.coachHistory)) g.coachHistory = [];
    if (!Array.isArray(g.jobOpenings)) g.jobOpenings = [];
    if (typeof g.coachFired !== 'boolean') g.coachFired = false;
    return g;
  } catch {
    return null;
  }
}

export interface StoreState {
  game: GameState | null;
  screen: Screen;
  saveExists: boolean;
  toast: string | null;
}

export type Action =
  | { type: 'NEW_GAME'; teamId: string }
  | { type: 'LOAD_SAVE'; game: GameState }
  | { type: 'CONTINUE' }
  | { type: 'DISMISS_RESULT' }
  | { type: 'SCREEN'; screen: Screen }
  | { type: 'SIGN'; playerId: string }
  | { type: 'RELEASE'; playerId: string }
  | { type: 'RENEW'; playerId: string; offer: ContractOffer }
  | { type: 'RENEW_STAFF'; staffId: string; offer: ContractOffer }
  | { type: 'TAG'; playerId: string }
  | { type: 'SET_STATUS'; playerId: string; status: PStatus }
  | { type: 'TACTICS'; corrida: number; agressividade: number }
  | { type: 'PLAYBOOK'; playbook: GameState['teams'][number]['tactics']['playbook'] }
  | { type: 'UPGRADE'; kind: 'estadio' | 'centroTreino' }
  | { type: 'FOCUS'; focus: Focus }
  | { type: 'DRAFT_PICK'; playerId: string }
  | { type: 'DRAFT_AUTO' }
  | { type: 'DRAFT_ALL' }
  | { type: 'ADVANCE_OFFPHASE' }
  | { type: 'PROBOWL_VOTE'; playerId: string }
  | { type: 'TRADE_PROPOSE'; proposal: TradeProposal }
  | { type: 'STUDY_OPPONENT'; teamId: string }
  | { type: 'MSG_READ'; id: number }
  | { type: 'MSG_STAR'; id: number }
  | { type: 'MSG_ARCHIVE'; id: number }
  | { type: 'MSG_DELETE'; id: number }
  | { type: 'MSG_READ_ALL'; category?: import('../game/types').MessageCategory }
  | { type: 'APPLY_JOB'; jobId: number }
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
    case 'TOAST_CLEAR':
      return { ...st, toast: null };
    case 'DISMISS_RESULT':
      return st.game ? { ...st, game: { ...st.game, lastResult: null }, screen: 'home' } : st;
    case 'CONTINUE': {
      if (!st.game) return st;
      try {
        const { state, out } = advance(st.game);
        // Se o usuário jogou, mostra a partida; se não (ex.: eliminado/não foi aos
        // playoffs), leva para a Semana da Liga para acompanhar os resultados.
        const nextScreen = out.match
          ? 'partida'
          : state.settings.fase === 'PO'
            ? 'calendario-liga'
            : st.screen;
        return { ...st, game: state, screen: nextScreen };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const fase = st.game?.settings.fase ?? '?';
        const semana = st.game?.settings.semana ?? '?';
        console.error(`[TAG] Erro ao simular (fase=${fase}, semana=${semana}):`, e);
        return { ...st, toast: `Erro ao simular (${fase} sem. ${semana}): ${msg}` };
      }
    }
    case 'SIGN': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = signFA(g, a.playerId);
      return { ...st, game: g, toast: r.msg };
    }
    case 'RELEASE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = releasePlayer(g, a.playerId);
      return { ...st, game: g, toast: r.msg };
    }
    case 'RENEW': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = negotiateContract(g, a.playerId, a.offer);
      return { ...st, game: g, toast: r.msg };
    }
    case 'RENEW_STAFF': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = renewStaff(g, a.staffId, a.offer);
      return { ...st, game: g, toast: r.msg };
    }
    case 'TAG': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const ok = applyTag(g, a.playerId);
      return { ...st, game: g, toast: ok ? 'Franchise tag aplicada.' : 'Não foi possível aplicar a tag.' };
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
      return { ...st, game: g };
    }
    case 'PLAYBOOK': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const me = g.teams.find(t => t.id === g.userTeam);
      if (me) me.tactics.playbook = a.playbook;
      return { ...st, game: g };
    }
    case 'UPGRADE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = upgrade(g, a.kind);
      return { ...st, game: g, toast: r.msg };
    }
    case 'FOCUS': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      g.focus = a.focus;
      return { ...st, game: g };
    }
    case 'DRAFT_PICK': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = userDraftPick(g, a.playerId);
      return { ...st, game: g, toast: r.msg };
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
      return { ...st, game: g, toast: r.msg };
    }
    case 'PROBOWL_VOTE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = castFanVote(g, a.playerId);
      return { ...st, game: g, toast: r.msg };
    }
    case 'TRADE_PROPOSE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = executeProposal(g, a.proposal, new Rng(newSeed()));
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'STUDY_OPPONENT': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = studyOpponent(g, a.teamId);
      return { ...st, game: g, toast: r.msg };
    }
    case 'MSG_READ': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      markRead(g, a.id);
      return { ...st, game: g };
    }
    case 'MSG_STAR': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      toggleStar(g, a.id);
      return { ...st, game: g };
    }
    case 'MSG_ARCHIVE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      toggleArchive(g, a.id);
      return { ...st, game: g };
    }
    case 'MSG_DELETE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      removeMessage(g, a.id);
      return { ...st, game: g };
    }
    case 'MSG_READ_ALL': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      markAllRead(g, a.category);
      return { ...st, game: g };
    }
    case 'APPLY_JOB': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = applyToJob(g, a.jobId, new Rng(newSeed()));
      return { ...st, game: g, toast: r.msg, screen: r.ok ? 'home' : st.screen };
    }
    default:
      return st;
  }
}

function reducer(st: StoreState, a: Action): StoreState {
  try {
    return reducerCore(st, a);
  } catch (e) {
    console.error('TAG — erro na ação', a.type, e);
    return { ...st, toast: 'Algo deu errado. Tente novamente.' };
  }
}

const StoreCtx = createContext<{ st: StoreState; dispatch: Dispatch<Action> } | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [st, dispatch] = useReducer(reducer, null, (): StoreState => ({
    game: null,
    screen: 'home',
    saveExists: loadSave() !== null,
    toast: null,
  }));

  // autosave
  useEffect(() => {
    if (st.game) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(st.game)); } catch { /* noop */ }
    }
  }, [st.game]);

  // auto-dismiss do toast
  useEffect(() => {
    if (!st.toast) return;
    const t = setTimeout(() => dispatch({ type: 'TOAST_CLEAR' }), 4200);
    return () => clearTimeout(t);
  }, [st.toast]);

  return <StoreCtx.Provider value={{ st, dispatch }}>{children}</StoreCtx.Provider>;
}

export function useGame() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useGame deve ser usado dentro de GameProvider');
  return ctx;
}
