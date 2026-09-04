/* ============================================================
 * 📧 Sistema de Mensagens / Inbox centralizado.
 * Substitui os toasts por mensagens persistentes + avaliação da
 * diretoria, demissão, recolocação e resultados Pro Bowl/Super Bowl.
 * Autocontido: importa apenas types/rng/tiebreakers (sem ciclo com season).
 * ============================================================ */

import type {
  CoachPerformance, GameResult, GameState, JobOpening, Message, MessageAction,
  MessageCategory, MessagePriority, Team,
} from './types';
import { Rng, clamp } from './rng';
import { computeStandings } from './tiebreakers';

/* ---------- metadados de categoria (ícone, rótulo, cor) ---------- */
export const CATEGORY_META: Record<MessageCategory, { label: string; icon: string; color: string }> = {
  front_office: { label: 'Diretoria', icon: '🏢', color: 'var(--color-gold)' },
  training: { label: 'Treino', icon: '🏋️', color: 'var(--color-grass)' },
  injury: { label: 'Lesões', icon: '⚕️', color: 'var(--color-blood)' },
  trade: { label: 'Trocas', icon: '🔄', color: 'var(--color-ice)' },
  contract: { label: 'Contratos', icon: '✍️', color: 'var(--color-goldhi)' },
  agent: { label: 'Agentes', icon: '🤝', color: 'var(--color-ice)' },
  scouting: { label: 'Scouting', icon: '🔍', color: 'var(--color-grass)' },
  media: { label: 'Mídia', icon: '📰', color: 'var(--color-dim)' },
  pro_bowl: { label: 'Pro Bowl', icon: '⭐', color: 'var(--color-goldhi)' },
  super_bowl: { label: 'Super Bowl', icon: '🏆', color: 'var(--color-gold)' },
  job: { label: 'Carreira', icon: '💼', color: 'var(--color-blood)' },
};

export const PRIORITY_META: Record<MessagePriority, { label: string; color: string }> = {
  urgent: { label: 'URGENTE', color: 'var(--color-blood)' },
  normal: { label: 'Normal', color: 'var(--color-gold)' },
  low: { label: 'Baixa', color: 'var(--color-faint)' },
};

/* ---------- helpers locais (evitam importar season.ts) ---------- */
const teamOf = (s: GameState, id: string): Team => s.teams.find(t => t.id === id)!;
const playersOf = (s: GameState, id: string) => s.players.filter(p => p.teamId === id);
const capUsed = (s: GameState, id: string) =>
  Math.round(playersOf(s, id).reduce((sum, p) => sum + p.salario, 0) * 10) / 10;

let seq = 0;
function nextId(s: GameState): number {
  const max = s.messages.reduce((m, x) => Math.max(m, x.id), 1000);
  seq++;
  return max + seq;
}

/* ---------- criação de mensagem ---------- */
export interface NotifyOpts {
  category: MessageCategory;
  sender: string;
  senderIcon?: string;
  subject: string;
  body: string;
  priority?: MessagePriority;
  dataPayload?: Record<string, unknown>;
  availableActions?: MessageAction[];
  alsoNews?: string; // rótulo para espelhar no feed de notícias
}

export function notify(s: GameState, o: NotifyOpts): Message {
  const msg: Message = {
    id: nextId(s),
    season: s.settings.temporada,
    week: s.settings.semana,
    category: o.category,
    priority: o.priority ?? 'normal',
    isRead: false,
    isArchived: false,
    isStarred: false,
    sender: o.sender,
    senderIcon: o.senderIcon ?? CATEGORY_META[o.category].icon,
    subject: o.subject,
    body: o.body,
    dataPayload: o.dataPayload,
    availableActions: o.availableActions,
    createdAt: Date.now() + seq,
  };
  s.messages.unshift(msg);
  if (s.messages.length > 120) s.messages.length = 120; // teto de memória
  return msg;
}

