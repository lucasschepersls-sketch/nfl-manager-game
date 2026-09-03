import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, playersOf } from '../game/season';
import { estimateAspect, GRADE_MEANING } from '../game/scouting';
import { Panel, PosBadge, Ovr, GradeBadge, Bar } from '../components/ui';
import type { Player } from '../game/types';

export function DraftScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const d = g.draftState;
  const [ord, setOrd] = useState<'pot' | 'ovr'>('pot');

  const prospects = useMemo(() =>
    [...g.draftClass].sort((a, b) => (ord === 'pot' ? b.pot - a.pot || b.ovr - a.ovr : b.ovr - a.ovr)),
    [g.draftClass, ord]);

  if (!d) {
    return (
      <Panel title="Draft de novatos">
        <p className="font-mono text-[13px] text-dim">
          O Draft acontece na Fase 3 da offseason. A ordem é definida pela campanha: pior time escolhe primeiro,
          o campeão por último. São 7 rodadas (32 escolhas cada).
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
  const userPosInRound = d.order.indexOf(g.userTeam) + 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 border border-line bg-panel2 px-4 py-2.5">
        <span className="font-mono text-[12px] text-dim">
          As notas de <b className="text-ink">Overall</b> e <b className="text-ink">Potencial</b> são estimativas do seu scouting.
          Prospectos com <span className="text-goldhi">3 relatórios</span> podem surpreender no combine (±5).
        </span>
        <button className="btn btn-sm btn-ghost ml-auto" onClick={() => dispatch({ type: 'SCREEN', screen: 'scouting' })}>
          Abrir Scouting Board »
        </button>
      </div>

      <div className="panel px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.25em] text-faint">No relógio</div>
            <div className="font-disp text-[26px] font-bold uppercase leading-tight">
              {d.done ? 'Draft encerrado' : <>Rodada {d.round}/7 — escolha {d.pick + 1}/32</>}
            </div>
          </div>
          {!d.done && currentTeam && (
            <div className="flex items-center gap-2.5">
              <TeamDotSafe cor={currentTeam.cor} />
              <div>
                <div className="font-disp text-[18px] font-bold uppercase leading-none">{currentTeam.cidade} {currentTeam.nome}</div>
                {isUser
                  ? <span className="tag border-gold/60 text-gold blink">SUA ESCOLHA — selecione abaixo</span>
                  : <span className="font-mono text-[11.5px] text-dim">sala de guerra decidindo…</span>}
              </div>
            </div>
          )}
          <div className="ml-auto flex flex-col items-end gap-2">
            <div className="w-52">
              <div className="mb-1 flex justify-between font-mono text-[11px] text-faint">
                <span>progresso</span><span>{done}/{total}</span>
              </div>
              <Bar pct={(done / total) * 100} color="var(--color-gold)" />
            </div>
            {!d.done && (
              <div className="flex gap-2">
                {!isUser && <button className="btn btn-sm btn-gold" onClick={() => dispatch({ type: 'DRAFT_AUTO' })}>Avançar até minha escolha »</button>}
                <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: 'DRAFT_ALL' })}>Deixar a IA draftar tudo</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_290px]">
        <Panel title={`Prospectos universitários — ${g.draftClass.length} disponíveis`} pad={false}
          right={
            <div className="flex gap-2">
              {(['pot', 'ovr'] as const).map(o => (
                <button key={o} className={`btn btn-sm ${ord === o ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setOrd(o)}>
                  {o === 'pot' ? 'Potencial' : 'OVR atual'}
                </button>
              ))}
            </div>
          }>
          <div className="max-h-[560px] overflow-y-auto">
            <table className="tbl">
              <thead><tr><th>POS</th><th>Prospecto</th><th>College</th><th className="num">Idade</th><th className="num">Overall</th><th className="num">Potencial</th><th className="num">Rel.</th><th /></tr></thead>
              <tbody>
                {prospects.slice(0, 120).map((p: Player) => {
                  const ovr = estimateAspect(p, 'ovr');
                  const pot = estimateAspect(p, 'pot');
                  const isElite = p.ovr >= 90;
                  return (
                    <tr key={p.id} style={isElite ? { boxShadow: 'inset 3px 0 0 var(--color-goldhi)' } : undefined}>
                      <td><PosBadge pos={p.pos} /></td>
                      <td>
                        {p.nome}
                        {isElite && <span className="tag ml-2 border-goldhi/70 text-goldhi">★ A+</span>}
                        {p.scout?.onBoard && <span className="ml-1.5 text-grass" title="No seu board">📌</span>}
                        {(p.scout?.aiHeat ?? 0) > 0 && <span className="ml-1.5 text-goldhi" title={`${p.scout?.aiHeat} GM(s) da IA investigaram`}>🔥{p.scout?.aiHeat}</span>}
                      </td>
                      <td className="text-dim">{p.scout?.college ?? '—'}</td>
                      <td className="num">{p.idade}</td>
                      <td className="num" title={ovr.exact ? `OVR exato: ${ovr.center}` : 'Estimativa do scout — investigue para refinar'}>
                        <GradeBadge grade={ovr.grade} exact={ovr.exact} title={GRADE_MEANING[ovr.grade]} />
                        <span className="ml-1.5 font-mono text-[10.5px] text-faint">{ovr.label}</span>
                      </td>
                      <td className="num" title={pot.exact ? `Potencial exato: ${pot.center}` : 'Estimativa do scout — investigue para refinar'}>
                        <GradeBadge grade={pot.grade} exact={pot.exact} title={GRADE_MEANING[pot.grade]} />
                        <span className="ml-1.5 font-mono text-[10.5px] text-faint">{pot.label}</span>
                      </td>
                      <td className="num">
                        <span className="inline-flex gap-[3px]" title={`${p.scout?.reports ?? 0}/3 relatórios`}>
                          {[...Array(p.scout?.maxReports ?? 3)].map((_, i) => (
                            <span key={i} className="inline-block h-[8px] w-[8px] rounded-full"
                              style={{ background: i < (p.scout?.reports ?? 0) ? 'var(--color-goldhi)' : 'rgba(255,255,255,0.12)' }} />
                          ))}
                        </span>
                      </td>
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
              <p className="px-4 py-4 font-mono text-[12px] text-faint">
                Você escolhe na posição {userPosInRound} de cada rodada. Nenhum novato contratado ainda.
              </p>
            ) : (
              mine.map(p => (
                <div key={p.id} className="flex items-center gap-2.5 border-b border-line2 px-3.5 py-[7px] font-mono text-[12px]">
                  <PosBadge pos={p.pos} />
                  <span className="truncate">{p.nome}</span>
                  <span className="ml-auto text-faint">{p.scout?.college ?? ''}</span>
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

function TeamDotSafe({ cor }: { cor: string }) {
  return <span className="inline-block h-8 w-8 border" style={{ background: cor }} />;
}
