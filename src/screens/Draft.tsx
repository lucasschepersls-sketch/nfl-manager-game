import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, playersOf } from '../game/season';
import { Panel, PosBadge, Ovr, Bar, TeamCrest } from '../components/ui';

export default function DraftScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const d = g.draftState;
  const [ord, setOrd] = useState<'pot' | 'ovr'>('pot');

  const prospects = useMemo(() =>
    [...g.draftClass].sort((a, b) => (ord === 'pot' ? b.pot - a.pot || b.ovr - a.ovr : b.ovr - a.ovr)).slice(0, 120),
    [g.draftClass, ord]);

  if (!d) {
    return (
      <Panel title="Draft de novatos">
        <p className="font-mono text-[13px] text-dim">
          O Draft acontece na <b className="text-goldhi">Fase 3 da offseason</b>, após as renovações. A ordem é definida pela
          campanha: pior time escolhe primeiro; o campeão escolhe por último. São 7 rodadas (32 escolhas cada).
        </p>
      </Panel>
    );
  }

  const current = d.done ? null : d.order[d.pick];
  const isUser = current === g.userTeam;
  const currentTeam = current ? teamById(g, current) : null;
  const total = 7 * 32;
  const done = (d.round - 1) * 32 + d.pick;
  const mine = playersOf(g, g.userTeam).filter(p => p.rookie && p.stats.jogos === 0 && p.contrato === 4);
  const userPosInRound = d.order.indexOf(g.userTeam) + 1;

  return (
    <div className="space-y-5">
      {/* relógio do draft */}
      <div className="panel px-5 py-4" style={{ boxShadow: '5px 5px 0 rgba(0,0,0,0.4)' }}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.25em] text-faint">No relógio</div>
            <div className="font-disp text-[26px] font-bold uppercase leading-tight">
              {d.done ? 'Draft encerrado' : <>Rodada {d.round}/7 — escolha {d.pick + 1}/32</>}
            </div>
          </div>
          {!d.done && currentTeam && (
            <div className="flex items-center gap-2.5">
              <TeamCrest cor={currentTeam.cor} cor2={currentTeam.cor2} sigla={currentTeam.sigla} conf={currentTeam.conf} size={34} />
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
              <thead><tr><th>POS</th><th>Prospecto</th><th className="num">Idade</th><th className="num">OVR</th><th className="num">POT</th><th className="num">Salário novato</th><th /></tr></thead>
              <tbody>
                {prospects.map(p => (
                  <tr key={p.id} className={isUser ? 'row-click' : ''}>
                    <td><PosBadge pos={p.pos} /></td>
                    <td>{p.nome}</td>
                    <td className="num">{p.idade}</td>
                    <td className="num"><Ovr v={p.ovr} /></td>
                    <td className="num font-bold text-ice">{p.pot}</td>
                    <td className="num text-goldhi">${p.salario.toFixed(1)}M</td>
                    <td>
                      {isUser && !d.done && (
                        <button className="btn btn-sm btn-gold" onClick={() => dispatch({ type: 'DRAFT_PICK', playerId: p.id })}>
                          Draftar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="Ordem da rodada 1" pad={false}>
            <div className="max-h-[300px] overflow-y-auto">
              {d.order.map((id, i) => {
                const t = teamById(g, id);
                const me = id === g.userTeam;
                const onClock = !d.done && d.round === 1 && d.pick === i;
                return (
                  <div key={id}
                    className={`flex items-center gap-2.5 border-b border-line2 px-3.5 py-[6px] font-mono text-[12px] ${me ? 'text-goldhi' : 'text-dim'} ${onClock ? 'bg-raise' : ''}`}>
                    <span className="w-6 text-faint">{i + 1}.</span>
                    <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={14} />
                    <span className="truncate">{t.cidade} {t.nome}</span>
                    {me && <span className="tag ml-auto border-gold/50 text-gold">VOCÊ</span>}
                    {onClock && !me && <span className="ml-auto text-[10px] text-grass">no relógio</span>}
                  </div>
                );
              })}
            </div>
          </Panel>

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
                  <span className="ml-auto"><Ovr v={p.ovr} pot={p.pot} /></span>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
