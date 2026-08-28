import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import type { ContractOffer, Focus, GameState, PStatus, Screen } from '../game/types';
import { newGame } from '../game/generate';
import {
  advance, advanceRound, advanceOffPhase, autoDraftAll, autoDraftUntilUser, autoFixRoster,
  enforceAllCompliance, generateNFLSchedule, newSeason, pushNews, userDraftPick,
  validateRoster, type RankMap,
} from '../game/season';
import { buildDraftClass, buildStaffPool } from '../game/generate';
import { hireStaff, renewPlayer, renewStaff, fireStaff, signWithOffer, staffTurnover } from '../game/negotiations';
import { Rng, newSeed } from '../game/rng';

const SAVE_KEY = 'gridiron-manager-nfl-v2';

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (!s.teams?.length || !s.players?.length || !s.settings || !Array.isArray(s.matches)) return null;
    const set = s.settings as unknown as Record<string, unknown>;
    if (typeof set.tvGrowth !== 'number') set.tvGrowth = 5;
    if (typeof set.inflacao !== 'number') set.inflacao = 1;
    if (typeof set.tvDeal !== 'number') set.tvDeal = 12;
    for (const t of s.teams) {
      if (t.hostilidade == null) t.hostilidade = 65;
      if (!t.estadioNome) t.estadioNome = `Estádio de ${t.cidade}`;
      if (!Array.isArray(t.histCampanha)) t.histCampanha = [0.5, 0.5, 0.5];
    }
    for (const p of s.players) {
      if (p.jogosCarreira == null) p.jogosCarreira = p.stats?.jogos ?? 0;
      if (p.bonus == null) p.bonus = 0;
    }
    if (!Array.isArray(s.news)) s.news = [];
    if (!Array.isArray(s.campeoes)) s.campeoes = [];
    if (!Array.isArray(s.faPool)) s.faPool = [];
    if (!Array.isArray(s.draftClass)) s.draftClass = [];
    if (!Array.isArray(s.staff)) s.staff = [];
    if (!Array.isArray(s.staffPool)) s.staffPool = [];
    return s;
  } catch {
    return null;
  }
}

type Action =
  | { type: 'NEW_GAME'; teamId: string }
  | { type: 'LOAD_SAVE'; game: GameState }
  | { type: 'QUIT' }
  | { type: 'SCREEN'; screen: Screen }
  | { type: 'CONTINUE' }
  | { type: 'TACTICS'; corrida: number; agressividade: number }
  | { type: 'FOCUS'; focus: Focus }
  | { type: 'SET_STATUS'; playerId: string; status: PStatus }
  | { type: 'RELEASE'; playerId: string }
  | { type: 'TAG'; playerId: string }
  | { type: 'SIGN_OFFER'; playerId: string; offer: ContractOffer }
  | { type: 'RENEW'; playerId: string; offer: ContractOffer }
  | { type: 'DRAFT_PICK'; playerId: string }
  | { type: 'DRAFT_AUTO' }
  | { type: 'DRAFT_ALL' }
  | { type: 'UPGRADE'; kind: 'estadio' | 'centroTreino' }
  | { type: 'ADVANCE_OFFPHASE' }
  | { type: 'START_SEASON' }
  | { type: 'AUTO_FIX' }
  | { type: 'STAFF_HIRE'; staffId: string; offer: ContractOffer }
  | { type: 'STAFF_RENEW'; staffId: string; offer: ContractOffer }
  | { type: 'STAFF_FIRE'; staffId: string }
  | { type: 'DISMISS_RESULT' }
  | { type: 'TOAST_CLEAR' };

interface StoreState {
  game: GameState | null;
  screen: Screen;
  saveExists: boolean;
  toast: string | null;
}

function buildWorldFor(s: GameState, rng: Rng, ranks: RankMap) {
  const schedTeams = s.teams.map(t => ({ id: t.id, conf: t.conf, div: t.div }));
  const pre: GameState['matches'] = [];
  for (const rodada of [1, 2]) {
    const all = rng.shuffle(s.teams.map(t => t.id));
    for (let i = 0; i < 16; i++)
      pre.push({ id: `pre-${rodada}-${i}-${s.settings.temporada + 1}`, fase: 'PRE', rodada, casa: all[i * 2], fora: all[i * 2 + 1], placarCasa: null, placarFora: null, jogada: false });
  }
  let reg: GameState['matches'];
  try {
    reg = generateNFLSchedule(schedTeams, s.settings.temporada + 1, ranks, rng);
  } catch (e) {
    console.error('Calendário falhou na virada:', e);
    reg = [];
  }
  return { matches: [...pre, ...reg], draftClass: buildDraftClass(rng), staffPool: buildStaffPool(rng) };
}

