import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { staffOf, teamById, fmtM } from '../game/season';
import { staffValue, staffHappiness, suggestedStaffOffer } from '../game/negotiations';
import { Panel, Stars, Bar, TeamCrest } from '../components/ui';
import type { ContractOffer, GameState, Staff } from '../game/types';

const ROLE_DESC: Record<string, string> = {
  'Head Coach': 'Comanda o vestiário e a moral da franquia.',
  'Coordenador Ofensivo': 'Soma bônus de passe e corrida na engine.',
  'Coordenador Defensivo': 'Soma bônus de pass-rush, corrida e cobertura.',
  'Médico': 'Reduz a taxa de lesões do elenco.',
  'Preparador Físico': 'Melhora a resistência e recuperação do elenco.',
  'Olheiro': 'Aumenta o orçamento de scouting na offseason.',
};

type Modo = 'renovar' | 'contratar';

export default function StaffScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const meus = staffOf(g, t.id);
  const mercado = useMemo(() => [...g.staffPool].sort((a, b) => b.nivel - a.nivel || b.experiencia - a.experiencia), [g.staffPool]);

  const [modo, setModo] = useState<Modo>('renovar');
  const [selId, setSelId] = useState<string | null>(null);
  const [offer, setOffer] = useState<ContractOffer | null>(null);
  const [confirmFire, setConfirmFire] = useState<string | null>(null);

  const sel: Staff | null = selId
    ? (modo === 'renovar' ? meus.find(s => s.id === selId) : g.staffPool.find(s => s.id === selId)) ?? null
    : null;

  const open = (s: Staff, m: Modo) => {
    setModo(m);
    setSelId(s.id);
    setOffer(suggestedStaffOffer(s, g.settings.inflacao));
  };

  const folhaStaff = meus.reduce((a, s) => a + s.salario, 0);

  return (
    <div className="space-y-5">
      <div className="panel flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4" style={{ boxShadow: '5px 5px 0 rgba(0,0,0,0.4)' }}>
        <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={40} />
        <div>
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.3em] text-faint">Comissão Técnica</div>
          <div className="font-disp text-[26px] font-extrabold uppercase leading-none">{t.cidade} <span className="text-goldhi">{t.nome}</span></div>
        </div>
        <div className="ml-auto flex items-center gap-6 font-mono text-[12px]">
          <div className="text-right">
            <div className="text-faint">Folha da comissão</div>
            <b className="text-[15px] text-goldhi">{fmtM(Math.round(folhaStaff * 10) / 10)}/ano</b>
          </div>
          <div className="text-right">
            <div className="text-faint">Caixa disponível</div>
            <b className={`text-[15px] ${t.dinheiro < 0 ? 'text-blood' : 'text-ink'}`}>${t.dinheiro}M</b>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ===== minha comissão ===== */}
        <Panel title="Minha comissão" pad={false}
          right={<span className="font-mono text-[11px] text-faint">salários saem do caixa, não do cap</span>}>
          <table className="tbl">
            <thead><tr><th>Função</th><th>Profissional</th><th className="num">Nível</th><th className="num">Exp.</th><th className="num">Salário</th><th className="num">Contrato</th><th /></tr></thead>
            <tbody>
              {meus.map(s => (
                <tr key={s.id} className={selId === s.id && modo === 'renovar' ? 'bg-raise' : ''}>
                  <td className="max-w-[140px]">
                    <div className="text-ink">{s.funcao}</div>
                    <div className="font-mono text-[10px] text-faint">{ROLE_DESC[s.funcao]}</div>
                  </td>
                  <td>{s.nome}</td>
                  <td className="num"><Stars n={s.nivel} /></td>
                  <td className="num text-dim">{s.experiencia}a</td>
                  <td className="num text-goldhi">{fmtM(s.salario)}</td>
                  <td className="num">
                    <span className={s.contrato === 1 ? 'text-blood font-bold' : 'text-ink'}>{s.contrato}a{s.contrato === 1 ? ' ⚠' : ''}</span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button className={`btn btn-sm ${s.contrato <= 2 ? 'btn-gold' : ''}`} onClick={() => open(s, 'renovar')}>Renovar</button>
                      {confirmFire === s.id ? (
                        <>
                          <button className="btn btn-sm btn-danger" onClick={() => { dispatch({ type: 'STAFF_FIRE', staffId: s.id }); setConfirmFire(null); setSelId(null); }}>Sim</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => setConfirmFire(null)}>Não</button>
                        </>
                      ) : (
                        <button className="btn btn-sm btn-ghost hover:text-blood" onClick={() => setConfirmFire(s.id)}>Dispensar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line2 px-3.5 py-2.5 font-mono text-[11.5px] text-faint">
            Contratos ⚠ vencem na virada da temporada — a IA rival pode contratar quem você não renovar.
            Dispensar antes do fim paga multa de 50% dos anos restantes.
          </p>
        </Panel>

        {/* ===== mercado de técnicos ===== */}
        <Panel title={`Mercado de técnicos — ${mercado.length} disponíveis`} pad={false}
          right={<span className="font-mono text-[11px] text-faint">agentes livres da comissão</span>}>
          <div className="max-h-[480px] overflow-y-auto">
            <table className="tbl">
              <thead><tr><th>Função</th><th>Profissional</th><th className="num">Nível</th><th className="num">Exp.</th><th className="num">Pedido</th><th /></tr></thead>
              <tbody>
                {mercado.map(s => (
                  <tr key={s.id} className={selId === s.id && modo === 'contratar' ? 'bg-raise' : ''}>
                    <td className="text-dim">{s.funcao}</td>
                    <td>
                      {s.nome}
                      {s.origem === t.id && <span className="tag ml-2 border-ice/50 text-ice" title="Já trabalhou na sua franquia">EX-CLUBE</span>}
                    </td>
                    <td className="num"><Stars n={s.nivel} /></td>
                    <td className="num text-dim">{s.experiencia}a</td>
                    <td className="num text-goldhi">{fmtM(s.salario)}</td>
                    <td><button className="btn btn-sm btn-gold" onClick={() => open(s, 'contratar')}>Contratar</button></td>
                  </tr>
                ))}
                {!mercado.length && <tr><td colSpan={6} className="py-6 text-center text-faint">Nenhum profissional livre no momento.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line2 px-3.5 py-2.5 font-mono text-[11.5px] text-faint">
            O mercado é reposto a cada offseason. Limite de 1 profissional por função.
          </p>
        </Panel>
      </div>

      {/* ===== painel de negociação ===== */}
      {sel && offer && (
        <NegotiationPanel
          g={g} sel={sel} offer={offer} setOffer={setOffer} modo={modo}
          onClose={() => setSelId(null)}
          onSend={() => {
            dispatch(modo === 'renovar'
              ? { type: 'STAFF_RENEW', staffId: sel.id, offer }
              : { type: 'STAFF_HIRE', staffId: sel.id, offer });
            setSelId(null);
          }}
        />
      )}
    </div>
  );
}

function NegotiationPanel({ g, sel, offer, setOffer, modo, onSend, onClose }: {
  g: GameState; sel: Staff; offer: ContractOffer;
  setOffer: (o: ContractOffer) => void; modo: Modo;
  onSend: () => void; onClose: () => void;
}) {
  const valor = staffValue(sel, g.settings.inflacao);
  const hap = staffHappiness(sel, offer, g.settings.inflacao);
  const custoTotal = Math.round((offer.base + offer.bonus) * 10) / 10;
  const t = teamById(g, g.userTeam);
  const caixaOk = t.dinheiro >= custoTotal;
  const tone = hap.value >= 75 ? 'var(--color-grass)' : hap.value >= 55 ? 'var(--color-grass)' : hap.value >= 38 ? 'var(--color-gold)' : 'var(--color-blood)';

  return (
    <Panel
      title={`${modo === 'renovar' ? 'Renovar com' : 'Contratar'} ${sel.nome} — ${sel.funcao}`}
      right={<button className="btn btn-sm btn-ghost" onClick={onClose}>Fechar</button>}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3 font-mono text-[12.5px] text-dim">
            <Stars n={sel.nivel} />
            <span>{sel.experiencia} anos de estrada</span>
            <span className="text-goldhi">valor de mercado {fmtM(valor)}/ano</span>
          </div>

          <label className="block">
            <div className="mb-1 flex justify-between font-disp text-[14px] font-semibold uppercase tracking-wider">
              <span className="text-dim">Duração</span><span className="text-ink">{offer.years} ano{offer.years > 1 ? 's' : ''}</span>
            </div>
            <input type="range" min={1} max={4} value={offer.years} className="w-full"
              onChange={e => setOffer({ ...offer, years: +e.target.value })} />
          </label>
          <label className="block">
            <div className="mb-1 flex justify-between font-disp text-[14px] font-semibold uppercase tracking-wider">
              <span className="text-dim">Salário anual</span><span className="text-goldhi">{fmtM(offer.base)}</span>
            </div>
            <input type="range" min={0.4} max={Math.max(1, valor * 2)} step={0.1} value={offer.base} className="w-full"
              onChange={e => setOffer({ ...offer, base: +e.target.value })} />
          </label>
          <label className="block">
            <div className="mb-1 flex justify-between font-disp text-[14px] font-semibold uppercase tracking-wider">
              <span className="text-dim">Bônus de assinatura</span><span className="text-goldhi">{fmtM(offer.bonus)}</span>
            </div>
            <input type="range" min={0} max={Math.max(0.5, valor * 2)} step={0.1} value={offer.bonus} className="w-full"
              onChange={e => setOffer({ ...offer, bonus: +e.target.value })} />
          </label>

          <button className="btn btn-gold w-full text-[16px]" disabled={!caixaOk}
            title={caixaOk ? 'Enviar proposta' : 'Caixa insuficiente'}
            onClick={onSend}>
            {modo === 'renovar' ? 'Enviar proposta de renovação' : 'Enviar proposta de contrato'} ({fmtM(custoTotal)} à vista)
          </button>
          {!caixaOk && (
            <p className="font-mono text-[11.5px] text-blood">
              ⚠ Custo de {fmtM(custoTotal)} excede o caixa (${t.dinheiro}M). Aumente a receita ou reduza a oferta.
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
            Bônus e o 1º ano são debitados do caixa na assinatura; o salário anual é pago do caixa a cada temporada.
          </p>
        </div>
      </div>
    </Panel>
  );
}
