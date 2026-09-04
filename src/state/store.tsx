import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode, type Dispatch } from 'react';
import type { ContractOffer, Focus, GameState, PStatus, Screen, TradeAsset } from '../game/types';
import { zeroStats } from '../game/types';
import { newGame, buildWorldFor, buildRivalries } from '../game/generate';
import {
  advance, advanceOffPhase, applyTag, autoDraftAll, autoDraftUntilUser, autoFixRoster,
  enforceAllCompliance, generateNFLSchedule, hireScoutStaff, negotiateContract, newSeason,
  releasePlayer, renewPlayer, renewStaff, setStatus, setTactics, signFA, signFAWithOffer,
  upgrade, userDraftPick, validateRoster, type RankMap,
} from '../game/season';
import { newSeed, Rng } from '../game/rng';
import { restructureContract } from '../game/contracts';
import { executeProposal } from '../game/trades';
import { castFanVote } from '../game/probowl';
import { investigate, studyOpponent, toggleBoard } from '../game/scouting';
import { markRead, toggleStar, toggleArchive, removeMessage, markAllRead, applyToJob } from '../game/messaging';

const SAVE_KEY = 'gridiron-nfl-save-v1';

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (!s.teams || !s.players || !s.settings) return null;
    if (!Array.isArray(s.news)) s.news = [];
    if (!Array.isArray(s.hallOfFame)) s.hallOfFame = [];
    if (!Array.isArray(s.seasonStorylines)) s.seasonStorylines = [];
    if (!Array.isArray(s.opponentScouting)) s.opponentScouting = [];
    if (!Array.isArray(s.rivalries) || s.rivalries.length === 0) s.rivalries = buildRivalries(s.teams);
    for (const rivalry of s.rivalries) {
      rivalry.gamesPlayed ??= 0;
      rivalry.team1Wins ??= 0;
      rivalry.team2Wins ??= 0;
      rivalry.draws ??= 0;
    }
    if (!Array.isArray(s.narrativas)) s.narrativas = [];
    if (!Array.isArray(s.campeoes)) s.campeoes = [];
    if (!s.historico) s.historico = {};
    if (!Array.isArray(s.faPool)) s.faPool = [];
    if (!Array.isArray(s.draftClass)) s.draftClass = [];
    if (!Array.isArray(s.staff)) s.staff = [];
    if (typeof s.scoutBudget !== 'number') { s.scoutBudget = 10; s.scoutBudgetMax = 10; }
    // saves antigos podem não ter posse de picks nem log de trocas
    if (!Array.isArray(s.pickOwners)) {
      s.pickOwners = Array.from({ length: 7 }, () =>
        Array.from({ length: 32 }, (_, slot) => ({
          owner: s.teams[slot % s.teams.length].id,
          from: null,
        })));
    }
    if (!Array.isArray(s.tradeLog)) s.tradeLog = [];
    if (!Array.isArray(s.teamSeasonStats)) s.teamSeasonStats = [];
    if (!Array.isArray(s.powerRankings)) s.powerRankings = [];
    if (!s.probowl) s.probowl = { season: s.settings.temporada, lastWeek: 0, votes: [], userFanVote: null, announced: false };
    if (!s.trainingState) s.trainingState = { focus: s.focus ?? 'FISICO', intensity: 'NORMAL', playersTraining: [] };
    // saves antigos: preenche campos novos de PlayerStats e TeamSeasonStats
    for (const p of s.players) {
      p.stats = { ...zeroStats(), ...p.stats };
      p.careerStats = { ...zeroStats(), ...p.careerStats };
      if (typeof p.lesaoTotal !== 'number') p.lesaoTotal = p.lesao > 0 ? p.lesao : 0;
      if (typeof p.clutchRating !== 'number') p.clutchRating = p.ovr > 85 ? 80 : 70;
      if (typeof p.careerProBowls !== 'number') p.careerProBowls = 0;
      if (typeof p.careerChampionships !== 'number') p.careerChampionships = 0;
      if (typeof p.anosNoTime !== 'number') p.anosNoTime = p.teamId ? Math.max(0, Math.min(8, p.idade - 22)) : 0;
    }
    for (const t of s.teams) {
      if (typeof t.quimica !== 'number') t.quimica = 65;
      if (typeof t.teamChurn !== 'number') t.teamChurn = 0;
      if (!t.tactics.playbook) t.tactics.playbook = 'balanced';
    }
    /* Repara calendário incompleto (bug antigo gerava 16 jogos p/ alguns times).
       Só regenera se nenhuma partida da temporada regular foi jogada. */
    try {
      const regPlayed = s.matches.some(m => m.fase === 'REG' && m.jogada);
      if (!regPlayed) {
        const cnt = new Map<string, number>();
        for (const m of s.matches) if (m.fase === 'REG') {
          cnt.set(m.casa, (cnt.get(m.casa) ?? 0) + 1);
          cnt.set(m.fora, (cnt.get(m.fora) ?? 0) + 1);
        }
        // detecta time jogando 2x na mesma semana (bug antigo de agendamento)
        const perWeek = new Map<number, Set<string>>();
        let weekConflict = false;
        for (const m of s.matches) if (m.fase === 'REG') {
          const set = perWeek.get(m.rodada) ?? new Set<string>();
          if (set.has(m.casa) || set.has(m.fora)) { weekConflict = true; break; }
          set.add(m.casa); set.add(m.fora);
          perWeek.set(m.rodada, set);
        }
        if (weekConflict || s.teams.some(t => (cnt.get(t.id) ?? 0) !== 17)) {
          const rng = new Rng(newSeed());
          const ranks: RankMap = new Map();
          for (const conf of ['AFC', 'NFC'] as const) {
            for (let d = 0; d < 4; d++) {
              const div = s.teams.filter(t => t.conf === conf && t.div === d)
                .sort((a, b) => (b.histCampanha?.[0] ?? 0.5) - (a.histCampanha?.[0] ?? 0.5));
              div.forEach((t, i) => ranks.set(t.id, i + 1));
            }
          }
          const kept = s.matches.filter(m => m.fase !== 'REG');
          const reg = generateNFLSchedule(
            s.teams.map(t => ({ id: t.id, conf: t.conf, div: t.div })),
            s.settings.temporada, ranks, rng,
          );
          s.matches = [...kept, ...reg];
          s.news.unshift({ id: Date.now(), rotulo: 'LIGA', texto: 'Calendário da temporada regular regenerado (17 jogos por franquia).' });
        }
      }
    } catch { /* mantém o calendário salvo se o reparo falhar */ }
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
  | { type: 'RESTRUCTURE'; playerId: string }
  | { type: 'TAG'; playerId: string }
  | { type: 'SET_STATUS'; playerId: string; status: PStatus }
  | { type: 'TACTICS'; corrida: number; agressividade: number }
  | { type: 'PLAYBOOK'; playbook: import('../game/types').PlaybookStyle }
  | { type: 'UPGRADE'; kind: 'estadio' | 'centroTreino' }
  | { type: 'FOCUS'; focus: Focus }
  | { type: 'TRAINING_INTENSITY'; intensity: 'LEVE' | 'NORMAL' | 'INTENSO' }
  | { type: 'DRAFT_PICK'; playerId: string }
  | { type: 'DRAFT_AUTO' }
  | { type: 'DRAFT_ALL' }
  | { type: 'ADVANCE_OFFPHASE' }
  | { type: 'START_SEASON' }
  | { type: 'AUTO_FIX' }
  | { type: 'NEGOTIATE'; playerId: string; offer: ContractOffer }
  | { type: 'SIGN_OFFER'; playerId: string; offer: ContractOffer }
  | { type: 'RENEW_STAFF'; staffId: string; offer: ContractOffer }
  | { type: 'TRADE_PROPOSE'; to: string; give: TradeAsset[]; get: TradeAsset[] }
  | { type: 'INVESTIGATE'; playerId: string }
  | { type: 'STUDY_OPPONENT'; teamId: string }
  | { type: 'TOGGLE_BOARD'; playerId: string }
  | { type: 'HIRE_SCOUT' }
  | { type: 'PROBOWL_VOTE'; playerId: string }
  | { type: 'TOAST_CLEAR' }
  | { type: 'MSG_READ'; id: number }
  | { type: 'MSG_STAR'; id: number }
  | { type: 'MSG_ARCHIVE'; id: number }
  | { type: 'MSG_DELETE'; id: number }
  | { type: 'MSG_READ_ALL'; category?: MessageCategory }
  | { type: 'APPLY_JOB'; jobId: number };

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
      const { state, trainingResults } = advance(st.game);
      const screen: Screen = state.lastResult ? 'partida' : st.screen;
      
      // Prepara feedback visual dos jogadores que evoluíram
      let toastMsg: string | null = null;
      if (trainingResults && trainingResults.length > 0) {
        const destaques = trainingResults.slice(0, 3).map(t => {
          const attrsMelhoradas = Object.entries(t.improvements)
            .map(([attr, val]) => `${attr}+${val}`)
            .join(', ');
          return `${t.nome} (${attrsMelhoradas})`;
        });
        toastMsg = `📈 Treino: ${destaques.join(', ')}${trainingResults.length > 3 ? ` e +${trainingResults.length - 3}` : ''}`;
      }
      
      return { ...st, game: state, screen, toast: toastMsg };
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
    case 'RESTRUCTURE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = restructureContract(g.players.find(p => p.id === a.playerId)!);
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
    case 'PLAYBOOK': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const team = g.teams.find(t => t.id === g.userTeam);
      if (team) team.tactics.playbook = a.playbook;
      return { ...st, game: g, toast: `Playbook: ${a.playbook.replace('_', ' ')}.` };
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
      g.trainingState.focus = a.focus;
      return { ...st, game: g, toast: `Foco de treinamento: ${a.focus}.` };
    }
    case 'TRAINING_INTENSITY': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      g.trainingState.intensity = a.intensity;
      return { ...st, game: g, toast: `Intensidade de treino: ${a.intensity.toLowerCase()}.` };
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
      // bloqueio obrigatório: só inicia com todas as validações da Fase 4 passando
      const chk = validateRoster(st.game);
      if (!chk.ok) return { ...st, toast: `Não dá para iniciar: ${chk.erros[0]}` };
      const g = newSeason(st.game, buildWorldFor);
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
      const r = executeProposal(g, {
        from: g.userTeam, to: a.to, give: a.give, get: a.get,
      }, new Rng(newSeed()));
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'INVESTIGATE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = investigate(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'STUDY_OPPONENT': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = studyOpponent(g, a.teamId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'TOGGLE_BOARD': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = toggleBoard(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'HIRE_SCOUT': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = hireScoutStaff(g);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'PROBOWL_VOTE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = castFanVote(g, a.playerId);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'NEGOTIATE': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = negotiateContract(g, a.playerId, a.offer);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'SIGN_OFFER': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const fa = g.faPool.find(p => p.id === a.playerId);
      if (!fa) return { ...st, toast: 'Jogador indisponível.' };
      const r = signFAWithOffer(g, fa, a.offer);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
    }
    case 'RENEW_STAFF': {
      if (!st.game) return st;
      const g = structuredClone(st.game);
      const r = renewStaff(g, a.staffId, a.offer);
      return { ...st, game: r.ok ? g : st.game, toast: r.msg };
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
    console.error('TAG — erro na ação', a.type, e);
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
