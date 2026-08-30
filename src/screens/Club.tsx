import { useGame } from '../state/store';
import {
  teamById, playersOf, standings, conferenceSeeds, capUsed, teamStrength,
  crowdPressure, fmtM, playoffZone,
} from '../game/season';
import { Panel, TeamCrest, Bar, SeqBadge } from '../components/ui';

export function ClubHomeScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const { fase, semana, temporada, cap, tvGrowth, tvDeal, inflacao } = g.settings;
  const capAtual = capUsed(g, g.userTeam);
  const over = capAtual > cap;

  const proxima = g.matches.find(m =>
    !m.jogada && m.rodada === semana && m.fase === fase && (m.casa === g.userTeam || m.fora === g.userTeam));
  const proximoPO = fase === 'PO' && g.bracket
    ? g.bracket[Math.min(semana - 1, g.bracket.length - 1)]?.jogos.find(j => (j.casa === g.userTeam || j.fora === g.userTeam) && !j.jogada)
    : null;
  const oppId = proxima ? (proxima.casa === g.userTeam ? proxima.fora : proxima.casa)
    : proximoPO ? (proximoPO.casa === g.userTeam ? proximoPO.fora : proximoPO.casa) : null;
  const opp = oppId ? teamById(g, oppId) : null;
  const emCasa = proxima ? proxima.casa === g.userTeam : proximoPO ? proximoPO.casa === g.userTeam : false;

  const st_ = standings(g);
  const minha = st_.find(r => r.teamId === g.userTeam)!;
  const confTeams = st_.filter(r => teamById(g, r.teamId).conf === t.conf)
    .sort((a, b) => (b.v + b.e * 0.5) - (a.v + a.e * 0.5) || b.net - a.net);
  const rank = confTeams.findIndex(r => r.teamId === g.userTeam) + 1;
  const inZone = playoffZone(g, t.conf).has(g.userTeam);

  const capPct = (capAtual / cap) * 100;
  const capProximo = Math.round(cap * (1 + tvGrowth / 100));

  return (
    <div className="space-y-5">
      {/* bilhete de rodada */}
      <div className="panel relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]" style={{ background: `repeating-linear-gradient(90deg, ${t.cor} 0 2px, transparent 2px 110px)` }} />
        <div className="relative flex flex-wrap items-center gap-6 px-6 py-5">
          <div>
            <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.25em] text-faint">
              {fase === 'PRE' ? `Pré-temporada · Semana ${semana}`
                : fase === 'REG' ? `Temporada regular · Semana ${semana}/18`
                  : fase === 'PO' ? (g.bracket?.[Math.min(semana - 1, g.bracket.length - 1)]?.nome ?? 'Playoffs')
                    : 'Janela de offseason'}
            </div>
            {opp ? (
              <div className="mt-2 flex items-center gap-4">
                <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={42} />
                <span className="font-disp text-[30px] font-extrabold uppercase">{t.sigla}</span>
                <span className="font-disp text-[22px] font-bold text-gold">×</span>
                <span className="font-disp text-[30px] font-extrabold uppercase">{opp.sigla}</span>
                <TeamCrest cor={opp.cor} cor2={opp.cor2} sigla={opp.sigla} conf={opp.conf} size={42} />
                <span className={`tag ml-2 ${emCasa ? 'border-grass/60 text-grass' : 'border-ice/60 text-ice'}`}>{emCasa ? 'CASA' : 'FORA'}</span>
              </div>
            ) : (
              <div className="mt-2 font-disp text-[26px] font-bold uppercase text-dim">
                {fase === 'OFF' ? 'Sem jogos — época de Draft e Free Agency' : 'Sem adversário definido'}
              </div>
            )}
          </div>
          <div className="ml-auto">
            {fase !== 'OFF' ? (
              <button className="btn btn-gold btn-pulse text-[17px]" onClick={() => dispatch({ type: 'CONTINUE' })}>
                {fase === 'PRE' ? `Jogar semana ${semana}` : fase === 'REG' ? `Jogar semana ${semana}` : 'Simular rodada'} »
              </button>
            ) : (
              <button className="btn btn-gold" onClick={() => dispatch({ type: 'SCREEN', screen: 'offseason' })}>
                Offseason · Fase {g.offPhase ?? 1}/4 »
              </button>
            )}
          </div>
        </div>
        {opp && (
          <div className="relative grid grid-cols-2 gap-4 border-t border-line px-6 py-3 font-mono text-[12px] text-dim">
            <div>
              <div className="mb-1 flex justify-between"><span>{t.sigla} força</span><b className="text-ink">{teamStrength(g, t.id)}</b></div>
              <Bar pct={teamStrength(g, t.id)} color={t.cor} />
            </div>
            <div>
              <div className="mb-1 flex justify-between"><span>{opp.sigla} força</span><b className="text-ink">{teamStrength(g, opp.id)}</b></div>
              <Bar pct={teamStrength(g, opp.id)} color={opp.cor} />
            </div>
          </div>
        )}
      </div>

      {/* cartões de indicadores */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="panel px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Caixa</div>
          <div className="mt-1 font-mono text-[20px] font-bold tabular-nums" style={{ color: t.dinheiro < 0 ? 'var(--color-blood)' : 'var(--color-goldhi)' }}>${t.dinheiro}M</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Folha / Cap</div>
          <div className="mt-1 font-mono text-[20px] font-bold tabular-nums" style={{ color: over ? 'var(--color-blood)' : 'var(--color-ink)' }}>
            {capAtual.toFixed(0)}/{cap}
          </div>
        </div>
        <div className="panel px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Campanha</div>
          <div className="mt-1 font-mono text-[20px] font-bold tabular-nums text-ink">{minha.v}V {minha.e}E {minha.d}D</div>
        </div>
        <div className="panel px-4 py-3">
          <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.18em] text-faint">Posição conf.</div>
          <div className="mt-1 font-mono text-[20px] font-bold tabular-nums" style={{ color: inZone ? 'var(--color-grass)' : 'var(--color-dim)' }}>
            {rank}º {inZone ? '(G7)' : ''}
          </div>
        </div>
      </div>

      {/* 💰 ECONOMIA / INFLAÇÃO */}
      <Panel
        title="💰 Economia da Liga — Inflação"
        right={<span className="tag border-gold/60 text-gold">TV +{tvGrowth.toFixed(1).replace('.', ',')}%/ano</span>}
      >
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
            <div className="font-mono text-[11px] uppercase tracking-wider text-faint">Cap {temporada}</div>
            <div className="mt-0.5 font-disp text-[22px] font-bold text-ink">{fmtM(cap)}</div>
          </div>
          <div className="border border-line2 bg-panel2 px-3.5 py-2.5">
            <div className="font-mono text-[11px] uppercase tracking-wider text-faint">Cap projetado {temporada + 1}</div>
            <div className="mt-0.5 font-disp text-[22px] font-bold text-ice">{fmtM(capProximo)}</div>
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between font-mono text-[12px] text-dim">
            <span>Uso do cap {fmtM(capAtual)} {over ? '— ACIMA DO TETO!' : ''}</span>
            <span>{capPct.toFixed(0)}%</span>
          </div>
          <Bar pct={capPct} h={12} color={capPct > 100 ? 'var(--color-blood)' : capPct > 88 ? 'var(--color-gold)' : 'var(--color-grass)'} />
        </div>
        <p className="mt-3 font-mono text-[11.5px] leading-relaxed text-faint">
          A cada temporada o cap cresce com a receita de TV ({tvGrowth.toFixed(1).replace('.', ',')}% projetado). Salários pedidos por free agents e
          renovações escalam junto com a inflação — times com pouco espaço sofrem para renovar estrelas.
        </p>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <MiniStandings />
        <Panel title="Central de notícias" pad={false}>
          <div className="max-h-[340px] overflow-y-auto">
            {g.news.slice(0, 20).map(n => (
              <div key={n.id} className="flex gap-3 border-b border-line2 px-4 py-2.5">
                <span className="tag mt-[2px] h-fit shrink-0 border-gold/40 text-gold">{n.rotulo}</span>
                <span className="font-mono text-[12.5px] leading-relaxed text-ink">{n.texto}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function MiniStandings() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const seeds = conferenceSeeds(g, t.conf);
  const seedOf = new Map(seeds.map(x => [x.teamId, x.seed]));
  const rows = standings(g).filter(r => teamById(g, r.teamId).conf === t.conf)
    .sort((a, b) => (b.v + b.e * 0.5) - (a.v + a.e * 0.5) || b.net - a.net).slice(0, 9);
  return (
    <Panel title={`${t.conf} — zona de playoffs (7 vagas)`} pad={false}
      right={<span className="font-mono text-[10px] text-faint">#1 folga no Wild Card</span>}>
      <table className="tbl">
        <thead><tr><th /><th>Clube</th><th className="num">V</th><th className="num">D</th><th className="num">+/−</th><th>Últ.5</th></tr></thead>
        <tbody>
          {rows.map(r => {
            const tt = teamById(g, r.teamId);
            const sd = seedOf.get(r.teamId);
            const me = r.teamId === g.userTeam;
            const cut = sd === 7;
            return (
              <tr key={r.teamId} style={{
                background: me ? 'rgba(240,180,41,0.07)' : undefined,
                borderBottom: cut ? '2px dashed var(--color-gold)' : undefined,
                opacity: sd ? 1 : 0.45,
              }}>
                <td className="w-7 font-mono text-[11px] text-gold">{sd ? `#${sd}` : '—'}</td>
                <td>
                  <span className="mr-1.5 inline-flex align-middle"><TeamCrest cor={tt.cor} cor2={tt.cor2} sigla={tt.sigla} conf={tt.conf} size={15} /></span>
                  {tt.cidade} <b>{tt.nome}</b>
                </td>
                <td className="num">{r.v}</td>
                <td className="num">{r.d}</td>
                <td className="num">{r.net > 0 ? `+${r.net}` : r.net}</td>
                <td><SeqBadge seq={r.seq} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
