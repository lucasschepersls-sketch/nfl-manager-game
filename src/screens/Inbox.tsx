/* ============================================================
 * 📧 Inbox centralizado — mensagens persistentes, avaliação da
 * diretoria, demissão/recolocação e resultados Pro Bowl/Super Bowl.
 * ============================================================ */

import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, fmtM } from '../game/season';
import { CATEGORY_META, PRIORITY_META, unreadByCategory } from '../game/messaging';
import type { CoachPerformance, JobOpening, Message, MessageCategory } from '../game/types';
import { Panel, TeamCrest, Bar } from '../components/ui';

const CATS = Object.keys(CATEGORY_META) as MessageCategory[];

function securityZone(overall: number): { label: string; color: string } {
  if (overall >= 60) return { label: 'Cargo seguro', color: 'var(--color-grass)' };
  if (overall >= 40) return { label: 'Sob pressão', color: 'var(--color-gold)' };
  return { label: 'Risco de demissão', color: 'var(--color-blood)' };
}

/* ---------- barra de avaliação com rótulo ---------- */
function ScoreRow({ label, value }: { label: string; value: number }) {
  const color = value >= 60 ? 'var(--color-grass)' : value >= 40 ? 'var(--color-gold)' : 'var(--color-blood)';
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex justify-between font-mono text-[11px] text-dim">
        <span>{label}</span><b className="text-ink">{value}</b>
      </div>
      <Bar pct={value} color={color} />
    </div>
  );
}

/* ---------- payload: avaliação da diretoria ---------- */
function PerfPayload({ perf }: { perf: CoachPerformance }) {
  return (
    <div className="mt-3 border border-line2 bg-pitcho/60 p-3">
      <div className="mb-2 font-disp text-[13px] font-bold uppercase tracking-wider text-goldhi">Boletim de avaliação</div>
      <ScoreRow label="Campanha (vitórias)" value={perf.winPctScore} />
      <ScoreRow label="Progresso nos playoffs" value={perf.playoffProgressScore} />
      <ScoreRow label="Desenvolvimento de jogadores" value={perf.playerDevelopmentScore} />
      <ScoreRow label="Gestão do teto salarial" value={perf.capManagementScore} />
      <ScoreRow label="Relação com a mídia" value={perf.mediaRelationsScore} />
      <div className="mt-2 flex items-center justify-between border-t border-line2 pt-2">
        <span className="font-disp text-[14px] font-bold uppercase text-dim">Nota geral</span>
        <span className="font-disp text-[22px] font-extrabold" style={{ color: securityZone(perf.overallRating).color }}>
          {perf.overallRating}/100
        </span>
      </div>
    </div>
  );
}