/* ---------- boas-vindas (chamado no newGame) ---------- */
export function createWelcomeMessage(userTeamId: string, team: Team): Message {
  return {
    id: 1, season: 2026, week: 0,
    category: 'front_office', priority: 'normal',
    isRead: false, isArchived: false, isStarred: true,
    sender: 'Diretoria', senderIcon: '🏢',
    subject: `Bem-vindo ao ${team.cidade} ${team.nome}`,
    body: `A diretoria confia no seu trabalho para liderar o ${team.cidade} ${team.nome}. ` +
      `Seu desempenho será avaliado semanalmente em cinco frentes: campanha, playoffs, ` +
      `desenvolvimento de jogadores, gestão do teto salarial e relação com a mídia. ` +
      `Resultados ruins e avaliação baixa podem custar o seu cargo — mas uma boa temporada abre portas na liga.`,
    createdAt: Date.now(),
  };
}

/* ---------- operações do inbox ---------- */
export function markRead(s: GameState, id: number): void {
  const m = s.messages.find(x => x.id === id);
  if (m && !m.isRead) { m.isRead = true; m.readAt = Date.now(); }
}
export function toggleStar(s: GameState, id: number): void {
  const m = s.messages.find(x => x.id === id);
  if (m) m.isStarred = !m.isStarred;
}
export function toggleArchive(s: GameState, id: number): void {
  const m = s.messages.find(x => x.id === id);
  if (m) m.isArchived = !m.isArchived;
}
export function removeMessage(s: GameState, id: number): void {
  s.messages = s.messages.filter(x => x.id !== id);
}
export function markAllRead(s: GameState, category?: MessageCategory): void {
  for (const m of s.messages) {
    if (category && m.category !== category) continue;
    if (!m.isRead) { m.isRead = true; m.readAt = Date.now(); }
  }
}
export const unreadCount = (s: GameState): number => s.messages.filter(m => !m.isRead && !m.isArchived).length;
export const unreadByCategory = (s: GameState): Partial<Record<MessageCategory, number>> => {
  const out: Partial<Record<MessageCategory, number>> = {};
  for (const m of s.messages) {
    if (m.isRead || m.isArchived) continue;
    out[m.category] = (out[m.category] ?? 0) + 1;
  }
  return out;
};

/* ================= avaliação da diretoria ================= */
export function evaluateCoach(s: GameState): CoachPerformance {
  const id = s.userTeam;
  const st = computeStandings(s);
  const me = st.get(id);
  const team = teamOf(s, id);

  // 1) campanha (35%)
  const winPct = me ? me.winPct : 0;
  const expectation = team.histCampanha?.[0] ?? 0.5;
  const winPctScore = clamp(Math.round(winPct * 100 + (winPct - expectation) * 40), 0, 100);

  // 2) progresso de playoffs (25%)
  let playoffProgressScore = 0;
  if (s.settings.fase === 'PO') {
    playoffProgressScore = clamp(60 + s.settings.semana * 10, 0, 100);
  } else if (me) {
    if (me.playoffSeed != null) playoffProgressScore = clamp(100 - (me.playoffSeed - 1) * 8, 55, 100);
    else playoffProgressScore = clamp(40 - me.gamesBehind * 3, 0, 45);
  }

  // 3) desenvolvimento de jogadores (15%)
  const young = playersOf(s, id).filter(p => p.status !== 'PS' && p.idade <= 25);
  const playing = young.filter(p => p.stats.jogos > 0).length;
  const devRatio = young.length ? playing / young.length : 0.5;
  const intensityBonus = s.trainingState.intensity === 'INTENSO' ? 12 : s.trainingState.intensity === 'NORMAL' ? 6 : 0;
  const playerDevelopmentScore = clamp(Math.round(devRatio * 80 + intensityBonus), 0, 100);

  // 4) gestão do cap (15%)
  const used = capUsed(s, id);
  const space = s.settings.cap - used;
  let capManagementScore = 100;
  if (space < 0) capManagementScore = clamp(Math.round(60 + space), 0, 60);      // estourado
  else if (space > 70) capManagementScore = 70;                                   // dinheiro parado
  else capManagementScore = clamp(Math.round(100 - Math.abs(space - 25)), 60, 100);

  // 5) relação com a mídia (10%) — moral do time + sequência recente
  const recentSeq = (me ? undefined : undefined); void recentSeq;
  const mediaRelationsScore = clamp(Math.round(team.moral), 0, 100);

  const overallRating = Math.round(
    winPctScore * 0.35 + playoffProgressScore * 0.25 +
    playerDevelopmentScore * 0.15 + capManagementScore * 0.15 + mediaRelationsScore * 0.10,
  );

  return {
    season: s.settings.temporada, week: s.settings.semana,
    winPctScore, playoffProgressScore, playerDevelopmentScore,
    capManagementScore, mediaRelationsScore, overallRating,
    isFired: false,
  };
}

