import { useGame } from '../state/store';
import {
  teamById, playersOf, capUsed, capHitOf, teamStrength, standings, divisionTable,
  conferenceSeeds, playoffZone, fmtM,
} from '../game/season';
import { CONF_LABEL, DIV_NAMES } from '../game/data';
import { Panel, TeamCrest, Bar, SeqBadge, Ovr } from '../components/ui';
import type { Conf, GameState } from '../game/types';

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
              <span className="font-mono text-[11.5px] text-faint">seeds #1–#4 campeões de divisão · #5–#7 wild cards</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map(div => (
                <Panel key={div} title={`Divisão ${DIV_NAMES[div]}`} pad={false}>
                  <table className="tbl">
                    <thead><tr><th>Clube</th><th className="num">J</th><th className="num">V</th><th className="num">E</th><th className="num">D</th><th className="num">+/−</th><th>Últ.5</th></tr></thead>
                    <tbody>
                      {divisionTable(g, conf, div).map(r => {
                        const t = teamById(g, r.teamId);
                        const sd = seedOf.get(r.teamId);
                        const me = r.teamId === g.userTeam;
                        return (
                          <tr key={r.teamId} style={me ? { background: 'rgba(240,180,41,0.07)' } : undefined}>
                            <td className="max-w-[120px]">
                              <span className="mr-1 inline-flex align-middle"><TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={14} /></span>
                              <b>{t.sigla}</b>
                              {sd && <span className="ml-1.5 font-mono text-[10px] text-gold">#{sd}</span>}
                            </td>
                            <td className="num">{r.j}</td>
                            <td className="num font-bold text-grass">{r.v}</td>
                            <td className="num text-faint">{r.e}</td>
                            <td className="num text-blood">{r.d}</td>
                            <td className="num">{r.net > 0 ? `+${r.net}` : r.net}</td>
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

/* ============================ CALENDÁRIO ============================ */
export function ScheduleScreen() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const { fase, semana } = g.settings;

  const userMatches = g.matches.filter(m => m.casa === g.userTeam || m.fora === g.userTeam);
  const pre = userMatches.filter(m => m.fase === 'PRE');
  const reg = userMatches.filter(m => m.fase === 'REG');
  const po = userMatches.filter(m => m.fase === 'PO').sort((a, b) => a.rodada - b.rodada);
  const poNomes = ['Wild Card', 'Divisional', 'Final de Conferência', 'Super Bowl'];

  const row = (m: (typeof reg)[number], label: string, current: boolean) => {
    const isHome = m.casa === g.userTeam;
    const opp = teamById(g, isHome ? m.fora : m.casa);
    const mine = isHome ? m.placarCasa : m.placarFora;
    const theirs = isHome ? m.placarFora : m.placarCasa;
    const res = !m.jogada ? null : mine! > theirs! ? 'V' : mine! < theirs! ? 'D' : 'E';
    const isDiv = m.fase === 'REG' && t.conf === opp.conf && t.div === opp.div;
    return (
      <tr key={m.id} style={current ? { background: 'rgba(240,180,41,0.09)', boxShadow: 'inset 3px 0 0 var(--color-gold)' } : undefined}>
        <td className="font-mono text-[12px] text-faint">{label}</td>
        <td>
          <span className="mr-1.5 inline-flex align-middle"><TeamCrest cor={opp.cor} cor2={opp.cor2} sigla={opp.sigla} conf={opp.conf} size={15} /></span>
          {opp.cidade} <b>{opp.nome}</b>
          <span className={`tag ml-2 ${isHome ? 'border-grass/50 text-grass' : 'border-ice/50 text-ice'}`}>{isHome ? 'CASA' : 'FORA'}</span>
          {isDiv && <span className="tag ml-1.5 border-gold/60 text-gold" title="Jogo de divisão (ida-e-volta)">DIV</span>}
        </td>
        <td className="num font-mono text-[13px]">
          {m.jogada
            ? <><b className={res === 'V' ? 'text-grass' : res === 'D' ? 'text-blood' : 'text-gold'}>{mine}</b><span className="text-faint"> × </span><b>{theirs}</b>
              <span className={`ml-2 inline-block w-5 text-center font-bold ${res === 'V' ? 'text-grass' : res === 'D' ? 'text-blood' : 'text-gold'}`}>{res}</span></>
            : <span className="text-faint">{current ? '▶ próximo jogo' : '—'}</span>}
        </td>
      </tr>
    );
  };

  const divCount = reg.filter(m => {
    const opp = teamById(g, m.casa === g.userTeam ? m.fora : m.casa);
    return t.conf === opp.conf && t.div === opp.div;
  }).length;

  return (
    <div className="space-y-5">
      <Panel
        title="Temporada regular — 18 semanas (17 jogos + bye; semana 18 é 100% divisão)"
        pad={false}
        right={<span className={`tag ${divCount === 6 ? 'border-grass/60 text-grass' : 'border-gold/60 text-gold'}`}>{divCount}/6 jogos de divisão</span>}
      >
        <table className="tbl"><tbody>
          {reg.map(m => row(m, `Sem. ${String(m.rodada).padStart(2, '0')}`, fase === 'REG' && m.rodada === semana && !m.jogada))}
          {po.map(m => row(m, poNomes[m.rodada - 1] ?? `PO ${m.rodada}`, fase === 'PO' && m.rodada === semana && !m.jogada))}
        </tbody></table>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Pré-temporada (amistosos)" pad={false}>
          <table className="tbl"><tbody>
            {pre.map(m => row(m, `Sem. ${m.rodada}`, fase === 'PRE' && m.rodada === semana && !m.jogada))}
          </tbody></table>
        </Panel>

        <Panel title="Playoffs" pad={false}>
          {!g.bracket ? (
            <p className="px-4 py-6 font-mono text-[12.5px] text-faint">
              A chave será montada após a semana 18: 7 times por conferência, seed #1 folga no Wild Card, tudo em jogo único.
            </p>
          ) : (
            <div>
              {g.bracket.map(r => (
                <div key={r.nome} className="border-b border-line2 px-4 py-2.5 last:border-0">
                  <div className="font-disp text-[14px] font-semibold uppercase tracking-[0.15em] text-gold">{r.nome}</div>
                  {r.jogos.map((j, k) => {
                    const c = teamById(g, j.casa); const f = teamById(g, j.fora);
                    const me = j.casa === g.userTeam || j.fora === g.userTeam;
                    return (
                      <div key={k} className={`mt-1 flex items-center gap-2 font-mono text-[12px] ${me ? 'text-goldhi' : 'text-dim'}`}>
                        <TeamCrest cor={c.cor} cor2={c.cor2} sigla={c.sigla} conf={c.conf} size={13} />
                        <b className={j.jogada && (j.pc ?? 0) > (j.pf ?? 0) ? 'text-ink' : ''}>{c.sigla} {j.jogada ? j.pc : ''}</b>
                        <span className="text-faint">×</span>
                        <b className={j.jogada && (j.pf ?? 0) > (j.pc ?? 0) ? 'text-ink' : ''}>{j.jogada ? j.pf : ''} {f.sigla}</b>
                        <TeamCrest cor={f.cor} cor2={f.cor2} sigla={f.sigla} conf={f.conf} size={13} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
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
  const top = [...playersOf(g, t.id)].sort((a, b) => capHitOf(b) - capHitOf(a)).slice(0, 10);
  const expirando = playersOf(g, t.id).filter(p => p.contrato === 1 && p.status !== 'PS').sort((a, b) => b.ovr - a.ovr);
  const over = folha - g.settings.cap;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { l: 'Caixa do clube', v: `$${t.dinheiro}M`, c: t.dinheiro < 0 ? 'var(--color-blood)' : 'var(--color-goldhi)' },
          { l: 'Folha salarial', v: fmtM(folha), c: over > 0 ? 'var(--color-blood)' : 'var(--color-ink)' },
          { l: 'Salary cap', v: fmtM(g.settings.cap), c: 'var(--color-ink)' },
          { l: 'Espaço no cap', v: fmtM(Math.round((g.settings.cap - folha) * 10) / 10), c: over > 0 ? 'var(--color-blood)' : 'var(--color-grass)' },
        ].map(x => (
          <div key={x.l} className="panel px-4 py-3">
            <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">{x.l}</div>
            <div className="mt-1 font-mono text-[19px] font-bold tabular-nums" style={{ color: x.c }}>{x.v}</div>
          </div>
        ))}
      </div>

      {over > 0 && (
        <div className="panel border-blood/50 px-4 py-3 font-mono text-[12.5px] text-blood">
          ⚠ Teto estourado em <b>{fmtM(over)}</b>. Multa semanal da liga: <b>{fmtM(Math.round(over * 0.1 * 10) / 10)}</b>,
          além de proibição de contratar. Dispense contratos no Elenco.
        </div>
      )}

      <Panel title="Liga & Economia — o dinheiro da TV move o cap">
        <div className="grid gap-3 md:grid-cols-4 font-mono text-[12.5px]">
          <div className="border border-line2 bg-panel2/50 px-3.5 py-2.5">
            <div className="text-faint">Acordo de TV (ano)</div>
            <div className="mt-0.5 font-disp text-[20px] font-bold text-goldhi">${g.settings.tvDeal.toFixed(1).replace('.', ',')}B</div>
          </div>
          <div className="border border-line2 bg-panel2/50 px-3.5 py-2.5">
            <div className="text-faint">Inflação acumulada</div>
            <div className="mt-0.5 font-disp text-[20px] font-bold text-grass">+{(g.settings.inflacao * 100 - 100).toFixed(1).replace('.', ',')}%</div>
          </div>
          <div className="border border-line2 bg-panel2/50 px-3.5 py-2.5">
            <div className="text-faint">Projeção p/ {g.settings.temporada + 1}</div>
            <div className="mt-0.5 font-disp text-[20px] font-bold text-ice">+{g.settings.tvGrowth.toFixed(1).replace('.', ',')}%</div>
          </div>
          <div className="border border-line2 bg-panel2/50 px-3.5 py-2.5">
            <div className="text-faint">Cap projetado</div>
            <div className="mt-0.5 font-disp text-[20px] font-bold text-ink">{fmtM(Math.round(g.settings.cap * (1 + g.settings.tvGrowth / 100)))}</div>
          </div>
        </div>
        <p className="mt-2.5 font-mono text-[11.5px] leading-relaxed text-faint">
          A cada temporada: <b className="text-dim">novo cap = cap × (1 + crescimento da TV)</b>. Pedidos de free agents e renovações sobem junto.
        </p>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Uso do teto salarial">
          <div className="mb-1 flex justify-between font-mono text-[12px] text-dim">
            <span>{fmtM(folha)} comprometidos</span><span>{capPct.toFixed(0)}% do cap</span>
          </div>
          <Bar pct={capPct} h={14} color={capPct > 100 ? 'var(--color-blood)' : capPct > 88 ? 'var(--color-gold)' : 'var(--color-grass)'} />
          <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-[12px] text-dim">
            <div className="border border-line2 bg-panel2/50 px-3 py-2">
              <div className="text-faint">Receita por jogo em casa</div>
              <b className="text-grass">≈ {fmtM(Math.round((7 + t.estadio * 4.5 + t.moral * 0.06) * 10) / 10)}</b>
            </div>
            <div className="border border-line2 bg-panel2/50 px-3 py-2">
              <div className="text-faint">Folha semanal (÷18)</div>
              <b className="text-blood">− {fmtM(Math.round(folha / 18 * 10) / 10)}</b>
            </div>
          </div>
        </Panel>

        <Panel title="Estrutura">
          <div className="flex items-center justify-between py-1.5">
            <div>
              <div className="font-disp text-[16px] font-semibold uppercase">Estádio <span className="text-gold">{'★'.repeat(t.estadio)}{'☆'.repeat(5 - t.estadio)}</span></div>
              <div className="font-mono text-[11.5px] text-faint">{t.estadioNome} · +bilheteria a cada nível</div>
            </div>
            <button className="btn btn-sm" disabled={t.estadio >= 5 || t.dinheiro < 8 + t.estadio * 6}
              onClick={() => dispatch({ type: 'UPGRADE', kind: 'estadio' })}>
              {t.estadio >= 5 ? 'MÁX' : `Reformar ${fmtM(8 + t.estadio * 6)}`}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-line2 py-1.5">
            <div>
              <div className="font-disp text-[16px] font-semibold uppercase">Centro de treinamento <span className="text-gold">{'★'.repeat(t.centroTreino)}{'☆'.repeat(5 - t.centroTreino)}</span></div>
              <div className="font-mono text-[11.5px] text-faint">Acelera desenvolvimento na offseason</div>
            </div>
            <button className="btn btn-sm" disabled={t.centroTreino >= 5 || t.dinheiro < 8 + t.centroTreino * 6}
              onClick={() => dispatch({ type: 'UPGRADE', kind: 'centroTreino' })}>
              {t.centroTreino >= 5 ? 'MÁX' : `Modernizar ${fmtM(8 + t.centroTreino * 6)}`}
            </button>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Maiores cap hits" pad={false}>
          <table className="tbl">
            <thead><tr><th>POS</th><th>Jogador</th><th className="num">OVR</th><th className="num">Cap hit</th><th className="num">Contrato</th></tr></thead>
            <tbody>
              {top.map(p => (
                <tr key={p.id}>
                  <td className="font-disp font-bold">{p.pos}</td>
                  <td>{p.nome}</td>
                  <td className="num"><Ovr v={p.ovr} /></td>
                  <td className="num text-goldhi">{fmtM(capHitOf(p))}</td>
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
                  <span className="truncate">{p.nome}</span>
                  <Ovr v={p.ovr} />
                  <span className="ml-auto text-goldhi">{fmtM(p.salario)}</span>
                  {p.tag
                    ? <span className="tag border-ice/60 text-ice">TAG ✓</span>
                    : <button className="btn btn-sm btn-ghost text-ice" onClick={() => dispatch({ type: 'TAG', playerId: p.id })}>Tag</button>}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
