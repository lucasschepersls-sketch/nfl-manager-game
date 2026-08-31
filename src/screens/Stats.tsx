import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame } from '../state/store';
import { standings } from '../game/season';
import {
  passerRating, ypc, ypr, fgPct, puntAvg, thirdPct, perGame,
  qbRows, rbRows, recRows, defRows, kRows, pRows,
  applyTeamFilter, teamRankRows, minGamesToRank, weeksPlayed,
  type RankingRow,
} from '../game/seasonStats';
import { Panel, PosBadge, TeamCrest, Bar } from '../components/ui';
import { DIV_NAMES } from '../game/data';
import type { Conf, StatsTab } from '../game/types';

/* ============================================================
 * Board — tabela densa estilo Brasfoot com cabeçalhos clicáveis,
 * destaque para a stat principal, medalhas p/ top-3 e paginação.
 * ============================================================ */
interface Col<T> {
  k: string; label: string; num?: boolean; primary?: boolean;
  val: (r: T) => number | string;
  fmt?: (r: T) => ReactNode;
  title?: string;
}

const PAGE = 20;

function Board<T extends { key: string }>({ title, note, cols, rows, defaultSort }: {
  title: string; note?: string; cols: Col<T>[]; rows: T[]; defaultSort: string;
}) {
  const [sortK, setSortK] = useState(defaultSort);
  const [dir, setDir] = useState<-1 | 1>(-1);
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [sortK, dir, rows.length]);

  const sorted = useMemo(() => {
    const col = cols.find(c => c.k === sortK) ?? cols[0];
    return [...rows].sort((a, b) => {
      const va = col.val(a); const vb = col.val(b);
      const c = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : (va as number) - (vb as number);
      return c * dir || String(a.key).localeCompare(String(b.key));
    });
  }, [rows, sortK, dir, cols]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const view = sorted.slice(safePage * PAGE, safePage * PAGE + PAGE);
  const isDefaultSort = sortK === defaultSort && dir === -1;

  return (
    <section className="panel">
      <header className="panel-hd">
        <h2>{title}</h2>
        {note && <span className="ml-auto font-mono text-[10.5px] text-faint">{note}</span>}
      </header>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="num w-8" title="Posição no ranking">#</th>
              {cols.map(c => {
                const active = sortK === c.k;
                return (
                  <th key={c.k}
                    className={`${c.num ? 'num' : ''} sortable-th ${active ? 'text-goldhi' : ''}`}
                    title={c.title ?? `Clique para ordenar por ${c.label}`}
                    onClick={() => {
                      if (active) setDir(d => (d === -1 ? 1 : -1));
                      else { setSortK(c.k); setDir(-1); }
                    }}>
                    {c.label}{active ? (dir === -1 ? ' ▾' : ' ▴') : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => {
              const rank = isDefaultSort ? safePage * PAGE + i + 1 : null;
              return (
                <tr key={r.key}>
                  <td className={`num ${rank === 1 ? 'medal-1' : rank === 2 ? 'medal-2' : rank === 3 ? 'medal-3' : 'text-faint'}`}>
                    {rank ?? '·'}
                  </td>
                  {cols.map(c => (
                    <td key={c.k} className={`${c.num ? 'num' : ''} ${c.primary ? 'highlight-num' : ''}`}>
                      {c.fmt ? c.fmt(r) : String(c.val(r))}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!view.length && (
              <tr><td colSpan={cols.length + 1} className="py-6 text-center text-faint">
                Sem dados ainda — simule algumas rodadas da temporada.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <footer className="flex items-center gap-3 border-t border-line px-4 py-2.5">
          <button className="btn btn-sm btn-ghost" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>« Anterior {PAGE}</button>
          <span className="font-mono text-[11.5px] text-dim">
            {safePage * PAGE + 1}–{Math.min(sorted.length, (safePage + 1) * PAGE)} de {sorted.length}
          </span>
          <button className="btn btn-sm btn-ghost ml-auto" disabled={safePage >= pages - 1} onClick={() => setPage(p => p + 1)}>Próxima {PAGE} »</button>
        </footer>
      )}
    </section>
  );
}

/* ---------- células compartilhadas ---------- */
const playerCell = (r: RankingRow) => (
  <span className="flex items-center gap-2">
    <PosBadge pos={r.p.pos} />
    <span className="max-w-[180px] truncate">{r.p.nome}</span>
  </span>
);
const teamCell = (r: RankingRow) => (
  <span className="flex items-center gap-1.5">
    <TeamCrest cor={r.t.cor} cor2={r.t.cor2} sigla={r.t.sigla} conf={r.t.conf} size={14} />
    <b>{r.t.sigla}</b>
  </span>
);

/* ============================================================
 * Tela principal — Estatísticas da Temporada
 * ============================================================ */
export default function StatsScreen({ tab }: { tab: StatsTab }) {
  const { st, dispatch } = useGame();
  const g = st.game!;

  const [conf, setConf] = useState<Conf | 'ALL'>('ALL');
  const [divF, setDivF] = useState(-1);
  const [limit, setLimit] = useState(20);
  const [qual, setQual] = useState(true);

  const weeks = weeksPlayed(g);
  const minGames = minGamesToRank(g);
  const qualOn = qual && weeks >= 2;

  const base = useMemo(() => {
    let rows = applyTeamFilter(
      tab === 'off' ? [...qbRows(g), ...rbRows(g), ...recRows(g)]
        : tab === 'def' ? defRows(g)
          : tab === 'st' ? [...kRows(g), ...pRows(g)]
            : [],
      conf, divF,
    );
    // remove duplicatas (um WR que corre e recebe aparece 1x)
    const seen = new Set<string>();
    rows = rows.filter(r => (seen.has(r.p.id) ? false : (seen.add(r.p.id), true)));
    if (qualOn) rows = rows.filter(r => r.p.stats.jogos >= minGames);
    return rows;
  }, [g, tab, conf, divF, qualOn, minGames]);

  const lim = (rows: RankingRow[]) => (limit > 0 ? rows.slice(0, limit) : rows);
  const withKey = (rows: RankingRow[]) => rows.map(r => ({ ...r, key: r.p.id }));

  /* ---------- TIMES ---------- */
  const stRows = standings(g);
  const wOf = (id: string) => stRows.find(r => r.teamId === id);
  const teamRows = useMemo(() =>
    teamRankRows(g, conf, divF).map(x => ({
      ...x, key: x.t.id,
      rec: `${wOf(x.t.id)?.v ?? 0}–${wOf(x.t.id)?.e ?? 0}–${wOf(x.t.id)?.d ?? 0}`,
      jogos: wOf(x.t.id)?.j ?? 0,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g, conf, divF]);

  const TABS: { k: StatsTab; label: string; screen: string }[] = [
    { k: 'teams', label: 'Times', screen: 'stats-teams' },
    { k: 'off', label: 'Ofensiva', screen: 'stats-off' },
    { k: 'def', label: 'Defensiva', screen: 'stats-def' },
    { k: 'st', label: 'Special Teams', screen: 'stats-st' },
  ];

  const seasonLabel = g.settings.fase === 'OFF' ? `Offseason ${g.settings.temporada}` : `Temporada ${g.settings.temporada}`;

  return (
    <div className="space-y-4">
      {/* cabeçalho da seção */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <h1 className="font-disp text-[30px] font-extrabold uppercase leading-none tracking-wide">
            Estatísticas <span className="text-goldhi">da Temporada</span>
          </h1>
          <p className="mt-1 font-mono text-[11.5px] text-faint">
            {seasonLabel} · {weeks} semana(s) da temporada regular disputada(s)
            {weeks >= 2 && <> · qualificação NFL: ≥ {minGames} jogo(s)</>}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select className="sel" value={conf} onChange={e => setConf(e.target.value as Conf | 'ALL')}>
            <option value="ALL">Conferência: todas</option>
            <option value="AFC">AFC</option>
            <option value="NFC">NFC</option>
          </select>
          <select className="sel" value={divF} onChange={e => setDivF(+e.target.value)}>
            <option value={-1}>Divisão: todas</option>
            {DIV_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          {tab !== 'teams' && (
            <select className="sel" value={limit} onChange={e => setLimit(+e.target.value)}>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
              <option value={0}>Todos</option>
            </select>
          )}
          {tab !== 'teams' && weeks >= 2 && (
            <button
              className={`btn btn-sm ${qualOn ? 'btn-gold' : 'btn-ghost'}`}
              onClick={() => setQual(q => !q)}
              title="Regra da NFL: só entram no ranking jogadores com metade das semanas disputadas">
              Ranking oficial {qualOn ? '✓' : ''}
            </button>
          )}
        </div>
      </div>

      {/* abas */}
      <div className="flex gap-1 border-b border-line">
        {TABS.map(t => (
          <button key={t.k}
            className={`border-b-2 px-5 py-2.5 font-disp text-[15px] font-bold uppercase tracking-wider transition-colors ${tab === t.k ? 'border-gold text-goldhi' : 'border-transparent text-dim hover:text-ink'}`}
            onClick={() => dispatch({ type: 'SCREEN', screen: t.screen as never })}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- TIMES ---------- */}
      {tab === 'teams' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Board
            title="Melhor ataque" note="ordenado por pontos"
            defaultSort="pts" rows={teamRows}
            cols={[
              { k: 'team', label: 'Time', val: r => r.t.sigla, fmt: r => <TeamCell t={r.t} rec={r.rec} /> },
              { k: 'pts', label: 'PTS', num: true, primary: true, val: r => r.ts.pointsScored },
              { k: 'ptsj', label: 'PTS/J', num: true, val: r => perGame(r.ts.pointsScored, r.jogos), title: 'Pontos por jogo' },
              { k: 'yds', label: 'Jardas', num: true, val: r => r.ts.totalYards },
              { k: 'pass', label: 'Passe', num: true, val: r => r.ts.passingYards },
              { k: 'rush', label: 'Corrida', num: true, val: r => r.ts.rushingYards },
              { k: 'third', label: '3ª %', num: true, val: r => thirdPct(r.ts.thirdConv, r.ts.thirdAtt), title: 'Conversões de 3ª descida' },
              { k: 'to', label: 'TOs', num: true, val: r => -r.ts.turnovers, fmt: r => <span className="text-blood">{r.ts.turnovers}</span>, title: 'Turnovers (menos é melhor)' },
            ]}
          />
          <Board
            title="Melhor defesa" note="ordenado por pontos sofridos (menos é melhor)"
            defaultSort="sofridos" rows={teamRows}
            cols={[
              { k: 'team', label: 'Time', val: r => r.t.sigla, fmt: r => <TeamCell t={r.t} rec={r.rec} /> },
              { k: 'sofridos', label: 'Pts sof.', num: true, primary: true, val: r => -r.ts.pointsAllowed, title: 'Pontos sofridos (menos é melhor)' },
              { k: 'ptsj', label: 'Pts/J', num: true, val: r => -perGame(r.ts.pointsAllowed, r.jogos), fmt: r => perGame(r.ts.pointsAllowed, r.jogos), title: 'Pontos sofridos por jogo' },
              { k: 'sacks', label: 'Sacks', num: true, val: r => r.ts.sacks },
              { k: 'int', label: 'INTs', num: true, val: r => r.ts.interceptions },
            ]}
          />
        </div>
      )}

      {/* ---------- OFENSIVA ---------- */}
      {tab === 'off' && (
        <div className="space-y-4">
          <Board
            title="Quarterbacks" note={`ordenado por jardas de passe${qualOn ? ' · ranking oficial' : ''}`}
            defaultSort="py" rows={withKey(lim(base.filter(r => r.p.stats.att > 0).sort((a, b) => b.p.stats.py - a.p.stats.py)))}
            cols={[
              { k: 'player', label: 'Jogador', val: r => r.p.nome, fmt: playerCell },
              { k: 'team', label: 'Time', val: r => r.t.sigla, fmt: teamCell },
              { k: 'jogos', label: 'J', num: true, val: r => r.p.stats.jogos },
              { k: 'cmp', label: 'Comp/Att', num: true, val: r => r.p.stats.cmp, fmt: r => `${r.p.stats.cmp}/${r.p.stats.att}` },
              { k: 'py', label: 'Jardas', num: true, primary: true, val: r => r.p.stats.py },
              { k: 'ptd', label: 'TDs', num: true, val: r => r.p.stats.ptd },
              { k: 'int', label: 'INTs', num: true, val: r => -r.p.stats.int, fmt: r => <span className="text-blood">{r.p.stats.int}</span> },
              { k: 'rating', label: 'Rating', num: true, val: r => passerRating(r.p.stats.cmp, r.p.stats.att, r.p.stats.py, r.p.stats.ptd, r.p.stats.int), title: 'Passer Rating oficial da NFL (0–158.3)', fmt: r => {
                const rt = passerRating(r.p.stats.cmp, r.p.stats.att, r.p.stats.py, r.p.stats.ptd, r.p.stats.int);
                return <span className={rt >= 95 ? 'text-grass' : rt < 70 ? 'text-blood' : ''}>{rt.toFixed(1)}</span>;
              } },
            ]}
          />
          <Board
            title="Corredores" note="ordenado por jardas de corrida"
            defaultSort="ry" rows={withKey(lim(base.filter(r => r.p.stats.car > 0).sort((a, b) => b.p.stats.ry - a.p.stats.ry)))}
            cols={[
              { k: 'player', label: 'Jogador', val: r => r.p.nome, fmt: playerCell },
              { k: 'team', label: 'Time', val: r => r.t.sigla, fmt: teamCell },
              { k: 'jogos', label: 'J', num: true, val: r => r.p.stats.jogos },
              { k: 'car', label: 'Tent.', num: true, val: r => r.p.stats.car },
              { k: 'ry', label: 'Jardas', num: true, primary: true, val: r => r.p.stats.ry },
              { k: 'ypc', label: 'Média', num: true, val: r => ypc(r.p.stats.ry, r.p.stats.car), title: 'Jardas por corrida', fmt: r => ypc(r.p.stats.ry, r.p.stats.car).toFixed(1) },
              { k: 'rtd', label: 'TDs', num: true, val: r => r.p.stats.rtd },
            ]}
          />
          <Board
            title="Receptores (WR/TE)" note="ordenado por jardas de recepção"
            defaultSort="recYds" rows={withKey(lim(base.filter(r => r.p.stats.rec > 0).sort((a, b) => b.p.stats.recYds - a.p.stats.recYds)))}
            cols={[
              { k: 'player', label: 'Jogador', val: r => r.p.nome, fmt: playerCell },
              { k: 'team', label: 'Time', val: r => r.t.sigla, fmt: teamCell },
              { k: 'jogos', label: 'J', num: true, val: r => r.p.stats.jogos },
              { k: 'rec', label: 'Recepções', num: true, val: r => r.p.stats.rec },
              { k: 'recYds', label: 'Jardas', num: true, primary: true, val: r => r.p.stats.recYds },
              { k: 'ypr', label: 'Média', num: true, val: r => ypr(r.p.stats.recYds, r.p.stats.rec), title: 'Jardas por recepção', fmt: r => ypr(r.p.stats.recYds, r.p.stats.rec).toFixed(1) },
              { k: 'recTD', label: 'TDs', num: true, val: r => r.p.stats.recTD },
            ]}
          />
        </div>
      )}

      {/* ---------- DEFENSIVA ---------- */}
      {tab === 'def' && (
        <div className="space-y-4">
          <Board
            title="Líderes em tackles" note="ordenado por tackles"
            defaultSort="tackles" rows={withKey(lim(base.filter(r => r.p.stats.tackles > 0).sort((a, b) => b.p.stats.tackles - a.p.stats.tackles)))}
            cols={[
              { k: 'player', label: 'Jogador', val: r => r.p.nome, fmt: playerCell },
              { k: 'team', label: 'Time', val: r => r.t.sigla, fmt: teamCell },
              { k: 'jogos', label: 'J', num: true, val: r => r.p.stats.jogos },
              { k: 'tackles', label: 'Tackles', num: true, primary: true, val: r => r.p.stats.tackles },
              { k: 'sacks', label: 'Sacks', num: true, val: r => r.p.stats.sacks },
              { k: 'intDef', label: 'INTs', num: true, val: r => r.p.stats.intDef },
              { k: 'ff', label: 'Fumbles F.', num: true, val: r => r.p.stats.ff, title: 'Fumbles forçados' },
            ]}
          />
          <Board
            title="Líderes em sacks" note="ordenado por sacks"
            defaultSort="sacks" rows={withKey(lim(base.filter(r => r.p.stats.sacks > 0).sort((a, b) => b.p.stats.sacks - a.p.stats.sacks)))}
            cols={[
              { k: 'player', label: 'Jogador', val: r => r.p.nome, fmt: playerCell },
              { k: 'team', label: 'Time', val: r => r.t.sigla, fmt: teamCell },
              { k: 'jogos', label: 'J', num: true, val: r => r.p.stats.jogos },
              { k: 'sacks', label: 'Sacks', num: true, primary: true, val: r => r.p.stats.sacks },
              { k: 'tackles', label: 'Tackles', num: true, val: r => r.p.stats.tackles },
              { k: 'ff', label: 'Fumbles F.', num: true, val: r => r.p.stats.ff },
            ]}
          />
          <Board
            title="Líderes em interceptações" note="ordenado por INTs"
            defaultSort="intDef" rows={withKey(lim(base.filter(r => r.p.stats.intDef > 0).sort((a, b) => b.p.stats.intDef - a.p.stats.intDef)))}
            cols={[
              { k: 'player', label: 'Jogador', val: r => r.p.nome, fmt: playerCell },
              { k: 'team', label: 'Time', val: r => r.t.sigla, fmt: teamCell },
              { k: 'jogos', label: 'J', num: true, val: r => r.p.stats.jogos },
              { k: 'intDef', label: 'INTs', num: true, primary: true, val: r => r.p.stats.intDef },
              { k: 'tackles', label: 'Tackles', num: true, val: r => r.p.stats.tackles },
              { k: 'ff', label: 'Fumbles F.', num: true, val: r => r.p.stats.ff },
            ]}
          />
        </div>
      )}

      {/* ---------- SPECIAL TEAMS ---------- */}
      {tab === 'st' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Board
            title="Kickers" note="ordenado por field goals"
            defaultSort="fgM" rows={withKey(lim(base.filter(r => r.p.stats.fgT > 0).sort((a, b) => b.p.stats.fgM - a.p.stats.fgM)))}
            cols={[
              { k: 'player', label: 'Jogador', val: r => r.p.nome, fmt: playerCell },
              { k: 'team', label: 'Time', val: r => r.t.sigla, fmt: teamCell },
              { k: 'jogos', label: 'J', num: true, val: r => r.p.stats.jogos },
              { k: 'fgM', label: 'FG', num: true, primary: true, val: r => r.p.stats.fgM, fmt: r => `${r.p.stats.fgM}/${r.p.stats.fgT}` },
              { k: 'pct', label: '%', num: true, val: r => fgPct(r.p.stats.fgM, r.p.stats.fgT), fmt: r => {
                const p = fgPct(r.p.stats.fgM, r.p.stats.fgT);
                return <span className={p >= 90 ? 'text-grass' : p < 70 ? 'text-blood' : ''}>{p}%</span>;
              } },
              { k: 'bar', label: 'Aproveitamento', num: false, val: r => fgPct(r.p.stats.fgM, r.p.stats.fgT), fmt: r => (
                <span className="block w-24"><Bar pct={fgPct(r.p.stats.fgM, r.p.stats.fgT)} color={fgPct(r.p.stats.fgM, r.p.stats.fgT) >= 85 ? 'var(--color-grass)' : 'var(--color-gold)'} h={8} /></span>
              ) },
            ]}
          />
          <Board
            title="Punters" note="ordenado por média de punt"
            defaultSort="avg" rows={withKey(lim(base.filter(r => r.p.stats.punts > 0).sort((a, b) => puntAvg(b.p.stats.puntYds, b.p.stats.punts) - puntAvg(a.p.stats.puntYds, a.p.stats.punts))))}
            cols={[
              { k: 'player', label: 'Jogador', val: r => r.p.nome, fmt: playerCell },
              { k: 'team', label: 'Time', val: r => r.t.sigla, fmt: teamCell },
              { k: 'jogos', label: 'J', num: true, val: r => r.p.stats.jogos },
              { k: 'punts', label: 'Punts', num: true, val: r => r.p.stats.punts },
              { k: 'yds', label: 'Jardas', num: true, val: r => r.p.stats.puntYds },
              { k: 'avg', label: 'Média', num: true, primary: true, val: r => puntAvg(r.p.stats.puntYds, r.p.stats.punts), fmt: r => puntAvg(r.p.stats.puntYds, r.p.stats.punts).toFixed(1) },
            ]}
          />
        </div>
      )}

      {/* rodapé com a dica de qualificação */}
      <p className="font-mono text-[11px] leading-relaxed text-faint">
        ◆ Cabeçalhos são clicáveis para reordenar qualquer coluna. ◆ A coluna dourada é a stat principal do ranking.
        {weeks >= 2 && <> ◆ <b className="text-dim">Ranking oficial</b> aplica a regra da NFL: mínimo de {minGames} jogo(s) (metade das {weeks} semanas disputadas).</>}
      </p>
    </div>
  );
}

/* célula de time com campanha, para a aba Times */
function TeamCell({ t, rec }: { t: { cor: string; cor2: string; sigla: string; conf: Conf; cidade: string; nome: string }; rec: string }) {
  return (
    <span className="flex items-center gap-2">
      <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={16} />
      <span><b>{t.cidade}</b> {t.nome}</span>
      <span className="ml-2 font-mono text-[10.5px] text-faint">{rec}</span>
    </span>
  );
}
