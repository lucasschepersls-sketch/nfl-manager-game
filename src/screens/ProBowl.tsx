import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { PROBOWL_POSITIONS, voteTeam, votePlayer, fmtVotes, proBowlRoster } from '../game/probowl';
import { Panel, PosBadge, Ovr, TeamDot } from '../components/ui';
import type { Pos } from '../game/types';

export function ProBowlScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const [pos, setPos] = useState<Pos>('QB');

  const votes = useMemo(() =>
    g.probowl.votes
      .map(v => ({ v, p: votePlayer(g, v), t: voteTeam(g, v) }))
      .filter(x => x.p && x.p.pos === pos)
      .sort((a, b) => b.v.totalWeighted - a.v.totalWeighted),
    [g, pos]);

  const roster = useMemo(() => g.probowl.announced ? proBowlRoster(g) : null, [g]);
  const canVote = !g.probowl.announced && g.settings.fase === 'REG';
  const alreadyVoted = g.probowl.userFanVote?.week === g.settings.semana;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-disp text-[26px] font-extrabold uppercase tracking-wide">🏆 Votação Pro Bowl {g.settings.temporada}</h2>
          <p className="font-mono text-[11.5px] text-faint">Fãs 75% · Jogadores 25% · Técnicos 25% {canVote ? `· Semana ${g.settings.semana}` : ''}</p>
        </div>
        {g.probowl.announced && <span className="tag border-gold/60 text-gold">ROSTER ANUNCIADO</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PROBOWL_POSITIONS.map(p2 => (
          <button key={p2} className={`btn btn-sm ${pos === p2 ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setPos(p2)}>{p2}</button>
        ))}
      </div>

      {roster ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {([['AFC', roster.afc], ['NFC', roster.nfc]] as const).map(([conf, list]) => (
            <Panel key={conf} title={`Seleção ${conf}`} pad={false}>
              <table className="tbl">
                <thead><tr><th>POS</th><th>Jogador</th><th>Time</th><th className="num">Votos</th><th>Tipo</th></tr></thead>
                <tbody>
                  {list.map(x => {
                    const p = votePlayer(g, x)!; const t = voteTeam(g, x);
                    return (
                      <tr key={x.playerId}>
                        <td><PosBadge pos={p.pos} /></td>
                        <td>{p.nome}</td>
                        <td>{t && <span className="inline-flex items-center gap-1.5"><TeamDot cor={t.cor} />{t.sigla}</span>}</td>
                        <td className="num text-goldhi">{fmtVotes(x.totalWeighted)}</td>
                        <td>{x.isStarter ? <span className="tag border-gold/60 text-gold">TITULAR</span> : <span className="tag border-line text-dim">RESERVA</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel title={`Top 10 — ${pos}`} pad={false}>
          <table className="tbl">
            <thead><tr><th>#</th><th>Jogador</th><th>Time</th><th className="num">OVR</th><th className="num">Fãs</th><th className="num">Jog.</th><th className="num">Téc.</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {votes.slice(0, 10).map((x, i) => (
                <tr key={x.v.playerId}>
                  <td className={`num font-bold ${i < 3 ? 'medal-' + (i + 1) : 'text-faint'}`}>{i + 1}</td>
                  <td>{x.p!.nome}{x.v.momentum && <span className="tag ml-2 border-gold/60 text-gold" title="Semana excepcional (bônus aplicado)">🔥</span>}</td>
                  <td>{x.t && <span className="inline-flex items-center gap-1.5"><TeamDot cor={x.t.cor} />{x.t.sigla}</span>}</td>
                  <td className="num"><Ovr v={x.p!.ovr} /></td>
                  <td className="num">{fmtVotes(x.v.fanVotes)}</td>
                  <td className="num">{fmtVotes(x.v.playerVotes)}</td>
                  <td className="num">{fmtVotes(x.v.coachVotes)}</td>
                  <td className="num highlight-num">{fmtVotes(x.v.totalWeighted)}</td>
                  <td>
                    {canVote && (
                      <button className="btn btn-sm btn-gold" disabled={alreadyVoted}
                        title={alreadyVoted ? 'Você já votou nesta semana' : 'Seu voto de fã (+2.500)'}
                        onClick={() => dispatch({ type: 'PROBOWL_VOTE', playerId: x.v.playerId })}>
                        {alreadyVoted ? 'Votou ✓' : '🗳️ Votar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!votes.length && <tr><td colSpan={9} className="py-6 text-center text-faint">Sem votos registrados ainda — a votação começa na temporada regular.</td></tr>}
            </tbody>
          </table>
        </Panel>
      )}

      {!roster && (
        <Panel title="Sistema de votação">
          <p className="font-mono text-[12px] leading-relaxed text-dim">
            Os votos acumulam a cada semana da temporada regular com base em performance (40%), estatísticas da temporada (35%),
            rating (15%) e reputação (10%). Semanas excepcionais dão bônus de momentum (+25%). No fim, o líder de cada posição
            por conferência é titular e os 3 seguintes de cada posição ofensiva/defensiva são reservas.
          </p>
        </Panel>
      )}
    </div>
  );
}
