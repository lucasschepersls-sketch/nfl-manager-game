import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import {
  standings, divisionTable, conferenceSeeds, playoffZone, teamById, playersOf,
  capUsed, capHitOf, fmtM, teamStrength,
} from '../game/season';
import { DIV_NAMES, CONF_LABEL } from '../game/data';
import { teamStage } from '../game/franchise';
import { Panel, TeamDot, SeqBadge, TeamCrest, Bar, Ovr } from '../components/ui';
import type { Conf, GameState } from '../game/types';

/* ================= CLASSIFICAÇÃO ================= */
export function StandingsScreen() {
  const { st } = useGame();
  const g = st.game!;
  return (
    <div className="space-y-5">
      {g.settings.fase === 'PRE' && (
        <div className="flex items-center gap-3 border border-line bg-panel2 px-4 py-2.5">
          <span className="tag border-gold/60 text-gold">PRÉ-TEMPORADA</span>
          <span className="font-mono text-[12px] text-dim">Amistosos não contam — a tabela zera na temporada regular.</span>
        </div>
      )}
      {(['AFC', 'NFC'] as Conf[]).map(conf => {
        const seeds = conferenceSeeds(g, conf);
        const seedOf = new Map(seeds.map(x => [x.teamId, x.seed]));
        const zone = playoffZone(g, conf);
        return (
          <div key={conf}>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="font-disp text-[24px] font-bold uppercase tracking-wide">{CONF_LABEL[conf]}</h2>
              <span className="font-mono text-[11px] text-faint">7 vagas: 4 campeões de divisão + 3 wild cards</span>
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
                        const inZone = zone.has(r.teamId);
                        const me = r.teamId === g.userTeam;
                        return (
                          <tr key={r.teamId} style={me ? { background: 'rgba(240,180,41,0.07)' } : inZone ? { background: 'rgba(62,207,122,0.05)' } : undefined}>
                            <td className="max-w-[120px]">
                              <span className="mr-1.5 inline-block h-[8px] w-[8px]" style={{ background: t.cor }} />
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

/* ================= CALENDÁRIO ================= */
export function ScheduleScreen() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const { fase, semana } = g.settings;
  const mine = g.matches.filter(m => m.casa === g.userTeam || m.fora === g.userTeam);

  const row = (m: GameState['matches'][number], label: string) => {
    const isHome = m.casa === g.userTeam;
    const opp = teamById(g, isHome ? m.fora : m.casa);
    const my = isHome ? m.placarCasa : m.placarFora;
    const th = isHome ? m.placarFora : m.placarCasa;
    const cur = fase === m.fase && semana === m.rodada && !m.jogada;
    return (
      <tr key={m.id} style={cur ? { background: 'rgba(240,180,41,0.09)', boxShadow: 'inset 3px 0 0 var(--color-gold)' } : undefined}>
        <td className="font-mono text-[12px] text-faint">{label}</td>
        <td>
          <span className="mr-2 inline-block h-[9px] w-[9px]" style={{ background: opp.cor }} />
          {opp.cidade} <b>{opp.nome}</b>
          <span className={`tag ml-2 ${isHome ? 'border-grass/50 text-grass' : 'border-ice/50 text-ice'}`}>{isHome ? 'CASA' : 'FORA'}</span>
        </td>
        <td className="num font-mono text-[13px]">
          {m.jogada
            ? <><b className={my! > th! ? 'text-grass' : my! < th! ? 'text-blood' : 'text-gold'}>{my}</b><span className="text-faint"> × </span><b>{th}</b></>
            : <span className="text-faint">{cur ? '▶ próximo' : '—'}</span>}
        </td>
      </tr>
    );
  };

  const pre = mine.filter(m => m.fase === 'PRE');
  const reg = mine.filter(m => m.fase === 'REG').sort((a, b) => a.rodada - b.rodada);
  const po = mine.filter(m => m.fase === 'PO').sort((a, b) => a.rodada - b.rodada);
  const poNomes = ['Wild Card', 'Divisional', 'Final de Conferência', 'Super Bowl'];

  return (
    <div className="space-y-5">
      <Panel title="Temporada regular — 18 semanas (17 jogos + bye)" pad={false}>
        <table className="tbl"><tbody>
          {pre.map(m => row(m, `Pré ${m.rodada}`))}
          {reg.map(m => row(m, `Sem. ${String(m.rodada).padStart(2, '0')}`))}
          {po.map(m => row(m, poNomes[m.rodada - 1] ?? `PO ${m.rodada}`))}
        </tbody></table>
      </Panel>
    </div>
  );
}

/* ================= FINANÇAS ================= */
export function FinanceScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const cap = capUsed(g, g.userTeam);
  const capPct = (cap / g.settings.cap) * 100;
  const top = [...playersOf(g, g.userTeam)].sort((a, b) => capHitOf(b) - capHitOf(a)).slice(0, 10);
  const expirando = playersOf(g, g.userTeam).filter(p => p.contrato === 1 && p.status !== 'PS').sort((a, b) => b.ovr - a.ovr);
  const over = cap - g.settings.cap;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="border border-line bg-panel2 px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Caixa</div>
          <div className="mt-1 font-mono text-[19px] font-bold text-goldhi">${t.dinheiro}M</div>
        </div>
        <div className="border border-line bg-panel2 px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Folha</div>
          <div className="mt-1 font-mono text-[19px] font-bold" style={{ color: over > 0 ? 'var(--color-blood)' : 'var(--color-ink)' }}>{fmtM(cap)}</div>
        </div>
        <div className="border border-line bg-panel2 px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Cap {g.settings.temporada}</div>
          <div className="mt-1 font-mono text-[19px] font-bold text-ink">{fmtM(g.settings.cap)}</div>
        </div>
        <div className="border border-line bg-panel2 px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Espaço</div>
          <div className="mt-1 font-mono text-[19px] font-bold" style={{ color: over > 0 ? 'var(--color-blood)' : 'var(--color-grass)' }}>{fmtM(g.settings.cap - cap)}</div>
        </div>
      </div>

      {over > 0 && (
        <div className="border border-blood/50 px-4 py-3 font-mono text-[12.5px] text-blood">
          ⚠ Teto estourado em {fmtM(over)}. Dispense contratos ou reestruture para voltar à conformidade.
        </div>
      )}

      <Panel title="Economia da liga (inflação de TV)">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 font-mono text-[12.5px]">
          <div><span className="text-faint">Receita de TV:</span> <b className="text-goldhi">${g.settings.tvDeal}B/ano</b></div>
          <div><span className="text-faint">Inflação acumulada:</span> <b className="text-ink">{Math.round((g.settings.inflacao - 1) * 100)}%</b></div>
          <div><span className="text-faint">Crescimento {g.settings.temporada + 1}:</span> <b className="text-grass">+{g.settings.tvGrowth}%</b></div>
          <div><span className="text-faint">Cap projetado:</span> <b className="text-ink">{fmtM(Math.round(g.settings.cap * (1 + g.settings.tvGrowth / 100)))}</b></div>
        </div>
        <p className="mt-2 font-mono text-[11px] text-faint">O cap cresce com a receita de TV a cada temporada; salários pedidos acompanham a inflação.</p>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Maiores salários (cap hit)" pad={false}>
          <table className="tbl">
            <thead><tr><th>POS</th><th>Jogador</th><th className="num">OVR</th><th className="num">Cap hit</th><th className="num">Contr.</th></tr></thead>
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
        <Panel title="Contratos expirando (fim da temporada)" pad={false}>
          {expirando.length === 0 ? (
            <p className="px-4 py-5 font-mono text-[12.5px] text-faint">Nenhum contrato acaba nesta temporada.</p>
          ) : (
            <div className="max-h-[330px] overflow-y-auto">
              {expirando.map(p => (
                <div key={p.id} className="flex items-center gap-3 border-b border-line2 px-4 py-2 font-mono text-[12px]">
                  <span className="font-disp font-bold text-dim">{p.pos}</span>
                  <span>{p.nome}</span>
                  <Ovr v={p.ovr} />
                  <span className="ml-auto text-goldhi">{fmtM(capHitOf(p))}</span>
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

/* ================= RIVALIDADES ================= */
export function RivalriesScreen() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const minhas = g.rivalries.filter(r => r.team1Id === g.userTeam || r.team2Id === g.userTeam);

  return (
    <Panel title={`Rivalidades — ${t.cidade} ${t.nome}`} pad={false}>
      <table className="tbl">
        <thead><tr><th>Adversário</th><th>Tipo</th><th className="num">Jogos</th><th className="num">Suas vit.</th><th className="num">Vit. deles</th><th className="num">Intensidade</th></tr></thead>
        <tbody>
          {minhas.map((r, i) => {
            const oppId = r.team1Id === g.userTeam ? r.team2Id : r.team1Id;
            const opp = teamById(g, oppId);
            const myWins = r.team1Id === g.userTeam ? r.team1Wins : r.team2Wins;
            const theirWins = r.team1Id === g.userTeam ? r.team2Wins : r.team1Wins;
            return (
              <tr key={i}>
                <td><span className="inline-flex items-center gap-2"><TeamDot cor={opp.cor} /><b>{opp.cidade} {opp.nome}</b></span></td>
                <td><span className="tag border-line text-dim">{r.history}</span></td>
                <td className="num">{r.gamesPlayed}</td>
                <td className="num font-bold text-grass">{myWins}</td>
                <td className="num text-blood">{theirWins}</td>
                <td className="num"><div className="w-24"><Bar pct={r.intensity * 10} color="var(--color-blood)" /></div></td>
              </tr>
            );
          })}
          {!minhas.length && <tr><td colSpan={6} className="py-6 text-center text-faint">Rivalidades se constroem com jogos de divisão ao longo das temporadas.</td></tr>}
        </tbody>
      </table>
    </Panel>
  );
}

/* ================= COMPARADOR H2H ================= */
export function TeamComparatorScreen() {
  const { st } = useGame();
  const g = st.game!;
  const [aId, setAId] = useState(g.userTeam);
  const [bId, setBId] = useState(g.teams.find(t => t.id !== g.userTeam)!.id);
  const a = teamById(g, aId); const b = teamById(g, bId);
  const rowsA = standings(g).find(r => r.teamId === aId)!;
  const rowsB = standings(g).find(r => r.teamId === bId)!;

  const cmp = (label: string, va: number, vb: number, fmt: (v: number) => string = String) => (
    <tr key={label}>
      <td className={`num font-bold ${va > vb ? 'text-grass' : 'text-dim'}`}>{fmt(va)}</td>
      <td className="text-center font-disp text-[13px] font-bold uppercase text-faint">{label}</td>
      <td className={`num font-bold ${vb > va ? 'text-grass' : 'text-dim'}`}>{fmt(vb)}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {[{ id: aId, set: setAId }, { id: bId, set: setBId }].map(({ id, set }, i) => (
          <select key={i} className="sel w-full" value={id} onChange={e => set(e.target.value)}>
            {g.teams.map(t => <option key={t.id} value={t.id}>{t.cidade} {t.nome}</option>)}
          </select>
        ))}
      </div>
      <Panel title="Confronto direto" pad={false}>
        <div className="flex items-center justify-center gap-8 border-b border-line px-4 py-4">
          <div className="flex flex-col items-center gap-1"><TeamCrest cor={a.cor} cor2={a.cor2} sigla={a.sigla} conf={a.conf} size={56} /><span className="font-disp text-[18px] font-bold uppercase">{a.sigla}</span></div>
          <span className="font-disp text-[28px] font-extrabold text-goldhi">×</span>
          <div className="flex flex-col items-center gap-1"><TeamCrest cor={b.cor} cor2={b.cor2} sigla={b.sigla} conf={b.conf} size={56} /><span className="font-disp text-[18px] font-bold uppercase">{b.sigla}</span></div>
        </div>
        <table className="tbl">
          <tbody>
            {cmp('Força', teamStrength(g, aId), teamStrength(g, bId))}
            {cmp('Vitórias', rowsA.v, rowsB.v)}
            {cmp('Pontos pró', rowsA.pf, rowsB.pf)}
            {cmp('Saldo', rowsA.net, rowsB.net)}
            {cmp('Química', a.quimica, b.quimica)}
            {cmp('Estágio', teamStage(g, aId).score, teamStage(g, bId).score)}
            {cmp('Moral', a.moral, b.moral)}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

/* ================= POWER RANKINGS ================= */
export function PowerRankingsScreen() {
  const { st } = useGame();
  const g = st.game!;
  const ranked = useMemo(() => {
    const rows = standings(g);
    return g.teams.map(t => {
      const r = rows.find(x => x.teamId === t.id)!;
      const score = Math.round(r.v * 10 + r.net * 0.5 + teamStrength(g, t.id) * 0.4 + t.moral * 0.1);
      return { t, r, score };
    }).sort((x, y) => y.score - x.score);
  }, [g]);

  return (
    <Panel title={`Power Rankings — Semana ${g.settings.semana}`} pad={false}>
      <table className="tbl">
        <thead><tr><th>#</th><th>Time</th><th className="num">Campanha</th><th className="num">Saldo</th><th className="num">Força</th><th className="num">Score</th></tr></thead>
        <tbody>
          {ranked.map((x, i) => (
            <tr key={x.t.id} style={x.t.id === g.userTeam ? { background: 'rgba(240,180,41,0.07)' } : undefined}>
              <td className={`num font-bold ${i < 3 ? 'medal-' + (i + 1) : 'text-faint'}`}>{i + 1}</td>
              <td><span className="inline-flex items-center gap-2"><TeamDot cor={x.t.cor} /><b>{x.t.cidade} {x.t.nome}</b></span></td>
              <td className="num">{x.r.v}V {x.r.e}E {x.r.d}D</td>
              <td className="num">{x.r.net > 0 ? `+${x.r.net}` : x.r.net}</td>
              <td className="num">{teamStrength(g, x.t.id)}</td>
              <td className="num highlight-num">{x.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/* ================= NARRATIVAS DA TEMPORADA ================= */
export function StorylinesScreen() {
  const { st } = useGame();
  const g = st.game!;
  const rows = standings(g);
  const top = [...rows].sort((a, b) => (b.v + b.e * 0.5) - (a.v + a.e * 0.5)).slice(0, 3);
  const corridas = ['AFC', 'NFC'].map(conf => {
    const zone = playoffZone(g, conf as Conf);
    const times = rows.filter(r => { const t = teamById(g, r.teamId); return t.conf === conf && zone.has(r.teamId); });
    return { conf, times };
  });

  return (
    <div className="space-y-5">
      <Panel title="Manchetes da semana">
        <ul className="space-y-2 font-mono text-[13px] leading-relaxed">
          {top.map((r, i) => {
            const t = teamById(g, r.teamId);
            return (
              <li key={r.teamId} className="border-l-2 border-gold pl-3">
                <b className="text-goldhi">{i === 0 ? '🔥' : '📰'} {t.cidade} {t.nome}</b>{' '}
                <span className="text-ink">{i === 0 ? 'lidera a liga' : 'segue na briga'} com {r.v} vitórias e saldo {r.net > 0 ? `+${r.net}` : r.net}.</span>
              </li>
            );
          })}
          {g.campeoes.length > 0 && (
            <li className="border-l-2 border-gold pl-3">
              <b className="text-goldhi">🏆 Atual campeão:</b>{' '}
              <span className="text-ink">{teamById(g, g.campeoes[g.campeoes.length - 1].teamId).cidade} {teamById(g, g.campeoes[g.campeoes.length - 1].teamId).nome} ({g.campeoes[g.campeoes.length - 1].temporada})</span>
            </li>
          )}
        </ul>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        {corridas.map(({ conf, times }) => (
          <Panel key={conf} title={`Corrida pelos playoffs — ${conf}`} pad={false}>
            <table className="tbl">
              <thead><tr><th>Seed</th><th>Time</th><th className="num">V</th><th className="num">D</th></tr></thead>
              <tbody>
                {times.map((r, i) => {
                  const t = teamById(g, r.teamId);
                  return (
                    <tr key={r.teamId}>
                      <td className="num text-gold">#{i + 1}</td>
                      <td><span className="inline-flex items-center gap-1.5"><TeamDot cor={t.cor} /><b>{t.sigla}</b></span></td>
                      <td className="num font-bold text-grass">{r.v}</td>
                      <td className="num text-blood">{r.d}</td>
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
}
