import type { ReactNode } from 'react';
import { useGame } from '../state/store';
import {
  teamById, standings, divisionTable, conferenceSeeds, capUsed, fmtM,
  playersOf, UPGRADE_COST,
} from '../game/season';
import { CONF_LABEL, DIV_NAMES } from '../game/data';
import type { Conf } from '../game/types';
import { Panel, TeamCrest, SeqBadge, Bar, Ovr } from '../components/ui';

/* ============================ CALENDÁRIO ============================ */
export function ScheduleScreen() {
  const { st } = useGame();
  const g = st.game!;
  const { fase, semana } = g.settings;
  const t = teamById(g, g.userTeam);

  const userMatches = g.matches.filter(m => m.casa === g.userTeam || m.fora === g.userTeam);
  const pre = userMatches.filter(m => m.fase === 'PRE');
  const reg = userMatches.filter(m => m.fase === 'REG').sort((a, b) => a.rodada - b.rodada);
  const po = userMatches.filter(m => m.fase === 'PO').sort((a, b) => a.rodada - b.rodada);
  const poNomes = ['Wild Card', 'Divisional', 'Final de Conferência', 'Super Bowl'];

  const divCount = reg.filter(m => {
    const opp = teamById(g, m.casa === g.userTeam ? m.fora : m.casa);
    return t.conf === opp.conf && t.div === opp.div;
  }).length;
  const interCount = reg.filter(m => {
    const opp = teamById(g, m.casa === g.userTeam ? m.fora : m.casa);
    return t.conf !== opp.conf;
  }).length;

  const row = (m: typeof reg[number], label: string, current: boolean) => {
    const isHome = m.casa === g.userTeam;
    const opp = teamById(g, isHome ? m.fora : m.casa);
    const mine = isHome ? m.placarCasa : m.placarFora;
    const theirs = isHome ? m.placarFora : m.placarCasa;
    const res = !m.jogada ? null : mine! > theirs! ? 'V' : mine! < theirs! ? 'D' : 'E';
    const isDiv = m.fase === 'REG' && t.conf === opp.conf && t.div === opp.div;
    const isInter = m.fase === 'REG' && t.conf !== opp.conf;
    return (
      <tr key={m.id} style={current ? { background: 'rgba(240,180,41,0.09)', boxShadow: 'inset 3px 0 0 var(--color-gold)' } : undefined}>
        <td className="font-mono text-[12px] text-faint">{label}</td>
        <td>
          <span className="mr-1.5 inline-flex align-middle"><TeamCrest cor={opp.cor} cor2={opp.cor2} sigla={opp.sigla} conf={opp.conf} size={16} /></span>
          {opp.cidade} <b>{opp.nome}</b>
          <span className={`tag ml-2 ${isHome ? 'border-grass/50 text-grass' : 'border-ice/50 text-ice'}`}>{isHome ? 'CASA' : 'FORA'}</span>
          {isDiv && <span className="tag ml-1.5 border-gold/60 text-gold" title="Jogo de divisão">DIV</span>}
          {isInter && <span className="tag ml-1.5 border-blood/50 text-blood" title="Interconferência">{t.conf}×{opp.conf}</span>}
        </td>
        <td className="num font-mono text-[13px]">
          {m.jogada
            ? <><b className={res === 'V' ? 'text-grass' : res === 'D' ? 'text-blood' : 'text-gold'}>{mine}</b><span className="text-faint"> × </span><b>{theirs}</b>
              <span className={`ml-2 inline-block w-5 text-center font-bold ${res === 'V' ? 'text-grass' : res === 'D' ? 'text-blood' : 'text-gold'}`}>{res}</span></>
            : <span className="text-faint">{current ? '▶ próximo' : '—'}</span>}
        </td>
      </tr>
    );
  };

  // intercala a linha de BYE (a semana 1-17 sem jogo)
  const semanasComJogo = new Set(reg.map(m => m.rodada));
  const byeWeek = [...Array(17)].map((_, i) => i + 1).find(w => !semanasComJogo.has(w)) ?? null;
  const corpo: ReactNode[] = [];
  let byeInserido = false;
  for (const m of reg) {
    if (byeWeek != null && !byeInserido && m.rodada > byeWeek) {
      corpo.push(
        <tr key="bye" className="opacity-90">
          <td className="font-mono text-[12px] text-faint">Sem. {String(byeWeek).padStart(2, '0')}</td>
          <td colSpan={2}><span className="tag border-gold/60 text-goldhi">BYE WEEK — folga (recuperação de lesionados)</span></td>
        </tr>,
      );
      byeInserido = true;
    }
    corpo.push(row(m, `Sem. ${String(m.rodada).padStart(2, '0')}`, fase === 'REG' && m.rodada === semana && !m.jogada));
  }

  return (
    <div className="space-y-5">
      <Panel title="Pré-temporada (amistosos)" pad={false}>
        <table className="tbl"><tbody>
          {pre.map(m => row(m, `Sem. ${m.rodada}`, fase === 'PRE' && m.rodada === semana && !m.jogada))}
        </tbody></table>
      </Panel>

      <Panel
        title="Temporada regular — 18 semanas (17 jogos + bye; semana 18 é 100% divisão)"
        pad={false}
        right={
          <span className="flex gap-2">
            <span className={`tag ${divCount === 6 ? 'border-grass/60 text-grass' : 'border-gold/60 text-gold'}`}>{divCount}/6 divisão</span>
            <span className="tag border-blood/50 text-blood">{interCount} interconf.</span>
            {byeWeek != null && <span className="tag border-gold/60 text-goldhi">bye Sem. {byeWeek}</span>}
          </span>
        }
      >
        <table className="tbl"><tbody>
          {corpo}
          {po.map(m => row(m, poNomes[m.rodada - 1] ?? `PO ${m.rodada}`, fase === 'PO' && m.rodada === semana && !m.jogada))}
        </tbody></table>
      </Panel>
    </div>
  );
}

