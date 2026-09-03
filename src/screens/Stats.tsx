import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById } from '../game/season';
import {
  qbRows, rbRows, recRows, defRows, kRows, pRows, teamRankRows,
  topBy, applyTeamFilter, minGamesToRank, passerRating, ypc, ypr, fgPct, puntAvg, thirdPct, perGame,
} from '../game/seasonStats';
import { Panel, PosBadge, TeamDot } from '../components/ui';
import type { StatsTab } from '../game/types';

function TeamFilter({ conf, div, setConf, setDiv }: {
  conf: 'ALL' | 'AFC' | 'NFC'; div: number;
  setConf: (c: 'ALL' | 'AFC' | 'NFC') => void; setDiv: (d: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-faint">Conferência:</span>
      {(['ALL', 'AFC', 'NFC'] as const).map(c => (
        <button key={c} className={`btn btn-sm ${conf === c ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setConf(c)}>{c}</button>
      ))}
      <span className="ml-3 font-mono text-[11px] uppercase tracking-wider text-faint">Divisão:</span>
      {[-1, 0, 1, 2, 3].map(d => (
        <button key={d} className={`btn btn-sm ${div === d ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setDiv(d)}>
          {d < 0 ? 'Todas' : ['Leste', 'Norte', 'Sul', 'Oeste'][d]}
        </button>
      ))}
    </div>
  );
}

function Num({ v, hl }: { v: string | number; hl?: boolean }) {
  return <td className={`num ${hl ? 'highlight-num' : ''}`}>{v}</td>;
}

export default function StatsScreen({ tab }: { tab: StatsTab }) {
  const { st } = useGame();
  const g = st.game!;
  const [conf, setConf] = useState<'ALL' | 'AFC' | 'NFC'>('ALL');
  const [div, setDiv] = useState(-1);
  const [n, setN] = useState(20);

  const minG = minGamesToRank(g);

  const teams = useMemo(() => topBy(teamRankRows(g, conf, div), r => r.ts.pointsScored, 32), [g, conf, div]);

  const qbs = useMemo(() => topBy(applyTeamFilter(qbRows(g), conf, div), r => r.p.stats.py, n), [g, conf, div, n]);
  const rbs = useMemo(() => topBy(applyTeamFilter(rbRows(g), conf, div), r => r.p.stats.ry, n), [g, conf, div, n]);
  const recs = useMemo(() => topBy(applyTeamFilter(recRows(g), conf, div), r => r.p.stats.recYds, n), [g, conf, div, n]);
  const defs = useMemo(() => topBy(applyTeamFilter(defRows(g), conf, div), r => r.p.stats.tackles + r.p.stats.sacks * 4 + r.p.stats.intDef * 5, n), [g, conf, div, n]);
  const kicks = useMemo(() => topBy(applyTeamFilter(kRows(g), conf, div), r => r.p.stats.fgM, n), [g, conf, div, n]);
  const punts = useMemo(() => topBy(applyTeamFilter(pRows(g), conf, div), r => r.p.stats.puntYds, n), [g, conf, div, n]);

  const playerRow = (r: { p: typeof qbs[number]['p']; t: typeof qbs[number]['t'] }, i: number, cells: React.ReactNode) => (
    <tr key={r.p.id}>
      <td className="num text-faint">{i + 1}</td>
      <td><PosBadge pos={r.p.pos} /> <span className="ml-1.5">{r.p.nome}</span>{r.p.stats.jogos < minG && <span className="tag ml-2 border-line text-faint" title={`Abaixo do mínimo de ${minG} jogos`}>*</span>}</td>
      <td><span className="inline-flex items-center gap-1.5"><TeamDot cor={r.t.cor} />{r.t.sigla}</span></td>
      <td className="num">{r.p.stats.jogos}</td>
      {cells}
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TeamFilter conf={conf} div={div} setConf={setConf} setDiv={setDiv} />
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-faint">Top:</span>
          {[10, 20, 50].map(v => (
            <button key={v} className={`btn btn-sm ${n === v ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setN(v)}>{v}</button>
          ))}
        </div>
      </div>

      {tab === 'teams' && (
        <Panel title="Ranking de times (pontos)" pad={false}>
          <table className="tbl">
            <thead><tr><th>#</th><th>Time</th><th className="num">J</th><th className="num">PTS</th><th className="num">Jardas</th><th className="num">Passe</th><th className="num">Corrida</th><th className="num">TOs</th><th className="num">3ª %</th></tr></thead>
            <tbody>
              {teams.map((r, i) => (
                <tr key={r.t.id}>
                  <td className="num text-faint">{i + 1}</td>
                  <td><span className="inline-flex items-center gap-1.5"><TeamDot cor={r.t.cor} /><b>{r.t.cidade} {r.t.nome}</b></span></td>
                  <td className="num">{r.ts.thirdAtt > 0 || r.ts.pointsScored > 0 ? '—' : '—'}</td>
                  <Num v={r.ts.pointsScored} hl />
                  <Num v={r.ts.totalYards} />
                  <Num v={r.ts.passingYards} />
                  <Num v={r.ts.rushingYards} />
                  <Num v={r.ts.turnovers} />
                  <Num v={`${thirdPct(r.ts.thirdConv, r.ts.thirdAtt)}%`} />
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === 'off' && (
        <>
          <Panel title={`Quarterbacks — jardas de passe (mín. ${minG} jogos)`} pad={false}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Jogador</th><th>Time</th><th className="num">J</th><th className="num">Comp/Att</th><th className="num">Jardas</th><th className="num">TD</th><th className="num">INT</th><th className="num">Rating</th></tr></thead>
              <tbody>
                {qbs.map((r, i) => playerRow(r, i, <>
                  <Num v={`${r.p.stats.cmp}/${r.p.stats.att}`} />
                  <Num v={r.p.stats.py} hl />
                  <Num v={r.p.stats.ptd} />
                  <Num v={r.p.stats.int} />
                  <Num v={passerRating(r.p.stats.cmp, r.p.stats.att, r.p.stats.py, r.p.stats.ptd, r.p.stats.int)} />
                </>))}
              </tbody>
            </table>
          </Panel>
          <Panel title={`Corredores — jardas (mín. ${minG} jogos)`} pad={false}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Jogador</th><th>Time</th><th className="num">J</th><th className="num">Car</th><th className="num">Jardas</th><th className="num">Méd</th><th className="num">TD</th></tr></thead>
              <tbody>
                {rbs.map((r, i) => playerRow(r, i, <>
                  <Num v={r.p.stats.car} />
                  <Num v={r.p.stats.ry} hl />
                  <Num v={ypc(r.p.stats.ry, r.p.stats.car)} />
                  <Num v={r.p.stats.rtd} />
                </>))}
              </tbody>
            </table>
          </Panel>
          <Panel title={`Receptores — jardas (mín. ${minG} jogos)`} pad={false}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Jogador</th><th>Time</th><th className="num">J</th><th className="num">Rec</th><th className="num">Jardas</th><th className="num">Méd</th><th className="num">TD</th></tr></thead>
              <tbody>
                {recs.map((r, i) => playerRow(r, i, <>
                  <Num v={r.p.stats.rec} />
                  <Num v={r.p.stats.recYds} hl />
                  <Num v={ypr(r.p.stats.recYds, r.p.stats.rec)} />
                  <Num v={r.p.stats.recTD} />
                </>))}
              </tbody>
            </table>
          </Panel>
        </>
      )}

      {tab === 'def' && (
        <Panel title={`Defesa — tackles + sacks + INTs (mín. ${minG} jogos)`} pad={false}>
          <table className="tbl">
            <thead><tr><th>#</th><th>Jogador</th><th>Time</th><th className="num">J</th><th className="num">Tackles</th><th className="num">Sacks</th><th className="num">INT</th><th className="num">FF</th></tr></thead>
            <tbody>
              {defs.map((r, i) => playerRow(r, i, <>
                <Num v={r.p.stats.tackles} hl />
                <Num v={r.p.stats.sacks} />
                <Num v={r.p.stats.intDef} />
                <Num v={r.p.stats.ff} />
              </>))}
            </tbody>
          </table>
        </Panel>
      )}

      {tab === 'st' && (
        <>
          <Panel title="Kickers — field goals" pad={false}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Jogador</th><th>Time</th><th className="num">J</th><th className="num">FG</th><th className="num">%</th><th className="num">Méd/jogo</th></tr></thead>
              <tbody>
                {kicks.map((r, i) => playerRow(r, i, <>
                  <Num v={`${r.p.stats.fgM}/${r.p.stats.fgT}`} hl />
                  <Num v={`${fgPct(r.p.stats.fgM, r.p.stats.fgT)}%`} />
                  <Num v={perGame(r.p.stats.fgM, r.p.stats.jogos)} />
                </>))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Punters — média" pad={false}>
            <table className="tbl">
              <thead><tr><th>#</th><th>Jogador</th><th>Time</th><th className="num">J</th><th className="num">Punts</th><th className="num">Média</th></tr></thead>
              <tbody>
                {punts.map((r, i) => playerRow(r, i, <>
                  <Num v={r.p.stats.punts} />
                  <Num v={puntAvg(r.p.stats.puntYds, r.p.stats.punts)} hl />
                </>))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
