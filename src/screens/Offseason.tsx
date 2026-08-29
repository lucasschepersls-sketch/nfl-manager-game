import { useMemo } from 'react';
import { useGame } from '../state/store';
import { OFF_PHASES, validateRoster, capUsed, playersOf, staffOf, teamById, fmtM } from '../game/season';
import { Panel, Ovr, PosBadge, Bar, TeamCrest } from '../components/ui';
import type { Screen } from '../game/types';

export default function OffseasonScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const fase = g.offPhase ?? 1;
  const cap = capUsed(g, t.id);
  const capSpace = Math.round((g.settings.cap - cap) * 10) / 10;
  const roster = playersOf(g, t.id);
  const ativos = roster.filter(p => p.status !== 'PS').length;
  const ps = roster.filter(p => p.status === 'PS').length;
  const chk = useMemo(() => validateRoster(g), [g]);

  const go = (screen: Screen) => dispatch({ type: 'SCREEN', screen });
  const advance = () => dispatch({ type: 'ADVANCE_OFFPHASE' });

  const expirando = useMemo(
    () => [...roster].filter(p => p.contrato === 1).sort((a, b) => b.ovr - a.ovr).slice(0, 6),
    [roster],
  );
  const staffExpirando = staffOf(g, t.id).filter(s => s.contrato === 1);

  if (g.settings.fase !== 'OFF') {
    return (
      <Panel title="Offseason">
        <p className="font-mono text-[13px] text-dim">
          A offseason guiada abre após o <b className="text-goldhi">Super Bowl</b>. Por enquanto, concentre-se na temporada:
          {g.settings.fase === 'PRE' ? ' a pré-temporada está em curso.' : g.settings.fase === 'REG' ? ` semana ${g.settings.semana}/18.` : ' os playoffs estão em curso.'}
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="relative overflow-hidden border-2 border-gold/60 bg-pitcho px-5 py-4" style={{ boxShadow: '6px 6px 0 rgba(0,0,0,0.4)' }}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.05]" style={{ background: `repeating-linear-gradient(90deg, ${t.cor} 0 2px, transparent 2px 90px)` }} />
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2">
          <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={46} />
          <div>
            <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.3em] text-faint">Offseason · Rumo a {g.settings.temporada + 1}</div>
            <h1 className="font-disp text-[32px] font-extrabold uppercase leading-none tracking-wide">
              Construindo o <span className="text-gold">próximo título</span>
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-5 font-mono text-[12px]">
            <div className="text-right">
              <div className="text-faint">Folha / Cap</div>
              <div className={`text-[15px] font-bold ${capSpace < 0 ? 'text-blood' : 'text-ink'}`}>{fmtM(cap)} / {fmtM(g.settings.cap)}</div>
            </div>
            <div className="text-right">
              <div className="text-faint">Elenco</div>
              <div className={`text-[15px] font-bold ${ativos !== 53 ? 'text-goldhi' : 'text-ink'}`}>{ativos}/53 <span className="text-faint text-[11px]">+{ps} PS</span></div>
            </div>
          </div>
        </div>
        <div className="relative mt-3"><Bar pct={(cap / g.settings.cap) * 100} h={10} color={capSpace < 0 ? 'var(--color-blood)' : capSpace < 15 ? 'var(--color-gold)' : 'var(--color-grass)'} /></div>
      </div>

      {/* stepper das 4 fases */}
      <div className="relative flex items-stretch gap-2 overflow-x-auto">
        {OFF_PHASES.map((p, i) => {
          const done = fase > p.n;
          const active = fase === p.n;
          return (
            <div key={p.n} className="relative min-w-[170px] flex-1">
              <div
                className="relative h-full border-2 px-3.5 py-3 transition-all duration-300"
                style={{
                  borderColor: done ? 'var(--color-grass)' : active ? 'var(--color-gold)' : 'var(--color-line)',
                  background: done ? 'rgba(62,207,122,0.07)' : active ? 'rgba(240,180,41,0.09)' : 'rgba(0,0,0,0.25)',
                  boxShadow: active ? '0 0 0 1px var(--color-gold), 4px 4px 0 rgba(0,0,0,0.45)' : '4px 4px 0 rgba(0,0,0,0.35)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center border-2 font-disp text-[15px] font-bold"
                    style={{
                      borderColor: done ? 'var(--color-grass)' : active ? 'var(--color-gold)' : 'var(--color-line)',
                      color: done ? 'var(--color-grass)' : active ? 'var(--color-goldhi)' : 'var(--color-faint)',
                    }}
                  >
                    {done ? '✓' : p.n}
                  </span>
                  <span
                    className="font-disp text-[15px] font-bold uppercase tracking-wider"
                    style={{ color: done ? 'var(--color-grass)' : active ? 'var(--color-goldhi)' : 'var(--color-dim)' }}
                  >
                    {p.titulo}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-[10.5px] leading-snug text-faint">{p.desc}</p>
                {active && (
                  <span className="absolute -top-[9px] left-3 border border-gold bg-pitcho px-1.5 font-disp text-[10px] font-bold uppercase tracking-[0.18em] text-goldhi">
                    em curso
                  </span>
                )}
              </div>
              {i < OFF_PHASES.length - 1 && (
                <span className="absolute -right-[7px] top-1/2 z-10 -translate-y-1/2 font-disp text-[16px] font-bold text-faint">»</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          {fase === 1 && (
            <Panel title="Fase 1 — Free Agency" right={<span className="font-mono text-[11px] text-faint">{g.faPool.length} agentes livres</span>}>
              <div className="space-y-4 p-1">
                <p className="font-mono text-[12.5px] leading-relaxed text-dim">
                  O mercado está aberto. As <b className="text-ink">31 outras franquias</b> também disputam os agentes livres —
                  times com mais espaço e posições carentes são mais agressivos. Garanta seus alvos antes que assinem com rivais.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn btn-gold" onClick={() => go('mercado')}>Abrir Free Agency »</button>
                  <button className="btn" onClick={advance}>Encerrar FA e ir p/ Renovações »</button>
                </div>
                <p className="font-mono text-[11px] text-faint">Dica: ao encerrar a fase, as IAs fazem uma onda final de contratações.</p>
              </div>
            </Panel>
          )}

          {fase === 2 && (
            <Panel title="Fase 2 — Renovações & Comissão Técnica" right={<span className="font-mono text-[11px] text-faint">{expirando.length} jogadores + {staffExpirando.length} técnicos a vencer</span>}>
              <div className="space-y-4 p-1">
                <p className="font-mono text-[12.5px] leading-relaxed text-dim">
                  Jogadores no <b className="text-ink">último ano de contrato</b> viram free agents na próxima offseason. Renove suas estrelas
                  pela Free Agency interna (Contratos) e <b className="text-ink">segure sua comissão técnica</b> — técnicos sem contrato vão para o mercado.
                </p>
                {expirando.length > 0 && (
                  <div className="space-y-1.5">
                    {expirando.map(p => (
                      <div key={p.id} className="flex items-center gap-3 border border-line2 bg-panel2/50 px-3 py-1.5">
                        <PosBadge pos={p.pos} />
                        <span className="truncate font-mono text-[12.5px]">{p.nome}</span>
                        <span className="ml-auto" /><Ovr v={p.ovr} />
                        <span className="font-mono text-[11px] text-faint">{fmtM(p.salario)}/ano</span>
                        {p.tag && <span className="tag border-ice/60 text-ice">TAG</span>}
                      </div>
                    ))}
                  </div>
                )}
                {staffExpirando.length > 0 && (
                  <p className="font-mono text-[11.5px] text-goldhi">
                    ⚠ Comissão a vencer: {staffExpirando.map(s => s.funcao).join(', ')}. Renove na tela Comissão Técnica.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn btn-gold" onClick={() => go('mercado')}>Renovar jogadores »</button>
                  <button className="btn" onClick={() => go('comissao')}>Comissão Técnica</button>
                  <button className="btn" onClick={advance}>Concluir e abrir o Draft »</button>
                </div>
              </div>
            </Panel>
          )}

          {fase === 3 && (
            <Panel
              title="Fase 3 — Draft de Novatos"
              right={
                <span className="font-mono text-[11px] text-faint">
                  {g.draftState?.done ? 'concluído ✓' : g.draftState ? `Rodada ${g.draftState.round}/7 · pick ${g.draftState.pick + 1}/32` : '—'}
                </span>
              }
            >
              <div className="space-y-4 p-1">
                <p className="font-mono text-[12.5px] leading-relaxed text-dim">
                  7 rodadas, 32 escolhas cada. A ordem segue a campanha — quem sofreu mais, escolhe primeiro.
                  Use <b className="text-ink">Potencial</b> para caçar estrelas do futuro.
                </p>
                {g.draftState && (
                  <Bar pct={((g.draftState.round - 1) * 32 + g.draftState.pick) / (7 * 32) * 100} color="var(--color-gold)" />
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn btn-gold" onClick={() => go('draft')}>Abrir Draft »</button>
                  <button className="btn" onClick={() => dispatch({ type: 'DRAFT_ALL' })}>Deixar a IA draftar por mim</button>
                  <button className="btn" onClick={advance} disabled={!g.draftState?.done} title={!g.draftState?.done ? 'Conclua as 7 rodadas primeiro' : undefined}>
                    Ir p/ Validação Final »
                  </button>
                </div>
                {!g.draftState?.done && <p className="font-mono text-[11px] text-faint">O avanço fica bloqueado até as 7 rodadas terminarem.</p>}
              </div>
            </Panel>
          )}

          {fase === 4 && (
            <Panel title="Fase 4 — Validação Final" right={<span className={`font-mono text-[11px] ${chk.ok ? 'text-grass' : 'text-blood'}`}>{chk.ok ? 'apto a jogar ✓' : `${chk.erros.length} pendência(s)`}</span>}>
              <div className="space-y-4 p-1">
                <p className="font-mono text-[12.5px] leading-relaxed text-dim">
                  A liga só libera a temporada se o elenco fechar com <b className="text-ink">53 jogadores ativos</b> e a folha
                  estiver <b className="text-ink">dentro do salary cap</b>. Corrija as pendências — ou use o Auto-Fix.
                </p>

                <ul className="space-y-1.5">
                  {[
                    { label: `Elenco ativo: ${ativos}/53`, ok: ativos === 53 },
                    { label: `Practice Squad: ${ps}/10`, ok: ps <= 10 },
                    { label: `Salary cap: ${fmtM(cap)} de ${fmtM(g.settings.cap)}`, ok: cap <= g.settings.cap },
                    { label: 'Ao menos 1 QB no elenco', ok: roster.some(p => p.pos === 'QB' && p.status !== 'PS') },
                  ].map(c => (
                    <li key={c.label} className="flex items-center gap-2.5 border border-line2 px-3 py-2 font-mono text-[12.5px]">
                      <span className={`grid h-5 w-5 place-items-center border-2 text-[11px] font-bold ${c.ok ? 'border-grass text-grass' : 'border-blood text-blood'}`}>
                        {c.ok ? '✓' : '✗'}
                      </span>
                      <span className={c.ok ? 'text-dim' : 'text-ink'}>{c.label}</span>
                    </li>
                  ))}
                </ul>

                {!chk.ok && (
                  <div className="border-l-2 border-blood bg-[rgba(226,87,75,0.06)] px-3 py-2.5">
                    {chk.erros.map(e => (
                      <p key={e} className="font-mono text-[12px] leading-relaxed text-blood">⚠ {e}</p>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button className="btn" onClick={() => dispatch({ type: 'AUTO_FIX' })}>⚙ Auto-Fix (cortar/completar)</button>
                  <button className="btn" onClick={() => go('mercado')}>Free Agency</button>
                  <button className="btn" onClick={() => go('elenco')}>Elenco</button>
                  <button
                    className={`btn btn-gold ml-auto text-[16px] ${chk.ok ? 'btn-pulse' : ''}`}
                    onClick={() => dispatch({ type: 'START_SEASON' })}
                    disabled={!chk.ok}
                    title={!chk.ok ? 'Resolva as pendências de validação primeiro' : undefined}
                  >
                    🏈 Iniciar Temporada {g.settings.temporada + 1} »
                  </button>
                </div>
              </div>
            </Panel>
          )}
        </div>

        {/* coluna lateral */}
        <div className="space-y-5 xl:col-span-4">
          <Panel title="Raio-x da franquia" pad={false}>
            <table className="tbl">
              <tbody>
                {[
                  ['Caixa disponível', <b key="c" className="text-goldhi">${t.dinheiro}M</b>],
                  ['Espaço no cap', <b key="e" className={capSpace < 0 ? 'text-blood' : 'text-grass'}>{fmtM(capSpace)}</b>],
                  ['Jogadores ativos', <b key="a" className={ativos !== 53 ? 'text-goldhi' : 'text-ink'}>{ativos} / 53</b>],
                  ['Practice Squad', <b key="p" className="text-ink">{ps} / 10</b>],
                  ['Comissão técnica', <b key="s" className="text-ink">{staffOf(g, t.id).length} profissionais</b>],
                  ['Força do elenco', <b key="f" className="text-ink">{ativos ? Math.round(roster.filter(p => p.status !== 'PS').reduce((a, p) => a + p.ovr, 0) / ativos) : 0}</b>],
                ].map(([l, v]) => (
                  <tr key={String(l)}>
                    <td className="font-mono text-[12px] text-dim">{l}</td>
                    <td className="num font-mono text-[12.5px]">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="Como funciona a offseason" pad={false}>
            <div className="space-y-3 p-4 font-mono text-[11.5px] leading-relaxed text-dim">
              <p><b className="text-goldhi">1.</b> Contrate agentes livres antes das IAs.</p>
              <p><b className="text-goldhi">2.</b> Renove estrelas e segure sua comissão técnica.</p>
              <p><b className="text-goldhi">3.</b> Draft 7 rodadas com base no potencial.</p>
              <p><b className="text-goldhi">4.</b> Valide 53 jogadores + cap para destravar a temporada.</p>
              <p className="border-t border-line2 pt-2 text-faint">Você pode navegar livremente, mas só avança de fase pelo botão de cada etapa. A temporada não inicia com pendências.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
