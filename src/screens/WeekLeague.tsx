/* ============================================================
 * 📅 Semana da Liga — todos os jogos de cada semana, incluindo
 * os playoffs (Wild Card → Super Bowl), preenchidos conforme os
 * confrontos vão sendo definidos no bracket.
 * ============================================================ */

import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById } from '../game/season';
import type { GameState, Match } from '../game/types';
import { TeamCrest, Panel } from '../components/ui';

/* chave de semana: 'pre-1', 'reg-5', 'po-1' (Wild Card), 'po-4' (Super Bowl) */
type WeekKey = { fase: 'PRE' | 'REG' | 'PO'; rodada: number };
const PO_NAMES = ['Wild Card', 'Divisional', 'Final de Conferência', 'Super Bowl'];

function weekKey(k: WeekKey): string {
  return `${k.fase}-${k.rodada}`;
}

/* ---------- card de um jogo ---------- */
function GameCard({ g, m, userTeam, delay }: { g: GameState; m: Match; userTeam: string; delay: number }) {
  const casa = teamById(g, m.casa);
  const fora = teamById(g, m.fora);
  const isUser = m.casa === userTeam || m.fora === userTeam;
  const jogada = m.jogada && m.placarCasa != null && m.placarFora != null;
  const casaWon = jogada && (m.placarCasa ?? 0) > (m.placarFora ?? 0);
  const foraWon = jogada && (m.placarFora ?? 0) > (m.placarCasa ?? 0);

  return (
    <div
      className={[
        'reveal-row border bg-panel transition-colors',
        isUser ? 'border-gold/60 bg-gold/[0.06]' : 'border-line hover:border-line/80',
      ].join(' ')}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {/* time da casa */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <TeamCrest cor={casa.cor} cor2={casa.cor2} sigla={casa.sigla} conf={casa.conf} size={30} />
          <div className="min-w-0">
            <div className={`truncate font-disp text-[15px] font-bold uppercase tracking-wide ${casaWon ? 'text-grass' : 'text-ink'}`}>
              {casa.sigla}
            </div>
            <div className="truncate font-mono text-[10px] uppercase tracking-wider text-faint">{casa.cidade}</div>
          </div>
          {m.casa === userTeam && <span className="tag border-gold/50 bg-gold/10 px-1 py-0 text-[8px] text-gold">VOCÊ</span>}
        </div>

        {/* placar / vs */}
        <div className="shrink-0 text-center">
          {jogada ? (
            <div className="flex items-center gap-2 font-disp text-[20px] font-extrabold">
              <span className={casaWon ? 'text-grass' : 'text-dim'}>{m.placarCasa}</span>
              <span className="text-[12px] text-faint">×</span>
              <span className={foraWon ? 'text-grass' : 'text-dim'}>{m.placarFora}</span>
            </div>
          ) : (
            <div className="font-disp text-[14px] font-bold uppercase text-faint">vs</div>
          )}
          <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wider text-faint">
            {jogada ? 'Final' : m.fase === 'PO' ? 'Playoffs' : casa.estadioNome}
          </div>
        </div>

        {/* time de fora */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5 text-right">
          {m.fora === userTeam && <span className="tag border-gold/50 bg-gold/10 px-1 py-0 text-[8px] text-gold">VOCÊ</span>}
          <div className="min-w-0">
            <div className={`truncate font-disp text-[15px] font-bold uppercase tracking-wide ${foraWon ? 'text-grass' : 'text-ink'}`}>
              {fora.sigla}
            </div>
            <div className="truncate font-mono text-[10px] uppercase tracking-wider text-faint">{fora.cidade}</div>
          </div>
          <TeamCrest cor={fora.cor} cor2={fora.cor2} sigla={fora.sigla} conf={fora.conf} size={30} />
        </div>
      </div>
    </div>
  );
}

/* ---------- seção de uma semana de playoffs a partir do bracket ---------- */
function PlayoffWeek({ g, rodada, userTeam }: { g: GameState; rodada: number; userTeam: string }) {
  const round = g.bracket?.[rodada - 1];
  const matches = g.matches.filter(m => m.fase === 'PO' && m.rodada === rodada);

  // Se o bracket ainda não definiu esta rodada, avisa.
  if (!round) {
    return (
      <div className="border border-dashed border-line bg-panel2/50 px-6 py-10 text-center">
        <div className="font-disp text-[20px] font-bold uppercase tracking-wide text-faint">Confrontos a definir</div>
        <p className="mx-auto mt-2 max-w-md font-mono text-[12px] leading-relaxed text-faint">
          Os jogos do <b className="text-dim">{PO_NAMES[rodada - 1]}</b> serão definidos assim que a rodada anterior for concluída.
          Simule as semanas para preencher o chaveamento.
        </p>
      </div>
    );
  }

  // Monta a lista de jogos: usa os matches já criados; se algum confronto do bracket
  // ainda não tem match criado, mostra como "a definir".
  const cards = round.jogos.map((j, i) => {
    const m = matches.find(x =>
      (x.casa === j.casa && x.fora === j.fora) || (x.casa === j.fora && x.fora === j.casa));
    if (m) return <GameCard key={i} g={g} m={m} userTeam={userTeam} delay={i * 60} />;
    // confronto previsto pelo bracket mas sem match criado (times podem estar indefinidos)
    const casaOk = j.casa && g.teams.some(t => t.id === j.casa);
    const foraOk = j.fora && g.teams.some(t => t.id === j.fora);
    if (!casaOk || !foraOk) {
      return (
        <div key={i} className="reveal-row border border-dashed border-line bg-panel2/40 px-4 py-3 text-center" style={{ animationDelay: `${i * 60}ms` }}>
          <span className="font-mono text-[11px] uppercase tracking-wider text-faint">Vencedor a definir</span>
        </div>
      );
    }
    const synthetic: Match = { id: `po-${rodada}-${j.casa}-${j.fora}`, fase: 'PO', rodada, casa: j.casa, fora: j.fora, placarCasa: j.pc, placarFora: j.pf, jogada: j.jogada };
    return <GameCard key={i} g={g} m={synthetic} userTeam={userTeam} delay={i * 60} />;
  });

  return <div className="space-y-2.5">{cards}</div>;
}

export function WeekLeagueScreen() {
  const { st } = useGame();
  const g = st.game!;
  const userTeam = g.userTeam;

  // Semana inicial: a semana atual da temporada (ou 1 se offseason).
  const [sel, setSel] = useState<WeekKey>(() => {
    if (g.settings.fase === 'PO') return { fase: 'PO', rodada: Math.min(g.settings.semana, 4) };
    if (g.settings.fase === 'REG') return { fase: 'REG', rodada: g.settings.semana };
    if (g.settings.fase === 'PRE') return { fase: 'PRE', rodada: g.settings.semana };
    return { fase: 'REG', rodada: 1 };
  });

  const games = useMemo(() => {
    if (sel.fase === 'PO') return []; // playoffs vêm do bracket
    return g.matches
      .filter(m => m.fase === sel.fase && m.rodada === sel.rodada)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [g, sel]);

  const userHasGame = useMemo(() => {
    if (sel.fase === 'PO') {
      const round = g.bracket?.[sel.rodada - 1];
      return round?.jogos.some(j => j.casa === userTeam || j.fora === userTeam) ?? false;
    }
    return games.some(m => m.casa === userTeam || m.fora === userTeam);
  }, [g, sel, games, userTeam]);

  const weeks: { grupo: string; itens: WeekKey[] }[] = [
    { grupo: 'Pré', itens: [1, 2].map(r => ({ fase: 'PRE' as const, rodada: r })) },
    { grupo: 'Temporada Regular', itens: Array.from({ length: 18 }, (_, i) => ({ fase: 'REG' as const, rodada: i + 1 })) },
    { grupo: 'Playoffs', itens: [1, 2, 3, 4].map(r => ({ fase: 'PO' as const, rodada: r })) },
  ];

  const currentKey = weekKey({
    fase: g.settings.fase === 'PO' ? 'PO' : g.settings.fase === 'PRE' ? 'PRE' : 'REG',
    rodada: g.settings.semana,
  });

  const selLabel = sel.fase === 'PO'
    ? PO_NAMES[sel.rodada - 1]
    : sel.fase === 'PRE'
      ? `Pré-temporada · Semana ${sel.rodada}`
      : `Semana ${sel.rodada}`;

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <header className="relative overflow-hidden border border-line bg-panel">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ background: `repeating-linear-gradient(90deg, ${teamById(g, userTeam).cor} 0 2px, transparent 2px 110px)` }}
        />
        <div className="relative flex flex-wrap items-center gap-4 px-5 py-4">
          <div>
            <h1 className="font-disp text-[28px] font-extrabold uppercase leading-none">
              Semana da <span className="text-goldhi">Liga</span>
            </h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              Todos os jogos de cada semana · Temporada {g.settings.temporada}
            </p>
          </div>
          <div className="ml-auto text-right">
            <div className="font-disp text-[22px] font-extrabold uppercase text-goldhi">{selLabel}</div>
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-faint">
              {sel.fase === 'PO' ? `${games.length || g.bracket?.[sel.rodada - 1]?.jogos.length || 0} confronto(s)` : `${games.length} jogo(s)`}
              {userHasGame ? ' · seu time joga' : ''}
            </div>
          </div>
        </div>
      </header>

      {/* trilho de semanas */}
      <div className="space-y-3">
        {weeks.map(w => (
          <div key={w.grupo}>
            <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.25em] text-faint">{w.grupo}</div>
            <div className="flex flex-wrap gap-1.5">
              {w.itens.map(k => {
                const key = weekKey(k);
                const on = key === weekKey(sel);
                const isCurrent = key === currentKey;
                const label = k.fase === 'PO' ? PO_NAMES[k.rodada - 1] : k.fase === 'PRE' ? `P${k.rodada}` : String(k.rodada);
                return (
                  <button
                    key={key}
                    onClick={() => setSel(k)}
                    className={[
                      'relative border px-2.5 py-1 font-disp text-[13px] font-bold uppercase tracking-wide transition-all',
                      on ? 'border-gold bg-gold/15 text-goldhi' : 'border-line bg-panel text-dim hover:border-gold/50 hover:text-ink',
                    ].join(' ')}
                    title={k.fase === 'PO' ? PO_NAMES[k.rodada - 1] : `${k.fase === 'PRE' ? 'Pré-temporada' : 'Semana'} ${k.rodada}`}
                  >
                    {label}
                    {isCurrent && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blood" title="Semana atual" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* jogos da semana */}
      {sel.fase === 'PO' ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="font-disp text-[18px] font-extrabold uppercase tracking-wide text-ink">{PO_NAMES[sel.rodada - 1]}</span>
            {sel.rodada === 1 && <span className="tag border-ice/50 text-ice">seed #1 folga</span>}
          </div>
          <PlayoffWeek g={g} rodada={sel.rodada} userTeam={userTeam} />
        </div>
      ) : (
        <Panel title={`${selLabel} · ${games.length} jogo(s)`} pad={false}>
          {games.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <div className="font-disp text-[18px] font-bold uppercase text-faint">Nenhum jogo nesta semana</div>
              <p className="mt-1 font-mono text-[11.5px] text-faint">
                {sel.fase === 'REG' && sel.rodada <= 18 ? 'Semana de folga (bye) para todos os times.' : 'Sem jogos programados.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5 p-3 lg:grid-cols-2">
              {games.map((m, i) => <GameCard key={m.id} g={g} m={m} userTeam={userTeam} delay={i * 45} />)}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
