import { useMemo } from 'react';
import { useGame } from '../state/store';
import {
  OFF_PHASES, validateRosterDetailed, capUsed, playersOf, fmtM, teamById, marketValue,
} from '../game/season';
import { calcExpectations, STRUCT_LABEL } from '../game/contracts';
import { Panel, Bar, PosBadge, Ovr, TeamCrest } from '../components/ui';
import type { Screen } from '../game/types';

const PHASE_ICON = ['🤝', '✍️', '🎓', '✅'];

export function OffseasonScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const teamByIdG = teamById(g, g.userTeam);
  const ph = g.offPhase ?? 1;
  const rules = validateRosterDetailed(g);
  const allOk = rules.every(r => r.ok);
  const nErr = rules.filter(r => !r.ok).length;

  const ativos = playersOf(g, g.userTeam).filter(p => p.status !== 'PS').length;
  const folha = capUsed(g, g.userTeam);
  const espaco = Math.max(0, Math.round((g.settings.cap - folha) * 10) / 10);

  const irPara = (destino: Screen) => dispatch({ type: 'SCREEN', screen: destino });

  const fa = useMemo(() => {
    const rfa = g.faPool.filter(p => p.rfa).length;
    const ufa = g.faPool.length - rfa;
    const meusRfa = g.faPool.filter(p => p.rfa && p.origem === g.userTeam);
    const top = [...g.faPool].sort((a, b) => b.ovr - a.ovr).slice(0, 6);
    return { rfa, ufa, meusRfa, top };
  }, [g.faPool, g.userTeam]);

  const renovaveis = useMemo(
    () => playersOf(g, g.userTeam).filter(p => !p.tag && p.contrato <= 2).sort((a, b) => b.ovr - a.ovr),
    [g.players, g.userTeam],
  );

  const draft = g.draftState;
  const minhaPos = draft ? draft.order.indexOf(g.userTeam) + 1 : 0;
  const draftDone = draft?.done ?? false;
  const quentes = useMemo(
    () => [...g.draftClass].sort((a, b) => (b.scout?.aiHeat ?? 0) - (a.scout?.aiHeat ?? 0)).slice(0, 3),
    [g.draftClass],
  );

  return (
    <div className="space-y-5">
      <div className="panel px-5 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.25em] text-faint">
              Offseason · rumo à temporada {g.settings.temporada + 1}
            </div>
            <h2 className="font-disp text-[30px] font-extrabold uppercase leading-tight">
              Fase {ph} de 4 — <span style={{ color: 'var(--color-goldhi)' }}>{PHASE_ICON[ph - 1]} {OFF_PHASES[ph - 1].titulo}</span>
            </h2>
          </div>
          <div className="text-right">
            <div className="font-mono text-[11px] uppercase tracking-wider text-faint">cap projetado</div>
            <div className="font-disp text-[22px] font-bold text-grass">
              {fmtM(Math.round(g.settings.cap * (1 + g.settings.tvGrowth / 100)))}
              <span className="ml-2 font-mono text-[12px] text-dim">(+{g.settings.tvGrowth.toFixed(1).replace('.', ',')}% TV)</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1">
          {OFF_PHASES.map((p, i) => {
            const done = p.n < ph;
            const current = p.n === ph;
            return (
              <div key={p.n} className="flex flex-1 items-center gap-1">
                <div
                  className={`flex h-9 flex-1 items-center justify-center gap-2 border font-disp text-[13px] font-bold uppercase tracking-wide transition-all ${
                    done ? 'border-grass/50 bg-grass/10 text-grass'
                      : current ? 'border-gold bg-gold/10 text-goldhi shadow-[0_0_14px_rgba(240,180,41,0.25)]'
                        : 'border-line text-faint'
                  }`}
                >
                  <span>{done ? '✓' : PHASE_ICON[i]}</span>
                  <span className="hidden md:inline">{p.titulo}</span>
                  <span className="md:hidden">{p.n}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 font-mono text-[12px] text-dim">{OFF_PHASES[ph - 1].desc}</p>
      </div>

      {ph === 1 && <FaseFA g={g} fa={fa} espaco={espaco} irPara={irPara} />}
      {ph === 2 && <FaseRenov g={g} renovaveis={renovaveis} irPara={irPara} />}
      {ph === 3 && <FaseDraft g={g} draft={draft} minhaPos={minhaPos} draftDone={draftDone} quentes={quentes} irPara={irPara} dispatch={dispatch} />}
      {ph === 4 && (
        <FaseValida
          g={g} rules={rules} allOk={allOk} nErr={nErr}
          ativos={ativos} folha={folha} espaco={espaco}
          irPara={irPara} dispatch={dispatch}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {ph === 1 && <span className="font-mono text-[11.5px] text-faint">Ao fechar o mercado, a IA faz a onda final de contratações e leva seus RFAs sem match.</span>}
        {ph === 3 && !draftDone && <span className="font-mono text-[11.5px] text-faint">O Draft precisa terminar (7 rodadas) para avançar.</span>}
        {ph < 4 ? (
          <button
            className="btn btn-gold ml-auto"
            onClick={() => dispatch({ type: 'ADVANCE_OFFPHASE' })}
            disabled={ph === 3 && !draftDone}
            title={ph === 3 && !draftDone ? 'Conclua o Draft antes de avançar' : ''}
          >
            {ph === 1 ? 'Fechar mercado & avançar »' : `Avançar para Fase ${ph + 1} »`}
          </button>
        ) : (
          <button
            className="btn btn-gold btn-pulse ml-auto"
            disabled={!allOk}
            title={allOk ? 'Tudo certo — iniciar nova temporada' : rules.find(r => !r.ok)?.detalhe}
            onClick={() => dispatch({ type: 'START_SEASON' })}
          >
            🏈 Iniciar temporada {g.settings.temporada + 1} »
          </button>
        )}
      </div>
    </div>
  );
}

function FaseFA({ g, fa, espaco, irPara }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Panel title={`Mercado aberto — ${g.faPool.length} agentes livres`} pad={false}
        right={
          <span className="flex gap-2">
            <span className="tag border-ice/60 text-ice">RFA {fa.rfa}</span>
            <span className="tag border-line text-dim">UFA {fa.ufa}</span>
          </span>
        }>
        <table className="tbl">
          <thead><tr><th>POS</th><th>Jogador</th><th>Origem</th><th>Tipo</th><th className="num">Idade</th><th className="num">OVR</th><th className="num">Pedido/ano</th></tr></thead>
          <tbody>
            {fa.top.map((p: any) => {
              const origem = p.origem ? g.teams.find((x: any) => x.id === p.origem) : null;
              return (
                <tr key={p.id}>
                  <td><PosBadge pos={p.pos} /></td>
                  <td>{p.nome}</td>
                  <td>
                    {origem
                      ? <span className="flex items-center gap-1.5"><TeamCrest {...origem} size={16} />{origem.sigla}</span>
                      : <span className="text-faint">—</span>}
                  </td>
                  <td>{p.rfa
                    ? <span className="tag border-ice/60 text-ice" title="Time de origem pode igualar qualquer oferta">RFA</span>
                    : <span className="tag border-line text-dim">UFA</span>}</td>
                  <td className="num">{p.idade}</td>
                  <td className="num"><Ovr v={p.ovr} /></td>
                  <td className="num text-goldhi">{fmtM(marketValue(p, g.settings.inflacao))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="border-t border-line px-4 py-3">
          <button className="btn" onClick={() => irPara('mercado')}>Abrir Free Agency completa »</button>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="Seu espaço de manobra">
          <div className="mb-1 flex justify-between font-mono text-[12px] text-dim">
            <span>Espaço no cap</span>
            <b className={espaco > 20 ? 'text-grass' : espaco > 0 ? 'text-goldhi' : 'text-blood'}>{fmtM(espaco)}</b>
          </div>
          <Bar pct={Math.min(100, (espaco / 60) * 100)} color={espaco > 20 ? 'var(--color-grass)' : 'var(--color-gold)'} />
          <p className="mt-2 font-mono text-[11.5px] leading-relaxed text-faint">
            A IA considera <b className="text-dim">necessidade</b>, <b className="text-dim">cap space</b> e <b className="text-dim">rating</b>.
            O jogador escolhe entre as ofertas por <b className="text-ink">salário (60%)</b>, <b className="text-ink">duração (20%)</b> e <b className="text-ink">competitividade (20%)</b>.
          </p>
        </Panel>

        <Panel title={`Seus RFAs no mercado (${fa.meusRfa.length})`} pad={false}>
          {fa.meusRfa.length === 0 ? (
            <p className="px-4 py-4 font-mono text-[12px] text-faint">Nenhum RFA seu no mercado. UFAs podem assinar com qualquer time.</p>
          ) : (
            <div className="max-h-[180px] overflow-y-auto">
              {fa.meusRfa.map((p: any) => (
                <div key={p.nome} className="flex items-center gap-2.5 border-b border-line2 px-4 py-2 font-mono text-[12px]">
                  <span className="font-bold text-ice">{p.pos}</span>
                  <span className="truncate">{p.nome}</span>
                  <Ovr v={p.ovr} />
                  <span className="ml-auto tag border-ice/50 text-ice">match</span>
                </div>
              ))}
              <p className="px-4 py-2 font-mono text-[11px] text-goldhi">
                ⚠ Exercite o match contratando-os na Free Agency antes de fechar o mercado, ou serão levados pela IA.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function FaseRenov({ g, renovaveis, irPara }: any) {
  return (
    <Panel
      title={`Renovações & extensões — ${renovaveis.length} elegíveis (≤2 anos restantes)`}
      pad={false}
      right={<button className="btn btn-sm btn-gold" onClick={() => irPara('negociacoes')}>Abrir Central de Contratos »</button>}
    >
      {renovaveis.length === 0 ? (
        <p className="px-4 py-6 font-mono text-[13px] text-faint">
          Nenhum jogador em fim de contrato. Todos seguros para a próxima temporada. ✓
        </p>
      ) : (
        <table className="tbl">
          <thead><tr><th>POS</th><th>Jogador</th><th className="num">Idade</th><th className="num">OVR</th><th>Contrato</th><th>Estrutura preferida</th><th className="num">Expectativa</th><th>Situação</th></tr></thead>
          <tbody>
            {renovaveis.map((p: any) => {
              const exp = calcExpectations(p, g.settings.inflacao);
              return (
                <tr key={p.id}>
                  <td><PosBadge pos={p.pos} /></td>
                  <td>{p.nome}</td>
                  <td className="num">{p.idade}</td>
                  <td className="num"><Ovr v={p.ovr} /></td>
                  <td>
                    {p.contrato === 1
                      ? <span className="tag border-gold/60 text-goldhi">último ano</span>
                      : <span className="tag border-line text-dim">{p.contrato} anos</span>}
                  </td>
                  <td className="text-dim">{STRUCT_LABEL[exp.structure]}</td>
                  <td className="num text-goldhi">{fmtM(exp.aav)}/ano · {exp.anos}a</td>
                  <td>
                    {p.holdout
                      ? <span className="tag border-blood/60 text-blood blink">HOLDOUT</span>
                      : p.contrato === 1 ? <span className="text-goldhi">renovar já</span> : <span className="text-faint">extensão</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="border-t border-line px-4 py-2.5 font-mono text-[11.5px] text-faint">
        Renovações usam a mesma fórmula de felicidade dos contratos, com <b className="text-goldhi">bônus de lealdade +10%</b>. Segure suas estrelas antes do Draft.
      </p>
    </Panel>
  );
}

function FaseDraft({ g, draft, minhaPos, draftDone, quentes, irPara, dispatch }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="Draft de Novatos — 7 rodadas" pad={false}>
        <div className="grid grid-cols-3 gap-3 p-4">
          <div className="border border-line2 p-3 text-center">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Rodada</div>
            <div className="font-disp text-[26px] font-bold text-goldhi">{draftDone ? 'FIM' : `${draft?.round ?? 1}/7`}</div>
          </div>
          <div className="border border-line2 p-3 text-center">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Sua posição</div>
            <div className="font-disp text-[26px] font-bold text-ink">#{minhaPos}</div>
          </div>
          <div className="border border-line2 p-3 text-center">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-faint">Prospectos</div>
            <div className="font-disp text-[26px] font-bold text-ink">{g.draftClass.length}</div>
          </div>
        </div>
        <p className="px-4 pb-3 font-mono text-[11.5px] leading-relaxed text-faint">
          Ordem pelo desempenho: times fora dos playoffs → perdedores do Wild Card → Divisional → Conferência → vice-campeão → <b className="text-goldhi">campeão por último</b>.
          A IA usa <b className="text-dim">best player available</b> nas rodadas 1–2 e <b className="text-dim">need-based</b> nas finais.
        </p>
        <div className="flex gap-2 border-t border-line px-4 py-3">
          <button className="btn btn-gold" onClick={() => irPara('draft')}>Abrir Draft »</button>
          {!draftDone && (
            <button className="btn btn-ghost" onClick={() => dispatch({ type: 'DRAFT_ALL' })}>Deixar a IA draftar tudo</button>
          )}
        </div>
      </Panel>

      <Panel title="🔥 Mais cotados nos boards da IA" pad={false}>
        {quentes.map((p: any) => (
          <div key={p.id} className="flex items-center gap-2.5 border-b border-line2 px-4 py-2.5">
            <PosBadge pos={p.pos} />
            <div className="min-w-0">
              <div className="truncate font-mono text-[12.5px]">{p.nome}</div>
              <div className="font-mono text-[10.5px] text-faint">{p.scout?.college}</div>
            </div>
            <Ovr v={p.ovr} pot={p.pot} />
            <span className="ml-auto font-mono text-[11px] text-goldhi" title="Franquias da IA que investigaram">
              🔥 {p.scout?.aiHeat ?? 0}
            </span>
          </div>
        ))}
        <p className="px-4 py-2.5 font-mono text-[11px] text-faint">
          O 🔥 mostra quantos GMs investigaram o prospecto durante a offseason — a IA tende a disputá-los.
        </p>
      </Panel>
    </div>
  );
}

function FaseValida({ g, rules, allOk, nErr, ativos, folha, espaco, irPara, dispatch }: any) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Panel
        title="Validação Final — obrigatória para iniciar"
        pad={false}
        right={allOk
          ? <span className="tag border-grass/60 text-grass">✓ APROVADO</span>
          : <span className="tag border-blood/60 text-blood">{nErr} PENDÊNCIA{nErr > 1 ? 'S' : ''}</span>}
      >
        <div className="divide-y divide-line2">
          {rules.map((r: any) => (
            <div key={r.id} className={`flex items-center gap-3 px-4 py-2.5 ${r.ok ? '' : 'bg-[rgba(226,87,75,0.05)]'}`}>
              <span className={`grid h-6 w-6 shrink-0 place-items-center border font-bold ${r.ok ? 'border-grass/60 text-grass' : 'border-blood/60 text-blood'}`}>
                {r.ok ? '✓' : '✗'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12.5px]">{r.label}</div>
                <div className={`font-mono text-[11px] ${r.ok ? 'text-faint' : 'text-blood'}`}>{r.detalhe}</div>
              </div>
              {!r.ok && r.destino && (
                <button className="btn btn-sm btn-ghost" onClick={() => irPara(r.destino as Screen)}>
                  {r.acao} »
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t border-line px-4 py-3">
          <button className="btn" onClick={() => dispatch({ type: 'AUTO_FIX' })}>
            ⚡ Auto-Fix (cortes & contratações automáticas)
          </button>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="Fotografia do elenco">
          <div className="mb-1 flex justify-between font-mono text-[12px] text-dim">
            <span>Elenco ativo</span>
            <b className={ativos === 53 ? 'text-grass' : 'text-blood'}>{ativos}/53</b>
          </div>
          <Bar pct={(ativos / 53) * 100} color={ativos === 53 ? 'var(--color-grass)' : 'var(--color-blood)'} />
          <div className="mb-1 mt-3 flex justify-between font-mono text-[12px] text-dim">
            <span>Folha salarial</span>
            <b className={folha <= g.settings.cap ? 'text-ink' : 'text-blood'}>{fmtM(folha)} / {fmtM(g.settings.cap)}</b>
          </div>
          <Bar pct={(folha / g.settings.cap) * 100} color={folha > g.settings.cap ? 'var(--color-blood)' : 'var(--color-grass)'} />
          <p className="mt-2 font-mono text-[11.5px] text-faint">Espaço livre: <b className="text-grass">{fmtM(espaco)}</b></p>
        </Panel>

        <Panel title="O que acontece ao iniciar">
          <ul className="space-y-1.5 font-mono text-[11.5px] leading-relaxed text-dim">
            <li>→ Temporada avança para <b className="text-ink">{g.settings.temporada + 1}</b></li>
            <li>→ Cap sobe <b className="text-grass">+{g.settings.tvGrowth.toFixed(1).replace('.', ',')}%</b> (receita de TV)</li>
            <li>→ Novo calendário oficial de 17 jogos é gerado</li>
            <li>→ Moral e fadiga de todos resetadas <b className="text-ink">(75 / 0)</b></li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
