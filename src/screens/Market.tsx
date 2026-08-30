import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { canSign, marketValue, fmtM } from '../game/season';
import { POS_LABEL } from '../game/data';
import { Panel, PosBadge, Ovr } from '../components/ui';
import type { Pos } from '../game/types';

export function MarketScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const [ord, setOrd] = useState<'ovr' | 'idade' | 'salario'>('ovr');
  const [posF, setPosF] = useState<'ALL' | Pos>('ALL');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const pool = useMemo(() => {
    let ps = [...g.faPool];
    if (posF !== 'ALL') ps = ps.filter(p => p.pos === posF);
    return ps.sort((a, b) =>
      ord === 'ovr' ? b.ovr - a.ovr : ord === 'idade' ? a.idade - b.idade : a.salario - b.salario);
  }, [g.faPool, ord, posF]);

  const infl = g.settings.inflacao;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={`btn btn-sm ${posF === 'ALL' ? 'btn-gold' : ''}`} onClick={() => setPosF('ALL')}>Todas</button>
        {(['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'] as Pos[]).map(p => (
          <button key={p} className={`btn btn-sm ${posF === p ? 'btn-gold' : ''}`} onClick={() => setPosF(p)}>{p}</button>
        ))}
        <span className="mx-2 h-5 w-px bg-line" />
        {(['ovr', 'idade', 'salario'] as const).map(o => (
          <button key={o} className={`btn btn-sm ${ord === o ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setOrd(o)}>
            {o === 'ovr' ? 'OVR' : o === 'idade' ? 'Idade' : 'Salário'}
          </button>
        ))}
      </div>

      <Panel
        title={`Free Agency — ${g.faPool.length} agentes livres`}
        pad={false}
        right={<span className="tag border-gold/50 text-gold">pedidos já inflacionados (+{Math.round((infl - 1) * 100)}%)</span>}
      >
        <div className="max-h-[600px] overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr><th>POS</th><th>Jogador</th><th className="num">Idade</th><th className="num">OVR</th><th className="num">POT</th><th className="num">Pedido/ano</th><th>Contrato</th><th /></tr>
            </thead>
            <tbody>
              {pool.map(p => {
                const chk = canSign(g, p);
                const mv = marketValue(p, infl);
                return (
                  <tr key={p.id}>
                    <td><PosBadge pos={p.pos} /></td>
                    <td>
                      {p.nome}
                      <span className="ml-2 font-mono text-[10.5px] text-faint" title={`Valor de mercado: ${fmtM(mv)}`}>mercado {fmtM(mv)}</span>
                    </td>
                    <td className="num">{p.idade}</td>
                    <td className="num"><Ovr v={p.ovr} pot={p.pot} /></td>
                    <td className="num text-ice">{p.pot}</td>
                    <td className="num text-goldhi">{fmtM(p.salario)}</td>
                    <td>{p.contrato} ano{p.contrato > 1 ? 's' : ''}</td>
                    <td>
                      {confirmId === p.id ? (
                        <div className="flex gap-1">
                          <button className="btn btn-sm btn-gold" onClick={() => { dispatch({ type: 'SIGN', playerId: p.id }); setConfirmId(null); }}>Confirmar</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>Não</button>
                        </div>
                      ) : (
                        <button className="btn btn-sm btn-gold" disabled={!chk.ok} title={chk.ok ? `Contratar por ${fmtM(p.salario)}/ano` : chk.motivo}
                          onClick={() => setConfirmId(p.id)}>Contratar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!pool.length && <tr><td colSpan={8} className="py-6 text-center text-faint">Nenhum agente livre neste filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="font-mono text-[11.5px] text-faint">
        Os pedidos dos agentes livres escalam com a inflação da liga (receita de TV). Times com pouco espaço no cap têm
        dificuldade para contratar — abra espaço dispensando jogadores no Elenco. Posições: {Object.values(POS_LABEL).slice(0, 4).join(', ')}…
      </p>
    </div>
  );
}