/** Registra a avaliação semanal no histórico (teto de 60 entradas). */
export function recordCoachEvaluation(s: GameState): CoachPerformance {
  const perf = evaluateCoach(s);
  s.coachHistory.push(perf);
  if (s.coachHistory.length > 60) s.coachHistory.shift();
  return perf;
}

/** Mensagem da diretoria com o boletim de avaliação. */
export function sendEvaluationMessage(s: GameState, perf: CoachPerformance): void {
  const team = teamOf(s, s.userTeam);
  const verdict = perf.overallRating >= 75 ? 'excelente'
    : perf.overallRating >= 55 ? 'sólido'
      : perf.overallRating >= 40 ? 'instável' : 'preocupante';
  notify(s, {
    category: 'front_office',
    sender: 'Diretoria',
    subject: `Avaliação da diretoria — Semana ${perf.week}`,
    body: `O conselho avaliou seu trabalho à frente do ${team.cidade} ${team.nome} como ${verdict} ` +
      `(nota geral ${perf.overallRating}/100). Campanha ${perf.winPctScore} · Playoffs ${perf.playoffProgressScore} · ` +
      `Desenvolvimento ${perf.playerDevelopmentScore} · Cap ${perf.capManagementScore} · Mídia ${perf.mediaRelationsScore}.`,
    priority: perf.overallRating < 40 ? 'urgent' : 'normal',
    dataPayload: { perf },
    availableActions: [{ id: 'goto_standings', label: 'Ver classificação', kind: 'goto', screen: 'classificacao' }],
  });
}

/* ================= demissão do usuário ================= */
export function checkUserFiring(s: GameState, rng: Rng): boolean {
  if (s.coachFired || s.settings.fase !== 'REG') return false;
  if (s.settings.semana < 8) return false; // dá tempo de engrenar
  const last = s.coachHistory[s.coachHistory.length - 1];
  if (!last) return false;
  void rng;
  // demissão determinística: avaliação abaixo de 30 após a semana 8
  if (last.overallRating >= 30) return false;
  
  s.coachFired = true;
  last.isFired = true;
  last.fireReason = 'Avaliação da diretoria abaixo de 30/100 — confiança esgotada.';
  const team = teamOf(s, s.userTeam);
  notify(s, {
    category: 'job',
    sender: 'Diretoria',
    priority: 'urgent',
    subject: `Você foi demitido do ${team.cidade} ${team.nome}`,
    body: `Após ${s.settings.semana} semanas e uma avaliação de ${last.overallRating}/100, a diretoria decidiu ` +
      `encerrar seu ciclo. ${last.fireReason} Sua carreira continua: há vagas abertas na liga. ` +
      `Acesse a tela de Carreira para se candidatar a um novo comando.`,
    dataPayload: { perf: last },
    availableActions: [{ id: 'goto_jobs', label: 'Ver vagas abertas', kind: 'goto', screen: 'jobs' }],
  });
  // garante vagas no mercado para recolocação
  generateAiCoachFirings(s, rng, 3);
  return true;
}

