import { useGame } from '../state/store';
import {
  teamById, playersOf, capUsed, capHitOf, teamStrength, standings, validateRoster, fmtM,
} from '../game/season';
import { teamStage, teamChemistry, STAGE_ZONES, chemistryLabel } from '../game/franchise';
import { TeamCrest, Bar, Panel, PosBadge, Ovr } from '../components/ui';
import type { GameState, Team } from '../game/types';

function StatChip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border border-line bg-panel2 px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{label}</div>
      <div className="mt-0.5 font-disp text-[22px] font-extrabold leading-none" style={{ color: tone ?? 'var(--color-ink)' }}>{value}</div>
    </div>
  );
}

export function ClubHomeScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const { fase, semana, temporada } = g.settings;

  const roster = playersOf(g, g.userTeam);
  const ativos = roster.filter(p => p.status !== 'PS');
  const cap = capUsed(g, g.userTeam);
  const forca = teamStrength(g, g.userTeam);
  const stage = teamStage(g, g.userTeam);
  const chem = teamChemistry(g, g.userTeam);
  const linha = standings(g).find(r => r.teamId === g.userTeam);
  const lesionados = roster.filter(p => p.lesao > 0);
  const chk = validateRoster(g);

  const proximo = g.matches.find(m =>
    !m.jogada && m.fase === fase && m.rodada === semana &&
    (m.casa === g.userTeam || m.fora === g.userTeam));
  const oppId = proximo ? (proximo.casa === g.userTeam ? proximo.fora : proximo.casa) : null;
  const opp = oppId ? teamById(g, oppId) : null;
  const emCasa = proximo ? proximo.casa === g.userTeam : false;

  // nome da rodada atual nos playoffs (Wild Card, Divisional, etc.)
  const roundNome = fase === 'PO' && g.bracket ? g.bracket[semana - 1]?.nome : null;
  // usuário eliminado: está nos playoffs mas não tem nenhum jogo futuro no bracket
  const temJogoFuturo = g.bracket?.some(round => round.jogos.some(j =>
    !j.jogada && (j.casa === g.userTeam || j.fora === g.userTeam))) ?? false;
  const eliminado = fase === 'PO' && !temJogoFuturo;

  return (
    <div className="space-y-5">
      {/* banner da franquia */}
      <div className="relative overflow-hidden border border-line bg-panel">
        <div className="absolute inset-0 opacity-[0.06]" style={{ background: `repeating-linear-gradient(90deg, ${t.cor} 0 2px, transparent 2px 110px)` }} />
        <div className="relative flex flex-wrap items-center gap-5 px-5 py-4">
          <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={64} />
          <div>
            <div className="font-disp text-[30px] font-extrabold uppercase leading-none">{t.cidade} <span className="text-goldhi">{t.nome}</span></div>
            <div className="mt-1 font-mono text-[11.5px] uppercase tracking-[0.2em] text-faint">{t.estadioNome} · Força {forca}</div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {!chk.ok && (
              <button className="btn btn-danger btn-sm" onClick={() => dispatch({ type: 'SCREEN', screen: 'offseason' })}
                title={chk.erros.join('\n')}>
                ⚠ {chk.erros.length} pendência{chk.erros.length > 1 ? 's' : ''}
              </button>
            )}
            {fase !== 'OFF' && (
              <button className="btn btn-gold btn-pulse" onClick={() => dispatch({ type: 'CONTINUE' })}>
                {fase === 'PO' && roundNome ? `${roundNome} »` : `Jogar Semana ${semana} »`}
              </button>
            )}
            {fase === 'OFF' && (
              <button className="btn btn-gold btn-pulse" onClick={() => dispatch({ type: 'SCREEN', screen: 'offseason' })}>
                Offseason · Fase {g.offPhase ?? 1}/4 »
              </button>
            )}
          </div>
        </div>
      </div>

      {/* chips */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatChip label="Campanha" value={linha ? `${linha.v}V ${linha.e}E ${linha.d}D` : '—'} />
        <StatChip label="Caixa" value={`$${t.dinheiro}M`} tone="var(--color-goldhi)" />
        <StatChip label="Elenco" value={`${ativos.length}/53`} tone={ativos.length === 53 ? 'var(--color-grass)' : 'var(--color-blood)'} />
        <StatChip label="Lesionados" value={String(lesionados.length)} tone={lesionados.length ? 'var(--color-blood)' : undefined} />
        <StatChip label="Temporada" value={String(temporada)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* próximo jogo / reta final dos playoffs */}
        {eliminado ? (
          <PlayoffTracker g={g} className="lg:col-span-2" />
        ) : (
        <Panel title="Próximo compromisso" className="lg:col-span-2">
          {opp && proximo ? (
            <div className="flex items-center gap-5">
              <div className="flex flex-col items-center gap-1">
                <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={54} />
                <span className="font-disp text-[15px] font-bold uppercase">{t.sigla}</span>
              </div>
              <div className="flex-1 text-center">
                <div className="font-disp text-[24px] font-extrabold uppercase text-goldhi">vs</div>
                <div className="font-mono text-[12px] text-dim">
                  {fase === 'PO' && roundNome ? roundNome : `Semana ${semana}`} · {emCasa ? 'Em casa' : 'Fora'}
                </div>
                <div className="mt-1 font-mono text-[11px] text-faint">
                  Força {opp ? teamStrength(g, opp.id) : '—'}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <TeamCrest cor={opp.cor} cor2={opp.cor2} sigla={opp.sigla} conf={opp.conf} size={54} />
                <span className="font-disp text-[15px] font-bold uppercase">{opp.sigla}</span>
              </div>
            </div>
          ) : (
            <p className="font-mono text-[13px] text-dim">
              {fase === 'OFF' ? 'Sem jogos — janela de offseason (draft, free agency e validação).' : 'Sem adversário definido para esta semana.'}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Folha / Cap</span><b className="text-ink">{fmtM(cap)} / {fmtM(g.settings.cap)}</b></div>
              <Bar pct={(cap / g.settings.cap) * 100} color={cap > g.settings.cap ? 'var(--color-blood)' : cap / g.settings.cap > 0.9 ? 'var(--color-gold)' : 'var(--color-grass)'} />
            </div>
            <div>
              <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Moral do time</span><b className="text-ink">{t.moral}</b></div>
              <Bar pct={t.moral} color="var(--color-grass)" />
            </div>
          </div>
        </Panel>
        )}

        {/* momento + química */}
        <Panel title="Momento da franquia">
          <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Estágio</span><b className="text-ink">{stage.score}/100</b></div>
          <Bar pct={stage.score} color={stage.score >= 75 ? 'var(--color-goldhi)' : stage.score >= 40 ? 'var(--color-grass)' : 'var(--color-ice)'} />
          <div className="mt-1 font-disp text-[16px] font-bold uppercase text-gold">{stage.label}</div>

          <div className="mt-3 mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Química</span><b className="text-ink">{chem.score}/100</b></div>
          <Bar pct={chem.score} color="var(--color-grass)" />
          <div className="mt-1 font-mono text-[11px] text-faint">{chemistryLabel(chem.score)} · QB–WR1: {chem.qbLink} ano{chem.qbLink === 1 ? '' : 's'}</div>

          <div className="mt-3 border-t border-line2 pt-2 font-mono text-[10.5px] text-faint">
            {STAGE_ZONES.map(z => z.nome).join(' · ')}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* top jogadores */}
        <Panel title="Estrelas do elenco" pad={false}>
          <table className="tbl">
            <thead><tr><th>POS</th><th>Jogador</th><th className="num">Idade</th><th className="num">OVR</th><th className="num">Salário</th></tr></thead>
            <tbody>
              {[...ativos].sort((a, b) => b.ovr - a.ovr).slice(0, 7).map(p => (
                <tr key={p.id}>
                  <td><PosBadge pos={p.pos} /></td>
                  <td>{p.nome}{p.lesao > 0 && <span className="tag ml-2 border-blood/60 text-blood">DM {p.lesao}sem</span>}</td>
                  <td className="num">{p.idade}</td>
                  <td className="num"><Ovr v={p.ovr} /></td>
                  <td className="num text-goldhi">{fmtM(capHitOf(p))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* notícias */}
        <Panel title="Central de notícias" pad={false}>
          <div className="max-h-[330px] overflow-y-auto">
            {g.news.slice(0, 20).map(n => (
              <div key={n.id} className="flex gap-3 border-b border-line2 px-4 py-2.5">
                <span className="tag mt-[2px] h-fit shrink-0 border-gold/40 text-gold">{n.rotulo}</span>
                <span className="font-mono text-[12px] leading-relaxed text-ink">{n.texto}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============ Rastreador de playoffs (quando o usuário é eliminado) ============ */
function MatchupRow({ team, score, win, played, isChamp }: { team: Team; score: number | null; win: boolean; played: boolean; isChamp: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 ${win ? 'bg-[rgba(62,207,122,0.10)]' : ''} ${isChamp ? 'bg-[rgba(240,180,41,0.12)]' : ''}`}>
      <TeamCrest cor={team.cor} cor2={team.cor2} sigla={team.sigla} conf={team.conf} size={20} />
      <span className={`flex-1 truncate font-mono text-[12px] ${win ? 'font-bold text-grass' : played ? 'text-dim' : 'text-ink'}`}>
        {team.sigla}
      </span>
      {isChamp && <span className="text-[13px]">🏆</span>}
      {played && <span className={`font-disp text-[15px] font-bold ${win ? 'text-grass' : 'text-faint'}`}>{score}</span>}
    </div>
  );
}

function PlayoffTracker({ g, className }: { g: GameState; className?: string }) {
  const champ = g.campeoes[g.campeoes.length - 1];
  const champTeam = champ ? teamById(g, champ.teamId) : null;
  return (
    <Panel title="Eliminado — acompanhe a reta final" className={className}>
      <p className="mb-3 font-mono text-[12px] text-dim">
        Sua campanha terminou, mas a disputa pelo anel continua. Simule as semanas para ver quem avança até o Super Bowl.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {g.bracket?.map(round => (
          <div key={round.nome}>
            <div className="mb-2 border-b border-line2 pb-1 font-disp text-[13px] font-bold uppercase tracking-wider text-goldhi">{round.nome}</div>
            <div className="space-y-2.5">
              {round.jogos.map((j, i) => {
                const c = teamById(g, j.casa); const f = teamById(g, j.fora);
                const winC = j.jogada && (j.pc ?? 0) > (j.pf ?? 0);
                const winF = j.jogada && (j.pf ?? 0) > (j.pc ?? 0);
                const champC = !!champTeam && champTeam.id === c.id && round.nome === 'Super Bowl';
                const champF = !!champTeam && champTeam.id === f.id && round.nome === 'Super Bowl';
                return (
                  <div key={i} className="divide-y divide-line2 border border-line2 bg-panel2">
                    <MatchupRow team={c} score={j.pc} win={winC} played={j.jogada} isChamp={champC} />
                    <MatchupRow team={f} score={j.pf} win={winF} played={j.jogada} isChamp={champF} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {champTeam && (
        <div className="mt-4 border border-gold/50 bg-[rgba(240,180,41,0.08)] p-3 text-center">
          <span className="font-disp text-[15px] font-bold uppercase text-goldhi">
            🏆 {champTeam.cidade} {champTeam.nome} — campeão da temporada {g.settings.temporada}
          </span>
        </div>
      )}
    </Panel>
  );
}
