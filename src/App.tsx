import { Component, type ErrorInfo, type ReactNode } from 'react';
import { GameProvider, useGame, loadSave } from './state/store';
import type { Screen } from './game/types';
import { teamById, capUsed, fmtM } from './game/season';
import { Icons, TeamCrest } from './components/ui';
import StartScreen from './screens/Start';
import { ClubHomeScreen } from './screens/Club';
import { RosterScreen, TacticsScreen, MedicalScreen } from './screens/Team';
import { ScheduleScreen, StandingsScreen, FinanceScreen } from './screens/League';
import MatchScreen from './screens/Match';
import { MarketScreen } from './screens/Market';
import { DraftScreen } from './screens/Draft';
import { OffseasonScreen } from './screens/Offseason';
import { TradesScreen } from './screens/Trades';
import StatsScreen from './screens/Stats';
import { ScoutingScreen } from './screens/Scouting';
import { NegotiationsScreen } from './screens/Negotiations';

const NAV: { s: Screen; label: string; icon: keyof typeof Icons; grupo: string }[] = [
  { s: 'home', label: 'Visão Geral', icon: 'home', grupo: 'CLUBE' },
  { s: 'offseason', label: 'Offseason', icon: 'offseason', grupo: 'CLUBE' },
  { s: 'elenco', label: 'Elenco', icon: 'roster', grupo: 'CLUBE' },
  { s: 'taticas', label: 'Táticas & Treino', icon: 'tactics', grupo: 'CLUBE' },
  { s: 'dm', label: 'Depto. Médico', icon: 'medical', grupo: 'CLUBE' },
  { s: 'mercado', label: 'Free Agency', icon: 'market', grupo: 'CLUBE' },
  { s: 'trades', label: 'Trades', icon: 'trade', grupo: 'CLUBE' },
  { s: 'negociacoes', label: 'Contratos', icon: 'contract', grupo: 'CLUBE' },
  { s: 'financas', label: 'Finanças', icon: 'money', grupo: 'CLUBE' },
  { s: 'draft', label: 'Draft', icon: 'draft', grupo: 'LIGA' },
  { s: 'scouting', label: 'Scouting', icon: 'scout', grupo: 'LIGA' },
  { s: 'calendario', label: 'Calendário', icon: 'calendar', grupo: 'LIGA' },
  { s: 'classificacao', label: 'Classificação', icon: 'standings', grupo: 'LIGA' },
  { s: 'stats-teams', label: 'Ranking Times', icon: 'standings', grupo: 'RANKINGS' },
  { s: 'stats-off', label: 'Ofensiva', icon: 'tactics', grupo: 'RANKINGS' },
  { s: 'stats-def', label: 'Defensiva', icon: 'shield', grupo: 'RANKINGS' },
  { s: 'stats-st', label: 'Special Teams', icon: 'whistle', grupo: 'RANKINGS' },
];

class ErrorBoundary extends Component<{ children: ReactNode }, { erro: string | null }> {
  state = { erro: null as string | null };
  static getDerivedStateFromError(e: Error) { return { erro: e.message }; }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('Gridiron:', e, info); }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="panel max-w-xl p-8 text-center">
          <div className="font-disp text-[30px] font-bold uppercase text-blood">Bola perdida!</div>
          <p className="mt-2 font-mono text-[13px] leading-relaxed text-dim">
            Um erro inesperado interrompeu a partida. Seu save automático está intacto.
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-faint">{this.state.erro}</p>
          <button className="btn btn-gold mt-5" onClick={() => window.location.reload()}>Voltar ao jogo</button>
        </div>
      </div>
    );
  }
}

