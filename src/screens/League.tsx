import { useState, type ReactNode } from 'react';
import { useGame } from '../state/store';
import {
  teamById, standings, divisionTable, conferenceSeeds, capUsed, fmtM, teamStrength,
  playersOf, UPGRADE_COST, conferenceOrder, generatePlayoffBracket,
} from '../game/season';
import { fmtPct, DIVISION_CRITERIA_LABELS, CONFERENCE_CRITERIA_LABELS } from '../game/tiebreakers';
import { CONF_LABEL, DIV_NAMES } from '../game/data';
import type { Conf, Player, PowerRankingEntry } from '../game/types';
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

export function RivalriesScreen() {
  const { st } = useGame();
  const g = st.game!;
  const rivalries = [...g.rivalries].sort((a, b) => b.intensity - a.intensity);
  return (
    <div className="space-y-5">
      <Panel title="Rivalidades da liga" right={<span className="font-mono text-[12px] text-dim">{rivalries.length} confrontos monitorados</span>} pad={false}>
        {rivalries.length === 0 ? (
          <div className="px-5 py-10 text-center font-mono text-[12.5px] text-faint">Nenhuma rivalidade registrada.</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Confronto</th><th>Histórico</th><th className="num">Intensidade</th><th className="num">Jogos</th><th className="num">Campanha</th></tr></thead>
            <tbody>{rivalries.map(r => {
              const one = teamById(g, r.team1Id); const two = teamById(g, r.team2Id);
              return <tr key={`${r.team1Id}-${r.team2Id}`}>
                <td><b>{one.sigla}</b> <span className="text-gold">×</span> <b>{two.sigla}</b><span className="ml-2 text-dim">{one.nome} · {two.nome}</span></td>
                <td className="text-dim">{r.history}</td>
                <td className="num"><span className="text-blood">{'★'.repeat(Math.min(10, r.intensity))}</span><span className="text-faint">{'★'.repeat(Math.max(0, 10 - r.intensity))}</span></td>
                <td className="num">{r.gamesPlayed}</td>
                <td className="num font-mono text-ink">{r.team1Wins}–{r.team2Wins}{r.draws ? `–${r.draws}` : ''}</td>
              </tr>;
            })}</tbody>
          </table>
        )}
      </Panel>
      <p className="font-mono text-[11.5px] text-faint">Rivalidades divisionais elevam a intensidade, o público e a atenção da mídia. Veteranos respondem melhor à pressão; jogadores jovens podem sentir o peso do clássico.</p>
    </div>
  );
}

export function StorylinesScreen() {
  const { st } = useGame();
  const g = st.game!;
  const stories = g.seasonStorylines;
  return (
    <div className="space-y-5">
      <Panel title="Narrativas da temporada" right={<span className="font-mono text-[12px] text-dim">Semana {g.settings.semana}</span>}>
        {stories.length === 0 ? <div className="py-8 text-center font-mono text-[12.5px] text-faint">A temporada ainda não criou uma narrativa dominante.</div> : <div className="grid gap-3 md:grid-cols-2">{stories.map(story => <article key={story.type} className="border border-line2 bg-panel2 p-4"><div className="flex items-start justify-between gap-3"><h2 className="font-disp text-[18px] font-bold uppercase text-goldhi">{story.description}</h2><span className="tag shrink-0 border-ice/60 text-ice">{story.weeksActive} sem.</span></div><div className="mt-3 flex flex-wrap gap-1.5">{story.affectedTeams.map(teamId => { const team = teamById(g, teamId); return <span key={teamId} className="tag border-line text-dim"><TeamCrest cor={team.cor} cor2={team.cor2} sigla={team.sigla} conf={team.conf} size={15} /> {team.sigla}</span>; })}</div></article>)}</div>}
      </Panel>
      <p className="font-mono text-[11.5px] text-faint">As narrativas são recalculadas semanalmente conforme campanha, estatísticas e desempenho recente.</p>
    </div>
  );
}

const comparePositions: Player['pos'][] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