/** Reducer protegido: erro de lógica nunca derruba a árvore (tela branca). */
function reducer(st: StoreState, a: Action): StoreState {
  try {
    return reducerCore(st, a);
  } catch (e) {
    console.error('Gridiron — erro na ação', a.type, e);
    return { ...st, toast: `Algo deu errado (${a.type}). Save preservado — tente de novo.` };
  }
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
    case 'QUIT':
      return { ...st, game: null, screen: 'home' };
    case 'SCREEN':
      return { ...st, screen: a.screen };
    case 'CONTINUE': {
      if (!st.game) return st;
      const g = st.game;
      const r = g.settings.fase === 'PO' ? advanceRound(g) : advance(g);
      const screen: Screen = r.out.match ? 'partida' : st.screen;
      return { ...st, game: r.state, screen, toast: null };
    }
    case 'TACTICS': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const t = g.teams.find(x => x.id === g.userTeam)!;
      t.tactics = { corrida: a.corrida, agressividade: a.agressividade };
      return { ...st, game: g };
    }
    case 'FOCUS': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      g.focus = a.focus;
      return { ...st, game: g };
    }
    case 'SET_STATUS': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const p = g.players.find(x => x.id === a.playerId);
      if (!p || p.teamId !== g.userTeam) return st;
      const roster = g.players.filter(x => x.teamId === g.userTeam);
      if (p.status === 'PS' && a.status !== 'PS' && roster.filter(x => x.status !== 'PS').length >= 53)
        return { ...st, toast: 'Elenco ativo cheio (53).' };
      if (p.status !== 'PS' && a.status === 'PS' && roster.filter(x => x.status === 'PS').length >= 10)
        return { ...st, toast: 'Practice Squad cheio (10).' };
      p.status = a.status;
      return { ...st, game: g };
    }
    case 'RELEASE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const p = g.players.find(x => x.id === a.playerId);
      if (!p || p.teamId !== g.userTeam) return st;
      g.players = g.players.filter(x => x.id !== a.playerId);
      p.teamId = null; p.status = 'RES'; p.origem = g.userTeam; p.bonus = 0;
      g.faPool.push(p);
      return { ...st, game: g, toast: `${p.nome} dispensado — agora é free agent.` };
    }
    case 'TAG': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const p = g.players.find(x => x.id === a.playerId);
      if (!p || p.teamId !== g.userTeam || p.contrato !== 1 || p.tag) return st;
      p.tag = true;
      pushNews(g, 'FRANCHISE TAG', `${p.nome} recebe a franchise tag: garantido por mais 1 temporada.`);
      return { ...st, game: g, toast: `Franchise tag aplicada em ${p.nome}.` };
    }
    case 'SIGN_OFFER': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = signWithOffer(g, a.playerId, a.offer, new Rng(newSeed()));
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'RENEW': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = renewPlayer(g, a.playerId, a.offer, new Rng(newSeed()));
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'DRAFT_PICK': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = userDraftPick(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.ok ? null : r.msg };
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
    case 'UPGRADE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const t = g.teams.find(x => x.id === g.userTeam)!;
      const cost = (lvl: number) => Math.round((8 + lvl * 6) * 10) / 10;
      if (t[a.kind] >= 5 || t.dinheiro < cost(t[a.kind])) return { ...st, toast: 'Caixa insuficiente para o upgrade.' };
      t.dinheiro = Math.round((t.dinheiro - cost(t[a.kind])) * 10) / 10;
      t[a.kind]++;
      return { ...st, game: g, toast: `${a.kind === 'estadio' ? 'Estádio' : 'Centro de treinamento'} agora nível ${t[a.kind]}!` };
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
        return { ...st, toast: 'Avance pelas fases da offseason (FA → Renovações → Draft) antes de iniciar.' };
      const chk = validateRoster(st.game);
      if (!chk.ok) return { ...st, toast: `Validação pendente: ${chk.erros[0]}` };
      const g = newSeason(st.game, buildWorldFor);
      staffTurnover(g, new Rng(newSeed()));
      pushNews(g, 'TEMPORADA', `Bola oval no ar! Temporada ${g.settings.temporada} oficialmente aberta. Boa sorte, GM!`);
      return { ...st, game: g, screen: 'home', toast: `Temporada ${g.settings.temporada} iniciada!` };
    }
    case 'AUTO_FIX': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = autoFixRoster(g);
      return { ...st, game: g, toast: r.msg };
    }
    case 'STAFF_HIRE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = hireStaff(g, a.staffId, a.offer, new Rng(newSeed()));
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'STAFF_RENEW': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = renewStaff(g, a.staffId, a.offer, new Rng(newSeed()));
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'STAFF_FIRE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = fireStaff(g, a.staffId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'DISMISS_RESULT': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      g.lastResult = null;
      const next: Screen = g.settings.fase === 'OFF' ? 'offseason' : 'home';
      return { ...st, game: g, screen: next };
    }
    case 'TOAST_CLEAR':
      return { ...st, toast: null };
    default:
      return st;
  }
}

const Ctx = createContext<{ st: StoreState; dispatch: React.Dispatch<Action> } | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [st, dispatch] = useReducer(reducer, null, (): StoreState => ({
    game: null,
    screen: 'home',
    saveExists: loadSave() !== null,
    toast: null,
  }));

  // autosave
  useEffect(() => {
    if (!st.game) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(st.game));
    } catch (e) {
      console.warn('Autosave falhou:', e);
    }
  }, [st.game]);

  const value = useMemo(() => ({ st, dispatch }), [st]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame fora do GameProvider');
  return v;
}
