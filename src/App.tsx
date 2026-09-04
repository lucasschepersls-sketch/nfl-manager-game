import { useState, type ReactNode } from 'react';
import { GameProvider, useGame, loadSave } from './state/store';
import type { Screen } from './game/types';
import { TEAMS_DEF, DIV_NAMES, CONF_LABEL } from './game/data';
import { Panel, TeamCrest, Bar } from './components/ui';

/* ---------- ícones SVG desenhados (envelope e maleta) ---------- */
const InboxIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 8 L12 13 L21 8" />
  </svg>
);
const JobsIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="M8 8 V6 a2 2 0 0 1 2-2 h4 a2 2 0 0 1 2 2 v2" />
    <path d="M3 13 h18" />
  </svg>
);
import { ClubHomeScreen } from './screens/Club';
import { TradesScreen } from './screens/Trades';
import { InboxScreen, JobsScreen } from './screens/Inbox';
import { StandingsScreen } from './screens/Standings';
import { unreadCount } from './game/messaging';

/* ============ navegação lateral ============ */
const NAV: { s: Screen; label: string; glyph: ReactNode; grupo: string }[] = [
  { s: 'home', label: 'Visão Geral', glyph: '🏈', grupo: 'CLUBE' },
  { s: 'inbox', label: 'Mensagens', glyph: InboxIcon, grupo: 'CLUBE' },
  { s: 'jobs', label: 'Carreira', glyph: JobsIcon, grupo: 'CLUBE' },
  { s: 'elenco', label: 'Elenco', glyph: '👥', grupo: 'CLUBE' },
  { s: 'taticas', label: 'Táticas & Treino', glyph: '📋', grupo: 'CLUBE' },
  { s: 'dm', label: 'Depto. Médico', glyph: '⚕️', grupo: 'CLUBE' },
  { s: 'trades', label: 'Trades', glyph: '🔄', grupo: 'MERCADO' },
  { s: 'mercado', label: 'Free Agency', glyph: '💼', grupo: 'MERCADO' },
  { s: 'negociacoes', label: 'Contratos', glyph: '✍️', grupo: 'MERCADO' },
  { s: 'calendario', label: 'Calendário', glyph: '🗓️', grupo: 'LIGA' },
  { s: 'calendario-liga', label: 'Semana da Liga', glyph: '📅', grupo: 'LIGA' },
  { s: 'classificacao', label: 'Classificação', glyph: '🏆', grupo: 'LIGA' },
  { s: 'stats-teams', label: 'Ranking Times', glyph: '📊', grupo: 'RANKINGS' },
  { s: 'stats-off', label: 'Ofensiva', glyph: '🎯', grupo: 'RANKINGS' },
  { s: 'stats-def', label: 'Defensiva', glyph: '🛡️', grupo: 'RANKINGS' },
  { s: 'stats-st', label: 'Special Teams', glyph: '🦶', grupo: 'RANKINGS' },
  { s: 'probowl', label: 'Pro Bowl', glyph: '⭐', grupo: 'LIGA' },
  { s: 'hall-of-fame', label: 'Hall da Fama', glyph: '🎖️', grupo: 'LIGA' },
  { s: 'draft', label: 'Draft', glyph: '🎓', grupo: 'OFFSEASON' },
  { s: 'scouting', label: 'Scouting', glyph: '🔍', grupo: 'OFFSEASON' },
  { s: 'offseason', label: 'Offseason', glyph: '🔧', grupo: 'OFFSEASON' },
  { s: 'financas', label: 'Finanças', glyph: '💰', grupo: 'CLUBE' },
];