/* ---------- demissão de FIM DE TEMPORADA (avaliação do ano completo) ---------- */
export function checkEndSeasonFiring(s: GameState, rng: Rng): boolean {
  if (s.coachFired || s.settings.fase !== 'OFF') return false;
  // média das avaliações da temporada
  const seasonEvals = s.coachHistory.filter(c => c.season === s.settings.temporada);
  if (!seasonEvals.length) return false;
  const avg = seasonEvals.reduce((a, c) => a + c.overallRating, 0) / seasonEvals.length;

  // campanha final
  const st = computeStandings(s);
  const me = st.get(s.userTeam);
  const winPct = me ? me.winPct : 0;
  const madePlayoffs = me ? me.playoffSeed != null : false;

  // não demite se foi aos playoffs ou avaliação média decente
  if (madePlayoffs || avg >= 40) return false;
  // só demite com avaliação média baixa E campanha ruim (probabilístico)
  if (avg >= 35 || winPct >= 0.3) return false;
  if (!rng.chance(0.7)) return false;

  s.coachFired = true;
  const last = seasonEvals[seasonEvals.length - 1];
  if (last) { last.isFired = true; last.fireReason = 'Temporada abaixo das expectativas — avaliação média ' + Math.round(avg) + '/100.'; }
  const team = teamOf(s, s.userTeam);
  notify(s, {
    category: 'job',
    sender: 'Diretoria',
    priority: 'urgent',
    subject: `Fim de temporada: você foi demitido do ${team.cidade} ${team.nome}`,
    body: `A diretoria fez o balanço da temporada ${s.settings.temporada} e, com uma avaliação média de ` +
      `${Math.round(avg)}/100 e aproveitamento de ${Math.round(winPct * 100)}%, decidiu encerrar seu ciclo. ` +
      `Sua carreira continua: há vagas abertas na liga para a próxima temporada.`,
    dataPayload: { perf: last ?? undefined },
    availableActions: [{ id: 'goto_jobs', label: 'Ver vagas abertas', kind: 'goto', screen: 'jobs' }],
  });
  generateAiCoachFirings(s, rng, 3);
  return true;
}

/* ================= vagas abertas (técnicos da IA demitidos) ================= */
function teamQualityOf(s: GameState, teamId: string): JobOpening['teamQuality'] {
  const st = computeStandings(s);
  const me = st.get(teamId);
  const hist = teamOf(s, teamId).histCampanha?.[0] ?? 0.5;
  const w = me ? me.winPct : hist;
  if (w >= 0.6) return 'contender';
  if (w >= 0.5) return 'playoff_team';
  if (w >= 0.35) return 'rebuilding';
  return 'disaster';
}
function rosterQualityOf(s: GameState, teamId: string): JobOpening['rosterQuality'] {
  const ativos = playersOf(s, teamId).filter(p => p.status !== 'PS');
  const top = [...ativos].sort((a, b) => b.ovr - a.ovr).slice(0, 22);
  const avg = top.length ? top.reduce((a, p) => a + p.ovr, 0) / top.length : 60;
  if (avg >= 80) return 'elite';
  if (avg >= 72) return 'good';
  if (avg >= 64) return 'average';
  return 'poor';
}

export function generateAiCoachFirings(s: GameState, rng: Rng, forceMin = 0): number {
  if (s.settings.fase !== 'REG' || s.settings.semana < 4) return 0;
  let created = 0;
  const st = computeStandings(s);
  for (const t of s.teams) {
    if (t.id === s.userTeam) continue;
    if (s.jobOpenings.some(j => j.teamId === t.id && !j.isFilled)) continue; // já tem vaga
    const me = st.get(t.id);
    const winPct = me ? me.winPct : 0;
    const chance = winPct < 0.15 ? 0.18 : winPct < 0.25 ? 0.07 : 0;
    if (created < forceMin ? false : !rng.chance(chance)) continue;

    const quality = teamQualityOf(s, t.id);
    const roster = rosterQualityOf(s, t.id);
    const picks: number[] = [];
    for (let r = 0; r < 3; r++) {
      const row = s.pickOwners[r];
      if (row && row.some(c => c.owner === t.id && !c.consumed)) picks.push(r + 1);
    }
    const capSpace = Math.round((s.settings.cap - capUsed(s, t.id)) * 10) / 10;
    const expectations: JobOpening['expectations'] =
      quality === 'contender' ? 'win_now' : quality === 'playoff_team' ? 'develop_young_players' : 'rebuild';
    const pressureLevel = quality === 'disaster' ? 9 : quality === 'rebuilding' ? 6 : quality === 'playoff_team' ? 4 : 3;

    s.jobOpenings.unshift({
      id: nextId(s), season: s.settings.temporada, week: s.settings.semana,
      teamId: t.id, reason: 'fired_coach',
      teamQuality: quality, rosterQuality: roster,
      capSpace, draftPicks: picks, expectations, pressureLevel,
      isFilled: false, filledByUser: false,
    });
    created++;
    notify(s, {
      category: 'media',
      sender: 'Mídia NFL',
      subject: `Técnico do ${t.cidade} ${t.nome} é demitido`,
      body: `Após uma campanha de ${Math.round(winPct * 100)}% de aproveitamento, o ${t.cidade} ${t.nome} ` +
        `dispensou seu treinador. A vaga está aberta e a diretoria busca um novo nome. ` +
        `Qualidade do elenco: ${roster}.`,
      priority: 'low',
      dataPayload: { teamId: t.id },
    });
  }
  return created;
}