export function PowerRankingsScreen() {
  const { st } = useGame();
  const g = st.game!;
  const current = [...g.powerRankings].filter(snapshot => snapshot.season === g.settings.temporada).sort((a, b) => b.week - a.week)[0];
  const previous = current ? [...g.powerRankings].find(snapshot => snapshot.season === current.season && snapshot.week === current.week - 1) : undefined;
  const previousRanks = new Map((previous?.entries ?? []).map(entry => [entry.teamId, entry.rank]));
  const entries = current?.entries ?? [];
  return (
    <div className="space-y-5">
      <Panel title="Power Rankings" right={<span className="font-mono text-[12px] text-dim">{current ? `Semana ${current.week}` : 'Aguardando a primeira semana'}</span>} pad={false}>
        {!current ? (
          <div className="px-5 py-10 text-center font-mono text-[12.5px] text-faint">Simule uma semana para publicar o primeiro ranking de poder.</div>
        ) : (
          <table className="tbl">
            <thead><tr><th className="num">#</th><th>Franquia</th><th className="num">Score</th><th className="num">Semana anterior</th><th>Movimento</th></tr></thead>
            <tbody>{entries.map((entry: PowerRankingEntry) => {
              const team = teamById(g, entry.teamId);
              const oldRank = previousRanks.get(entry.teamId);
              const movement = oldRank == null ? null : oldRank - entry.rank;
              return <tr key={entry.teamId} style={entry.teamId === g.userTeam ? { background: 'rgba(240,180,41,0.08)' } : undefined}>
                <td className={`num font-disp text-[20px] font-bold ${entry.rank <= 3 ? 'text-goldhi' : 'text-dim'}`}>{entry.rank}</td>
                <td><span className="mr-2 inline-flex align-middle"><TeamCrest cor={team.cor} cor2={team.cor2} sigla={team.sigla} conf={team.conf} size={24} /></span><b>{team.sigla}</b> <span className="text-dim">{team.cidade} {team.nome}</span></td>
                <td className="num font-mono text-goldhi">{entry.score.toFixed(1)}</td>
                <td className="num font-mono text-dim">{oldRank ?? '—'}</td>
                <td className={movement == null ? 'text-faint' : movement > 0 ? 'text-grass' : movement < 0 ? 'text-blood' : 'text-dim'}>{movement == null ? 'NOVO' : movement > 0 ? `▲ ${movement}` : movement < 0 ? `▼ ${Math.abs(movement)}` : '—'}</td>
              </tr>;
            })}</tbody>
          </table>
        )}

      </Panel>
      <p className="font-mono text-[11.5px] text-faint">O score combina aproveitamento, diferencial de pontos, força do calendário e desempenho nos últimos três jogos.</p>
    </div>
  );
}