/* ============ tela de seleção de franquia ============ */
function TeamPicker() {
  const { dispatch } = useGame();
  const [sel, setSel] = useState<string>('kc');
  const save = loadSave();

  const grupos = (['AFC', 'NFC'] as const).map(conf => ({
    conf,
    divs: [0, 1, 2, 3].map(div => ({
      div,
      times: TEAMS_DEF.filter(t => t.conf === conf && t.div === div),
    })),
  }));

  const selTeam = TEAMS_DEF.find(t => t.sigla.toLowerCase() === sel) ?? TEAMS_DEF[0];

  return (
    <div className="min-h-screen bg-pitch px-4 py-8 text-ink">
      <div className="mx-auto max-w-[1200px]">
        <header className="mb-6 border-b-2 border-gold pb-4">
          <h1 className="font-disp text-[44px] font-extrabold uppercase leading-none tracking-wide">
            The American <span className="text-goldhi">Game</span> Manager
          </h1>
          <p className="mt-1 font-mono text-[12px] uppercase tracking-[0.25em] text-faint">
            Modo carreira · escolha sua franquia
          </p>
        </header>

        {save && (
          <div className="mb-5 flex items-center justify-between border border-line bg-panel px-4 py-3">
            <span className="font-mono text-[12px] text-dim">Save encontrado na sua máquina.</span>
            <button className="btn btn-gold" onClick={() => dispatch({ type: 'LOAD_SAVE', game: save })}>
              Continuar carreira »
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            {grupos.map(({ conf, divs }) => (
              <section key={conf}>
                <h2 className="mb-2 font-disp text-[22px] font-bold uppercase tracking-wider text-goldhi">{CONF_LABEL[conf]}</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {divs.map(({ div, times }) => (
                    <Panel key={div} title={`Divisão ${DIV_NAMES[div]}`} pad={false}>
                      <div className="grid grid-cols-2 gap-1.5 p-2">
                        {times.map(t => {
                          const id = t.sigla.toLowerCase();
                          const on = sel === id;
                          return (
                            <button
                              key={id}
                              onClick={() => setSel(id)}
                              className="group flex items-center gap-2 border px-2 py-2 text-left transition-all duration-150"
                              style={{
                                borderColor: on ? 'var(--color-gold)' : 'var(--color-line2)',
                                background: on ? 'rgba(240,180,41,0.10)' : 'transparent',
                                boxShadow: on ? '0 0 14px rgba(240,180,41,0.25)' : 'none',
                              }}
                            >
                              <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={30} />
                              <span className={`font-disp text-[14px] font-bold uppercase ${on ? 'text-goldhi' : 'text-dim group-hover:text-ink'}`}>
                                {t.sigla}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </Panel>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside>
            <div className="sticky top-6 space-y-4">
              <Panel title="Sua franquia" pad={false}>
                <div className="flex flex-col items-center gap-3 border-b border-line px-4 py-5">
                  <TeamCrest cor={selTeam.cor} cor2={selTeam.cor2} sigla={selTeam.sigla} conf={selTeam.conf} size={84} />
                  <div className="text-center">
                    <div className="font-disp text-[22px] font-extrabold uppercase leading-none">{selTeam.cidade}</div>
                    <div className="font-disp text-[18px] font-bold uppercase text-goldhi">{selTeam.nome}</div>
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-wider text-faint">
                    {CONF_LABEL[selTeam.conf]} · Divisão {DIV_NAMES[selTeam.div]}
                  </div>
                </div>
                <div className="space-y-2.5 px-4 py-4">
                  <div>
                    <div className="mb-1 flex justify-between font-mono text-[11px] text-dim"><span>Força</span><b className="text-ink">{selTeam.forca}/5</b></div>
                    <Bar pct={(selTeam.forca / 5) * 100} color="var(--color-gold)" />
                  </div>
                  <div className="flex justify-between gap-3 font-mono text-[11.5px] text-dim">
                    <span className="shrink-0">Estádio</span>
                    <b className="truncate text-right text-ink">{selTeam.estadio}</b>
                  </div>
                </div>
                <div className="px-4 pb-4">
                  <button
                    className="btn btn-gold btn-pulse w-full text-[17px]"
                    onClick={() => dispatch({ type: 'NEW_GAME', teamId: sel })}
                  >
                    Assumir o comando »
                  </button>
                </div>
              </Panel>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ============ placeholder p/ telas ainda não carregadas neste workspace ============ */
function MissingScreen({ screen }: { screen: Screen }) {
  const item = NAV.find(n => n.s === screen);
  return (
    <Panel title={item ? `${item.glyph} ${item.label}` : screen}>
      <p className="font-mono text-[13px] leading-relaxed text-dim">
        Esta tela existe no seu projeto local, mas não está carregada neste workspace de preview.
        O arquivo <b className="text-goldhi">src/screens/Trades.tsx</b> (o foco da correção) está ativo e funcional.
      </p>
    </Panel>
  );
}

/* ============ toast ============ */
function Toast() {
  const { st, dispatch } = useGame();
  if (!st.toast) return null;
  return (
    <button
      onClick={() => dispatch({ type: 'TOAST_CLEAR' })}
      className="toast-anim fixed bottom-6 left-1/2 z-50 -translate-x-1/2 border border-gold bg-panel px-5 py-3 font-mono text-[12.5px] text-goldhi shadow-lg"
    >
      {st.toast}
    </button>
  );
}

/* ============ shell do jogo ============ */
function Shell() {
  const { st, dispatch } = useGame();
  const g = st.game!;

  const grupos = Array.from(new Set(NAV.map(n => n.grupo)));

  const renderScreen = () => {
    switch (st.screen) {
      case 'home': return <ClubHomeScreen />;
      case 'trades': return <TradesScreen />;
      case 'classificacao': return <StandingsScreen />;
      case 'inbox': return <InboxScreen />;
      case 'jobs': return <JobsScreen />;
      default: return <MissingScreen screen={st.screen} />;
    }
  };

  return (
    <div className="min-h-screen bg-pitch text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-panel2/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-2.5">
          <span className="font-disp text-[20px] font-extrabold uppercase leading-none">
            TAG<span className="text-goldhi">M</span>
          </span>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-faint sm:block">
            The American Game Manager
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="font-mono text-[11.5px] text-dim">
              Temporada <b className="text-goldhi">{g.settings.temporada}</b> · {g.settings.fase} · Semana {g.settings.semana}
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] gap-4 px-4 py-4">
        <nav className="hidden w-[220px] shrink-0 md:block">
          <div className="sticky top-[64px] space-y-4">
            {grupos.map(gr => (
              <div key={gr}>
                <div className="mb-1 px-2 font-mono text-[9.5px] uppercase tracking-[0.25em] text-faint">{gr}</div>
                {NAV.filter(n => n.grupo === gr).map(n => {
                  const on = st.screen === n.s;
                  const unread = n.s === 'inbox' && st.game
                    ? st.game.messages.filter(m => !m.isRead && !m.isArchived).length
                    : 0;
                  return (
                    <button
                      key={n.s}
                      onClick={() => dispatch({ type: 'SCREEN', screen: n.s })}
                      className="nav-item"
                      style={{
                        color: on ? 'var(--color-goldhi)' : undefined,
                        borderLeftColor: on ? 'var(--color-gold)' : 'transparent',
                        background: on ? 'linear-gradient(90deg, rgba(240,180,41,0.10), transparent)' : undefined,
                      }}
                    >
                      <span className="flex items-center">{n.glyph}</span>
                      <span>{n.label}</span>
                      {unread > 0 && (
                        <span
                          className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blood px-1 font-mono text-[10px] font-bold text-white"
                          title={`${unread} mensagem(ns) não lida(s)`}
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1">
          <div key={st.screen} className="reveal">
            {renderScreen()}
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
      <Root />
    </GameProvider>
  );
}

function Root() {
  const { st } = useGame();
  return st.game ? <Shell /> : <TeamPicker />;
}