function Header() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const fase = g.settings.fase;
  const faseLabel = fase === 'PRE' ? `Pré-temporada · Sem ${g.settings.semana}`
    : fase === 'REG' ? `Temporada ${g.settings.temporada} · Sem ${g.settings.semana}/18`
      : fase === 'PO' ? `Playoffs ${g.settings.temporada}` : `Offseason ${g.settings.temporada}`;
  const cap = capUsed(g, g.userTeam);
  const over = cap > g.settings.cap;
  return (
    <header className="sticky top-0 z-30 border-b border-line" style={{ background: 'rgba(10,26,18,0.94)', backdropFilter: 'blur(6px)' }}>
      <div className="mx-auto flex max-w-[1460px] items-center gap-4 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={34} />
          <div className="leading-tight">
            <div className="font-disp text-[18px] font-extrabold uppercase tracking-wide">{t.cidade} <span style={{ color: 'var(--color-goldhi)' }}>{t.nome}</span></div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-faint">Gridiron Manager · {faseLabel}</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 font-mono text-[12px]">
          <span className="chip">Caixa <b className="text-goldhi">${t.dinheiro}M</b></span>
          <span className="chip" style={over ? { borderColor: 'var(--color-blood)', color: 'var(--color-blood)' } : undefined}>
            Cap <b>{fmtM(cap)}</b>/{fmtM(g.settings.cap)}
          </span>
          <button className="btn btn-sm btn-ghost" title="Salvar e voltar à seleção"
            onClick={() => { const s = loadSave(); if (s) dispatch({ type: 'LOAD_SAVE', game: s }); window.location.reload(); }}>
            {Icons.out} Sair
          </button>
        </div>
      </div>
      <Ticker />
    </header>
  );
}

function Ticker() {
  const { st } = useGame();
  const g = st.game!;
  const items = g.news.slice(0, 8);
  if (!items.length) return null;
  const row = items.map((n, i) => (
    <span key={i} className="font-mono text-[11.5px] text-dim">
      <b className="text-gold">[{n.rotulo}]</b> {n.texto}
    </span>
  ));
  return (
    <div className="ticker border-t border-line2 py-1.5">
      <div className="ticker-track px-5">{row}{row}</div>
    </div>
  );
}

function Sidebar() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  let lastGrupo = '';
  return (
    <aside className="sticky top-[86px] hidden h-[calc(100vh-86px)] w-[212px] shrink-0 overflow-y-auto border-r border-line2 py-4 md:block">
      {NAV.map(n => {
        const header = n.grupo !== lastGrupo ? (lastGrupo = n.grupo, true) : false;
        return (
          <div key={n.s}>
            {header && <div className="px-4 pb-1 pt-3 font-disp text-[12px] font-bold uppercase tracking-[0.22em] text-faint">{n.grupo}</div>}
            <button className={`nav-item ${st.screen === n.s ? 'on' : ''}`} onClick={() => dispatch({ type: 'SCREEN', screen: n.s })}>
              <span className="opacity-80">{Icons[n.icon]}</span>
              {n.label}
              {n.s === 'draft' && g.settings.fase === 'OFF' && g.draftState && !g.draftState.done && (
                <span className="tag ml-auto border-gold/60 text-gold blink">AO VIVO</span>
              )}
            </button>
          </div>
        );
      })}
    </aside>
  );
}

function Toast() {
  const { st, dispatch } = useGame();
  if (!st.toast) return null;
  return (
    <div className="toast-anim fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2">
      <button className="panel border-gold/50 px-5 py-3 text-left font-mono text-[13px] text-ink shadow-2xl" onClick={() => dispatch({ type: 'TOAST_CLEAR' })}>
        {st.toast}
      </button>
    </div>
  );
}

function Content() {
  const { st } = useGame();
  switch (st.screen) {
    case 'elenco': return <RosterScreen />;
    case 'taticas': return <TacticsScreen />;
    case 'dm': return <MedicalScreen />;
    case 'calendario': return <ScheduleScreen />;
    case 'classificacao': return <StandingsScreen />;
    case 'financas': return <FinanceScreen />;
    case 'mercado': return <MarketScreen />;
    case 'trades': return <TradesScreen />;
    case 'negociacoes': return <NegotiationsScreen />;
    case 'draft': return <DraftScreen />;
    case 'stats-teams': return <StatsScreen tab="teams" />;
    case 'stats-off': return <StatsScreen tab="off" />;
    case 'stats-def': return <StatsScreen tab="def" />;
    case 'stats-st': return <StatsScreen tab="st" />;
    case 'scouting': return <ScoutingScreen />;
    case 'offseason': return <OffseasonScreen />;
    case 'partida': return <MatchScreen />;
    default: return <ClubHomeScreen />;
  }
}

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
            <Content />
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
      <ErrorBoundary>
        <Shell />
      </ErrorBoundary>
    </GameProvider>
  );
}