export function TeamComparatorScreen() {
  const { st } = useGame();
  const g = st.game!;
  const [leftId, setLeftId] = useState(g.userTeam);
  const [rightId, setRightId] = useState(g.teams.find(t => t.id !== g.userTeam)?.id ?? g.teams[1].id);
  const left = teamById(g, leftId); const right = teamById(g, rightId);
  const leftPlayers = playersOf(g, leftId); const rightPlayers = playersOf(g, rightId);
  const leftStats = g.teamSeasonStats.find(s => s.teamId === leftId);
  const rightStats = g.teamSeasonStats.find(s => s.teamId === rightId);
  const stats = [
    ['Pontos', leftStats?.pointsScored ?? 0, rightStats?.pointsScored ?? 0],
    ['Jardas', leftStats?.totalYards ?? 0, rightStats?.totalYards ?? 0],
    ['Turnovers', leftStats?.turnovers ?? 0, rightStats?.turnovers ?? 0],
  ] as const;
  const rating = (players: Player[], positions: Player['pos'][]) => {
    const group = players.filter(p => positions.includes(p.pos) && p.status !== 'PS');
    return group.length ? Math.round(group.reduce((sum, p) => sum + p.ovr, 0) / group.length) : 0;
  };
  const streak = (teamId: string) => {
    const games = g.matches.filter(m => m.jogada && (m.casa === teamId || m.fora === teamId)).sort((a, b) => b.rodada - a.rodada);
    if (!games.length) return '—';
    const first = games[0]; const home = first.casa === teamId;
    const result = home ? (first.placarCasa! > first.placarFora! ? 'V' : first.placarCasa! < first.placarFora! ? 'D' : 'E') : (first.placarFora! > first.placarCasa! ? 'V' : first.placarFora! < first.placarCasa! ? 'D' : 'E');
    let count = 0;
    for (const game of games) {
      const isHome = game.casa === teamId;
      const current = isHome ? (game.placarCasa! > game.placarFora! ? 'V' : game.placarCasa! < game.placarFora! ? 'D' : 'E') : (game.placarFora! > game.placarCasa! ? 'V' : game.placarFora! < game.placarCasa! ? 'D' : 'E');
      if (current !== result) break;
      count++;
    }
    return `${result}${count}`;
  };
  const rivalry = g.rivalries.find(r => (r.team1Id === leftId && r.team2Id === rightId) || (r.team1Id === rightId && r.team2Id === leftId));
  const comparisonBar = (label: string, a: number, b: number, max = Math.max(a, b, 1)) => (
    <div className="py-2">
      <div className="mb-1 flex justify-between font-mono text-[11px] text-dim"><span>{label}</span><span>{a} <span className="text-faint">×</span> {b}</span></div>
      <div className="flex h-2 gap-1"><i className="bg-gold" style={{ width: `${(a / max) * 50}%` }} /><i className="ml-auto bg-ice" style={{ width: `${(b / max) * 50}%` }} /></div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Panel title="Comparador Head-to-Head" right={<span className="font-mono text-[12px] text-dim">pré-jogo</span>}>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
          <select value={leftId} onChange={e => setLeftId(e.target.value)} className="border border-line bg-panel2 px-2.5 py-2 font-disp text-[15px] font-semibold uppercase text-ink">{g.teams.map(t => <option key={t.id} value={t.id}>{t.sigla} · {t.cidade} {t.nome}</option>)}</select>
          <span className="font-disp text-[20px] font-extrabold text-gold">VS</span>
          <select value={rightId} onChange={e => setRightId(e.target.value)} className="border border-line bg-panel2 px-2.5 py-2 font-disp text-[15px] font-semibold uppercase text-ink">{g.teams.map(t => <option key={t.id} value={t.id}>{t.sigla} · {t.cidade} {t.nome}</option>)}</select>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        {[[left, leftPlayers], [right, rightPlayers]].map(([team, players], index) => {
          const currentTeam = team as typeof left; const currentPlayers = players as Player[];
          return <Panel key={currentTeam.id} title={currentTeam.sigla} right={<TeamCrest cor={currentTeam.cor} cor2={currentTeam.cor2} sigla={currentTeam.sigla} conf={currentTeam.conf} size={34} />}>
            <div className="grid grid-cols-3 gap-2 text-center font-mono text-[11px]"><div><b className="block font-disp text-[26px] text-goldhi">{teamStrength(g, currentTeam.id)}</b>FORÇA</div><div><b className="block font-disp text-[26px] text-ink">{currentTeam.moral}</b>MORAL</div><div><b className="block font-disp text-[26px] text-grass">{streak(currentTeam.id)}</b>STREAK</div></div>
            <div className="mt-3 font-mono text-[11.5px] text-dim">{currentPlayers.filter(p => p.status !== 'PS').length} ativos · {currentPlayers.filter(p => p.lesao > 0).length} lesionados</div>
          </Panel>;
        })}
      </div>

      <Panel title="Ratings médios por unidade">
        {comparisonBar('Ataque', rating(leftPlayers, ['QB', 'RB', 'WR', 'TE', 'OL']), rating(rightPlayers, ['QB', 'RB', 'WR', 'TE', 'OL']))}
        {comparisonBar('Defesa', rating(leftPlayers, ['DL', 'LB', 'CB', 'S']), rating(rightPlayers, ['DL', 'LB', 'CB', 'S']))}
      </Panel>

      <Panel title="Comparativo da temporada" pad={false}>
        <div className="grid gap-2 divide-y divide-line2 px-4 md:grid-cols-3 md:divide-x md:divide-y-0">{stats.map(([label, a, b]) => <div key={label} className="px-3 py-2">{comparisonBar(label, a, b)}</div>)}</div>
      </Panel>

      <Panel title="Matchup por posição" pad={false}>
        <table className="tbl"><thead><tr><th>POS</th><th>{left.sigla}</th><th className="num">OVR</th><th className="text-center">VS</th><th>{right.sigla}</th><th className="num">OVR</th></tr></thead><tbody>{comparePositions.map(pos => { const lp = leftPlayers.filter(p => p.pos === pos && p.status !== 'PS').sort((a, b) => b.ovr - a.ovr)[0]; const rp = rightPlayers.filter(p => p.pos === pos && p.status !== 'PS').sort((a, b) => b.ovr - a.ovr)[0]; return <tr key={pos}><td><b>{pos}</b></td><td>{lp?.nome ?? '—'}</td><td className="num"><Ovr v={lp?.ovr ?? 0} /></td><td className="text-center text-gold">×</td><td>{rp?.nome ?? '—'}</td><td className="num"><Ovr v={rp?.ovr ?? 0} /></td></tr>; })}</tbody></table>
      </Panel>

      <Panel title="Histórico do confronto">
        {rivalry ? <div className="grid grid-cols-3 gap-2 text-center font-mono"><div><b className="block font-disp text-[28px] text-goldhi">{rivalry.team1Id === leftId ? rivalry.team1Wins : rivalry.team2Wins}</b>{left.sigla}</div><div><b className="block font-disp text-[28px] text-dim">{rivalry.draws}</b>EMPATES</div><div><b className="block font-disp text-[28px] text-ice">{rivalry.team1Id === rightId ? rivalry.team1Wins : rivalry.team2Wins}</b>{right.sigla}</div></div> : <p className="font-mono text-[12px] text-faint">Nenhum histórico registrado.</p>}
      </Panel>
    </div>
  );
}