/* ============================ CLASSIFICAÇÃO ============================ */
export function StandingsScreen() {
  const { st } = useGame();
  const g = st.game!;
  return (
    <div className="space-y-5">
      {(['AFC', 'NFC'] as Conf[]).map(conf => {
        const seeds = conferenceSeeds(g, conf);
        const seedOf = new Map(seeds.map(x => [x.teamId, x.seed]));
        return (
          <div key={conf}>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="font-disp text-[24px] font-bold uppercase tracking-wide">{CONF_LABEL[conf]}</h2>
              <span className="font-mono text-[11.5px] text-faint">7 vagas: 4 campeões de divisão + 3 wild cards · #1 folga</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map(div => (
                <Panel key={div} title={`Divisão ${DIV_NAMES[div]}`} pad={false}>
                  <table className="tbl">
                    <thead><tr><th>Clube</th><th className="num">J</th><th className="num">V</th><th className="num">E</th><th className="num">D</th><th>Últ.5</th></tr></thead>
                    <tbody>
                      {divisionTable(g, conf, div).map(r => {
                        const t = teamById(g, r.teamId);
                        const sd = seedOf.get(r.teamId);
                        const me = r.teamId === g.userTeam;
                        return (
                          <tr key={r.teamId} style={me ? { background: 'rgba(240,180,41,0.07)' } : undefined}>
                            <td className="max-w-[130px]">
                              <span className="mr-1.5 inline-flex align-middle"><TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={14} /></span>
                              <b>{t.sigla}</b>
                              {sd && <span className="ml-1.5 font-mono text-[10px] text-gold">#{sd}</span>}
                            </td>
                            <td className="num">{r.j}</td>
                            <td className="num font-bold text-grass">{r.v}</td>
                            <td className="num text-faint">{r.e}</td>
                            <td className="num text-blood">{r.d}</td>
                            <td><SeqBadge seq={r.seq} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Panel>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================ FINANÇAS ============================ */
export function FinanceScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const folha = capUsed(g, t.id);
  const capPct = (folha / g.settings.cap) * 100;
  const { cap, tvGrowth, tvDeal, inflacao, temporada } = g.settings;
  const over = folha - cap;
  const top = [...playersOf(g, t.id)].sort((a, b) => b.salario - a.salario).slice(0, 10);
  const expirando = playersOf(g, t.id).filter(p => p.contrato === 1 && p.status !== 'PS').sort((a, b) => b.ovr - a.ovr);

  return (
    <div className="space-y-5">
      <Panel title="💰 Economia da Liga — Sistema de Inflação">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="border border-line2 bg-panel2 px-3.5 py-2.5">
            <div className="font-mono text-[11px] uppercase tracking-wider text-faint">Receita de TV</div>
            <div className="mt-0.5 font-disp text-[22px] font-bold text-goldhi">${tvDeal.toFixed(1).replace('.', ',')}B/ano</div>
          </div>
          <div className="border border-line2 bg-panel2 px-3.5 py-2.5">
            <div className="font-mono text-[11px] uppercase tracking-wider text-faint">Inflação acumulada</div>
            <div className="mt-0.5 font-disp text-[22px] font-bold text-grass">+{Math.round((inflacao - 1) * 100)}%</div>
          </div>
          <div className="border border-line2 bg-panel2 px-3.5 py-2.5">
            <div className="font-mono text-[11px] uppercase tracking-wider text-faint">Crescimento p/ {temporada + 1}</div>
            <div className="mt-0.5 font-disp text-[22px] font-bold text-ice">+{tvGrowth.toFixed(1).replace('.', ',')}%</div>
          </div>
          <div className="border border-line2 bg-panel2 px-3.5 py-2.5">
            <div className="font-mono text-[11px] uppercase tracking-wider text-faint">Cap projetado {temporada + 1}</div>
            <div className="mt-0.5 font-disp text-[22px] font-bold text-ink">{fmtM(Math.round(cap * (1 + tvGrowth / 100)))}</div>
          </div>
        </div>
        <p className="mt-3 font-mono text-[11.5px] leading-relaxed text-faint">
          A cada temporada: <b className="text-dim">novo cap = cap × (1 + crescimento da TV)</b>. Os pedidos de free agents e renovações sobem
          com a inflação ({Math.round((inflacao - 1) * 100)}% acumulado) — times com pouco espaço sofrem para renovar estrelas.
        </p>
      </Panel>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="panel px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Caixa do clube</div>
          <div className="mt-1 font-mono text-[19px] font-bold tabular-nums" style={{ color: t.dinheiro < 0 ? 'var(--color-blood)' : 'var(--color-goldhi)' }}>${t.dinheiro}M</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Folha salarial</div>
          <div className="mt-1 font-mono text-[19px] font-bold tabular-nums" style={{ color: over > 0 ? 'var(--color-blood)' : 'var(--color-ink)' }}>{fmtM(folha)}</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Salary cap</div>
          <div className="mt-1 font-mono text-[19px] font-bold tabular-nums text-ink">{fmtM(cap)}</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Espaço no cap</div>
          <div className="mt-1 font-mono text-[19px] font-bold tabular-nums" style={{ color: over > 0 ? 'var(--color-blood)' : 'var(--color-grass)' }}>{fmtM(Math.round((cap - folha) * 10) / 10)}</div>
        </div>
      </div>

      {over > 0 && (
        <div className="panel border-blood/50 px-4 py-3 font-mono text-[12.5px] text-blood">
          ⚠ Teto estourado em <b>{fmtM(over)}</b>. Dispense contratos ou use o Auto-Fix na Validação Final.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Uso do teto salarial">
          <div className="mb-1 flex justify-between font-mono text-[12px] text-dim">
            <span>{fmtM(folha)} comprometidos</span><span>{capPct.toFixed(0)}% do cap</span>
          </div>
          <Bar pct={capPct} h={14} color={capPct > 100 ? 'var(--color-blood)' : capPct > 88 ? 'var(--color-gold)' : 'var(--color-grass)'} />
        </Panel>

        <Panel title="Estrutura">
          <div className="flex items-center justify-between py-1.5">
            <div>
              <div className="font-disp text-[16px] font-semibold uppercase">Estádio <span className="text-gold">{'★'.repeat(t.estadio)}{'☆'.repeat(5 - t.estadio)}</span></div>
              <div className="font-mono text-[11.5px] text-faint">Aumenta bilheteria e pressão da torcida</div>
            </div>
            <button className="btn btn-sm" disabled={t.estadio >= 5 || t.dinheiro < UPGRADE_COST(t.estadio)}
              onClick={() => dispatch({ type: 'UPGRADE', kind: 'estadio' })}>
              {t.estadio >= 5 ? 'MÁX' : `Reformar ${fmtM(UPGRADE_COST(t.estadio))}`}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line2 py-1.5">
            <div>
              <div className="font-disp text-[16px] font-semibold uppercase">Centro de treinamento <span className="text-gold">{'★'.repeat(t.centroTreino)}{'☆'.repeat(5 - t.centroTreino)}</span></div>
              <div className="font-mono text-[11.5px] text-faint">Acelera o desenvolvimento na offseason</div>
            </div>
            <button className="btn btn-sm" disabled={t.centroTreino >= 5 || t.dinheiro < UPGRADE_COST(t.centroTreino)}
              onClick={() => dispatch({ type: 'UPGRADE', kind: 'centroTreino' })}>
              {t.centroTreino >= 5 ? 'MÁX' : `Modernizar ${fmtM(UPGRADE_COST(t.centroTreino))}`}
            </button>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Maiores salários" pad={false}>
          <table className="tbl">
            <thead><tr><th>POS</th><th>Jogador</th><th className="num">OVR</th><th className="num">Salário</th><th className="num">Contrato</th></tr></thead>
            <tbody>
              {top.map(p => (
                <tr key={p.id}>
                  <td className="font-disp font-bold">{p.pos}</td>
                  <td>{p.nome}</td>
                  <td className="num"><Ovr v={p.ovr} /></td>
                  <td className="num text-goldhi">{fmtM(p.salario)}</td>
                  <td className="num">{p.contrato}a</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Contratos expirando (fim da temporada)" pad={false}
          right={<span className="font-mono text-[11px] text-faint">use a Franchise Tag no Elenco</span>}>
          {expirando.length === 0 ? (
            <p className="px-4 py-5 font-mono text-[12.5px] text-faint">Nenhum contrato acaba nesta temporada.</p>
          ) : (
            <div className="max-h-[330px] overflow-y-auto">
              {expirando.map(p => (
                <div key={p.id} className="flex items-center gap-3 border-b border-line2 px-4 py-2 font-mono text-[12px]">
                  <span className="font-disp font-bold text-dim">{p.pos}</span>
                  <span>{p.nome}</span>
                  <Ovr v={p.ovr} />
                  <span className="ml-auto text-goldhi">{fmtM(p.salario)}</span>
                  {p.tag
                    ? <span className="tag border-ice/60 text-ice">TAG ✓</span>
                    : <button className="btn btn-sm btn-ghost text-ice" onClick={() => dispatch({ type: 'TAG', playerId: p.id })}>Aplicar tag</button>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
