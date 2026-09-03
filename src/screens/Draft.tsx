import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, playersOf } from '../game/season';
import { estimateAspect, GRADE_MEANING } from '../game/scouting';
import { rookieSalary } from '../game/data';
import { fmtM } from '../game/season';
import { Panel, PosBadge, Ovr, Bar, GradeBadge } from '../components/ui';

export function DraftScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const d = g.draftState;
  const [ord, setOrd] = useState<'pot' | 'ovr'>('pot');

  const prospects = useMemo(() =>
    [...g.draftClass].sort((a, b) => ord === 'pot' ? b.pot - a.pot || b.ovr - a.ovr : b.ovr - a.ovr),
    [g.draftClass, ord]);

  if (!d) {
    return (
      <Panel title="Draft de novatos">
        <p className="font-mono text-[13px] text-dim">
          O Draft acontece na Fase 3 da offseason. A ordem segue a campanha (pior time escolhe primeiro).
          São 7 rodadas de 32 escolhas.
        </p>
      </Panel>
    );
  }

  const current = d.order[d.pick];
  const isUser = current === g.userTeam;
  const currentTeam = current ? teamById(g, current) : null;
  const total = 7 * 32;
  const done = (d.round - 1) * 32 + d.pick;
  const mine = playersOf(g, g.userTeam).filter(p => p.rookie && p.contrato === 4);

  return (
    <div className="space-y-5">
      {/* relógio */}
      <div className="border border-line bg-panel px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.25em] text-faint">No relógio</div>
            <div className="font-disp text-[26px] font-bold uppercase leading-tight">
              {d.done ? 'Draft encerrado' : <>Rodada {d.round}/7 — escolha {d.pick + 1}/32</>}
            </div>
          </div>
          {!d.done && currentTeam && (
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-8 w-8 border" style={{ background: currentTeam.cor }} />
              <div>
                <div className="font-disp text-[18px] font-bold uppercase leading-none">{currentTeam.cidade} {currentTeam.nome}</div>
                {isUser
                  ? <span className="tag border-gold/60 text-gold blink">SUA ESCOLHA</span>
                  : <span className="font-mono text-[11.5px] text-dim">sala de guerra decidindo…</span>}
              </div>
            </div>
          )}
          <div className="ml-auto flex flex-col items-end gap-2">
            <div className="w-52">
              <div className="mb-1 flex justify-between font-mono text-[11px] text-faint"><span>progresso</span><span>{done}/{total}</span></div>
              <Bar pct={(done / total) * 100} color="var(--color-gold)" />
            </div>
            {!d.done && (
              <div className="flex gap-2">
                {!isUser && <button className="btn btn-sm btn-gold" onClick={() => dispatch({ type: 'DRAFT_AUTO' })}>Avançar até minha escolha »</button>}
                <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: 'DRAFT_ALL' })}>IA drafta tudo</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_290px]">
        <Panel title={`Prospectos — ${g.draftClass.length} disponíveis`} pad={false}
          right={
            <div className="flex gap-2">
              {(['pot', 'ovr'] as const).map(o => (
                <button key={o} className={`btn btn-sm ${ord === o ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setOrd(o)}>
                  {o === 'pot' ? 'Potencial' : 'OVR'}
                </button>
              ))}
            </div>
          }>
          <div className="max-h-[560px] overflow-y-auto">
            <table className="tbl">
              <thead><tr><th>POS</th><th>Prospecto</th><th>College</th><th className="num">Idade</th><th className="num">Overall</th><th className="num">Potencial</th><th className="num">Rookie</th><th /></tr></thead>
              <tbody>
                {prospects.slice(0, 120).map(p => {
                  const ovr = estimateAspect(p, 'ovr');
                  const pot = estimateAspect(p, 'pot');
                  return (
                    <tr key={p.id}>
                      <td><PosBadge pos={p.pos} /></td>
                      <td>{p.nome}{p.scout?.onBoard && <span className="ml-1.5 text-grass" title="No seu board">📌</span>}</td>
                      <td className="text-dim">{p.scout?.college ?? '—'}</td>
                      <td className="num">{p.idade}</td>
                      <td className="num"><GradeBadge grade={ovr.grade} exact={ovr.exact} title={GRADE_MEANING[ovr.grade]} /> <span className="ml-1 font-mono text-[10.5px] text-faint">{ovr.label}</span></td>
                      <td className="num"><GradeBadge grade={pot.grade} exact={pot.exact} /> <span className="ml-1 font-mono text-[10.5px] text-faint">{pot.label}</span></td>
                      <td className="num text-goldhi">{fmtM(rookieSalary(p.ovr))}</td>
                      <td>
                        {isUser && !d.done && (
                          <button className="btn btn-sm btn-gold" onClick={() => dispatch({ type: 'DRAFT_PICK', playerId: p.id })}>Draftar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="Minhas escolhas" pad={false}>
            {mine.length === 0 ? (
              <p className="px-4 py-4 font-mono text-[12px] text-faint">Nenhum novato contratado ainda.</p>
            ) : (
              mine.map(p => (
                <div key={p.id} className="flex items-center gap-2.5 border-b border-line2 px-3.5 py-[7px] font-mono text-[12px]">
                  <PosBadge pos={p.pos} />
                  <span className="truncate">{p.nome}</span>
                  <Ovr v={p.ovr} pot={p.pot} />
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
