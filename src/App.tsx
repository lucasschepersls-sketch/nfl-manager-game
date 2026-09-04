import { Component, type ErrorInfo, type ReactNode } from 'react';
import { GameProvider, useGame } from './state/store';
import { teamById } from './game/season';
import { Icons, TeamCrest } from './components/ui';
import type { Screen } from './game/types';

import StartScreen from './screens/Start';
import MatchScreen from './screens/Match';
import StatsScreen from './screens/Stats';
import { ClubHomeScreen } from './screens/Club';
import { RosterScreen, TacticsScreen, MedicalScreen, LeagueRostersScreen } from './screens/Team';
import { ScheduleScreen, FinanceScreen, RivalriesScreen, TeamComparatorScreen, PowerRankingsScreen, StorylinesScreen } from './screens/League';
import { MarketScreen } from './screens/Market';
import { DraftScreen } from './screens/Draft';
import { OffseasonScreen } from './screens/Offseason';
import { ScoutingScreen } from './screens/Scouting';
import { NegotiationsScreen } from './screens/Negotiations';
import { TradesScreen } from './screens/Trades';
import { InboxScreen, JobsScreen } from './screens/Inbox';
import { StandingsScreen } from './screens/Standings';
import { unreadCount } from './game/messaging';
import { WeekLeagueScreen } from './screens/WeekLeague';
import { ProBowlScreen } from './screens/ProBowl';
import { HallOfFameScreen } from './screens/HallOfFame';

/* ---------- navegação ---------- */
const NAV: { s: Screen; label: string; icon: keyof typeof Icons; grupo: string }[] = [
  { s: 'home', label: 'Visão Geral', icon: 'home', grupo: 'CLUBE' },
  { s: 'inbox', label: 'Mensagens', glyph: '📧', grupo: 'CLUBE' },
  { s: 'jobs', label: 'Carreira', glyph: '💼', grupo: 'CLUBE' },
  { s: 'offseason', label: 'Offseason', icon: 'offseason', grupo: 'CLUBE' },
  { s: 'elenco', label: 'Elenco', icon: 'roster', grupo: 'CLUBE' },
  { s: 'taticas', label: 'Táticas & Treino', icon: 'tactics', grupo: 'CLUBE' },
  { s: 'dm', label: 'Depto. Médico', icon: 'medical', grupo: 'CLUBE' },
  { s: 'negociacoes', label: 'Contratos', icon: 'contract', grupo: 'CLUBE' },
  { s: 'trades', label: 'Trades', icon: 'trade', grupo: 'CLUBE' },
  { s: 'financas', label: 'Finanças', icon: 'money', grupo: 'CLUBE' },
  { s: 'calendario', label: 'Calendário', icon: 'calendar', grupo: 'LIGA' },
  { s: 'calendario-liga', label: 'Semana da Liga', icon: 'grid', grupo: 'LIGA' },
  { s: 'classificacao', label: 'Classificação', icon: 'standings', grupo: 'LIGA' },
  { s: 'probowl', label: 'Pro Bowl', icon: 'trophy', grupo: 'LIGA' },
  { s: 'hall-of-fame', label: 'Hall of Fame', icon: 'trophy', grupo: 'LIGA' },
  { s: 'rivalidades', label: 'Rivalidades', icon: 'trophy', grupo: 'LIGA' },
  { s: 'elencos-liga', label: 'Elencos da Liga', icon: 'roster', grupo: 'LIGA' },
  { s: 'comparador', label: 'Comparador H2H', icon: 'standings', grupo: 'LIGA' },
  { s: 'power-rankings', label: 'Power Rankings', icon: 'standings', grupo: 'LIGA' },
  { s: 'storylines', label: 'Narrativas da Temporada', icon: 'grid', grupo: 'LIGA' },
  { s: 'scouting', label: 'Scouting', icon: 'scout', grupo: 'LIGA' },
  { s: 'draft', label: 'Draft', icon: 'draft', grupo: 'LIGA' },
  { s: 'stats-teams', label: 'Ranking Times', icon: 'standings', grupo: 'RANKINGS' },
  { s: 'stats-off', label: 'Ofensiva', icon: 'tactics', grupo: 'RANKINGS' },
  { s: 'stats-def', label: 'Defensiva', icon: 'shield', grupo: 'RANKINGS' },
  { s: 'stats-st', label: 'Special Teams', icon: 'whistle', grupo: 'RANKINGS' },
];

