import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { canSign, capUsed, fmtM, teamById } from '../game/season';
import { marketValue, playerExpectations, playerHappiness, makeContract, STRUCT_LABEL } from '../game/negotiations';
import { Panel, PosBadge, Ovr, AttrCell, Bar } from '../components/ui';
import { ATTR_KEYS } from '../game/data';
import type { ContractOffer, ContractStructure, Player } from '../game/types';

const keyAttrs = (pos: Player['pos']) => {
  const map: Record<string, string[]> = {
    QB: ['passe', 'corrida', 'velocidade'], RB: ['corrida', 'recepcao', 'velocidade'],
    WR: ['recepcao', 'velocidade', 'corrida'], TE: ['recepcao', 'bloqueio', 'velocidade'],
    OL: ['bloqueio', 'resistencia', 'corrida'], DL: ['tackle', 'velocidade', 'resistencia'],
    LB: ['tackle', 'velocidade', 'resistencia'], CB: ['recepcao', 'velocidade', 'tackle'],
    S: ['tackle', 'recepcao', 'velocidade'], K: ['chute', 'resistencia', 'velocidade'], P: ['chute', 'resistencia', 'velocidade'],
  };
  return (map[pos] ?? ['passe', 'corrida', 'velocidade']) as (keyof Player['attrs'])[];
};