/* ================= recolocação (candidatura a uma vaga) ================= */
export function applyToJob(s: GameState, jobId: number, rng: Rng): { ok: boolean; msg: string } {
  const job = s.jobOpenings.find(j => j.id === jobId && !j.isFilled);
  if (!job) return { ok: false, msg: 'Esta vaga não está mais disponível.' };
  const last = s.coachHistory[s.coachHistory.length - 1];
  const rating = last ? last.overallRating : 55;
  // chance: reputação do técnico vs pressão do cargo
  const chance = clamp(Math.round(50 + (rating - 50) * 0.9 - job.pressureLevel * 3), 10, 92);
  const team = teamOf(s, job.teamId);

  if (!rng.chance(chance / 100)) {
    notify(s, {
      category: 'job', sender: 'Diretoria', senderIcon: '💼',
      subject: `Candidatura recusada — ${team.cidade} ${team.nome}`,
      body: `A diretoria do ${team.cidade} ${team.nome} optou por outro nome. ` +
        `Sua reputação atual (${rating}/100) não foi suficiente para a pressão do cargo (nível ${job.pressureLevel}). ` +
        `Continue vencendo para se valorizar.`,
      priority: 'normal',
    });
    return { ok: false, msg: `Recusado pelo ${team.sigla} (chance ${chance}%).` };
  }

  // aceita: troca de equipe
  const oldTeam = teamOf(s, s.userTeam);
  job.isFilled = true;
  job.filledByUser = true;
  s.userTeam = job.teamId;
  s.coachFired = false;
  teamOf(s, job.teamId).moral = Math.max(teamOf(s, job.teamId).moral, 60);
  notify(s, {
    category: 'job', sender: 'Diretoria', senderIcon: '💼',
    subject: `Contratado! Você é o novo técnico do ${team.cidade} ${team.nome}`,
    body: `A diretoria do ${team.cidade} ${team.nome} aprovou sua contratação. Expectativa: ` +
      `${job.expectations === 'win_now' ? 'brigar pelo título agora' : job.expectations === 'rebuild' ? 'reconstruir o elenco' : 'desenvolver os jovens'}. ` +
      `Pressão do cargo: nível ${job.pressureLevel}/10. Você deixou o ${oldTeam.cidade} ${oldTeam.nome}. Boa sorte!`,
    priority: 'urgent',
    dataPayload: { teamId: job.teamId, expectations: job.expectations },
    availableActions: [{ id: 'goto_home', label: 'Assumir o comando', kind: 'goto', screen: 'home' }],
  });
  return { ok: true, msg: `✍️ Contratado pelo ${team.sigla}!` };
}

/* ================= Pro Bowl (por conferência) ================= */
export interface ProBowlPick { playerId: string; nome: string; pos: string; sigla: string; starter: boolean; }

/** Monta os elencos do Pro Bowl separados por conferência (AFC / NFC). */
export function proBowlRosterByConference(s: GameState): { afc: ProBowlPick[]; nfc: ProBowlPick[] } {
  const afc: ProBowlPick[] = []; const nfc: ProBowlPick[] = [];
  for (const v of s.probowl.votes) {
    if (s.settings.temporada !== v.season) continue;
    if (!v.isStarter && !v.isReserve) continue;
    const p = s.players.find(x => x.id === v.playerId);
    if (!p || !p.teamId) continue;
    const t = teamOf(s, p.teamId);
    const pick: ProBowlPick = { playerId: p.id, nome: p.nome, pos: p.pos, sigla: t.sigla, starter: !!v.isStarter };
    (t.conf === 'AFC' ? afc : nfc).push(pick);
  }
  const ord = (a: ProBowlPick, b: ProBowlPick) => Number(b.starter) - Number(a.starter) || a.pos.localeCompare(b.pos);
  return { afc: afc.sort(ord), nfc: nfc.sort(ord) };
}