const FASE_LABEL: Record<string, string> = {
  PRE: 'Pré-Temporada', REG: 'Temporada Regular', PO: 'Playoffs', OFF: 'Offseason',
};

/* ---------- ErrorBoundary: nenhum erro derruba a árvore ---------- */
class ErrorBoundary extends Component<{ children: ReactNode }, { erro: string | null }> {
  state = { erro: null as string | null };
  static getDerivedStateFromError(e: Error) { return { erro: e.message }; }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('TAG:', e, info); }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="panel mx-auto mt-10 max-w-xl p-8 text-center">
        <div className="font-disp text-[28px] font-extrabold uppercase text-blood">Bola perdida!</div>
        <p className="mt-2 font-mono text-[13px] leading-relaxed text-dim">
          Um erro inesperado interrompeu esta tela. Seu save automático está intacto.
        </p>
        <p className="mt-1 truncate font-mono text-[11px] text-faint">{this.state.erro}</p>
        <button className="btn btn-gold mt-5" onClick={() => window.location.reload()}>Recarregar o jogo</button>
      </div>
    );
  }
}

/* ---------- header ---------- */
function Header() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const { fase, semana, temporada } = g.settings;

  const faseChip = fase === 'REG' ? `${FASE_LABEL[fase]} · Semana ${semana}/18`
    : fase === 'PRE' ? `${FASE_LABEL[fase]} · Semana ${semana}/2`
      : fase === 'PO' ? `${FASE_LABEL[fase]} · Rodada ${Math.min(semana, 4)}/4`
        : FASE_LABEL[fase];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-pitcho/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1460px] items-center gap-4 px-5 py-2.5">
        <button className="flex items-center gap-3" onClick={() => dispatch({ type: 'SCREEN', screen: 'home' })} title="Visão geral">
          <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={38} />
          <span className="text-left leading-tight">
            <span className="block font-disp text-[19px] font-extrabold uppercase tracking-wide">{t.cidade} {t.nome}</span>
            <span className="block font-mono text-[10.5px] uppercase tracking-[0.2em] text-faint">TAG Manager · {temporada}</span>
          </span>
        </button>

        <span className={`tag ml-2 ${fase === 'OFF' ? 'border-gold/60 text-gold' : fase === 'PO' ? 'border-blood/60 text-blood' : 'border-grass/50 text-grass'}`}>
          {faseChip}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden font-mono text-[12px] text-dim md:block">
            Caixa <b className="text-goldhi">${t.dinheiro}M</b> · Moral <b className="text-ink">{t.moral}</b>
          </span>
          {fase !== 'OFF' && st.screen !== 'partida' && (
            <button className="btn btn-gold btn-pulse" onClick={() => dispatch({ type: 'CONTINUE' })}>
              <span className="text-[#241a02]">{Icons.play}</span>
              {fase === 'PRE' ? `Jogar Semana ${semana}` : fase === 'REG' ? `Jogar Semana ${semana}` : 'Simular Rodada'} »
            </button>
          )}
          {fase === 'OFF' && (
            <button className="btn btn-gold btn-pulse" onClick={() => dispatch({ type: 'SCREEN', screen: 'offseason' })}>
              {Icons.offseason} Offseason · Fase {g.offPhase ?? 1}/4 »
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------- sidebar ---------- */
function Sidebar() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const grupos = [...new Set(NAV.map(n => n.grupo))];

  return (
    <aside className="sticky top-[61px] hidden h-[calc(100vh-61px)] w-[218px] shrink-0 overflow-y-auto border-r border-line bg-pitcho/80 py-4 md:block">
      {grupos.map(gr => (
        <div key={gr} className="mb-4">
          <div className="px-4 pb-1.5 font-mono text-[10px] uppercase tracking-[0.28em] text-faint">{gr}</div>
          {NAV.filter(n => n.grupo === gr).map(n => (
            <button key={n.s} className={`nav-item ${st.screen === n.s ? 'on' : ''}`} onClick={() => dispatch({ type: 'SCREEN', screen: n.s })}>
              <span className="shrink-0 opacity-90">{Icons[n.icon]}</span>
              <span className="truncate">{n.label}</span>
              {n.s === 'draft' && g.settings.fase === 'OFF' && g.draftState && !g.draftState.done && (
                <span className="tag ml-auto border-gold/60 text-gold blink">AO VIVO</span>
              )}
              {n.s === 'scouting' && g.settings.fase === 'OFF' && g.scoutBudget > 0 && (
                <span className="tag ml-auto border-gold/50 text-gold">{g.scoutBudget} pts</span>
              )}
              {n.s === 'offseason' && g.settings.fase === 'OFF' && (
                <span className="tag ml-auto border-blood/50 text-blood">{g.offPhase ?? 1}/4</span>
              )}
            </button>
          ))}
        </div>
      ))}
      <div className="mt-6 px-4 text-center font-mono text-[10px] uppercase tracking-widest text-faint">
        autosave ativo ✓
      </div>
    </aside>
  );
}

/* ---------- roteador de telas ---------- */
function Content() {
  const { st } = useGame();
  switch (st.screen) {
    case 'partida': return <MatchScreen />;
    case 'elenco': return <RosterScreen />;
    case 'taticas': return <TacticsScreen />;
    case 'dm': return <MedicalScreen />;
    case 'negociacoes': return <NegotiationsScreen />;
    case 'trades': return <TradesScreen />;
    case 'mercado': return <MarketScreen />;
    case 'financas': return <FinanceScreen />;
    case 'calendario': return <ScheduleScreen />;
    case 'calendario-liga': return <WeekLeagueScreen />;
    case 'probowl': return <ProBowlScreen />;
    case 'hall-of-fame': return <HallOfFameScreen />;
    case 'rivalidades': return <RivalriesScreen />;
    case 'elencos-liga': return <LeagueRostersScreen />;
    case 'comparador': return <TeamComparatorScreen />;
    case 'power-rankings': return <PowerRankingsScreen />;
    case 'storylines': return <StorylinesScreen />;
    case 'scouting': return <ScoutingScreen />;
    case 'draft': return <DraftScreen />;
    case 'offseason': return <OffseasonScreen />;
    case 'stats-teams': return <StatsScreen tab="teams" />;
    case 'stats-off': return <StatsScreen tab="off" />;
    case 'stats-def': return <StatsScreen tab="def" />;
    case 'stats-st': return <StatsScreen tab="st" />;
    case 'classificacao': return <StandingsScreen />;
    case 'inbox': return <InboxScreen />;
    case 'jobs': return <JobsScreen />;
    default: return <ClubHomeScreen />;
  }
}

/* ---------- toast ---------- */
function Toast() {
  const { st, dispatch } = useGame();
  if (!st.toast) return null;
  return (
    <button
      className="toast-anim fixed bottom-6 left-1/2 z-50 max-w-[620px] -translate-x-1/2 border border-gold/60 bg-[#1a2f20] px-5 py-3 text-left shadow-[0_14px_40px_rgba(0,0,0,0.6)]"
      onClick={() => dispatch({ type: 'TOAST_CLEAR' })}
      title="Clique para fechar"
    >
      <span className="font-mono text-[12.5px] leading-snug text-ink">{st.toast}</span>
    </button>
  );
}

/* ---------- shell ---------- */
function Shell() {
  const { st } = useGame();
  if (!st.game) return <StartScreen />;
  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto flex max-w-[1460px]">
        <Sidebar />
        <main className="min-w-0 flex-1 px-5 py-5">
          <div key={st.screen} className="reveal">
            <ErrorBoundary>
              <Content />
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}
