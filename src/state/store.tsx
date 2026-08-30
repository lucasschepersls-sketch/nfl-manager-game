import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode, type Dispatch } from 'react';
import type { Focus, GameState, PStatus, Screen } from '../game/types';
import { newGame, buildWorldFor } from '../game/generate';
import {
  advance, advanceOffPhase, applyTag, autoDraftAll, autoDraftUntilUser, autoFixRoster,
  enforceAllCompliance, newSeason, releasePlayer, renewPlayer, setStatus, setTactics,
  signFA, upgrade, userDraftPick,
} from '../game/season';
import { newSeed } from '../game/rng';

const SAVE_KEY = 'gridiron-nfl-save-v1';

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (!s.teams || !s.players || !s.settings) return null;
    if (!Array.isArray(s.news)) s.news = [];
    if (!Array.isArray(s.campeoes)) s.campeoes = [];
    if (!Array.isArray(s.faPool)) s.faPool = [];
    if (!Array.isArray(s.draftClass)) s.draftClass = [];
    if (!Array.isArray(s.staff)) s.staff = [];
    if (typeof s.scoutBudget !== 'number') { s.scoutBudget = 10; s.scoutBudgetMax = 10; }
    return s;
  } catch {
    return null;
  }
}

export type Action =
  | { type: 'NEW_GAME'; teamId: string }
  | { type: 'LOAD_SAVE'; game: GameState }
  | { type: 'CONTINUE' }
  | { type: 'DISMISS_RESULT' }
  | { type: 'SCREEN'; screen: Screen }
  | { type: 'SIGN'; playerId: string }
  | { type: 'RELEASE'; playerId: string }
  | { type: 'RENEW'; playerId: string }
  | { type: 'TAG'; playerId: string }
  | { type: 'SET_STATUS'; playerId: string; status: PStatus }
  | { type: 'TACTICS'; corrida: number; agressividade: number }
  | { type: 'UPGRADE'; kind: 'estadio' | 'centroTreino' }
  | { type: 'FOCUS'; focus: Focus }
  | { type: 'DRAFT_PICK'; playerId: string }
  | { type: 'DRAFT_AUTO' }
  | { type: 'DRAFT_ALL' }
  | { type: 'ADVANCE_OFFPHASE' }
  | { type: 'START_SEASON' }
  | { type: 'AUTO_FIX' }
  | { type: 'TOAST_CLEAR' };

interface StoreState {
  game: GameState | null;
  screen: Screen;
  saveExists: boolean;
  toast: string | null;
}

function reducerCore(st: StoreState, a: Action): StoreState {
  switch (a.type) {
    case 'NEW_GAME': {
      const game = newGame(a.teamId, newSeed());
      enforceAllCompliance(game);
      return { game, screen: 'home', saveExists: true, toast: null };
    }
    case 'LOAD_SAVE':
      return { game: a.game, screen: 'home', saveExists: true, toast: null };
    case 'CONTINUE': {
      if (!st.game) return st;
      const { state } = advance(st.game);
      const screen: Screen = state.lastResult ? 'partida' : st.screen;
      return { ...st, game: state, screen };
    }
    case 'DISMISS_RESULT':
      return { ...st, screen: st.game?.settings.fase === 'OFF' ? 'offseason' : 'home' };
    case 'SCREEN':
      return { ...st, screen: a.screen };
    case 'SIGN': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = signFA(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'RELEASE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = releasePlayer(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'RENEW': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = renewPlayer(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'TAG': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const ok = applyTag(g, a.playerId);
      return { ...st, game: ok ? g : st.game, toast: ok ? 'Franchise tag aplicada.' : 'Não foi possível aplicar a tag.' };
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
      return { ...st, game: g, toast: 'Plano de jogo atualizado.' };
    }
    case 'UPGRADE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = upgrade(g, a.kind);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'FOCUS': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      g.focus = a.focus;
      return { ...st, game: g, toast: `Foco de treinamento: ${a.focus}.` };
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
      return { ...st, game: g };
    }
    case 'ADVANCE_OFFPHASE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = advanceOffPhase(g);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'START_SEASON': {
      if (!st.game) return st;
      const g = newSeason(st.game, buildWorldFor);
      return { ...st, game: g, screen: 'home', toast: `Temporada ${g.settings.temporada} iniciada!` };
    }
    case 'AUTO_FIX': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = autoFixRoster(g);
      return { ...st, game: g, toast: r.msg };
    }
    case 'TOAST_CLEAR':
      return { ...st, toast: null };
    default:
      return st;
  }
}

function reducer(st: StoreState, a: Action): StoreState {
  try {
    return reducerCore(st, a);
  } catch (e) {
    console.error('Gridiron — erro na ação', a.type, e);
    return { ...st, toast: 'Algo deu errado na simulação (save preservado).' };
  }
}

const Ctx = createContext<{ st: StoreState; dispatch: Dispatch<Action> } | null>(null);

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
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(st.game)); } catch { /* quota */ }
    }
  }, [st.game]);

  // auto-dismiss toast
  useEffect(() => {
    if (!st.toast) return;
    const t = setTimeout(() => dispatch({ type: 'TOAST_CLEAR' }), 4000);
    return () => clearTimeout(t);
  }, [st.toast]);

  const value = useMemo(() => ({ st, dispatch }), [st]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame fora do GameProvider');
  return v;
}