/* ============================ CLASSIFICAÇÃO ============================ */
export function StandingsScreen() {
  const { st } = useGame();
  const g = st.game!;
    const fase = g.settings.fase;
  const temJogo = g.matches.some(m => m.fase === 'REG' && m.jogada);

  return (
    <div className="space-y-6">
      {/* cabeçalho com explicação do sistema de desempate */}
      <div className="border border-line bg-panel px-4 py-3">
        <details className="group">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center gap-3">
              <span className="font-disp text-[18px] font-bold uppercase tracking-wide text-goldhi">⚖️ Sistema oficial de desempate da NFL</span>
              <span className="font-mono text-[11px] text-faint group-open:hidden">clique para ver os critérios ▾</span>
              <span className="font-mono text-[11px] text-faint hidden group-open:inline">clique para fechar ▴</span>
            </div>
          </summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1.5 font-disp text-[13px] font-bold uppercase tracking-wider text-grass">Divisão — 15 critérios (em ordem)</div>
              <ol className="list-decimal space-y-0.5 pl-5 font-mono text-[10.5px] text-dim">
                {DIVISION_CRITERIA_LABELS.map(c => <li key={c}>{c}</li>)}
              </ol>
            </div>
            <div>
              <div className="mb-1.5 font-disp text-[13px] font-bold uppercase tracking-wider text-ice">Conferência (wild cards) — 10 critérios</div>
              <ol className="list-decimal space-y-0.5 pl-5 font-mono text-[10.5px] text-dim">
                {CONFERENCE_CRITERIA_LABELS.map(c => <li key={c}>{c}</li>)}
              </ol>
              <p className="mt-2 border-l-2 border-gold pl-2 font-mono text-[10.5px] text-gold/90">
                Regra de ouro: campeões de divisão (seeds 1–4) SEMPRE ficam à frente dos wild cards (5–7), independente do recorde.
              </p>
            </div>
          </div>
        </details>
      </div>

      {(['AFC', 'NFC'] as Conf[]).map(conf => {
        const confColor = conf === 'AFC' ? 'var(--color-blood)' : 'var(--color-ice)';
        const order = conferenceOrder(g, conf);
        const bracket = temJogo ? generatePlayoffBracket(g, conf) : null;
        return (
          <div key={conf}>
            <div className="mb-2 flex items-baseline gap-3">
              <span className="inline-block h-5 w-1.5" style={{ background: confColor }} />
              <h2 className="font-disp text-[24px] font-bold uppercase tracking-wide">{CONF_LABEL[conf]}</h2>
              <span className="font-mono text-[11.5px] text-faint">7 vagas · 4 campeões de divisão + 3 wild cards · seed #1 folga no Wild Card</span>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
              {/* divisões */}
              <div className="grid gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map(div => (
                  <Panel key={div} title={`Divisão ${DIV_NAMES[div]}`} pad={false}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Clube</th>
                          <th className="num" title="Vitórias-Empates-Derrotas">REC</th>
                          <th className="num" title="% de vitórias (empate vale 0,5)">PCT</th>
                          <th className="num" title="% de vitórias dentro da divisão">DIV</th>
                          <th className="num" title="% de vitórias na conferência">CONF</th>
                          <th className="num" title="Saldo de pontos">+/-</th>
                          <th title="Critério que define a posição em caso de empate — passe o mouse">TB</th>
                        </tr>
                      </thead>
                      <tbody>
                        {divisionTable(g, conf, div).map(r => {
                          const t = teamById(g, r.teamId);
                          const standing = order.find(o => o.teamId === r.teamId);
                          const me = r.teamId === g.userTeam;
                          const champ = standing?.isDivisionChampion;
                          return (
                            <tr key={r.teamId} style={me ? { background: 'rgba(240,180,41,0.07)' } : undefined}>
                              <td className="max-w-[150px]">
                                <span className="mr-1.5 inline-flex align-middle"><TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={14} /></span>
                                <b>{t.sigla}</b>
                                {champ && <span className="ml-1.5 font-mono text-[9px] font-bold text-gold" title="Campeão da divisão">★</span>}
                              </td>
                              <td className="num font-mono text-[12px]">{r.v}-{r.e}-{r.d}</td>
                              <td className="num font-mono text-[12px] font-bold text-grass">{fmtPct(r.winPct ?? 0)}</td>
                              <td className="num font-mono text-[12px]">{fmtPct(r.divPct ?? 0)}</td>
                              <td className="num font-mono text-[12px]">{fmtPct(r.confPct ?? 0)}</td>
                              <td className="num font-mono text-[12px]">{r.net > 0 ? `+${r.net}` : r.net}</td>
                              <td>
                                {r.tiebreakNote ? (
                                  <span className="tb-tip" title={r.tiebreakNote}>ⓘ</span>
                                ) : (
                                  <span className="text-faint">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Panel>
                ))}
              </div>

              {/* playoff picture */}
              <Panel
                title={<span>🏆 Playoff Picture — {conf}</span>}
                pad={false}
                right={<span className="font-mono text-[10px] text-faint">{temJogo ? 'atualizado a cada jogo' : 'aguardando jogos'}</span>}
              >
                <div className="divide-y divide-line2">
                  {order.filter(o => o.playoffSeed != null).map(o => {
                    const t = teamById(g, o.teamId);
                    const me = o.teamId === g.userTeam;
                    const isBye = o.playoffSeed === 1;
                    const isChamp = o.playoffSeed! <= 4;
                    return (
                      <div key={o.teamId} className="flex items-center gap-2.5 px-3.5 py-2" style={me ? { background: 'rgba(240,180,41,0.07)' } : undefined}>
                        <span className={`w-6 text-center font-disp text-[15px] font-extrabold ${isBye ? 'text-goldhi' : isChamp ? 'text-grass' : 'text-ice'}`}>{o.playoffSeed}</span>
                        <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={16} />
                        <span className="flex-1 truncate font-disp text-[15px] font-bold uppercase">{t.sigla}</span>
                        {isBye && <span className="tag border-gold/60 text-gold" title="Folga na rodada de Wild Card">BYE</span>}
                        {isChamp && !isBye && <span className="tag border-grass/50 text-grass">DIV</span>}
                        {!isChamp && <span className="tag border-ice/50 text-ice">WC</span>}
                        <span className="font-mono text-[12px] text-dim">{o.wins}-{o.losses}{o.ties ? `-${o.ties}` : ''}</span>
                      </div>
                    );
                  })}
                </div>
                {/* bolha */}
                <div className="border-t border-dashed border-line px-3.5 py-2">
                  <div className="mb-1 font-mono text-[9.5px] uppercase tracking-widest text-faint">Na bolha (fora do G7)</div>
                  {order.filter(o => o.playoffSeed == null).slice(0, 2).map(o => {
                    const t = teamById(g, o.teamId);
                    return (
                      <div key={o.teamId} className="flex items-center gap-2.5 py-0.5 opacity-50">
                        <span className="w-6 text-center font-mono text-[11px] text-faint">{o.confRank}</span>
                        <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={13} />
                        <span className="flex-1 truncate font-disp text-[13px] font-bold uppercase">{t.sigla}</span>
                        <span className="font-mono text-[11px] text-faint">{o.wins}-{o.losses}{o.ties ? `-${o.ties}` : ''}</span>
                      </div>
                    );
                  })}
                </div>
                {/* matchups do Wild Card */}
                {bracket && (
                  <div className="border-t border-line px-3.5 py-2.5">
                    <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-widest text-faint">Rodada de Wild Card (projeção)</div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 font-mono text-[11px] text-gold/80">
                        <span className="w-5 text-center font-bold text-goldhi">1</span>
                        <span>{teamById(g, bracket.bye.teamId).sigla}</span>
                        <span className="ml-auto tag border-gold/50 text-gold">folga</span>
                      </div>
                      {bracket.matchups.map(mu => (
                        <div key={mu.seedCasa} className="flex items-center gap-2 font-mono text-[11px] text-dim">
                          <span className="w-5 text-center font-bold text-ice">{mu.seedCasa}</span>
                          <span className="font-bold text-ink">{teamById(g, mu.casaId).sigla}</span>
                          <span className="text-faint">×</span>
                          <span className="w-5 text-center font-bold text-ice">{mu.seedFora}</span>
                          <span className="font-bold text-ink">{teamById(g, mu.foraId).sigla}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            </div>
          </div>
        );
      })}

      {fase === 'OFF' && (
        <p className="font-mono text-[11.5px] text-faint">A classificação acima reflete o fim da temporada regular. Os playoffs já foram disputados.</p>
      )}
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
  const homeGames = g.matches.filter(m => m.casa === t.id && m.jogada).sort((a, b) => b.rodada - a.rodada);
  const receitaTotal = homeGames.reduce((sum, m) => sum + (m.receitaCasa ?? 0), 0);

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

      <Panel title="Receita por jogo" pad={false} right={<span className="font-mono text-[12px] text-goldhi">Total: {fmtM(Math.round(receitaTotal * 100) / 100)}</span>}>
        {homeGames.length === 0 ? (
          <p className="px-4 py-5 font-mono text-[12.5px] text-faint">Nenhum jogo em casa foi concluído.</p>
        ) : (
          <table className="tbl">
            <thead><tr><th>Jogo</th><th>Adversário</th><th className="num">Público</th><th className="num">Bilheteria</th><th className="num">TV</th><th className="num">Total</th></tr></thead>
            <tbody>{homeGames.map(m => {
              const opponent = teamById(g, m.fora);
              return <tr key={m.id}>
                <td className="font-mono text-dim">Sem. {m.rodada}</td>
                <td><b>{opponent.sigla}</b> {opponent.cidade} {opponent.nome}</td>
                <td className="num">{m.publico ? m.publico.toLocaleString('pt-BR') : '—'}</td>
                <td className="num text-goldhi">{m.receitaBilheteria != null ? fmtM(m.receitaBilheteria) : '—'}</td>
                <td className="num text-ice">{m.receitaTV != null ? fmtM(m.receitaTV) : '—'}</td>
                <td className="num font-bold text-grass">{m.receitaCasa != null ? fmtM(m.receitaCasa) : '—'}</td>
              </tr>;
            })}</tbody>
          </table>
        )}
      </Panel>

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
