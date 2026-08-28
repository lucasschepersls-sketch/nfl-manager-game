import { useMemo } from 'react';
import { useGame } from '../state/store';
import {
  teamById, playersOf, standings, teamStrength, capUsed, fmtM, crowdPressure,
} from '../game/season';
import { Panel, Bar, SeqBadge, TeamCrest, Icons } from '../components/ui';

export function ClubHomeScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const off = g.settings.fase === 'OFF';

  return (
    <div className="space-y-5">
      {off && (
        <button
          onClick={() => dispatch({ type: 'SCREEN', screen: 'offseason' })}
          className="btn-pulse flex w-full items-center gap-4 border-2 border-gold bg-[rgba(240,180,41,0.1)] px-5 py-3.5 text-left transition-transform hover:-translate-y-[1px]"
          style={{ boxShadow: '5px 5px 0 rgba(0,0,0,0.4)' }}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center border-2 border-gold font-disp text-[18px] font-bold text-goldhi">{g.offPhase ?? 1}</span>
          <span>
            <span className="block font-disp text-[18px] font-extrabold uppercase leading-none tracking-wide text-goldhi">Offseason em andamento — Fase {g.offPhase ?? 1} de 4</span>
            <span className="mt-1 block font-mono text-[11.5px] text-dim">Free Agency → Renovações & Comissão → Draft → Validação. Clique para gerenciar.</span>
          </span>
          <span className="ml-auto font-disp text-[22px] font-bold text-gold">»</span>
        </button>
      )}

      <MatchdayTicket />

      <div className="grid gap-5 lg:grid-cols-3">
        <CapPanel />
        <MoralPanel />
        <MiniStandings />
      </div>

      <Panel title="Central de notícias" pad={false}>
        <div className="max-h-[340px] overflow-y-auto">
          {g.news.slice(0, 30).map(n => (
            <div key={n.id} className="flex gap-3 border-b border-line2 px-4 py-2.5">
              <span className="tag mt-[2px] h-fit shrink-0 border-gold/40 text-gold">{n.rotulo}</span>
              <span className="font-mono text-[12.5px] leading-relaxed text-ink">{n.texto}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MatchdayTicket() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const { fase, semana } = g.settings;
  const off = fase === 'OFF';

  const byeWeek = fase === 'REG' && !g.matches.some(m => m.fase === 'REG' && m.rodada === semana && !m.jogada && (m.casa === g.userTeam || m.fora === g.userTeam));
  const proxima = g.matches.find(m =>
    !m.jogada && m.rodada === semana && m.fase === fase && (m.casa === g.userTeam || m.fora === g.userTeam));
  const oppId = proxima ? (proxima.casa === g.userTeam ? proxima.fora : proxima.casa) : null;
  const opp = oppId ? teamById(g, oppId) : null;
  const emCasa = proxima ? proxima.casa === g.userTeam : false;

  const headline = fase === 'PRE' ? `Semana ${semana} · Pré-temporada`
    : fase === 'REG' ? (byeWeek ? `Semana ${semana}/18 · BYE WEEK` : `Semana ${semana}/18`)
      : fase === 'PO' ? (g.bracket?.[Math.min(semana - 1, g.bracket.length - 1)]?.nome ?? 'Playoffs')
        : 'Janela de offseason';
  const btnLabel = fase === 'PRE' ? `Jogar semana ${semana}`
    : fase === 'REG' ? (byeWeek ? `Simular semana ${semana} (BYE)` : `Jogar semana ${semana}`)
      : fase === 'PO' ? `Simular ${g.bracket?.[Math.min(semana - 1, g.bracket.length - 1)]?.nome ?? 'playoffs'}` : '';

  return (
    <div className="relative overflow-hidden border-2 border-line" style={{ background: 'linear-gradient(180deg, var(--color-panel), var(--color-pitcho))', boxShadow: '6px 6px 0 rgba(0,0,0,0.4)' }}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ background: `repeating-linear-gradient(90deg, ${t.cor} 0 3px, transparent 3px 90px)` }} />
      <div className="relative flex flex-wrap items-center gap-x-8 gap-y-4 px-6 py-5">
        <div>
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.3em] text-gold">{headline}</div>
          {opp ? (
            <div className="mt-2 flex items-center gap-4">
              <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={44} />
              <span className="font-disp text-[34px] font-black uppercase leading-none">{t.sigla}</span>
              <span className="font-disp text-[24px] font-bold text-gold">×</span>
              <span className="font-disp text-[34px] font-black uppercase leading-none">{opp.sigla}</span>
              <TeamCrest cor={opp.cor} cor2={opp.cor2} sigla={opp.sigla} conf={opp.conf} size={44} />
              <span className={`tag ml-2 ${emCasa ? 'border-grass/60 text-grass' : 'border-ice/60 text-ice'}`}>{emCasa ? 'EM CASA' : 'FORA'}</span>
            </div>
          ) : (
            <div className="mt-2 font-disp text-[26px] font-bold uppercase text-dim">
              {off ? 'Sem jogos — época de Draft e Free Agency' : byeWeek ? 'Semana de folga — o elenco descansa' : 'Sem adversário definido'}
            </div>
          )}
          <div className="mt-2 font-mono text-[12px] text-dim">
            {opp
              ? <>{emCasa ? t.estadioNome : opp.estadioNome} · pressão da torcida {crowdPressure(emCasa ? t : opp)}/100 · força {teamStrength(g, opp.id)}</>
              : off ? 'Ajuste elenco, contratos e comissão técnica.' : 'Lesionados recuperam 1 semana extra no bye.'}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {opp && (
            <div className="font-mono text-[12px] text-dim">
              <div className="mb-1">força {t.sigla} <b className="text-ink">{teamStrength(g, t.id)}</b></div>
              <Bar pct={teamStrength(g, t.id)} color={t.cor} />
            </div>
          )}
          {!off && (
            <button className="btn btn-gold btn-pulse text-[17px]" onClick={() => dispatch({ type: 'CONTINUE' })}>
              <span className="text-[#241a02]">{Icons.play}</span> {btnLabel} »
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CapPanel() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const folha = capUsed(g, t.id);
  const pct = (folha / g.settings.cap) * 100;
  return (
    <Panel title="Salary Cap" right={<span className="font-mono text-[11px] text-faint">{pct.toFixed(0)}% usado</span>}>
      <div className="flex items-baseline gap-2">
        <span className={`font-disp text-[36px] font-black leading-none ${folha > g.settings.cap ? 'text-blood' : 'text-ink'}`}>{fmtM(folha)}</span>
        <span className="font-mono text-[12px] text-faint">/ {fmtM(g.settings.cap)}</span>
      </div>
      <div className="rbar mt-3"><i style={{ width: `${Math.min(100, pct)}%`, ['--rbar' as string]: pct > 100 ? 'var(--color-blood)' : pct > 88 ? 'var(--color-gold)' : 'var(--color-grass)' } as React.CSSProperties} /></div>
      <dl className="mt-3 space-y-1.5 font-mono text-[12px] text-dim">
        <div className="flex justify-between"><span>Espaço livre</span><b className={folha > g.settings.cap ? 'text-blood' : 'text-grass'}>{fmtM(Math.round((g.settings.cap - folha) * 10) / 10)}</b></div>
        <div className="flex justify-between"><span>Caixa do clube</span><b className="text-goldhi">${t.dinheiro}M</b></div>
        <div className="flex justify-between"><span>Projeção cap {g.settings.temporada + 1}</span><b className="text-ink">{fmtM(Math.round(g.settings.cap * (1 + g.settings.tvGrowth / 100)))}</b></div>
      </dl>
      {folha > g.settings.cap && (
        <div className="mt-3 border border-blood/50 bg-[rgba(226,87,75,0.08)] px-2.5 py-2 font-mono text-[11.5px] text-blood">
          ⚠ Acima do teto — a liga multa e proíbe contratações. Dispense contratos no Elenco.
        </div>
      )}
    </Panel>
  );
}

function MoralPanel() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const dm = playersOf(g, t.id).filter(p => p.lesao > 0).length;
  const expirando = playersOf(g, t.id).filter(p => p.contrato === 1 && p.status !== 'PS').length;
  const selo = t.moral >= 75 ? ['EXCELENTE', 'var(--color-grass)'] : t.moral >= 55 ? ['BOA', 'var(--color-grass)'] : t.moral >= 40 ? ['REGULAR', 'var(--color-gold)'] : ['CRÍTICA', 'var(--color-blood)'];
  return (
    <Panel title="Moral do time">
      <div className="flex items-baseline gap-3">
        <span className="font-disp text-[36px] font-black leading-none" style={{ color: selo[1] as string }}>{Math.round(t.moral)}</span>
        <span className="tag" style={{ borderColor: selo[1] as string, color: selo[1] as string }}>{selo[0]}</span>
      </div>
      <div className="rbar mt-3"><i style={{ width: `${t.moral}%`, ['--rbar' as string]: selo[1] as string } as React.CSSProperties} /></div>
      <dl className="mt-3 space-y-1.5 font-mono text-[12px] text-dim">
        <div className="flex justify-between"><span>Pressão da torcida (casa)</span><b className={crowdPressure(t) >= 80 ? 'text-blood' : 'text-ink'}>{crowdPressure(t)}/100</b></div>
        <div className="flex justify-between"><span>Lesionados no DM</span><b className={dm ? 'text-blood' : 'text-ink'}>{dm}</b></div>
        <div className="flex justify-between"><span>Contratos a vencer</span><b className={expirando ? 'text-goldhi' : 'text-ink'}>{expirando}</b></div>
      </dl>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-faint">
        Moral alta soma bônus de ataque e defesa na engine; vitórias elevam, derrotas derrubam.
      </p>
    </Panel>
  );
}

function MiniStandings() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const rows = standings(g)
    .filter(r => teamById(g, r.teamId).conf === t.conf)
    .sort((a, b) => (b.v + b.e * 0.5) - (a.v + a.e * 0.5) || b.net - a.net)
    .slice(0, 8);
  return (
    <Panel title={`${t.conf} — G8 (playoffs)`} pad={false}>
      <table className="tbl">
        <thead><tr><th /><th>Clube</th><th className="num">V</th><th className="num">D</th><th>Últ.5</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const tt = teamById(g, r.teamId);
            const me = r.teamId === g.userTeam;
            return (
              <tr key={r.teamId} style={me ? { background: 'rgba(240,180,41,0.07)' } : undefined}>
                <td className="w-7 font-mono text-[11px] text-gold">#{i + 1}</td>
                <td className="max-w-[130px]"><TeamCrest cor={tt.cor} cor2={tt.cor2} sigla={tt.sigla} conf={tt.conf} size={15} /> <b>{tt.sigla}</b></td>
                <td className="num">{r.v}</td>
                <td className="num">{r.d}</td>
                <td><SeqBadge seq={r.seq} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
