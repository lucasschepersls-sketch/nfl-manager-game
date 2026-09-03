import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { playersOf, teamById, SCOUT_HIRE_COST, fmtM } from '../game/season';
import { accuracyRange, estimateAspect, GRADE_MEANING, needGradeFor } from '../game/scouting';
import { COLLEGES } from '../game/generate';
import { Panel, PosBadge, GradeBadge, Bar, Icons } from '../components/ui';
import type { GradeLetter, Pos } from '../game/types';

const GRADE_RANK: Record<GradeLetter, number> = {
  'A+': 11, 'A': 10, 'A-': 9, 'B+': 8, 'B': 7, 'B-': 6,
  'C+': 5, 'C': 4, 'C-': 3, 'D': 2, 'F': 1,
};
const GRADES: GradeLetter[] = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];

export function ScoutingScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const myRoster = useMemo(() => playersOf(g, g.userTeam), [g]);

  const [posF, setPosF] = useState<'ALL' | Pos>('ALL');
  const [gradeF, setGradeF] = useState<'ALL' | GradeLetter>('ALL');
  const [needF, setNeedF] = useState(false);
  const [collegeF, setCollegeF] = useState<'ALL' | string>('ALL');
  const [boardF, setBoardF] = useState(false);
  const [ord, setOrd] = useState<'pot' | 'ovr' | 'need'>('pot');

  const rows = useMemo(() => {
    let list = g.draftClass.map(p => {
      const ovr = estimateAspect(p, 'ovr');
      const pot = estimateAspect(p, 'pot');
      const need = needGradeFor(p.pos, myRoster);
      return { p, ovr, pot, need };
    });
    if (posF !== 'ALL') list = list.filter(r => r.p.pos === posF);
    if (gradeF !== 'ALL') list = list.filter(r => GRADE_RANK[r.ovr.grade] >= GRADE_RANK[gradeF]);
    if (needF) list = list.filter(r => GRADE_RANK[r.need] >= GRADE_RANK['B+']);
    if (collegeF !== 'ALL') list = list.filter(r => r.p.scout?.college === collegeF);
    if (boardF) list = list.filter(r => r.p.scout?.onBoard);
    return list.sort((a, b) =>
      ord === 'pot' ? b.pot.center - a.pot.center
        : ord === 'ovr' ? b.ovr.center - a.ovr.center
          : GRADE_RANK[b.need] - GRADE_RANK[a.need]);
  }, [g.draftClass, myRoster, posF, gradeF, needF, collegeF, boardF, ord]);

  const eliteCount = useMemo(
    () => g.draftClass.filter(p => p.ovr >= 90).length,
    [g.draftClass],
  );
  const budgetPct = g.scoutBudgetMax > 0 ? (g.scoutBudget / g.scoutBudgetMax) * 100 : 0;
  const onBoardCount = g.draftClass.filter(p => p.scout?.onBoard).length;

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <div>
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.25em] text-faint">Budget de Scouting</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="font-disp text-[34px] font-extrabold leading-none text-goldhi">{g.scoutBudget}</span>
            <span className="font-mono text-[12px] text-dim">/ {g.scoutBudgetMax} pontos</span>
          </div>
        </div>
        <div className="min-w-[180px] flex-1">
          <Bar pct={budgetPct} color={budgetPct > 40 ? 'var(--color-gold)' : 'var(--color-blood)'} h={10} />
          <div className="mt-1 font-mono text-[10.5px] text-faint">cada investigação custa 1 ponto · restaurado a cada offseason</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-sm" onClick={() => dispatch({ type: 'HIRE_SCOUT' })}>
            {Icons.staff} Olheiro extra · {fmtM(SCOUT_HIRE_COST)}/ano
          </button>
          <span className="tag border-gold/50 text-gold">{eliteCount} A+ na classe</span>
          <span className="tag border-grass/50 text-grass">{onBoardCount} no board</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={`btn btn-sm ${posF === 'ALL' ? 'btn-gold' : ''}`} onClick={() => setPosF('ALL')}>Todas pos</button>
        {(['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'] as Pos[]).map(p => (
          <button key={p} className={`btn btn-sm ${posF === p ? 'btn-gold' : ''}`} onClick={() => setPosF(p)}>{p}</button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        <select
          className="btn btn-sm bg-panel"
          value={gradeF}
          onChange={e => setGradeF(e.target.value as 'ALL' | GradeLetter)}
        >
          <option value="ALL">Nota mín: qualquer</option>
          {GRADES.map(gr => <option key={gr} value={gr}>Nota mín: {gr}</option>)}
        </select>
        <select
          className="btn btn-sm bg-panel"
          value={collegeF}
          onChange={e => setCollegeF(e.target.value)}
        >
          <option value="ALL">College: todos</option>
          {COLLEGES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className={`btn btn-sm ${needF ? 'btn-gold' : ''}`} onClick={() => setNeedF(v => !v)}>Só carências</button>
        <button className={`btn btn-sm ${boardF ? 'btn-gold' : ''}`} onClick={() => setBoardF(v => !v)}>Só no board</button>
        <span className="mx-1 h-5 w-px bg-line" />
        {([['pot', 'Potencial'], ['ovr', 'Overall'], ['need', 'Necessidade']] as const).map(([o, l]) => (
          <button key={o} className={`btn btn-sm ${ord === o ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setOrd(o)}>{l}</button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <Panel title={`Prospectos — ${rows.length} de ${g.draftClass.length}`} pad={false}>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>POS</th><th>Jogador</th><th>College</th>
                  <th className="num">Overall</th><th className="num">Potencial</th>
                  <th className="num">Need</th><th className="num">Speed</th>
                  <th className="num">Reports</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, ovr, pot, need }) => {
                  const sc = p.scout!;
                  const isElite = p.ovr >= 90;
                  const maxed = sc.reports >= sc.maxReports;
                  return (
                    <tr
                      key={p.id}
                      className={sc.onBoard ? 'bg-[rgba(62,207,122,0.06)]' : undefined}
                      style={isElite ? { boxShadow: 'inset 3px 0 0 var(--color-goldhi)' } : undefined}
                    >
                      <td><PosBadge pos={p.pos} /></td>
                      <td>
                        {p.nome}
                        {isElite && <span className="tag ml-2 border-goldhi/70 text-goldhi" title="Franchise player (A+)">★ A+</span>}
                        {sc.onBoard && <span className="ml-1.5 text-grass" title="No board">📌</span>}
                      </td>
                      <td className="text-dim">{sc.college}</td>
                      <td className="num" title={ovr.exact ? `OVR exato: ${ovr.center}` : `Estimativa ±${accuracyRange(sc.reports)}`}>
                        <GradeBadge grade={ovr.grade} exact={ovr.exact} title={`${GRADE_MEANING[ovr.grade]}`} />
                        <span className="ml-1.5 font-mono text-[10.5px] text-faint">{ovr.label}</span>
                      </td>
                      <td className="num" title={pot.exact ? `Potencial exato: ${pot.center}` : `Estimativa ±${accuracyRange(sc.reports)}`}>
                        <GradeBadge grade={pot.grade} exact={pot.exact} title={GRADE_MEANING[pot.grade]} />
                        <span className="ml-1.5 font-mono text-[10.5px] text-faint">{pot.label}</span>
                      </td>
                      <td className="num"><GradeBadge grade={need} title={`Necessidade: ${GRADE_MEANING[need]}`} /></td>
                      <td className="num font-mono text-[12px]">{p.attrs.velocidade}</td>
                      <td className="num">
                        <span className="inline-flex gap-[3px]" title={`${sc.reports}/${sc.maxReports} relatórios`}>
                          {[...Array(sc.maxReports)].map((_, i) => (
                            <span key={i} className="inline-block h-[9px] w-[9px] rounded-full"
                              style={{ background: i < sc.reports ? 'var(--color-goldhi)' : 'rgba(255,255,255,0.12)' }} />
                          ))}
                        </span>
                      </td>
                      <td>
                        <div className="flex justify-end gap-1.5">
                          <button
                            className="btn btn-sm btn-ghost"
                            disabled={maxed || g.scoutBudget < 1}
                            title={maxed ? 'Relatórios completos' : g.scoutBudget < 1 ? 'Sem pontos de scouting' : `Investigar (1 ponto) — precisão ±${accuracyRange(sc.reports + 1) === 0 ? 'exata' : accuracyRange(sc.reports + 1)}`}
                            onClick={() => dispatch({ type: 'INVESTIGATE', playerId: p.id })}
                          >
                            {Icons.scout} {maxed ? 'Completo' : 'Investigar'}
                          </button>
                          <button
                            className={`btn btn-sm ${sc.onBoard ? 'btn-gold' : 'btn-ghost'}`}
                            title={sc.onBoard ? 'Remover do board' : 'Adicionar ao board'}
                            onClick={() => dispatch({ type: 'TOGGLE_BOARD', playerId: p.id })}
                          >
                            {sc.onBoard ? 'No board' : 'Board'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr><td colSpan={9} className="py-8 text-center font-mono text-[12.5px] text-faint">Nenhum prospecto corresponde aos filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Escala de notas" pad={false}>
            <div className="px-3.5 py-2.5">
              {GRADES.map(gr => (
                <div key={gr} className="flex items-center justify-between border-b border-line2 py-[5px] last:border-0">
                  <GradeBadge grade={gr} />
                  <span className="font-mono text-[11px] text-dim">{GRADE_MEANING[gr]}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Como funciona">
            <ul className="space-y-2 font-mono text-[11.5px] leading-relaxed text-dim">
              <li><span className="text-goldhi">◆</span> Sem relatório, a nota é uma faixa larga (±15). Investigar reduz a incerteza: ±10, ±5 e então <span className="text-ink">exata</span>.</li>
              <li><span className="text-goldhi">◆</span> Um prospecto com <span className="text-ink">3 relatórios</span> tem 10% de chance de surpreender no combine (±5 de rating).</li>
              <li><span className="text-goldhi">◆</span> <span className="text-goldhi">★ A+</span> marca os franchise players — apenas alguns por classe.</li>
              <li><span className="text-goldhi">◆</span> <span className="text-grass">Need</span> reflete a carência do seu elenco naquela posição.</li>
              <li><span className="text-goldhi">◆</span> O budget volta cheio a cada offseason; olheiros extras dão +2.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
