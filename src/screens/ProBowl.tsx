import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import {
  PROBOWL_POSITIONS, proBowlRoster, votePlayer, voteTeam, fmtVotes,
} from '../game/probowl';
import { teamById } from '../game/season';
import { POS_LABEL } from '../game/data';
import { Panel, PosBadge, TeamCrest } from '../components/ui';
import type { Pos, ProBowlVote } from '../game/types';

const medalCls = (rank: number) =>
  rank === 1 ? 'medal-1' : rank === 2 ? 'medal-2' : rank === 3 ? 'medal-3' : '';

function Trophy({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="var(--color-goldhi)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 4 H16 V9 a4 4 0 0 1 -8 0 Z" fill="rgba(240,180,41,0.18)" />
      <path d="M8 5 H5 a3 3 0 0 0 3 4 M16 5 H19 a3 3 0 0 1 -3 4" />
      <path d="M12 13 V16 M9 20 H15 M10 16 H14 L15 20 H9 Z" fill="rgba(240,180,41,0.12)" />
    </svg>
  );
}

export function ProBowlScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const pb = g.probowl;
  const me = g.userTeam;

  const [pos, setPos] = useState<Pos>('QB');
  const [view, setView] = useState<'votacao' | 'roster'>('votacao');

  const userTeam = teamById(g, me);
  const week = g.settings.fase === 'REG' ? g.settings.semana : pb.lastWeek;
  const totalVotes = useMemo(() => pb.votes.reduce((a, v) => a + v.totalWeighted, 0), [pb.votes]);

  // votos da posição selecionada, ordenados
  const ranked = useMemo(() => {
    const ids = new Set(g.players.filter(p => p.pos === pos && p.teamId).map(p => p.id));
    return pb.votes.filter(v => ids.has(v.playerId)).sort((a, b) => b.totalWeighted - a.totalWeighted);
  }, [pb.votes, g.players, pos]);

  const top10 = ranked.slice(0, 10);
  const userVotedThisWeek = pb.userFanVote?.week === week;

  const roster = useMemo(() => (pb.announced ? proBowlRoster(g) : null), [g, pb.announced]);

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <div className="panel relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07]" style={{ background: 'radial-gradient(600px 200px at 50% 0%, var(--color-gold), transparent 70%)' }} />
        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <Trophy />
          <div>
            <div className="font-disp text-[24px] font-extrabold uppercase leading-none tracking-wide text-goldhi">Pro Bowl {g.settings.temporada}</div>
            <div className="mt-0.5 font-mono text-[12px] text-dim">
              {pb.announced ? 'Roster anunciado — temporada regular encerrada' : week >= 1 ? `Votação aberta · Semana ${week}` : 'Votação abre na semana 1'}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-6">
            <div className="text-right">
              <div className="font-mono text-[11px] uppercase tracking-wider text-faint">Votos totais</div>
              <div className="font-disp text-[22px] font-bold text-ink">{fmtVotes(totalVotes)}</div>
            </div>
            <div className="flex gap-2">
              <button className={`btn btn-sm ${view === 'votacao' ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setView('votacao')}>Votação</button>
              <button className={`btn btn-sm ${view === 'roster' ? 'btn-gold' : 'btn-ghost'}`} disabled={!pb.announced} onClick={() => setView('roster')}>Roster</button>
            </div>
          </div>
        </div>

        {/* status do voto do fã */}
        <div className="relative flex flex-wrap items-center gap-3 border-t border-line px-5 py-2.5 font-mono text-[12px]">
          <span className="text-dim">Seu voto de fã (1 por semana, +2.500 votos):</span>
          {userVotedThisWeek ? (
            <span className="tag border-grass/60 text-grass">✓ Voto computado nesta semana</span>
          ) : pb.announced ? (
            <span className="tag border-line text-faint">Votação encerrada</span>
          ) : (
            <span className="tag border-gold/60 text-gold">disponível — escolha um jogador abaixo</span>
          )}
          <span className="ml-auto text-faint">Fãs 75% · Jogadores 25% · Técnicos 25%</span>
        </div>
      </div>

      {view === 'votacao' ? (
        <>
          {/* seletor de posição */}
          <div className="flex flex-wrap gap-1.5">
            {PROBOWL_POSITIONS.map(p => {
              const count = pb.votes.filter(v => g.players.some(pl => pl.id === v.playerId && pl.pos === p)).length;
              return (
                <button key={p} onClick={() => setPos(p)}
                  className={`btn btn-sm ${pos === p ? 'btn-gold' : 'btn-ghost'}`}
                  title={`${POS_LABEL[p]} — ${count} na votação`}>
                  {p}
                </button>
              );
            })}
          </div>

          {/* top 10 da posição */}
          <Panel
            title={`Top 10 — ${POS_LABEL[pos]} (${pos})`}
            pad={false}
            right={<span className="font-mono text-[11px] text-faint">{ranked.length} votados</span>}
          >
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Rank</th><th>Jogador</th><th>Time</th>
                    <th className="num">Fãs</th><th className="num">Players</th><th className="num">Coaches</th>
                    <th className="num">Total</th><th>Stats (temporada)</th><th />
                  </tr>
                </thead>
                <tbody>
                  {top10.map(v => {
                    const p = votePlayer(g, v)!;
                    const t = voteTeam(g, v);
                    const mine = t?.id === me;
                    const def = ['DL', 'LB', 'CB', 'S'].includes(p.pos);
                    return (
                      <tr key={v.playerId} style={mine ? { background: 'rgba(240,180,41,0.08)' } : undefined}>
                        <td>
                          <span className={`inline-flex h-7 w-7 items-center justify-center border font-disp text-[15px] font-bold ${medalCls(v.rankInPosition) || 'text-dim border-line'}`}>
                            {v.rankInPosition}
                          </span>
                        </td>
                        <td className="max-w-[190px]">
                          <span className="mr-2 inline-flex align-middle"><PosBadge pos={p.pos} /></span>
                          <b>{p.nome}</b>
                          <span className="ml-1.5 font-mono text-[10.5px] text-faint">OVR {p.ovr}</span>
                          {v.momentum && <span className="ml-1.5 text-blood" title="Semana excepcional — bônus de momentum">🔥</span>}
                          {v.isStarter && <span className="tag ml-1.5 border-goldhi/70 text-goldhi">TIT</span>}
                          {v.isReserve && <span className="tag ml-1.5 border-line text-dim">RES</span>}
                        </td>
                        <td>
                          {t && (
                            <span className="flex items-center gap-1.5">
                              <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={16} />
                              <span className={mine ? 'text-goldhi' : ''}>{t.sigla}</span>
                              {mine && <span className="tag border-gold/60 text-gold">SEU</span>}
                            </span>
                          )}
                        </td>
                        <td className="num">{fmtVotes(v.fanVotes)}</td>
                        <td className="num text-dim">{fmtVotes(v.playerVotes)}</td>
                        <td className="num text-dim">{fmtVotes(v.coachVotes)}</td>
                        <td className="num font-bold text-goldhi">{fmtVotes(v.totalWeighted)}</td>
                        <td className="font-mono text-[11.5px] text-dim">
                          {def
                            ? `${p.stats.tackles} tackles, ${p.stats.sacks} sacks, ${p.stats.intDef} INT`
                            : p.pos === 'K'
                              ? `${p.stats.fgM}/${p.stats.fgT} FG`
                              : `${v.summary.yards} jd, ${v.summary.tds} TD${p.pos === 'QB' ? `, rating ${v.summary.rating}` : ''}`}
                        </td>
                        <td>
                          {!pb.announced && !userVotedThisWeek && (
                            <button className="btn btn-sm" onClick={() => dispatch({ type: 'PROBOWL_VOTE', playerId: v.playerId })}>
                              Votar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!top10.length && (
                    <tr><td colSpan={9} className="py-8 text-center text-faint">Nenhum {POS_LABEL[pos]} na votação ainda — simule semanas da temporada regular.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* pódio: top 3 de todas as posições */}
          <div>
            <h2 className="mb-2 font-disp text-[18px] font-bold uppercase tracking-wide text-dim">Líderes por posição</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {PROBOWL_POSITIONS.map(p => {
                const ids = new Set(g.players.filter(pl => pl.pos === p && pl.teamId).map(pl => pl.id));
                const lead = pb.votes.filter(v => ids.has(v.playerId)).sort((a, b) => b.totalWeighted - a.totalWeighted)[0];
                if (!lead) return null;
                const pl = votePlayer(g, lead)!;
                const t = voteTeam(g, lead);
                const mine = t?.id === me;
                return (
                  <button key={p} onClick={() => { setPos(p); setView('votacao'); }}
                    className="group border border-line bg-panel2 p-3 text-left transition-all hover:-translate-y-[2px] hover:border-gold/60">
                    <div className="flex items-center gap-2">
                      <PosBadge pos={p} />
                      <span className="font-disp text-[13px] font-semibold uppercase tracking-wider text-faint">{POS_LABEL[p]}</span>
                      {lead.momentum && <span className="text-blood">🔥</span>}
                    </div>
                    <div className={`mt-1.5 truncate font-disp text-[16px] font-bold ${mine ? 'text-goldhi' : 'text-ink'}`}>{pl.nome}</div>
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-dim">
                      {t && <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={13} />}
                      <span>{t?.sigla}</span>
                      <span className="ml-auto font-bold text-goldhi">{fmtVotes(lead.totalWeighted)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        roster && (
          <div className="grid gap-5 lg:grid-cols-2">
            {([['AFC', roster.afc], ['NFC', roster.nfc]] as const).map(([conf, list]) => (
              <Panel key={conf} title={`Conferência ${conf}`} pad={false}
                right={<span className="font-mono text-[11px] text-faint">{list.length} selecionados</span>}>
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead><tr><th>Pos</th><th>Jogador</th><th>Time</th><th className="num">Votos</th><th>Papel</th></tr></thead>
                    <tbody>
                      {list.map(v => {
                        const p = votePlayer(g, v)!;
                        const t = voteTeam(g, v);
                        const mine = t?.id === me;
                        return (
                          <tr key={v.playerId} style={mine ? { background: 'rgba(240,180,41,0.08)' } : undefined}>
                            <td><PosBadge pos={p.pos} /></td>
                            <td className={mine ? 'text-goldhi' : ''}><b>{p.nome}</b></td>
                            <td>
                              {t && (
                                <span className="flex items-center gap-1.5">
                                  <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={15} />
                                  {t.sigla}{mine && <span className="tag border-gold/60 text-gold">SEU</span>}
                                </span>
                              )}
                            </td>
                            <td className="num font-bold text-goldhi">{fmtVotes(v.totalWeighted)}</td>
                            <td>{v.isStarter ? <span className="tag border-goldhi/70 text-goldhi">Titular</span> : <span className="tag border-line text-dim">Reserva</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            ))}
          </div>
        )
      )}
    </div>
  );
}
