import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { capUsed, fmtM, teamById } from '../game/season';
import { marketValue, negotiationHappiness, suggestedOffer } from '../game/negotiations';
import { Panel, PosBadge, Ovr, AttrCell, Bar } from '../components/ui';
import { ATTR_KEYS } from '../game/data';
import type { AttrKey, ContractOffer, GameState, Player, Pos } from '../game/types';

function keyAttrsOf(pos: Pos): AttrKey[] {
  switch (pos) {
    case 'QB': return ['passe', 'corrida', 'velocidade'];
    case 'RB': return ['corrida', 'recepcao', 'velocidade'];
    case 'WR': return ['recepcao', 'velocidade', 'corrida'];
    case 'TE': return ['recepcao', 'bloqueio', 'velocidade'];
    case 'OL': return ['bloqueio', 'resistencia', 'corrida'];
    case 'DL': return ['tackle', 'velocidade', 'resistencia'];
    case 'LB': return ['tackle', 'velocidade', 'resistencia'];
    case 'CB': return ['recepcao', 'velocidade', 'tackle'];
    case 'S': return ['tackle', 'recepcao', 'velocidade'];
    default: return ['chute', 'resistencia', 'velocidade'];
  }
}

export function MarketScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const off = g.settings.fase === 'OFF';
  const [ord, setOrd] = useState<'ovr' | 'idade' | 'salario'>('ovr');
  const [selId, setSelId] = useState<string | null>(null);
  const [offer, setOffer] = useState<ContractOffer | null>(null);

  const pool = useMemo(() =>
    [...g.faPool].sort((a, b) =>
      ord === 'ovr' ? b.ovr - a.ovr : ord === 'idade' ? a.idade - b.idade : a.salario - b.salario),
    [g.faPool, ord]);

  const capSpace = g.settings.cap - capUsed(g, g.userTeam);
  const sel = selId ? g.faPool.find(p => p.id === selId) ?? null : null;

  const openOffer = (p: Player) => {
    setSelId(p.id);
    setOffer(suggestedOffer(p, g.settings.inflacao));
  };

  return (
    <div className="space-y-4">
      {!off && (
        <div className="panel border-gold/40 px-4 py-3 font-mono text-[12.5px] text-dim">
          🔒 <b className="text-gold">Mercado fechado durante a temporada.</b> A Free Agency abre na offseason.
          Acompanhe no painel de Finanças quem está com contrato expirando.
        </div>
      )}
      <Panel
        title={`Free Agency — ${g.faPool.length} agentes livres`}
        pad={false}
        right={
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-faint">ordenar:</span>
            {(['ovr', 'idade', 'salario'] as const).map(o => (
              <button key={o} className={`btn btn-sm ${ord === o ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setOrd(o)}>
                {o === 'ovr' ? 'OVR' : o === 'idade' ? 'Idade' : 'Salário'}
              </button>
            ))}
          </div>
        }
      >
        <div className="max-h-[600px] overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr><th>POS</th><th>Jogador</th><th className="num">Idade</th><th className="num">OVR</th>
                <th className="num">Atributos-chave</th><th className="num">Pedido/ano</th><th className="num">Valor de mercado</th><th /></tr>
            </thead>
            <tbody>
              {pool.map(p => {
                const keys = keyAttrsOf(p.pos);
                return (
                  <tr key={p.id} className={selId === p.id ? 'bg-raise' : ''}>
                    <td><PosBadge pos={p.pos} /></td>
                    <td>{p.nome}</td>
                    <td className="num">{p.idade}</td>
                    <td className="num"><Ovr v={p.ovr} /></td>
                    <td className="num">
                      <span className="mr-1 font-mono text-[10.5px] text-faint">{keys.map(k => ATTR_KEYS.find(a => a.k === k)!.s).join('/')}</span>
                      {keys.map(k => <AttrCell key={k} v={p.attrs[k]} />).map((el, i) => <span key={i}>{i > 0 && ' '}{el}</span>)}
                    </td>
                    <td className="num text-dim">{fmtM(p.salario)}</td>
                    <td className="num text-goldhi">{fmtM(marketValue(p, g.settings.inflacao))}</td>
                    <td>
                      <button className="btn btn-sm btn-gold" disabled={!off}
                        title={off ? 'Montar oferta' : 'Mercado fechado'}
                        onClick={() => openOffer(p)}>
                        Negociar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!pool.length && <tr><td colSpan={8} className="py-6 text-center text-faint">Mercado vazio.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* montador de oferta */}
      {sel && offer && (
        <OfferPanel g={g} sel={sel} offer={offer} setOffer={setOffer} capSpace={capSpace} dispatch={dispatch} onClose={() => setSelId(null)} />
      )}
    </div>
  );
}

function OfferPanel({ g, sel, offer, setOffer, capSpace, dispatch, onClose }: {
  g: GameState; sel: Player; offer: ContractOffer;
  setOffer: (o: ContractOffer) => void; capSpace: number;
  dispatch: ReturnType<typeof useGame>['dispatch']; onClose: () => void;
}) {
  const mv = marketValue(sel, g.settings.inflacao);
  const hap = negotiationHappiness(sel, offer, g.settings.inflacao);
  const capHit = Math.round((offer.base + offer.bonus / Math.max(1, offer.years)) * 10) / 10;
  const estoura = capHit > capSpace;
  const tone = hap.value >= 75 ? 'var(--color-grass)' : hap.value >= 55 ? 'var(--color-grass)' : hap.value >= 38 ? 'var(--color-gold)' : 'var(--color-blood)';

  return (
    <Panel
      title={`Negociar com ${sel.nome}`}
      right={<button className="btn btn-sm btn-ghost" onClick={onClose}>Fechar</button>}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3 font-mono text-[12.5px] text-dim">
            <PosBadge pos={sel.pos} /><Ovr v={sel.ovr} />
            <span>{sel.idade} anos</span>
            <span className="text-goldhi">valor de mercado {fmtM(mv)}/ano</span>
          </div>

          <label className="block">
            <div className="mb-1 flex justify-between font-disp text-[14px] font-semibold uppercase tracking-wider">
              <span className="text-dim">Duração</span><span className="text-ink">{offer.years} ano{offer.years > 1 ? 's' : ''}</span>
            </div>
            <input type="range" min={1} max={5} value={offer.years} className="w-full"
              onChange={e => setOffer({ ...offer, years: +e.target.value })} />
          </label>
          <label className="block">
            <div className="mb-1 flex justify-between font-disp text-[14px] font-semibold uppercase tracking-wider">
              <span className="text-dim">Salário-base anual</span><span className="text-goldhi">{fmtM(offer.base)}</span>
            </div>
            <input type="range" min={0.6} max={Math.max(2, mv * 2)} step={0.1} value={offer.base} className="w-full"
              onChange={e => setOffer({ ...offer, base: +e.target.value })} />
          </label>
          <label className="block">
            <div className="mb-1 flex justify-between font-disp text-[14px] font-semibold uppercase tracking-wider">
              <span className="text-dim">Bônus de assinatura</span><span className="text-goldhi">{fmtM(offer.bonus)}</span>
            </div>
            <input type="range" min={0} max={Math.max(1, mv * 3)} step={0.1} value={offer.bonus} className="w-full"
              onChange={e => setOffer({ ...offer, bonus: +e.target.value })} />
          </label>

          <button className="btn btn-gold w-full text-[16px]" disabled={estoura}
            title={estoura ? 'A oferta estouraria o salary cap' : 'Enviar proposta'}
            onClick={() => { dispatch({ type: 'SIGN_OFFER', playerId: sel.id, offer }); onClose(); }}>
            Enviar proposta ({fmtM(capHit)}/ano de cap hit)
          </button>
          {estoura && (
            <p className="font-mono text-[11.5px] text-blood">
              ⚠ Esta oferta estouraria o cap em {fmtM(Math.round((capHit - capSpace) * 10) / 10)}. Reduza valores ou dispense contratos.
            </p>
          )}
        </div>

        <div>
          <div className="mb-1 flex justify-between font-disp text-[14px] font-semibold uppercase tracking-wider">
            <span className="text-dim">Probabilidade de aceite</span>
            <span style={{ color: tone }}>{hap.value}% — {hap.parecer}</span>
          </div>
          <Bar pct={hap.value} h={14} color={tone} />
          <div className="mt-3 space-y-1.5">
            {hap.fatores.map(f => (
              <div key={f.label} className="flex items-center justify-between border border-line2 bg-panel2/50 px-3 py-1.5 font-mono text-[11.5px]">
                <span className="text-dim">{f.label}</span>
                <b style={{ color: f.delta >= 0 ? 'var(--color-grass)' : 'var(--color-blood)' }}>{f.delta >= 0 ? '+' : ''}{f.delta}</b>
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-faint">
            Cap hit = base + bônus ÷ anos. Espaço disponível: <b className={capSpace < 0 ? 'text-blood' : 'text-grass'}>{fmtM(capSpace)}</b>.
          </p>
        </div>
      </div>
    </Panel>
  );
}
