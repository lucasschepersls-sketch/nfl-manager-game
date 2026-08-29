import React, { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { GameProvider, useGame, loadSave } from './state/store';
import { Icons, TeamCrest } from './components/ui';
import type { Screen } from './game/types';
import { teamById, capUsed, fmtM } from './game/season';
import StartScreen from './screens/Start';
import MatchScreen from './screens/Match';
import { ClubHomeScreen } from './screens/Club';
import { RosterScreen, TacticsScreen, MedicalScreen } from './screens/Team';
import { StandingsScreen, ScheduleScreen, FinanceScreen } from './screens/League';
import { MarketScreen } from './screens/Market';
import StaffScreen from './screens/Staff';
import DraftScreen from './screens/Draft';
import OffseasonScreen from './screens/Offseason';

class ErrorBoundary extends Component<{ children: ReactNode }, { erro: string | null }> {
  state = { erro: null as string | null };
  static getDerivedStateFromError(e: Error) { return { erro: e.message }; }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('Gridiron:', e, info); }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="panel max-w-xl p-8 text-center">
        <div className="font-disp text-[26px] font-bold uppercase text-blood">Bola perdida!</div>
        <p className="mt-2 font-mono text-[13px] text-dim">Um erro inesperado interrompeu a tela. Seu save está intacto.</p>
        <p className="mt-1 truncate font-mono text-[11px] text-faint">{this.state.erro}</p>
        <button className="btn btn-gold mt-4" onClick={() => window.location.reload()}>Voltar ao jogo</button>
      </div>
    );
  }
}

const NAV: { s: Screen; label: string; icon: keyof typeof Icons; grupo: string }[] = [
  { s: 'home', label: 'Visão Geral', icon: 'home', grupo: 'CLUBE' },
  { s: 'elenco', label: 'Elenco', icon: 'roster', grupo: 'CLUBE' },
  { s: 'taticas', label: 'Táticas & Treino', icon: 'standings', grupo: 'CLUBE' },
  { s: 'comissao', label: 'Comissão Técnica', icon: 'whistle', grupo: 'CLUBE' },
  { s: 'dm', label: 'Depto. Médico', icon: 'medical', grupo: 'CLUBE' },
  { s: 'financas', label: 'Finanças', icon: 'money', grupo: 'CLUBE' },
  { s: 'liga', label: 'Calendário & Tabela', icon: 'standings', grupo: 'LIGA' },
  { s: 'mercado', label: 'Free Agency', icon: 'market', grupo: 'LIGA' },
  { s: 'draft', label: 'Draft', icon: 'draft', grupo: 'LIGA' },
  { s: 'offseason', label: 'Offseason', icon: 'offseason', grupo: 'LIGA' },
];

function Header() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const fase = g.settings.fase;
  const faseLabel = fase === 'PRE' ? `Pré-temporada · Sem ${g.settings.semana}`
    : fase === 'REG' ? `Semana ${g.settings.semana}/18`
      : fase === 'PO' ? (g.bracket?.[Math.min(g.settings.semana - 1, g.bracket.length - 1)]?.nome ?? 'Playoffs')
        : 'Offseason';
  return (
    <header className="border-b border-line bg-pitcho/95" style={{ boxShadow: '0 4px 18px rgba(0,0,0,0.45)' }}>
      <div className="mx-auto flex max-w-[1460px] items-center gap-4 px-5 py-3">
        <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={38} />
        <div className="leading-none">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.3em] text-gold">Gridiron Manager NFL</div>
          <div className="font-disp text-[24px] font-extrabold uppercase tracking-wide">{t.cidade} <span className="text-goldhi">{t.nome}</span></div>
        </div>
        <div className="ml-6 hidden items-center gap-5 font-mono text-[12px] md:flex">
          <div><span className="text-faint">Temporada </span><b className="text-ink">{g.settings.temporada}</b></div>
          <div><span className="text-faint">Fase </span><b className="text-goldhi">{faseLabel}</b></div>
          <div><span className="text-faint">Cap </span><b className={capUsed(g, t.id) > g.settings.cap ? 'text-blood' : 'text-ink'}>{fmtM(capUsed(g, t.id))}/{fmtM(g.settings.cap)}</b></div>
          <div><span className="text-faint">Caixa </span><b className="text-goldhi">${t.dinheiro}M</b></div>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="btn btn-sm btn-ghost" title="Salvar e voltar à tela inicial" onClick={() => dispatch({ type: 'QUIT' })}>
            {Icons.out} Sair
          </button>
        </div>
      </div>
    </header>
  );
}

function Sidebar() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const off = g.settings.fase === 'OFF';
  let grupo = '';
  return (
    <aside className="w-[220px] shrink-0 border-r border-line2 bg-pitcho/80 py-4">
      {NAV.map(n => {
        const showGroup = n.grupo !== grupo;
        grupo = n.grupo;
        const offOnly = n.s === 'mercado' || n.s === 'draft' || n.s === 'offseason';
        return (
          <React.Fragment key={n.s}>
            {showGroup && (
              <div className="mt-3 mb-1 px-4 font-disp text-[12px] font-bold uppercase tracking-[0.25em] text-faint first:mt-0">{n.grupo}</div>
            )}
            <button className={`nav-item ${st.screen === n.s ? 'on' : ''} ${offOnly && !off ? 'opacity-40' : ''}`}
              onClick={() => dispatch({ type: 'SCREEN', screen: n.s })}>
              <span className="text-current opacity-80">{Icons[n.icon]}</span>
              {n.label}
              {n.s === 'draft' && off && g.draftState && !g.draftState.done && (
                <span className="tag ml-auto border-gold/60 text-gold blink">AO VIVO</span>
              )}
              {n.s === 'offseason' && off && (
                <span className="tag ml-auto border-gold/50 text-gold">F{g.offPhase ?? 1}/4</span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </aside>
  );
}

function Toast() {
  const { st, dispatch } = useGame();
  useEffect(() => {
    if (!st.toast) return;
    const t = setTimeout(() => dispatch({ type: 'TOAST_CLEAR' }), 4200);
    return () => clearTimeout(t);
  }, [st.toast, dispatch]);
  if (!st.toast) return null;
  return (
    <div className="toast-anim fixed bottom-6 left-1/2 z-50 max-w-[620px] border border-gold/70 bg-pitcho px-5 py-3 font-mono text-[13px] text-goldhi"
      style={{ boxShadow: '0 0 24px rgba(240,180,41,0.25), 4px 4px 0 rgba(0,0,0,0.5)', transform: 'translateX(-50%)' }}>
      {st.toast}
    </div>
  );
}

function Content() {
  const { st } = useGame();
  switch (st.screen) {
    case 'partida': return <MatchScreen />;
    case 'elenco': return <RosterScreen />;
    case 'taticas': return <TacticsScreen />;
    case 'dm': return <MedicalScreen />;
    case 'liga': return <div className="space-y-5"><StandingsScreen /><ScheduleScreen /></div>;
    case 'financas': return <FinanceScreen />;
    case 'mercado': return <MarketScreen />;
    case 'comissao': return <StaffScreen />;
    case 'draft': return <DraftScreen />;
    case 'offseason': return <OffseasonScreen />;
    default: return <ClubHomeScreen />;
  }
}

function Shell() {
  const { st, dispatch } = useGame();
  if (!st.game) {
    return <StartScreen onLoad={() => {
      const g = loadSave();
      if (g) dispatch({ type: 'LOAD_SAVE', game: g });
    }} />;
  }
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