export function MarketScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const off = g.settings.fase === 'OFF';
  const [ord, setOrd] = useState<'ovr' | 'idade' | 'salario'>('ovr');
  const [selId, setSelId] = useState<string | null>(null);
  const [offer, setOffer] = useState<ContractOffer | null>(null);

  const pool = useMemo(() =>
    [...g.faPool].sort((a, b) => ord === 'ovr' ? b.ovr - a.ovr : ord === 'idade' ? a.idade - b.idade : a.salario - b.salario),
    [g.faPool, ord]);

  const sel = selId ? g.faPool.find(p => p.id === selId) ?? null : null;
  const space = g.settings.cap - capUsed(g, g.userTeam);

  const openOffer = (p: Player) => {
    setSelId(p.id);
    const exp = playerExpectations(p, g.settings.inflacao);
    setOffer({ years: exp.anos, base: Math.round(exp.aav), bonus: Math.round(exp.aav * exp.anos * 0.1), structure: 'BALANCED' });
  };

  const hap = sel && offer ? playerHappiness(sel, offer, g.settings.inflacao) : null;

  return (
    <div className="space-y-4">
      {!off && (
        <div className="border border-gold/40 px-4 py-3 font-mono text-[12.5px] text-dim">
          🔒 <b className="text-gold">Mercado fecha durante a temporada.</b> A Free Agency abre na offseason.
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel title={`Free Agency — ${g.faPool.length} agentes livres`} pad={false}
          right={
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="text-faint">ordenar:</span>
              {(['ovr', 'idade', 'salario'] as const).map(o => (
                <button key={o} className={`btn btn-sm ${ord === o ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setOrd(o)}>
                  {o === 'ovr' ? 'OVR' : o === 'idade' ? 'Idade' : 'Salário'}
                </button>
              ))}
            </div>
          }>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="tbl">
              <thead><tr><th>POS</th><th>Jogador</th><th className="num">Idade</th><th className="num">OVR</th><th className="num">Atributos</th><th className="num">Valor mercado</th><th /></tr></thead>
              <tbody>
                {pool.map(p => {
                  const chk = canSign(g, p);
                  const keys = keyAttrs(p.pos);
                  return (
                    <tr key={p.id}>
                      <td><PosBadge pos={p.pos} /></td>
                      <td>{p.nome}</td>
                      <td className="num">{p.idade}</td>
                      <td className="num"><Ovr v={p.ovr} /></td>
                      <td className="num">
                        {keys.map((k, i) => <span key={k}>{i > 0 && <span className="text-faint"> </span>}<AttrCell v={p.attrs[k]} /></span>)}
                      </td>
                      <td className="num text-goldhi">{fmtM(marketValue(p.ovr, p.idade, g.settings.inflacao))}</td>
                      <td>
                        <button className="btn btn-sm btn-gold" disabled={!off || !chk.ok} title={chk.ok ? 'Fazer oferta' : chk.motivo}
                          onClick={() => openOffer(p)}>Ofertar</button>
                      </td>
                    </tr>
                  );
                })}
                {!pool.length && <tr><td colSpan={7} className="py-6 text-center text-faint">Mercado vazio.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* montador de oferta */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          {sel && offer && hap ? (
            <Panel title={`Oferta — ${sel.nome}`}>
              <div className="mb-3 flex items-center gap-3">
                <PosBadge pos={sel.pos} />
                <div>
                  <div className="font-disp text-[17px] font-bold uppercase">{sel.nome}</div>
                  <div className="font-mono text-[11px] text-faint">OVR {sel.ovr} · {sel.idade} anos · pede ~{fmtM(playerExpectations(sel, g.settings.inflacao).aav)}/ano</div>
                </div>
              </div>

              <label className="block">
                <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Duração</span><b className="text-ink">{offer.years} ano{offer.years > 1 ? 's' : ''}</b></div>
                <input type="range" min={1} max={5} value={offer.years} className="w-full"
                  onChange={e => setOffer({ ...offer, years: +e.target.value })} />
              </label>
              <label className="mt-3 block">
                <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Salário/ano</span><b className="text-goldhi">{fmtM(offer.base)}</b></div>
                <input type="range" min={1} max={60} value={offer.base} className="w-full"
                  onChange={e => setOffer({ ...offer, base: +e.target.value })} />
              </label>
              <label className="mt-3 block">
                <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Bônus assinatura</span><b className="text-ink">{fmtM(offer.bonus)}</b></div>
                <input type="range" min={0} max={30} value={offer.bonus} className="w-full"
                  onChange={e => setOffer({ ...offer, bonus: +e.target.value })} />
              </label>
              <div className="mt-3">
                <div className="mb-1 font-mono text-[11.5px] text-dim">Estrutura</div>
                <div className="flex gap-1.5">
                  {(['FRONT', 'BALANCED', 'BACK'] as ContractStructure[]).map(s2 => (
                    <button key={s2} className={`btn btn-sm flex-1 ${offer.structure === s2 ? 'btn-gold' : 'btn-ghost'}`}
                      onClick={() => setOffer({ ...offer, structure: s2 })}>{STRUCT_LABEL[s2]}</button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim">
                  <span>Probabilidade de aceite</span><b className="text-ink">{hap.value}%</b>
                </div>
                <Bar pct={hap.value} color={hap.value >= 70 ? 'var(--color-grass)' : hap.value >= 40 ? 'var(--color-gold)' : 'var(--color-blood)'} />
                <div className="mt-1 font-mono text-[11px] text-faint">
                  Salário {hap.partes.salario} · Duração {hap.partes.duracao} · Situação {hap.partes.situacao} · Moral {hap.partes.moral}
                </div>
              </div>

              <div className="mt-3 border-t border-line2 pt-2 font-mono text-[11.5px] text-dim">
                <div className="flex justify-between"><span>Cap hit ano 1</span><b className="text-ink">{fmtM(offer.base + offer.bonus / Math.max(1, offer.years))}</b></div>
                <div className="flex justify-between"><span>Espaço após assinar</span>
                  <b style={{ color: space - (offer.base + offer.bonus / Math.max(1, offer.years)) < 0 ? 'var(--color-blood)' : 'var(--color-grass)' }}>
                    {fmtM(space - (offer.base + offer.bonus / Math.max(1, offer.years)))}
                  </b>
                </div>
              </div>

              <button className="btn btn-gold mt-4 w-full"
                onClick={() => { dispatch({ type: 'SIGN_OFFER', playerId: sel.id, offer }); setSelId(null); setOffer(null); }}>
                Apresentar oferta »
              </button>
              <button className="btn btn-ghost mt-2 w-full" onClick={() => { setSelId(null); setOffer(null); }}>Cancelar</button>
            </Panel>
          ) : (
            <Panel title="Como contratar">
              <p className="font-mono text-[12.5px] leading-relaxed text-dim">
                Clique em <b className="text-gold">Ofertar</b> num agente livre para montar uma proposta.
                A probabilidade de aceite considera salário pedido, duração, momento e moral.
                Contratos usam estruturas <b className="text-ink">frontloaded / balanceada / backloaded</b> com bônus amortizado.
              </p>
              <p className="mt-2 font-mono text-[11.5px] text-faint">Espaço no cap: <b className="text-goldhi">{fmtM(space)}</b></p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