/* ---------- payload: Pro Bowl (por conferência) ---------- */
interface ProBowlPickView { playerId: string; nome: string; pos: string; sigla: string; starter: boolean; }
function ProBowlPayload({ msg }: { msg: Message }) {
    const afc = (msg.dataPayload?.afc ?? []) as ProBowlPickView[];
  const nfc = (msg.dataPayload?.nfc ?? []) as ProBowlPickView[];
  if (!afc.length && !nfc.length) return null;
  const col = (title: string, picks: ProBowlPickView[], color: string) => (
    <div>
      <div className="mb-1.5 font-disp text-[12.5px] font-bold uppercase tracking-wider" style={{ color }}>{title}</div>
      {picks.map(p => (
        <div key={p.playerId} className="flex items-center gap-1.5 py-[3px] font-mono text-[11.5px]">
          <span className={p.starter ? 'text-goldhi' : 'text-faint'}>{p.starter ? '⭐' : '•'}</span>
          <span className="w-7 shrink-0 text-[10px] uppercase text-faint">{p.pos}</span>
          <span className={p.starter ? 'text-ink' : 'text-dim'}>{p.nome}</span>
          <span className="ml-auto text-[10px] text-faint">{p.sigla}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="mt-3 grid gap-3 border border-line2 bg-pitcho/60 p-3 sm:grid-cols-2">
      {col('Conferência AFC', afc, 'var(--color-ice)')}
      {col('Conferência NFC', nfc, 'var(--color-grass)')}
    </div>
  );
}

/* ---------- payload: relatório de treino ---------- */
function TrainingPayload({ msg }: { msg: Message }) {
  const results = (msg.dataPayload?.results ?? []) as { nome: string; improvements: Record<string, number>; total?: number }[];
  if (!results.length) return null;
  return (
    <div className="mt-3 border border-line2 bg-pitcho/60 p-3">
      <div className="mb-1.5 font-disp text-[12.5px] font-bold uppercase tracking-wider text-grass">Destaques da sessão</div>
      {results.map((r, i) => {
        const total = r.total ?? Object.values(r.improvements).reduce((a, b) => a + b, 0);
        return (
          <div key={i} className="flex items-baseline gap-2 py-[3px] font-mono text-[11.5px]">
            <span className="text-ink">{r.nome}</span>
            <span className="truncate text-[10.5px] text-dim">
              {Object.entries(r.improvements).map(([k, v]) => `${k} +${v}`).join(' · ')}
            </span>
            <span className="ml-auto shrink-0 font-bold text-grass">+{total}</span>
          </div>
        );
      })}
    </div>
  );
}

export function InboxScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const [cat, setCat] = useState<MessageCategory | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const byCat = unreadByCategory(g);
  const totalUnread = g.messages.filter(m => !m.isRead && !m.isArchived).length;
  const lastPerf = g.coachHistory[g.coachHistory.length - 1];
  const prevPerf = g.coachHistory[g.coachHistory.length - 2];
  const trend = lastPerf && prevPerf ? lastPerf.overallRating - prevPerf.overallRating : 0;

  const filtered = useMemo(() => {
    return g.messages
      .filter(m => (showArchived ? m.isArchived : !m.isArchived))
      .filter(m => cat === 'all' || m.category === cat)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [g.messages, cat, showArchived]);

  const selected = filtered.find(m => m.id === selectedId) ?? filtered[0] ?? null;
  
  // marca como lida automaticamente quando a mensagem é exibida no painel
  // (resolve o caso da primeira mensagem auto-selecionada nunca ser marcada)
  useEffect(() => {
    if (selected && !selected.isRead) dispatch({ type: 'MSG_READ', id: selected.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.isRead]);

  const open = (m: Message) => {
    setSelectedId(m.id);
    if (!m.isRead) dispatch({ type: 'MSG_READ', id: m.id });
  };

  const runAction = (a: NonNullable<Message['availableActions']>[number]) => {
    if (a.kind === 'goto' && a.screen) dispatch({ type: 'SCREEN', screen: a.screen });
    else if (a.kind === 'apply_job' && a.jobId != null) dispatch({ type: 'APPLY_JOB', jobId: a.jobId });
  };

  const zone = lastPerf ? securityZone(lastPerf.overallRating) : null;

  return (
    <div className="space-y-4">
      {/* faixa de segurança do cargo */}
      {lastPerf && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-line bg-panel px-4 py-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">Avaliação da diretoria</div>
            <div className="flex items-baseline gap-2">
              <span className="font-disp text-[30px] font-extrabold leading-none" style={{ color: zone!.color }}>
                {lastPerf.overallRating}
              </span>
              <span className="font-mono text-[12px] text-dim">/100 · Semana {lastPerf.week}</span>
              {trend !== 0 && (
                <span className={`font-mono text-[12px] font-bold ${trend > 0 ? 'text-grass' : 'text-blood'}`}>
                  {trend > 0 ? `▲ +${trend}` : `▼ ${trend}`}
                </span>
              )}
            </div>
          </div>
          <div className="min-w-[200px] flex-1">
            <div className="mb-1 flex justify-between font-mono text-[11px] text-dim">
              <span>Segurança do cargo</span>
              <b style={{ color: zone!.color }}>{zone!.label}</b>
            </div>
            <Bar pct={lastPerf.overallRating} color={zone!.color} />
          </div>
          {g.coachFired && (
            <span className="tag border-blood/60 bg-blood/10 px-2 py-1 text-blood">DEMITIDO — procure um novo clube</span>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr_1fr]">
        {/* trilho de categorias */}
        <div className="space-y-1.5">
          <button
            onClick={() => { setCat('all'); setShowArchived(false); }}
            className={`flex w-full items-center justify-between border px-3 py-2 text-left transition-colors ${cat === 'all' && !showArchived ? 'border-gold bg-panel' : 'border-line2 bg-panel2 hover:border-line'}`}
          >
            <span className="font-disp text-[14px] font-bold uppercase tracking-wider text-ink">📥 Todas</span>
            {totalUnread > 0 && <span className="rounded-full bg-gold px-1.5 font-mono text-[11px] font-bold text-pitcho">{totalUnread}</span>}
          </button>
          {CATS.map(c => {
            const meta = CATEGORY_META[c];
            const n = byCat[c] ?? 0;
            return (
              <button
                key={c}
                onClick={() => { setCat(c); setShowArchived(false); }}
                className={`flex w-full items-center justify-between border px-3 py-1.5 text-left transition-colors ${cat === c && !showArchived ? 'border-gold bg-panel' : 'border-line2 bg-panel2 hover:border-line'}`}
              >
                <span className="font-mono text-[12px] text-dim">{meta.icon} {meta.label}</span>
                {n > 0 && <span className="rounded-full bg-gold px-1.5 font-mono text-[10px] font-bold text-pitcho">{n}</span>}
              </button>
            );
          })}
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`mt-2 flex w-full items-center justify-between border px-3 py-1.5 text-left transition-colors ${showArchived ? 'border-gold bg-panel' : 'border-line2 bg-panel2 hover:border-line'}`}
          >
            <span className="font-mono text-[12px] text-dim">🗄 Arquivadas</span>
          </button>
          <button
            onClick={() => dispatch({ type: 'MSG_READ_ALL', category: cat === 'all' ? undefined : cat })}
            className="btn btn-ghost mt-2 w-full text-[12px]"
          >
            Marcar todas como lidas
          </button>
        </div>

        {/* lista de mensagens */}
        <div className="max-h-[640px] overflow-y-auto border border-line bg-panel">
          {filtered.length === 0 && (
            <div className="p-6 text-center font-mono text-[12px] text-faint">Nenhuma mensagem aqui.</div>
          )}
          {filtered.map(m => {
            const meta = CATEGORY_META[m.category];
            const pri = PRIORITY_META[m.priority];
            const active = selected?.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => open(m)}
                className={`block w-full border-b border-line2 px-3 py-2.5 text-left transition-colors ${active ? 'bg-panel2' : 'hover:bg-panel2/60'}`}
                style={active ? { boxShadow: `inset 3px 0 0 ${meta.color}` } : undefined}
              >
                <div className="flex items-center gap-2">
                  {!m.isRead && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-gold" />}
                  <span className="shrink-0 text-[13px]">{meta.icon}</span>
                  <span className={`truncate font-mono text-[12.5px] ${m.isRead ? 'text-dim' : 'font-bold text-ink'}`}>
                    {m.subject}
                  </span>
                  {m.isStarred && <span className="shrink-0 text-goldhi">★</span>}
                  {m.priority === 'urgent' && (
                    <span className="ml-auto shrink-0 font-mono text-[9px] font-bold uppercase" style={{ color: pri.color }}>● {pri.label}</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 pl-6 font-mono text-[10.5px] text-faint">
                  <span>{m.sender}</span>
                  <span>·</span>
                  <span>T{m.season} S{m.week}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* painel de leitura */}
        <div className="max-h-[640px] overflow-y-auto border border-line bg-panel">
          {!selected ? (
            <div className="p-6 text-center font-mono text-[12px] text-faint">Selecione uma mensagem para ler.</div>
          ) : (
            <div className="p-4">
              <div className="mb-3 border-b border-line2 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-disp text-[20px] font-bold uppercase leading-tight text-ink">{selected.subject}</h3>
                  <span className="tag shrink-0 px-2 py-0.5" style={{ borderColor: PRIORITY_META[selected.priority].color, color: PRIORITY_META[selected.priority].color }}>
                    {PRIORITY_META[selected.priority].label}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 font-mono text-[11.5px] text-dim">
                  <span className="text-[14px]">{selected.senderIcon}</span>
                  <b className="text-ink">{selected.sender}</b>
                  <span>·</span>
                  <span>Temporada {selected.season}, Semana {selected.week}</span>
                </div>
              </div>

              <p className="whitespace-pre-line font-mono text-[13px] leading-relaxed text-ink/90">{selected.body}</p>

              {selected.category === 'front_office' && selected.dataPayload?.perf ? (
                <PerfPayload perf={selected.dataPayload.perf as CoachPerformance} />
              ) : null}
              {selected.category === 'pro_bowl' && <ProBowlPayload msg={selected} />}
              {selected.category === 'training' && <TrainingPayload msg={selected} />}

              {selected.availableActions && selected.availableActions.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selected.availableActions.map(a => (
                    <button key={a.id} onClick={() => runAction(a)} className="btn btn-gold text-[13px]">
                      {a.label} »
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 flex gap-2 border-t border-line2 pt-3">
                <button onClick={() => dispatch({ type: 'MSG_STAR', id: selected.id })} className="btn btn-ghost text-[12px]">
                  {selected.isStarred ? '★ Favoritada' : '☆ Favoritar'}
                </button>
                <button onClick={() => dispatch({ type: 'MSG_ARCHIVE', id: selected.id })} className="btn btn-ghost text-[12px]">
                  {selected.isArchived ? 'Desarquivar' : 'Arquivar'}
                </button>
                <button onClick={() => dispatch({ type: 'MSG_DELETE', id: selected.id })} className="btn btn-ghost text-[12px] text-blood">
                  Excluir
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * 💼 Mercado de técnicos (vagas abertas)
 * ============================================================ */
const QUALITY_LABEL: Record<JobOpening['teamQuality'], { label: string; color: string }> = {
  contender: { label: 'Contender', color: 'var(--color-goldhi)' },
  playoff_team: { label: 'Playoffs', color: 'var(--color-grass)' },
  rebuilding: { label: 'Reconstrução', color: 'var(--color-ice)' },
  disaster: { label: 'Desastre', color: 'var(--color-blood)' },
};
const EXPECT_LABEL: Record<JobOpening['expectations'], string> = {
  win_now: 'Vencer agora',
  develop_young_players: 'Desenvolver jovens',
  rebuild: 'Reconstruir',
};

export function JobsScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const open = g.jobOpenings.filter(j => !j.isFilled);
  const lastPerf = g.coachHistory[g.coachHistory.length - 1];

  return (
    <div className="space-y-4">
      <Panel
        title="💼 Mercado de técnicos"
        right={<span className="font-mono text-[11px] text-dim">{open.length} vaga(s) aberta(s)</span>}
      >
        {g.coachFired && (
          <div className="mb-3 border border-blood/50 bg-blood/10 px-3 py-2 font-mono text-[12px] text-blood">
            Você está desempregado. Seja contratado por um novo clube para retomar a carreira.
          </div>
        )}
        {lastPerf && (
          <div className="mb-3 font-mono text-[12px] text-dim">
            Sua reputação atual: <b style={{ color: securityZone(lastPerf.overallRating).color }}>{lastPerf.overallRating}/100</b>
            {' '}— quanto maior, mais chances de ser aprovado em vagas de alta pressão.
          </div>
        )}
        {open.length === 0 && (
          <div className="p-4 text-center font-mono text-[12px] text-faint">
            Nenhuma vaga aberta no momento. Técnicos são demitidos durante a temporada conforme os resultados.
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {open.map(j => {
            const team = teamById(g, j.teamId);
            const q = QUALITY_LABEL[j.teamQuality];
            return (
              <div key={j.id} className="border border-line2 bg-panel2 p-3 transition-transform hover:-translate-y-0.5">
                <div className="flex items-center gap-3">
                  <TeamCrest cor={team.cor} cor2={team.cor2} sigla={team.sigla} conf={team.conf} size={40} />
                  <div className="flex-1">
                    <div className="font-disp text-[16px] font-bold uppercase text-ink">{team.cidade} {team.nome}</div>
                    <div className="font-mono text-[10.5px] text-faint">{team.estadioNome}</div>
                  </div>
                  <span className="tag px-2 py-0.5" style={{ borderColor: q.color, color: q.color }}>{q.label}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-dim">
                  <span>Elenco: <b className="text-ink">{j.rosterQuality}</b></span>
                  <span>Cap livre: <b className={j.capSpace >= 0 ? 'text-grass' : 'text-blood'}>{fmtM(j.capSpace)}</b></span>
                  <span>Expectativa: <b className="text-ink">{EXPECT_LABEL[j.expectations]}</b></span>
                  <span>Pressão: <b className="text-goldhi">{j.pressureLevel}/10</b></span>
                  <span className="col-span-2">Picks: <b className="text-ink">{j.draftPicks.length ? j.draftPicks.map(r => `R${r}`).join(', ') : '—'}</b></span>
                </div>
                <button
                  onClick={() => dispatch({ type: 'APPLY_JOB', jobId: j.id })}
                  className="btn btn-gold mt-3 w-full text-[13px]"
                >
                  Candidatar-se ao cargo »
                </button>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
