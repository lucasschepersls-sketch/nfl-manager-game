import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { playersOf } from '../game/season';
import { estimateAspect, needGradeFor, needScore, GRADE_MEANING, accuracyRange } from '../game/scouting';
import { Panel, PosBadge, GradeBadge, Bar } from '../components/ui';
import type { Pos } from '../game/types';

const POSICOES: (Pos | 'ALL')[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

export function ScoutingScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const [pos, setPos] = useState<Pos | 'ALL'>('ALL');
  const [minGrade, setMinGrade] = useState(0);
  const [onlyNeed, setOnlyNeed] = useState(false);
  const [onlyBoard, setOnlyBoard] = useState(false);

  const myRoster = useMemo(() => playersOf(g, g.userTeam), [g]);

  const rows = useMemo(() => {
    return g.draftClass
      .map(p => {
        const ovr = estimateAspect(p, 'ovr');
        const pot = estimateAspect(p, 'pot');
        const need = needScore(p.pos, myRoster);
        return { p, ovr, pot, need, needGrade: needGradeFor(p.pos, myRoster) };
      })
      .filter(r => (pos === 'ALL' || r.p.pos === pos))
      .filter(r => r.ovr.center >= minGrade)
      .filter(r => !onlyNeed || r.need >= 65)
      .filter(r => !onlyBoard || r.p.scout?.onBoard)
      .sort((a, b) => b.pot.center - a.pot.center);
  }, [g.draftClass, myRoster, pos, minGrade, onlyNeed, onlyBoard]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-dim">Budget de scouting:</span>
          <span className="font-disp text-[20px] font-extrabold text-goldhi">{g.scoutBudget} pts</span>
          <span className="font-mono text-[11px] text-faint">(1 investigação = 1 ponto)</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={`btn btn-sm ${onlyBoard ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setOnlyBoard(!onlyBoard)}>📌 Só no board</button>
          <button className={`btn btn-sm ${onlyNeed ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setOnlyNeed(!onlyNeed)}>Só carências</button>
          <select className="sel" value={minGrade} onChange={e => setMinGrade(+e.target.value)}>
            <option value={0}>Nota mín: todas</option>
            <option value={85}>Nota mín: A</option>
            <option value={75}>Nota mín: B+</option>
            <option value={65}>Nota mín: B-</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {POSICOES.map(p2 => (
          <button key={p2} className={`btn btn-sm ${pos === p2 ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setPos(p2)}>{p2}</button>
        ))}
      </div>

      <Panel title={`Scouting Board — ${rows.length} prospectos`} pad={false}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>POS</th><th>Prospecto</th><th>College</th><th className="num">Overall</th><th className="num">Potencial</th><th className="num">Need</th><th className="num">Precisão</th><th className="num">Rel.</th><th>Ações</th></tr></thead>
            <tbody>
              {rows.slice(0, 80).map(r => {
                const reports = r.p.scout?.reports ?? 0;
                const max = r.p.scout?.maxReports ?? 3;
                const range = accuracyRange(reports);
                return (
                  <tr key={r.p.id} style={r.p.scout?.onBoard ? { boxShadow: 'inset 3px 0 0 var(--color-grass)' } : undefined}>
                    <td><PosBadge pos={r.p.pos} /></td>
                    <td>{r.p.nome}{r.p.scout?.onBoard && <span className="ml-1.5 text-grass">📌</span>}</td>
                    <td className="text-dim">{r.p.scout?.college ?? '—'}</td>
                    <td className="num">
                      <GradeBadge grade={r.ovr.grade} exact={r.ovr.exact} title={GRADE_MEANING[r.ovr.grade]} />{' '}
                      <span className="ml-1 font-mono text-[10.5px] text-faint">{r.ovr.label}</span>
                    </td>
                    <td className="num">
                      <GradeBadge grade={r.pot.grade} exact={r.pot.exact} />{' '}
                      <span className="ml-1 font-mono text-[10.5px] text-faint">{r.pot.label}</span>
                    </td>
                    <td className="num"><GradeBadge grade={r.needGrade} exact title={`Necessidade do seu time em ${r.p.pos}: ${r.need}`} /></td>
                    <td className="num font-mono text-[11px] text-faint">{range === 0 ? 'exato' : `±${range}`}</td>
                    <td className="num">
                      <span className="inline-flex gap-[3px]">
                        {[...Array(max)].map((_, i) => (
                          <span key={i} className="inline-block h-[8px] w-[8px] rounded-full"
                            style={{ background: i < reports ? 'var(--color-goldhi)' : 'rgba(255,255,255,0.12)' }} />
                        ))}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button className="btn btn-sm" disabled={reports >= max || g.scoutBudget < 1}
                          title={reports >= max ? 'Relatórios completos' : 'Gasta 1 ponto de scouting'}
                          onClick={() => dispatch({ type: 'INVESTIGATE', playerId: r.p.id })}>Investigar</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: 'TOGGLE_BOARD', playerId: r.p.id })}>
                          {r.p.scout?.onBoard ? 'Remover' : 'Board'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={9} className="py-6 text-center text-faint">Nenhum prospecto nos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Como funciona o scouting">
        <div className="grid gap-3 font-mono text-[12px] leading-relaxed text-dim md:grid-cols-3">
          <div><b className="text-ink">Precisão:</b> sem relatórios a avaliação vem como faixa (±15). Cada investigação aperta: ±10, ±5 e então <b className="text-grass">exata</b>.</div>
          <div><b className="text-ink">Surpresas:</b> prospectos com 3 relatórios têm 10% de chance de ±5 de rating no combine — para cima ou para baixo.</div>
          <div><b className="text-ink">Need:</b> a nota de necessidade reflete a carência do seu elenco naquela posição. Use-a junto ao potencial no draft.</div>
        </div>
      </Panel>
    </div>
  );
}
