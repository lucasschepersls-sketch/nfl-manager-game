import { useGame } from '../state/store';
import { teamById, playersOf } from '../game/season';
import { Panel, TeamCrest } from '../components/ui';
import type { FranchiseHistory, SeasonRecord } from '../game/types';

export default function HistoryScreen() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const h: FranchiseHistory | undefined = g.historico?.[g.userTeam];

  if (!h || h.seasons.length === 0) {
    return (
      <Panel title="Histórico da Franquia">
        <div className="px-5 py-10 text-center">
          <div className="font-disp text-[26px] font-bold uppercase text-dim">Nenhuma temporada registrada ainda</div>
          <p className="mt-2 font-mono text-[12.5px] text-faint">
            A retrospectiva começa ao fim da primeira temporada. Campanhas, playoffs e líderes da franquia serão registrados automaticamente.
          </p>
        </div>
      </Panel>
    );
  }

  const leaderRow = (label: string, val: { nome: string; valor: number } | null, suffix = '') => (
    <tr>
      <td className="font-mono text-[12px] text-dim">{label}</td>
      <td className="num font-mono text-[12.5px]">
        {val ? <><b className="text-ink">{val.nome}</b> <span className="text-goldhi">{val.valor}{suffix}</span></> : <span className="text-faint">—</span>}
      </td>
    </tr>
  );
  const recentSeasons = [...h.seasons].sort((a, b) => b.temporada - a.temporada).slice(0, 8).reverse();

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="relative overflow-hidden border-2 border-gold/40 bg-pitcho px-5 py-4" style={{ boxShadow: '6px 6px 0 rgba(0,0,0,0.4)' }}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ background: `repeating-linear-gradient(90deg, ${t.cor} 0 2px, transparent 2px 90px)` }} />
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2">
          <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={46} />
          <div>
            <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.3em] text-faint">Histórico da Franquia</div>
            <h1 className="font-disp text-[32px] font-extrabold uppercase leading-none tracking-wide">
              {t.cidade} <span className="text-goldhi">{t.nome}</span>
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-5">
            {h.superBowls > 0 && (
              <div className="text-center">
                <div className="font-disp text-[36px] font-black leading-none text-goldhi">{h.superBowls}</div>
                <div className="font-disp text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Super Bowls</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* conquistas */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          { l: 'Super Bowls', v: h.superBowls, c: 'var(--color-goldhi)' },
          { l: 'Aparições SB', v: h.superBowlAppearances, c: 'var(--color-gold)' },
          { l: 'Playoffs', v: h.playoffAppearances, c: 'var(--color-grass)' },
          { l: 'Títulos Div.', v: h.divisionTitles, c: 'var(--color-ice)' },
          { l: 'Temp. vencedoras', v: h.winningSeasons, c: 'var(--color-grass)' },
          { l: 'Temp. perdedoras', v: h.losingSeasons, c: 'var(--color-blood)' },
        ].map(x => (
          <div key={x.l} className="panel px-4 py-3 text-center">
            <div className="font-disp text-[28px] font-black leading-none" style={{ color: x.c as string }}>{x.v}</div>
            <div className="mt-1 font-disp text-[11px] font-semibold uppercase tracking-[0.15em] text-faint">{x.l}</div>
          </div>
        ))}
      </div>

      <Panel title="Trajetória recente" right={<span className="font-mono text-[10px] text-faint">Últimas {recentSeasons.length} temporadas</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {recentSeasons.map(season => {
            const played = season.vitorias + season.derrotas + season.empates;
            const winPct = played ? (season.vitorias + season.empates * 0.5) / played : 0;
            const diff = season.pf - season.pc;
            return <div key={season.temporada} className="border border-line2 bg-panel2 px-2.5 py-2">
              <div className="flex items-center justify-between font-mono text-[10px] text-faint"><span>{season.temporada}</span><span>{season.playoffFinish ?? (season.superBowl ? 'Campeão' : season.playoffs ? 'Playoffs' : '—')}</span></div>
              <div className="mt-1 font-disp text-[17px] font-bold text-ink">{season.vitorias}-{season.derrotas}{season.empates ? `-${season.empates}` : ''}</div>
              <div className="mt-1 h-1.5 bg-pitcho"><div className="h-full bg-grass" style={{ width: `${Math.round(winPct * 100)}%` }} /></div>
              <div className={`mt-1 font-mono text-[10px] ${diff > 0 ? 'text-grass' : diff < 0 ? 'text-blood' : 'text-faint'}`}>Saldo {diff > 0 ? '+' : ''}{diff}</div>
            </div>;
          })}
          {!recentSeasons.length && <p className="col-span-full py-3 font-mono text-[12px] text-faint">Os resultados aparecerão após a primeira temporada.</p>}
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* records */}
        <Panel title="Records da franquia">
          <dl className="space-y-2.5 font-mono text-[13px]">
            <div className="flex justify-between border-b border-line2 pb-2">
              <span className="text-dim">Melhor temporada</span>
              <b className="text-grass">{h.bestRecord}</b>
            </div>
            <div className="flex justify-between border-b border-line2 pb-2">
              <span className="text-dim">Pior temporada</span>
              <b className="text-blood">{h.worstRecord}</b>
            </div>
            <div className="flex justify-between border-b border-line2 pb-2">
              <span className="text-dim">Maior sequência de vitórias</span>
              <b className="text-grass">{h.longestWinStreak} jogos</b>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">Maior sequência de derrotas</span>
              <b className="text-blood">{h.longestLoseStreak} jogos</b>
            </div>
          </dl>
        </Panel>

        {/* líderes de todos os tempos */}
        <Panel title="Líderes de todos os tempos" pad={false}>
          <table className="tbl">
            <tbody>
              {leaderRow('Jardas de passe', h.allTimeLeaders.passingYds, ' jd')}
              {leaderRow('TDs passados', h.allTimeLeaders.passingTds)}
              {leaderRow('Jardas corridas', h.allTimeLeaders.rushYds, ' jd')}
              {leaderRow('TDs corridos', h.allTimeLeaders.rushTds)}
              {leaderRow('Jardas recebidas', h.allTimeLeaders.receivingYds, ' jd')}
              {leaderRow('Sacks', h.allTimeLeaders.sacks)}
              {leaderRow('Tackles', h.allTimeLeaders.tackles)}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* histórico de temporadas */}
      <Panel title={`Temporadas registradas (${h.seasons.length})`} pad={false}>
        <div className="max-h-[460px] overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Temp.</th><th className="num">V</th><th className="num">D</th><th className="num">E</th>
                <th className="num">PF</th><th className="num">PC</th><th>Pós-temporada</th><th>Seed</th><th>Título Div.</th><th>Técnico</th>
              </tr>
            </thead>
            <tbody>
              {[...h.seasons].reverse().map((s: SeasonRecord) => (
                <tr key={s.temporada}>
                  <td className="font-disp font-bold text-goldhi">{s.temporada}</td>
                  <td className="num font-bold text-grass">{s.vitorias}</td>
                  <td className="num text-blood">{s.derrotas}</td>
                  <td className="num text-faint">{s.empates}</td>
                  <td className="num">{s.pf}</td>
                  <td className="num">{s.pc}</td>
                  <td>{s.playoffs ? <span className={`tag ${s.superBowl ? 'border-goldhi text-goldhi' : 'border-grass/60 text-grass'}`}>{s.playoffFinish ?? (s.superBowl ? 'Campeão' : 'Playoffs')}</span> : <span className="text-faint">—</span>}</td>
                  <td className="font-mono text-gold">{s.seed ? `#${s.seed}` : '—'}</td>
                  <td>{s.divisionTitle ? <span className="tag border-gold/60 text-gold">SIM</span> : <span className="text-faint">—</span>}</td>
                  <td className="text-dim">{s.coach ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