export function sendProBowlResults(s: GameState): void {
  const mine = s.probowl.votes.filter(v => {
    if (s.settings.temporada !== v.season) return false;
    const p = s.players.find(x => x.id === v.playerId);
    return p && p.teamId === s.userTeam && (v.isStarter || v.isReserve);
  });
  const starters = mine.filter(v => v.isStarter);
  const reserves = mine.filter(v => v.isReserve);
  const { afc, nfc } = proBowlRosterByConference(s);
  const fmtRoster = (picks: ProBowlPick[]) =>
    picks.map(p => `${p.starter ? '⭐' : '  •'} ${p.pos.padEnd(2)} ${p.nome} (${p.sigla})`).join('\n');
  notify(s, {
    category: 'pro_bowl',
    sender: 'Liga', senderIcon: '⭐',
    subject: mine.length
      ? `Pro Bowl: ${mine.length} jogador(es) do seu time selecionados!`
      : 'Pro Bowl: elencos definidos — nenhum atleta seu foi escolhido',
    body:
      `A votação de fãs (75%), jogadores e técnicos definiu os elencos do Pro Bowl da temporada ${s.settings.temporada}.\n\n` +
      `—— CONFERÊNCIA AFC ——\n${fmtRoster(afc)}\n\n` +
      `—— CONFERÊNCIA NFC ——\n${fmtRoster(nfc)}\n\n` +
      (mine.length
        ? `Seu time terá ${starters.length} titular(es) e ${reserves.length} reserva(s). ⭐ = titular.`
        : `Nenhum atleta do seu elenco recebeu votos suficientes. Desempenho individual e vitórias aumentam a visibilidade dos seus jogadores.`),
    priority: mine.length ? 'normal' : 'low',
    dataPayload: {
      afc, nfc,
      starters: starters.map(v => ({ playerId: v.playerId, nome: s.players.find(x => x.id === v.playerId)?.nome ?? '—' })),
      reserves: reserves.map(v => ({ playerId: v.playerId, nome: s.players.find(x => x.id === v.playerId)?.nome ?? '—' })),
    },
  });
}

/* ================= Super Bowl (com MVP e destaques) ================= */
export function sendSuperBowlMessage(s: GameState, champTeamId: string, result?: GameResult): void {
  const champ = teamOf(s, champTeamId);
  const isUser = champTeamId === s.userTeam;
  
  // detalhes da partida: placar, MVP e jogada do jogo (quando disponíveis)
  const mvp = result?.rich.story.mvp ?? null;
  const jogada = result?.rich.story.jogada ?? null;
  const placar = result ? `${result.placarCasa} × ${result.placarFora}` : '';
  const siglaCasa = result ? teamOf(s, result.casaId).sigla : '';
  const siglaFora = result ? teamOf(s, result.foraId).sigla : '';

  const detalhes: string[] = [];
  if (placar) detalhes.push(`Placar final: ${siglaCasa} ${result!.placarCasa} × ${result!.placarFora} ${siglaFora}.`);
  if (mvp) detalhes.push(`🏅 MVP do Super Bowl: ${mvp.nome} (${mvp.pos}) — ${mvp.linha}.`);
  if (jogada) detalhes.push(`⚡ Jogada do jogo: ${jogada.texto}`);

  const corpo = isUser
    ? `O ${champ.cidade} ${champ.nome} conquistou o título da temporada ${s.settings.temporada}! ` +
      `A diretoria, a torcida e a cidade celebram o seu trabalho. Seu nome entra para a história da franquia.`
    : `O ${champ.cidade} ${champ.nome} levantou o troféu da temporada ${s.settings.temporada}. ` +
      `A liga parabeniza o campeão. A próxima temporada começa em breve — prepare seu elenco.`;
  
  notify(s, {
    category: 'super_bowl',
    sender: 'Liga',
    senderIcon: '🏆',
    subject: isUser
      ? `🏆 CAMPEÕES! ${champ.cidade} ${champ.nome} vence o Super Bowl!`
      : `Super Bowl: ${champ.cidade} ${champ.nome} é o campeão da temporada ${s.settings.temporada}`,
    body: corpo + (detalhes.length ? `\n\n${detalhes.join('\n')}` : ''),
    priority: 'urgent',
    dataPayload: {
      champTeamId, temporada: s.settings.temporada, isUser,
      mvp: mvp ? { nome: mvp.nome, pos: mvp.pos, linha: mvp.linha } : null,
      jogada: jogada?.texto ?? null,
      placar: placar || null,
    },
    availableActions: isUser ? [{ id: 'goto_home', label: 'Celebrar com o time', kind: 'goto', screen: 'home' }] : undefined,
  });
}

