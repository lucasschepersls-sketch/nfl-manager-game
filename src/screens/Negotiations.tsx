import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, playersOf, capUsed, capHitOf, fmtM } from '../game/season';
import {
  calcExpectations, negotiationHappiness, happinessVerdict, makeContract,
  STRUCT_DESC, STRUCT_LABEL,
} from '../game/contracts';
import type { ContractStructure, Player } from '../game/types';
import { Panel, PosBadge, Ovr, TeamCrest } from '../components/ui';

type RowKind = 'holdout' | 'ultimo' | 'extensao';

const STRUCTS: ContractStructure[] = ['FRONT', 'BALANCED', 'BACK'];
/** mini-distribuição para visualização das estruturas (até 4 anos) */
const STRUCT_BARS: Record<ContractStructure, number[]> = {
  FRONT: [35, 30, 22.5, 12.5],
  BALANCED: [25, 25, 25, 25],
  BACK: [12.5, 22.5, 30, 35],
};

const probColor = (v: number) => (v >= 70 ? 'var(--color-grass)' : v >= 40 ? 'var(--color-gold)' : 'var(--color-blood)');

export function NegotiationsScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const infl = g.settings.inflacao;

  /* ---------- elenco elegível ---------- */
  const roster = useMemo(() => playersOf(g, g.userTeam), [g]);
  const rows = useMemo(() => {
    const out: { p: Player; kind: RowKind }[] = [];
    for (const p of roster) {
      if (p.tag) continue;
      if (p.holdout) out.push({ p, kind: 'holdout' });
      else if (p.contrato === 1) out.push({ p, kind: 'ultimo' });
      else if (p.contrato === 2) out.push({ p, kind: 'extensao' });
    }
    const peso: Record<RowKind, number> = { holdout: 0, ultimo: 1, extensao: 2 };
    return out.sort((a, b) => peso[a.kind] - peso[b.kind] || b.p.ovr - a.p.ovr);
  }, [roster]);

  const [selId, setSelId] = useState<string | null>(null);
  const sel = rows.find(r => r.p.id === selId)?.p ?? rows[0]?.p ?? null;

  /* ---------- oferta em edição ---------- */
  const [years, setYears] = useState(3);
  const [base, setBase] = useState(5);
  const [bonus, setBonus] = useState(0);
  const [structure, setStructure] = useState<ContractStructure>('BALANCED');

  // ao trocar de jogador, pré-preenche com a expectativa do agente
  useEffect(() => {
    if (!sel) return;
    const exp = calcExpectations(sel, infl);
    setYears(exp.anos);
    setBase(Math.round(exp.aav * 10) / 10);
    setBonus(Math.round(exp.aav * exp.anos * 0.1 * 10) / 10);
    setStructure(exp.structure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, sel?.id, infl]);

  const exp = sel ? calcExpectations(sel, infl) : null;
  const offer = { years, base, bonus, structure };
  const hap = sel ? negotiationHappiness(sel, offer, infl, { lealdade: true }) : null;
  const verdict = hap ? happinessVerdict(hap.total) : null;
  const contrato = sel ? makeContract(offer) : null;

  const usado = capUsed(g, g.userTeam);
  const usadoSemEle = sel ? usado - capHitOf(sel) : usado;
  const novoHit = contrato?.capHits[0] ?? 0;
  const capDepois = Math.round((usadoSemEle + novoHit) * 10) / 10;
  const estoura = capDepois > g.settings.cap;

  const maxBase = sel ? Math.max(0.75, Math.round((g.settings.cap - usadoSemEle) * 10) / 10) : 1;

  const holdoutCount = rows.filter(r => r.kind === 'holdout').length;

  return (
    <div className="space-y-5">
      {holdoutCount > 0 && (
        <div className="qb-banner flex items-center gap-3 border border-blood/60 bg-[rgba(226,87,75,0.12)] px-4 py-2.5 font-disp text-[15px] font-bold uppercase tracking-wider text-blood">
          ⚠ {holdoutCount} jogador(es) em holdout — recusam jogar até renovar. Priorize-os abaixo.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* ---------- lista de elegíveis ---------- */}
        <Panel title={`Negociáveis (${rows.length})`} pad={false}
          right={<span className="font-mono text-[11px] text-faint">inflação ×{infl.toFixed(2).replace('.', ',')}</span>}>
          <div className="max-h-[640px] overflow-y-auto">
            {rows.length === 0 && (
              <p className="px-4 py-6 font-mono text-[12.5px] leading-relaxed text-faint">
                Ninguém para negociar agora.<br />Renovações abrem quando um contrato entra nos 2 últimos anos (ou em holdout).
              </p>
            )}
            {rows.map(({ p, kind }) => {
              const isSel = sel?.id === p.id;
              return (
                <button key={p.id}
                  onClick={() => setSelId(p.id)}
                  className={`flex w-full items-center gap-3 border-b border-line2 px-3.5 py-2.5 text-left transition-colors ${isSel ? 'bg-raise' : 'hover:bg-raise/50'}`}
                  style={isSel ? { boxShadow: 'inset 3px 0 0 var(--color-gold)' } : undefined}>
                  <PosBadge pos={p.pos} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[13px] font-semibold text-ink">{p.nome}</span>
                    <span className="block font-mono text-[10.5px] text-faint">
                      {p.idade}a · OVR <Ovr v={p.ovr} /> · {fmtM(p.salario)}/ano
                    </span>
                  </span>
                  {kind === 'holdout' && <span className="tag blink border-blood/70 text-blood">HOLDOUT</span>}
                  {kind === 'ultimo' && <span className="tag border-gold/60 text-gold">ÚLTIMO ANO</span>}
                  {kind === 'extensao' && <span className="tag border-ice/60 text-ice">EXTENSÃO</span>}
                </button>
              );
            })}
          </div>
        </Panel>

        {/* ---------- mesa de negociação ---------- */}
        {sel && hap && exp && contrato && verdict ? (
          <div className="space-y-5">
            {/* cabeçalho do jogador */}
            <div className="panel relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.06]" style={{ background: `repeating-linear-gradient(90deg, ${t.cor} 0 2px, transparent 2px 90px)` }} />
              <div className="relative flex flex-wrap items-center gap-4 px-5 py-4">
                <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={44} />
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <PosBadge pos={sel.pos} />
                    <h2 className="truncate font-disp text-[30px] font-extrabold uppercase leading-none tracking-wide">{sel.nome}</h2>
                    {sel.holdout && <span className="tag blink border-blood/70 text-blood">EM HOLDOUT</span>}
                  </div>
                  <div className="mt-1 font-mono text-[12px] text-dim">
                    {sel.idade} anos · OVR <Ovr v={sel.ovr} /> · moral {sel.moral} · {sel.jogosCarreira} jogos na carreira
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.2em] text-faint">O agente quer</div>
                  <div className="font-disp text-[26px] font-extrabold leading-none text-goldhi">
                    {exp.anos} anos · {fmtM(exp.aav)}/ano
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-dim">{STRUCT_LABEL[exp.structure]} · total ~{fmtM(exp.total)}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
              {/* controles da oferta */}
              <Panel title="Sua oferta">
                {/* duração */}
                <div className="mb-5">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="font-disp text-[15px] font-semibold uppercase tracking-wider text-dim">Duração</span>
                    <span className={`font-disp text-[24px] font-extrabold leading-none ${years === exp.anos ? 'text-grass' : 'text-ink'}`}>
                      {years} ano{years > 1 ? 's' : ''}
                    </span>
                  </div>
                  <input type="range" min={1} max={5} step={1} value={years} onChange={e => setYears(+e.target.value)} className="w-full" />
                  <div className="mt-0.5 flex justify-between font-mono text-[10.5px] text-faint">
                    <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
                  </div>
                </div>

                {/* salário-base */}
                <div className="mb-5">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="font-disp text-[15px] font-semibold uppercase tracking-wider text-dim">Salário-base</span>
                    <span className={`font-disp text-[24px] font-extrabold leading-none ${base >= exp.aav ? 'text-grass' : base >= exp.aav * 0.9 ? 'text-goldhi' : 'text-blood'}`}>
                      {fmtM(base)}/ano
                    </span>
                  </div>
                  <input type="range" min={0.75} max={Math.max(1, maxBase)} step={0.05} value={Math.min(base, maxBase)} onChange={e => setBase(+e.target.value)} className="w-full" />
                  <div className="mt-0.5 flex justify-between font-mono text-[10.5px] text-faint">
                    <span>{fmtM(0.75)}</span>
                    <span className="text-gold">pedido: {fmtM(exp.aav)}</span>
                    <span>{fmtM(Math.max(1, maxBase))}</span>
                  </div>
                </div>

                {/* bônus de assinatura */}
                <div className="mb-5">
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="font-disp text-[15px] font-semibold uppercase tracking-wider text-dim">Bônus de assinatura</span>
                    <span className="font-disp text-[24px] font-extrabold leading-none text-ink">{fmtM(bonus)}</span>
                  </div>
                  <input type="range" min={0} max={Math.max(1, Math.round(exp.aav * years))} step={0.5} value={bonus} onChange={e => setBonus(+e.target.value)} className="w-full" />
                  <div className="mt-0.5 font-mono text-[10.5px] text-faint">amortizado igualmente nos {years} ano(s) — ajuda a convencer sem elevar tanto o cap hit do ano 1</div>
                </div>

                {/* estrutura */}
                <div>
                  <div className="mb-2 font-disp text-[15px] font-semibold uppercase tracking-wider text-dim">Estrutura de pagamento</div>
                  <div className="grid grid-cols-3 gap-2.5">
                    {STRUCTS.map(st2 => {
                      const on = structure === st2;
                      const pref = exp.structure === st2;
                      return (
                        <button key={st2} onClick={() => setStructure(st2)}
                          className={`border px-2.5 py-2.5 text-left transition-all ${on ? 'border-gold bg-raise' : 'border-line hover:border-line/70 hover:bg-raise/40'}`}
                          style={on ? { boxShadow: '3px 3px 0 rgba(0,0,0,0.35)' } : undefined}>
                          <span className={`block font-disp text-[14px] font-bold uppercase leading-none ${on ? 'text-goldhi' : 'text-ink'}`}>
                            {STRUCT_LABEL[st2]}{pref && <span className="ml-1 text-grass">✓</span>}
                          </span>
                          <span className="mt-1.5 flex h-[14px] items-end gap-[2px]">
                            {STRUCT_BARS[st2].slice(0, Math.max(2, years)).map((w, i) => (
                              <span key={i} className="flex-1" style={{ height: `${Math.max(18, w * 2.4)}%`, background: on ? 'var(--color-gold)' : 'var(--color-faint)' }} />
                            ))}
                          </span>
                          <span className="mt-1.5 block font-mono text-[9.5px] leading-snug text-faint">{STRUCT_DESC[st2]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Panel>

              {/* felicidade + cap hits */}
              <div className="space-y-5">
                <Panel title="Chance de aceitação">
                  <div className="mb-2 text-center">
                    <span className="font-disp text-[54px] font-extrabold leading-none tabular-nums" style={{ color: probColor(hap.total) }}>
                      {hap.total}%
                    </span>
                    <span className={`mt-1 block font-disp text-[15px] font-bold uppercase tracking-[0.15em] ${verdict.tone === 'good' ? 'text-grass' : verdict.tone === 'mid' ? 'text-gold' : 'text-blood'}`}>
                      {verdict.label}
                    </span>
                  </div>
                  <div className="rbar mb-4" style={{ height: 14 }}>
                    <i style={{ width: `${hap.total}%`, ['--rbar' as string]: probColor(hap.total) }} />
                  </div>

                  {[
                    { k: 'Salário', v: hap.salary, w: '40%' },
                    { k: 'Duração', v: hap.years, w: '20%' },
                    { k: 'Estrutura', v: hap.structure, w: '20%' },
                    { k: 'Situação', v: hap.situation, w: '20%' },
                  ].map(f => (
                    <div key={f.k} className="mb-2">
                      <div className="mb-0.5 flex justify-between font-mono text-[11px] text-dim">
                        <span>{f.k} <span className="text-faint">({f.w})</span></span>
                        <b style={{ color: probColor(f.v) }}>{f.v}</b>
                      </div>
                      <div className="bar" style={{ height: 6 }}><i style={{ width: `${f.v}%`, background: probColor(f.v) }} /></div>
                    </div>
                  ))}
                  <div className="mt-3 flex items-center justify-between border-t border-line2 pt-2.5 font-mono text-[11px]">
                    <span className="text-grass">♥ Bônus de lealdade</span>
                    <b className="text-grass">+{hap.lealdade}</b>
                  </div>
                  <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-faint">
                    A decisão final tem ±10 de personalidade — uma oferta na corda bamba pode surpreender.
                  </p>
                </Panel>

                <Panel title="Impacto no cap" pad={false}>
                  <div className="px-3.5 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {contrato.capHits.map((h, i) => (
                        <span key={i} className={`tag ${i === 0 ? 'border-gold/70 text-goldhi' : 'border-line text-dim'}`}>
                          Ano {i + 1}: {fmtM(h)}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2.5 space-y-1 font-mono text-[11.5px]">
                      <div className="flex justify-between text-dim" title="Soma de todos os anos (bônus incluído)"><span>Valor total do contrato</span><span className="text-ink">{fmtM(contrato.total)}</span></div>
                      <div className="flex justify-between text-dim" title="Bônus de assinatura + base do ano 1 protegido — o clube paga mesmo se dispensar"><span>Dinheiro garantido</span><span className="text-ice">{fmtM(contrato.guaranteed)}</span></div>
                      <div className="my-1 border-t border-line2" />
                      <div className="flex justify-between text-dim"><span>Cap usado (sem ele)</span><span>{fmtM(usadoSemEle)}</span></div>
                      <div className="flex justify-between text-dim"><span>+ ano 1 da oferta</span><span className="text-goldhi">{fmtM(novoHit)}</span></div>
                      <div className="flex justify-between font-bold" style={{ color: estoura ? 'var(--color-blood)' : 'var(--color-grass)' }}>
                        <span>Cap após assinar</span><span>{fmtM(capDepois)} / {fmtM(g.settings.cap)}</span>
                      </div>
                    </div>
                    {estoura && (
                      <div className="mt-2 border border-blood/50 bg-[rgba(226,87,75,0.1)] px-2.5 py-1.5 font-mono text-[11px] text-blood">
                        ⚠ Estoura o teto em {fmtM(Math.round((capDepois - g.settings.cap) * 10) / 10)} — a oferta será bloqueada.
                      </div>
                    )}
                  </div>
                </Panel>
              </div>
            </div>

            {/* ação */}
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn btn-gold btn-pulse text-[17px]"
                disabled={estoura}
                onClick={() => dispatch({ type: 'NEGOTIATE', playerId: sel.id, offer })}>
                Apresentar oferta de {years} ano{years > 1 ? 's' : ''} · {fmtM(base)}/ano »
              </button>
              {sel.contrato === 1 && !sel.tag && (
                <button className="btn" onClick={() => dispatch({ type: 'TAG', playerId: sel.id })}>
                  Aplicar Franchise Tag
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => dispatch({ type: 'SCREEN', screen: 'elenco' })}>Ver elenco</button>
            </div>
          </div>
        ) : (
          <Panel title="Mesa de negociação">
            <p className="font-mono text-[13px] text-dim">Selecione um jogador na lista para abrir a negociação.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
