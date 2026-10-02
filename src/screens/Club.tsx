import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import {
  teamById, playersOf, capUsed, teamStrength, standings, validateRoster, fmtM,
  conferenceSeeds, playoffZone, fmtRecord,
} from '../game/season';
import { teamStage, teamChemistry, STAGE_ZONES, chemistryLabel, stageLabel } from '../game/franchise';
import { TeamCrest, Bar, Panel, SeqBadge, PosBadge } from '../components/ui';
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
  const [newsQuery, setNewsQuery] = useState('');
  const [newsCategory, setNewsCategory] = useState('Todas');
  const [newsOnlyMine, setNewsOnlyMine] = useState(false);
  const t = teamById(g, g.userTeam);
  const { fase, semana, temporada } = g.settings;

  const roster = playersOf(g, g.userTeam);
  const ativos = roster.filter(p => p.status !== 'PS');
  const cap = capUsed(g, g.userTeam);
  const forca = teamStrength(g, g.userTeam);
  const linha = standings(g).find(r => r.teamId === g.userTeam);
  const lesionados = roster.filter(p => p.lesao > 0);
  const chk = validateRoster(g);
  const newsCategories = useMemo(() => ['Todas', ...new Set(g.news.map(item => item.rotulo))], [g.news]);
  const visibleNews = useMemo(() => {
    const query = newsQuery.trim().toLocaleLowerCase('pt-BR');
    return g.news.filter(item => {
      const matchesCategory = newsCategory === 'Todas' || item.rotulo === newsCategory;
      const matchesQuery = !query || `${item.rotulo} ${item.texto}`.toLocaleLowerCase('pt-BR').includes(query);
      const matchesClub = !newsOnlyMine || item.teamIds?.includes(g.userTeam) || item.teamIds == null;
      return matchesCategory && matchesQuery && matchesClub;
    }).slice(0, 50);
  }, [g.news, g.userTeam, newsCategory, newsOnlyMine, newsQuery]);

  const proximo = g.matches.find(m =>
    !m.jogada && m.fase === fase && m.rodada === semana &&
    (m.casa === g.userTeam || m.fora === g.userTeam));
  const oppId = proximo ? (proximo.casa === g.userTeam ? proximo.fora : proximo.casa) : null;
  const opp = oppId ? teamById(g, oppId) : null;
  const opponentReport = oppId ? g.opponentScouting.find(r => r.teamId === oppId && r.season === g.settings.temporada) : undefined;
  const reportPlayers = opponentReport?.keyPlayers.map(id => g.players.find(p => p.id === id)).filter(Boolean) ?? [];
  const emCasa = proximo ? proximo.casa === g.userTeam : false;

  // nome da rodada atual nos playoffs (Wild Card, Divisional, etc.)
  const roundNome = fase === 'PO' && g.bracket ? g.bracket[semana - 1]?.nome : null;
  // usuário eliminado: está nos playoffs mas não tem nenhum jogo futuro no bracket
  const temJogoFuturo = g.bracket?.some(round => round.jogos.some(j =>
    !j.jogada && (j.casa === g.userTeam || j.fora === g.userTeam))) ?? false;
  const eliminado = fase === 'PO' && !temJogoFuturo;
  const mensagensPendentes = g.messages.filter(m => !m.isRead && !m.isArchived);
  const urgentes = mensagensPendentes.filter(m => m.priority === 'urgent').length;

  const timeline = [
    { label: 'Pré-temporada', detail: '2 semanas', week: 2 },
    { label: 'Temporada regular', detail: '18 semanas · 17 jogos', week: 18 },
    { label: 'Playoffs', detail: 'Wild Card ao Super Bowl', week: 4 },
    { label: 'Offseason', detail: 'Renovações · Free Agency · Draft', week: 4 },
  ];
  const timelineIndex = fase === 'PRE' ? 0 : fase === 'REG' ? 1 : fase === 'PO' ? 2 : 3;

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

      <Panel title="Ações prioritárias" pad={false} right={<span className="font-mono text-[10px] text-faint">Atalhos para o que pede atenção agora</span>}>
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {!chk.ok && <ActionShortcut tone="blood" title="Ajustar o elenco" detail={chk.erros[0]} action="Resolver pendências" onClick={() => dispatch({ type: 'SCREEN', screen: fase === 'OFF' ? 'offseason' : 'elenco' })} />}
          {mensagensPendentes.length > 0 && <ActionShortcut tone={urgentes ? 'blood' : 'gold'} title={`${mensagensPendentes.length} mensagem${mensagensPendentes.length === 1 ? '' : 'ns'} não lida${mensagensPendentes.length === 1 ? '' : 's'}`} detail={urgentes ? `${urgentes} precisa${urgentes === 1 ? '' : 'm'} de atenção urgente` : 'Confira atualizações da liga e do clube'} action="Abrir mensagens" onClick={() => dispatch({ type: 'SCREEN', screen: 'inbox' })} />}
          {fase === 'OFF' && <ActionShortcut tone="gold" title={`Offseason · Fase ${g.offPhase ?? 1}/4`} detail="Renovações, mercado, Draft e validação do elenco" action="Continuar offseason" onClick={() => dispatch({ type: 'SCREEN', screen: 'offseason' })} />}
          {fase !== 'OFF' && <ActionShortcut tone="grass" title={proximo ? `Próximo jogo · Semana ${semana}` : 'Acompanhar a liga'} detail={proximo ? `${opp ? `${opp.sigla} ${emCasa ? 'em casa' : 'fora'}` : 'Confronto agendado'} · veja os jogos e resultados` : 'Consulte a rodada atual e os placares'} action="Abrir semana da liga" onClick={() => dispatch({ type: 'SCREEN', screen: 'calendario-liga' })} />}
        </div>
      </Panel>

      {/* chips */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatChip label="Campanha (W-L-T)" value={linha ? fmtRecord(linha.v, linha.d, linha.e) : '—'} />
        <StatChip label="Caixa" value={`$${t.dinheiro}M`} tone="var(--color-goldhi)" />
        <StatChip label="Elenco" value={`${ativos.length}/53`} tone={ativos.length === 53 ? 'var(--color-grass)' : 'var(--color-blood)'} />
        <StatChip label="Lesionados" value={String(lesionados.length)} tone={lesionados.length ? 'var(--color-blood)' : undefined} />
        <StatChip label="Reputação" value={`${t.reputacao}/100`} tone={t.reputacao >= 70 ? 'var(--color-grass)' : t.reputacao < 40 ? 'var(--color-blood)' : 'var(--color-goldhi)'} />
        <StatChip label="Temporada" value={String(temporada)} />
      </div>

      {fase === 'OFF' && <SeasonRecap g={g} />}

      <Panel title={`Temporada ${temporada} · Linha do tempo`} pad={false} right={
        <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: 'SCREEN', screen: 'calendario-liga' })}>Abrir calendário »</button>
      }>
        <div className="grid gap-0 p-3 sm:grid-cols-4">
          {timeline.map((step, i) => {
            const current = i === timelineIndex;
            const done = i < timelineIndex;
            const progress = current
              ? fase === 'PRE' ? semana / 2 : fase === 'REG' ? semana / 18 : fase === 'PO' ? semana / 4 : (g.offPhase ?? 1) / 4
              : done ? 1 : 0;
            return <div key={step.label} className="relative border-l border-line2 py-2 pl-4 sm:border-l-0 sm:pl-0 sm:pr-3">
              {i > 0 && <div className={`absolute left-0 top-[17px] hidden h-px w-3 sm:block ${done ? 'bg-grass' : 'bg-line2'}`} />}
              <div className="flex items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold ${done ? 'border-grass bg-grass/15 text-grass' : current ? 'border-gold bg-gold/15 text-goldhi' : 'border-line2 text-faint'}`}>{done ? '✓' : i + 1}</span>
                <div className="min-w-0">
                  <div className={`font-disp text-[14px] font-bold uppercase ${current ? 'text-goldhi' : done ? 'text-grass' : 'text-dim'}`}>{step.label}</div>
                  <div className="font-mono text-[10px] text-faint">{current ? (fase === 'OFF' ? `Fase ${g.offPhase ?? 1}/4` : `Semana ${semana}/${step.week}`) : step.detail}</div>
                </div>
              </div>
              <div className="mt-2 h-1 overflow-hidden bg-panel2"><div className={`h-full ${done ? 'bg-grass' : current ? 'bg-gold' : 'bg-transparent'}`} style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} /></div>
            </div>;
          })}
        </div>
      </Panel>

      {(fase === 'PO' || fase === 'OFF') && <HomePlayoffBracket g={g} />}

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
                    Força {teamStrength(g, opp.id)}
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

        {opp && fase !== 'OFF' && (
          <Panel title="Análise adversária" right={<span className="font-mono text-[11px] text-gold">1 ponto</span>}>
            {!opponentReport ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[12px] text-dim">Estude {opp.cidade} {opp.nome} antes do kickoff e ganhe +3% na performance defensiva.</p>
                <button className="btn btn-ghost border-ice/60 text-ice" disabled={g.scoutBudget < 1} onClick={() => dispatch({ type: 'STUDY_OPPONENT', teamId: opp.id })}>
                  {g.scoutBudget < 1 ? 'Sem pontos' : 'Estudar adversário'}
                </button>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                <div><div className="font-mono text-[10px] uppercase tracking-wider text-faint">Forças</div>{opponentReport.strengths.map(item => <div key={item} className="mt-1 text-[12px] text-blood">+ {item}</div>)}</div>
                <div><div className="font-mono text-[10px] uppercase tracking-wider text-faint">Fraquezas</div>{opponentReport.weaknesses.map(item => <div key={item} className="mt-1 text-[12px] text-grass">− {item}</div>)}</div>
                <div><div className="font-mono text-[10px] uppercase tracking-wider text-faint">Tendências · relatório {opponentReport.reports}</div><div className="mt-1 font-mono text-[12px] text-ink">Passe {opponentReport.passRate}% · Corrida na 1ª {opponentReport.runOnFirstDown}%</div><div className="mt-1 text-[12px] text-dim">Marcar: {reportPlayers.map(player => player?.nome).join(', ')}</div></div>
              </div>
            )}
          </Panel>
        )}

        {/* momento da franquia: REBUILD ↔ CONTENDER + química */}
        <FranchiseMomentPanel g={g} teamId={g.userTeam} />
      </div>

      <ContractOutlook g={g} cap={cap} />

      <div className="grid gap-5 lg:grid-cols-2">
        <MiniStandings g={g} />
        <Panel title="Notícias da liga" pad={false} right={<span className="font-mono text-[11px] text-faint">{visibleNews.length} manchetes</span>}>
          <div className="grid gap-2 border-b border-line2 bg-panel2 p-3 sm:grid-cols-[1fr_auto_auto]">
            <input aria-label="Buscar notícias" className="min-w-0 border border-line bg-panel px-2 py-1 font-mono text-[12px] text-ink placeholder:text-faint focus:border-gold focus:outline-none" placeholder="Buscar notícia, time ou jogador..." value={newsQuery} onChange={e => setNewsQuery(e.target.value)} />
            <select aria-label="Filtrar notícias por categoria" className="sel" value={newsCategory} onChange={e => setNewsCategory(e.target.value)}>
              {newsCategories.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
            <button className={`btn btn-sm ${newsOnlyMine ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setNewsOnlyMine(v => !v)} aria-pressed={newsOnlyMine}>
              {newsOnlyMine ? 'Meu clube ✓' : 'Meu clube'}
            </button>
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {visibleNews.length === 0 && <div className="p-6 text-center font-mono text-[12px] text-faint">Nenhuma notícia encontrada.</div>}
            {visibleNews.map(n => (
              <article key={n.id} className="flex gap-3 border-b border-line2 px-4 py-3">
                <span className={`tag mt-[2px] h-fit shrink-0 ${n.priority === 'high' ? 'border-blood/50 text-blood' : 'border-gold/40 text-gold'}`}>{n.rotulo}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[12px] leading-relaxed text-ink">{n.texto}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-faint">
                    <span>T{n.season ?? temporada}</span><span>·</span><span>{n.week ? `Semana ${n.week}` : 'Offseason'}</span>
                    {n.teamIds?.includes(g.userTeam) && <span className="text-goldhi">· Envolve seu clube</span>}
                    {n.priority === 'high' && <span className="text-blood">· Destaque</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ContractOutlook({ g, cap }: { g: GameState; cap: number }) {
  const { dispatch } = useGame();
  const roster = playersOf(g, g.userTeam).filter(p => p.status !== 'PS');
  const ending = roster.filter(p => p.contrato <= 1).sort((a, b) => b.salario - a.salario);
  const space = g.settings.cap - cap;
  const usedPct = Math.min(100, Math.max(0, cap / g.settings.cap * 100));
  return (
    <Panel title="Teto salarial & contratos" pad={false} right={
      <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: 'SCREEN', screen: 'negociacoes' })}>Central de contratos »</button>
    }>
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="flex items-end justify-between gap-3">
            <div><div className="font-mono text-[10px] uppercase tracking-wider text-faint">Folha comprometida</div><div className="font-disp text-[24px] font-extrabold text-ink">{fmtM(cap)} <span className="font-mono text-[12px] font-normal text-faint">/ {fmtM(g.settings.cap)}</span></div></div>
            <div className={`font-mono text-[12px] font-bold ${space < 0 ? 'text-blood' : 'text-grass'}`}>{space < 0 ? `Excedente ${fmtM(Math.abs(space))}` : `${fmtM(space)} livres`}</div>
          </div>
          <div className="mt-2 h-2 overflow-hidden bg-panel2"><div className={`h-full ${usedPct >= 95 ? 'bg-blood' : usedPct >= 85 ? 'bg-gold' : 'bg-grass'}`} style={{ width: `${usedPct}%` }} /></div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-faint"><span>{usedPct.toFixed(0)}% utilizado</span><span>{roster.length} contratos ativos</span></div>
        </div>
        <div className="border-t border-line2 pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
          <div className="mb-2 flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-wider text-faint">Vencem ao fim da temporada</span><span className={`tag ${ending.length ? 'border-gold/50 text-goldhi' : 'border-grass/50 text-grass'}`}>{ending.length} jogador{ending.length === 1 ? '' : 'es'}</span></div>
          {ending.length === 0 ? <p className="font-mono text-[11.5px] text-faint">Nenhum contrato ativo termina nesta temporada.</p> : <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {ending.slice(0, 4).map(p => <div key={p.id} className="flex min-w-0 items-center gap-2 border-b border-line2 py-1 font-mono text-[11px]"><PosBadge pos={p.pos} /><span className="truncate text-ink">{p.nome}</span><span className="ml-auto whitespace-nowrap text-goldhi">{fmtM(p.salario)}</span></div>)}
          </div>}
          {ending.length > 4 && <p className="mt-1 font-mono text-[10px] text-faint">e mais {ending.length - 4} com contrato no último ano</p>}
        </div>
      </div>
    </Panel>
  );
}

function ActionShortcut({ tone, title, detail, action, onClick }: {
  tone: 'blood' | 'gold' | 'grass'; title: string; detail: string; action: string; onClick: () => void;
}) {
  const tones = {
    blood: 'border-blood/35 bg-blood/5',
    gold: 'border-gold/35 bg-gold/5',
    grass: 'border-grass/30 bg-grass/5',
  };
  const textTones = { blood: 'text-blood', gold: 'text-goldhi', grass: 'text-grass' };
  return <div className={`flex min-w-0 flex-col border p-3 ${tones[tone]}`}>
    <div className={`font-disp text-[14px] font-bold uppercase ${textTones[tone]}`}>{title}</div>
    <div className="mt-1 min-h-8 flex-1 font-mono text-[10.5px] leading-relaxed text-dim">{detail}</div>
    <button className="btn btn-sm btn-ghost mt-2 self-start" onClick={onClick}>{action} »</button>
  </div>;
}

function SeasonRecap({ g }: { g: GameState }) {
  const row = standings(g).find(r => r.teamId === g.userTeam);
  const title = g.campeoes.find(c => c.temporada === g.settings.temporada);
  const champ = title ? teamById(g, title.teamId) : null;
  const sb = g.matches.find(m => m.fase === 'PO' && m.rodada === 4 && m.jogada);
  const playoffGames = g.matches.filter(m => m.fase === 'PO' && m.jogada && (m.casa === g.userTeam || m.fora === g.userTeam)).length;
  const madePlayoffs = playoffGames > 0;
  return (
    <Panel title={`Resumo da temporada ${g.settings.temporada}`} className="border-gold/40">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="font-disp text-[24px] font-extrabold uppercase text-goldhi">{champ ? `${champ.cidade} ${champ.nome} é campeão` : 'Temporada encerrada'}</div>
          <p className="mt-1 font-mono text-[12px] text-dim">
            {row ? `Sua campanha: ${fmtRecord(row.v, row.d, row.e)} · ${row.pf} pontos feitos · ${row.pc} cedidos.` : 'Não foi possível recuperar a campanha desta temporada.'}
            {' '}{madePlayoffs ? `Playoffs: ${playoffGames} jogo${playoffGames === 1 ? '' : 's'} disputado${playoffGames === 1 ? '' : 's'}.` : 'O time não chegou aos playoffs.'}
          </p>
        </div>
        {sb && <div className="border border-line2 bg-panel2 px-4 py-2 text-center">
          <div className="font-mono text-[10px] uppercase tracking-wider text-faint">Super Bowl</div>
          <div className="mt-1 font-disp text-[20px] font-bold">{teamById(g, sb.casa).sigla} <span className="text-goldhi">{sb.placarCasa}–{sb.placarFora}</span> {teamById(g, sb.fora).sigla}</div>
        </div>}
      </div>
    </Panel>
  );
}

function HomePlayoffBracket({ g }: { g: GameState }) {
  const rounds = [
    { week: 1, label: 'Wild Card' }, { week: 2, label: 'Divisional' },
    { week: 3, label: 'Finais de conferência' }, { week: 4, label: 'Super Bowl' },
  ];
  return (
    <Panel title="Chaveamento dos playoffs" pad={false} right={<span className="font-mono text-[10px] text-faint">Resultados e próximos confrontos</span>}>
      <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
        {rounds.map(round => {
          const games = g.matches.filter(m => m.fase === 'PO' && m.rodada === round.week);
          const done = games.filter(m => m.jogada).length;
          return <section key={round.week} className="min-h-24 border border-line2 bg-panel2 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-disp text-[13px] font-bold uppercase text-ink">{round.label}</h3>
              <span className="font-mono text-[10px] text-faint">{games.length ? `${done}/${games.length}` : 'a definir'}</span>
            </div>
            {games.length === 0 ? <p className="font-mono text-[10.5px] text-faint">Confrontos ainda não definidos</p> : games.map((m, index) => {
              const home = teamById(g, m.casa); const away = teamById(g, m.fora);
              const hw = m.jogada && (m.placarCasa ?? 0) > (m.placarFora ?? 0);
              const aw = m.jogada && (m.placarFora ?? 0) > (m.placarCasa ?? 0);
              return <div key={m.id ?? `${round.week}-${index}`} className="mb-2 border-t border-line/70 pt-1.5 font-mono text-[11px]">
                <div className={`flex justify-between ${hw ? 'font-bold text-grass' : m.jogada ? 'text-faint' : 'text-ink'}`}><span>{home.sigla}</span><span>{m.jogada ? m.placarCasa : '—'}</span></div>
                <div className={`flex justify-between ${aw ? 'font-bold text-grass' : m.jogada ? 'text-faint' : 'text-ink'}`}><span>{away.sigla}</span><span>{m.jogada ? m.placarFora : '—'}</span></div>
              </div>;
            })}
          </section>;
        })}
      </div>
    </Panel>
  );
}

/* ============ Momento da franquia: REBUILD ↔ CONTENDER + química ============ */
function FranchiseMomentPanel({ g, teamId }: { g: GameState; teamId: string }) {
  const stage = teamStage(g, teamId);
  const chem = teamChemistry(g, teamId);
  const needleColor = stage.score >= 70 ? 'var(--color-goldhi)' : stage.score >= 40 ? 'var(--color-grass)' : 'var(--color-ice)';

  return (
    <Panel title="Momento da franquia" className="lg:col-span-3">
      {/* gauge REBUILD ↔ CONTENDER */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between font-disp text-[13px] font-bold uppercase tracking-wider">
          <span className="text-ice">◄ Rebuild</span>
          <span style={{ color: needleColor }}>{stageLabel(stage.score)}</span>
          <span className="text-goldhi">Contender ►</span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-sm border border-line2"
          style={{ background: 'linear-gradient(90deg, var(--color-ice), var(--color-grass), var(--color-goldhi))' }}>
          <div className="absolute top-[-3px] h-[18px] w-[3px] bg-[#fff] shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            style={{ left: `calc(${stage.score}% - 1px)` }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div><div className="font-mono text-[10px] uppercase text-faint">Campanha</div><Bar pct={stage.factors.campanha * 100} color="var(--color-grass)" /></div>
          <div><div className="font-mono text-[10px] uppercase text-faint">Talento</div><Bar pct={stage.factors.talento * 100} color="var(--color-goldhi)" /></div>
          <div><div className="font-mono text-[10px] uppercase text-faint">Janela de idade</div><Bar pct={stage.factors.janela * 100} color="var(--color-ice)" /></div>
          <div><div className="font-mono text-[10px] uppercase text-faint">Núcleo jovem</div><Bar pct={stage.factors.nucleos * 100} color="var(--color-grass)" /></div>
        </div>
      </div>

      {/* química */}
      <div className="border-t border-line2 pt-3">
        <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Química do vestiário</span><b className="text-ink">{chem.score}/100</b></div>
        <Bar pct={chem.score} color="var(--color-grass)" />
        <div className="mt-1 font-mono text-[11px] text-faint">{chemistryLabel(chem.score)} · QB–WR1: {chem.qbLink} ano{chem.qbLink === 1 ? '' : 's'}</div>
        <div className="mt-3 border-t border-line2 pt-2 font-mono text-[10.5px] text-faint">
          {STAGE_ZONES.map(z => z.nome).join(' · ')}
        </div>
      </div>
    </Panel>
  );
}

/* ============ Mini classificação da conferência ============ */
function MiniStandings({ g }: { g: GameState }) {
  const t = teamById(g, g.userTeam);
  const seeds = conferenceSeeds(g, t.conf);
  const seedOf = new Map(seeds.map(s => [s.teamId, s.seed]));
  const inZone = playoffZone(g, t.conf).has(g.userTeam);
  // ordem = playoff picture: seeds 1→7 primeiro, depois os demais por campanha
  const rows = standings(g)
    .filter(r => teamById(g, r.teamId).conf === t.conf)
    .sort((a, b) => {
      const sa = seedOf.get(a.teamId);
      const sb = seedOf.get(b.teamId);
      if (sa != null && sb != null) return sa - sb;   // ambos com seed: pela posição
      if (sa != null) return -1;                      // com seed vem antes
      if (sb != null) return 1;
      return (b.v + b.e * 0.5) - (a.v + a.e * 0.5) || b.net - a.net;  // sem seed: campanha
    })
    .slice(0, 9);

  return (
    <Panel title={`Classificação ${t.conf}`} pad={false}
      right={<span className={`tag ${inZone ? 'border-grass/50 text-grass' : 'border-line text-faint'}`}>{inZone ? 'Na zona' : 'Fora da zona'}</span>}>
      <table className="tbl">
        <thead><tr><th /> <th>Clube</th><th className="num">W-L-T</th><th className="num">+/−</th><th>Últ.5</th></tr></thead>
        <tbody>
          {rows.map(r => {
            const rt = teamById(g, r.teamId);
            const sd = seedOf.get(r.teamId);
            const me = r.teamId === g.userTeam;
            return (
              <tr key={r.teamId} style={me ? { background: 'rgba(240,180,41,0.07)' } : undefined}>
                <td className="w-8 font-mono text-[11px] text-gold">{sd ? `#${sd}` : ''}</td>
                <td><span className="mr-2 inline-block h-[9px] w-[9px]" style={{ background: rt.cor }} />{rt.cidade} <b>{rt.nome}</b></td>
                <td className="num font-disp font-bold tracking-wide">{fmtRecord(r.v, r.d, r.e)}</td>
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