/* ================= lesões graves ================= */
export function sendInjuryMessage(s: GameState, playerName: string, pos: string, weeks: number, tipo: string): void {
  notify(s, {
    category: 'injury',
    sender: 'Departamento Médico',
    subject: `Lesão: ${playerName} fora por ${weeks} semana(s)`,
    body: `${playerName} (${pos}) sofreu ${tipo.toLowerCase()} e ficará afastado por aproximadamente ${weeks} semana(s). ` +
      `Ajuste seu elenco e considere o mercado ou o practice squad para repor a posição.`,
    priority: weeks >= 4 ? 'urgent' : 'normal',
    dataPayload: { playerName, pos, weeks, tipo },
    availableActions: [{ id: 'goto_dm', label: 'Ver departamento médico', kind: 'goto', screen: 'dm' }],
  });
}

/* ================= 1) RELATÓRIO DE TREINO (substitui o toast) ================= */
export interface TrainingDelta { playerId: string; nome: string; improvements: Record<string, number>; }
export function sendTrainingReport(s: GameState, results: TrainingDelta[]): void {
  if (!results.length) return;
  const top = [...results]
    .map(r => ({ ...r, total: Object.values(r.improvements).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);
  const lines = top.map(r =>
    `${r.nome}: ${Object.entries(r.improvements).map(([k, v]) => `${k} +${v}`).join(', ')} (total +${r.total})`);
  const intensity = s.trainingState.intensity;
  notify(s, {
    category: 'training',
    sender: 'Coordenação de Treino', senderIcon: '🏋️',
    subject: `Relatório de treino — ${results.length} jogador(es) evoluíram`,
    body:
      `Sessão de treino (${intensity.toLowerCase()}) concluída. Destaques da semana:\n\n${lines.join('\n')}\n\n` +
      `Jogadores com mais snaps em campo evoluem mais rápido. Ajuste a intensidade e o foco ` +
      `na tela de Táticas & Treino para direcionar o desenvolvimento do elenco.`,
    priority: 'low',
    dataPayload: { results: top, intensity },
    availableActions: [{ id: 'goto_taticas', label: 'Ajustar treino', kind: 'goto', screen: 'taticas' }],
  });
}

/* ================= 2) PRESSÃO DA DIRETORIA (semanal) ================= */
export function sendWeeklyPressure(s: GameState, perf: CoachPerformance): void {
  const team = teamOf(s, s.userTeam);
  const st = computeStandings(s);
  const me = st.get(s.userTeam);
  const seedTxt = me?.playoffSeed != null ? `zona de playoffs (seed #${me.playoffSeed})` : 'fora da zona de playoffs';
  const last = s.coachHistory[s.coachHistory.length - 2];
  const trend = last ? perf.overallRating - last.overallRating : 0;
  const trendTxt = trend > 0 ? `em alta (+${trend})` : trend < 0 ? `em queda (${trend})` : 'estável';

  let pressure: string;
  if (perf.overallRating >= 65) pressure = 'A diretoria está satisfeita e o clima é de confiança. Mantenha o ritmo.';
  else if (perf.overallRating >= 45) pressure = 'A diretoria acompanha de perto. Bons resultados nas próximas semanas são esperados.';
  else pressure = '⚠ A diretoria está impaciente. Uma sequência ruim pode colocar seu cargo em risco.';

  notify(s, {
    category: 'front_office',
    sender: 'Diretoria', senderIcon: '🏢',
    subject: `Pressão da diretoria — Semana ${perf.week}`,
    body:
      `Resumo semanal do ${team.cidade} ${team.nome}:\n\n` +
      `• Avaliação geral: ${perf.overallRating}/100 (${trendTxt})\n` +
      `• Campanha: nota ${perf.winPctScore} — você está ${seedTxt}\n` +
      `• Gestão do cap: nota ${perf.capManagementScore}\n\n` +
      `${pressure}`,
    priority: perf.overallRating < 40 ? 'urgent' : 'low',
    dataPayload: { perf },
    availableActions: [{ id: 'goto_standings', label: 'Ver classificação', kind: 'goto', screen: 'classificacao' }],
  });
}

/* ================= 6) OUTROS TIPOS DE MENSAGENS ================= */

/* --- Contrato / renovação --- */
export function sendContractMessage(s: GameState, playerName: string, pos: string, years: number, base: number): void {
  notify(s, {
    category: 'contract',
    sender: 'Agente do Jogador', senderIcon: '✍️',
    subject: `Contrato fechado: ${playerName}`,
    body: `${playerName} (${pos}) assinou por ${years} temporada(s) a $${base.toFixed(1)}M/ano. ` +
      `O acordo foi registrado na liga e o cap hit já está computado.`,
    priority: 'normal',
    dataPayload: { playerName, pos, years, base },
    availableActions: [{ id: 'goto_negociacoes', label: 'Ver contratos', kind: 'goto', screen: 'negociacoes' }],
  });
}

/* --- Troca confirmada --- */
export function sendTradeMessage(s: GameState, partnerSigla: string, gave: string, got: string): void {
  notify(s, {
    category: 'trade',
    sender: 'Escritório da Liga', senderIcon: '🔄',
    subject: `Troca confirmada com o ${partnerSigla}`,
    body: `A liga homologou a troca.\n\nVocê enviou: ${gave}\nVocê recebeu: ${got}\n\n` +
      `Jogadores recém-chegados precisam de algumas semanas para ganhar entrosamento.`,
    priority: 'normal',
    dataPayload: { partnerSigla, gave, got },
    availableActions: [{ id: 'goto_trades', label: 'Central de trocas', kind: 'goto', screen: 'trades' }],
  });
}

/* --- Contratação na free agency --- */
export function sendFreeAgentMessage(s: GameState, playerName: string, pos: string, ovr: number, salary: number): void {
  notify(s, {
    category: 'agent',
    sender: 'Agente do Jogador', senderIcon: '🤝',
    subject: `Reforço contratado: ${playerName}`,
    body: `${playerName} (${pos}, OVR ${ovr}) aceitou sua proposta de $${salary.toFixed(1)}M/ano ` +
      `e já está integrado ao elenco. Avalie o encaixe tático na próxima partida.`,
    priority: 'normal',
    dataPayload: { playerName, pos, ovr, salary },
    availableActions: [{ id: 'goto_elenco', label: 'Ver elenco', kind: 'goto', screen: 'elenco' }],
  });
}

/* --- Escolha no draft --- */
export function sendDraftMessage(s: GameState, round: number, playerName: string, pos: string, college: string): void {
  notify(s, {
    category: 'scouting',
    sender: 'Scout Chefe', senderIcon: '🔍',
    subject: `Draft: ${playerName} selecionado na rodada ${round}`,
    body: `O ${s.teams.find(t => t.id === s.userTeam)?.sigla} usou a escolha da rodada ${round} em ` +
      `${playerName} (${pos}), vindo de ${college}. O novato assinou por 4 temporadas. ` +
      `Desenvolva-o com snaps e treino para atingir o potencial projetado.`,
    priority: 'normal',
    dataPayload: { round, playerName, pos, college },
    availableActions: [{ id: 'goto_elenco', label: 'Ver elenco', kind: 'goto', screen: 'elenco' }],
  });
}

/* --- Marco / recorde de um jogador --- */
export function sendMilestoneMessage(s: GameState, playerName: string, feito: string): void {
  notify(s, {
    category: 'media',
    sender: 'Mídia NFL', senderIcon: '📰',
    subject: `${playerName} atinge novo marco`,
    body: `${playerName} ${feito}. A imprensa destaca o momento do atleta e a torcida celebra. ` +
      `A valorização do jogador no mercado tende a subir.`,
    priority: 'low',
    dataPayload: { playerName, feito },
  });
}
