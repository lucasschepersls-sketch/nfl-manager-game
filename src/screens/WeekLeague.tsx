import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, standings, conferenceSeeds, type TableRow } from '../game/season';
import { Panel, TeamCrest, SeqBadge, Bar } from '../components/ui';
import type { Conf, GameState, Phase } from '../game/types';

/** Semana selecionável: pré-temporada (2) + temporada regular (18). */
type WeekSel = { fase: 'PRE' | 'REG'; semana: number };

/** Horário fictício determinístico (estilo grade de TV da NFL). */
function horario(matchId: string): string {
  let h = 0;
  for (let i = 0; i < matchId.length; i++) h = (h * 31 + matchId.charCodeAt(i)) >>> 0;
  const slots = ['14:00', '14:00', '17:05', '17:05', '21:20'];
  return slots[h % slots.length];
}

export function WeekLeagueScreen() {
  const { st } = useGame();
  const g = st.game!;
  const { fase, semana } = g.settings;

  // semana inicial: a atual (se estiver em PRE/REG), senão a semana 1 da regular
  const [sel, setSel] = useState<WeekSel>(() =>
    fase === 'PRE' || fase === 'REG' ? { fase, semana } : { fase: 'REG', semana: 1 },
  );
  const [confTab, setConfTab] = useState<Conf>('AFC');

  const jogos = useMemo(
    () => g.matches.filter(m => m.fase === sel.fase && m.rodada === sel.semana),
    [g.matches, sel],
  );

  // times de folga (bye) na semana selecionada da temporada regular
  const byes = useMemo(() => {
    if (sel.fase !== 'REG') return [];
    const jogando = new Set<string>();
    for (const m of jogos) { jogando.add(m.casa); jogando.add(m.fora); }
    return g.teams.filter(t => !jogando.has(t.id));
  }, [jogos, sel.fase, g.teams]);

  const isCurrent = sel.fase === fase && sel.semana === semana;
  const encerrados = jogos.filter(m => m.jogada).length;

  const titulo = sel.fase === 'PRE'
    ? `Pré-temporada · Semana ${sel.semana}`
    : `Temporada regular · Semana ${sel.semana}`;

  /* ---------- trilho de semanas ---------- */
  const weekPills: WeekSel[] = [
    { fase: 'PRE', semana: 1 }, { fase: 'PRE', semana: 2 },
    ...Array.from({ length: 18 }, (_, i) => ({ fase: 'REG' as const, semana: i + 1 })),
  ];

  const pillLabel = (w: WeekSel) => (w.fase === 'PRE' ? `P${w.semana}` : String(w.semana));
  const pillState = (w: WeekSel): 'done' | 'now' | 'todo' => {
    const idx = (f: Phase, s: number) => (f === 'PRE' ? s : 2 + s);
    const cur = idx(fase, semana);
    const th = idx(w.fase, w.semana);
    if (fase === 'PO' || fase === 'OFF') return th <= idx('REG', 18) ? 'done' : 'todo';
    if (th < cur) return 'done';
    if (th === cur) return 'now';
    return 'todo';
  };

  return (
    <div className="space-y-4">
      {/* cabeçalho + navegação de semanas */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-disp text-[30px] font-extrabold uppercase leading-none tracking-wide">
              {titulo}
              {isCurrent && (
                <span className="ml-3 inline-flex items-center gap-1.5 align-middle">
                  <span className="live-dot inline-block h-2 w-2 rounded-full bg-blood" />
                  <span className="font-disp text-[15px] font-bold text-blood">SEMANA ATUAL</span>
                </span>
              )}
            </h2>
            <p className="mt-1 font-mono text-[12px] text-faint">
              {jogos.length} jogo{jogos.length !== 1 ? 's' : ''} na liga
              {sel.fase === 'REG' && byes.length > 0 && <> · {byes.length} time{byes.length !== 1 ? 's' : ''} de folga</>}
              {jogos.length > 0 && <> · {encerrados}/{jogos.length} encerrados</>}
            </p>
          </div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setSel(fase === 'PRE' || fase === 'REG' ? { fase, semana } : { fase: 'REG', semana: 1 })}
          >
            ⟳ Ir para a semana atual
          </button>
        </div>

        {/* trilho de semanas */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border border-line bg-panel2 p-2">
          {weekPills.map(w => {
            const state = pillState(w);
            const active = sel.fase === w.fase && sel.semana === w.semana;
            const hasMine = g.matches.some(
              m => m.fase === w.fase && m.rodada === w.semana && (m.casa === g.userTeam || m.fora === g.userTeam),
            );
            return (
              <button
                key={`${w.fase}-${w.semana}`}
                onClick={() => setSel(w)}
                title={`${w.fase === 'PRE' ? 'Pré-temporada' : 'Temporada regular'} · Semana ${w.semana}${hasMine ? ' · seu time joga' : ''}`}
                className={`relative flex h-8 min-w-[34px] items-center justify-center border px-1.5 font-disp text-[13px] font-bold transition-all hover:-translate-y-px ${
                  active
                    ? 'border-gold bg-gold/15 text-goldhi shadow-[0_0_12px_rgba(240,180,41,0.25)]'
                    : state === 'done'
                      ? 'border-grass/40 bg-grass/5 text-grass'
                      : state === 'now'
                        ? 'border-line text-ink'
                        : 'border-line text-faint'
                } ${w.fase === 'PRE' ? 'mr-1' : ''}`}
              >
                {pillLabel(w)}
                {state === 'now' && <span className="live-dot absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blood" />}
                {hasMine && !active && <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gold" />}
              </button>
            );
          })}
          <span className="ml-auto hidden font-mono text-[10.5px] text-faint md:block">
            <span className="mr-2"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-grass" />jogada</span>
            <span className="mr-2"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blood" />atual</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gold" />seu time joga</span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        {/* ---------- jogos da semana ---------- */}
        <div className="space-y-4">
          {jogos.length === 0 ? (
            <Panel title="Sem jogos">
              <p className="font-mono text-[13px] text-dim">
                Nenhuma partida nesta semana — pode ser uma semana de bye coletiva ou a temporada ainda não começou.
              </p>
            </Panel>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {jogos.map(m => {
                const c = teamById(g, m.casa); const f = teamById(g, m.fora);
                const isMine = m.casa === g.userTeam || m.fora === g.userTeam;
                const isDiv = c.conf === f.conf && c.div === f.div;
                const isInter = c.conf !== f.conf;
                const winCasa = m.placarCasa! >= m.placarFora!;
                return (
                  <div
                    key={m.id}
                    className={`border p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(0,0,0,0.35)] ${
                      isMine ? 'border-gold shadow-[0_0_16px_rgba(240,180,41,0.18)]' : 'border-line'
                    }`}
                  >
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <span className={`tag ${m.jogada ? 'border-line text-dim' : 'border-grass/50 text-grass'}`}>
                        {m.jogada ? 'FINAL' : `AGENDADO · ${horario(m.id)}`}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {isDiv && <span className="tag border-gold/50 text-gold" title="Jogo de divisão">DIV</span>}
                        {isInter && <span className="tag border-blood/50 text-blood" title="Interconferência">{c.conf}×{f.conf}</span>}
                        {isMine && <span className="tag border-gold/60 text-gold">SEU JOGO</span>}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {[{ t: c, pts: m.placarCasa, home: true, won: m.jogada && winCasa },
                        { t: f, pts: m.placarFora, home: false, won: m.jogada && !winCasa }].map(({ t, pts, home, won }) => (
                        <div key={t.id} className={`flex items-center gap-2.5 ${m.jogada && !won ? 'opacity-70' : ''}`}>
                          <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={26} />
                          <div className="min-w-0 leading-tight">
                            <div className={`truncate font-disp text-[16px] font-bold uppercase ${won ? 'text-goldhi' : ''}`}>{t.cidade} {t.nome}</div>
                            <div className="font-mono text-[10px] text-faint">{home ? 'casa' : 'fora'}</div>
                          </div>
                          {m.jogada ? (
                            <span className={`ml-auto font-disp text-[22px] font-extrabold tabular-nums ${won ? 'text-goldhi' : 'text-faint'}`}>{pts}</span>
                          ) : (
                            <span className="ml-auto font-disp text-[14px] font-bold text-faint">vs</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* byes da semana */}
          {byes.length > 0 && (
            <Panel title={`De folga na semana ${sel.semana}`} pad={false}>
              <div className="flex flex-wrap items-center gap-2 p-3.5">
                {byes.map(t => (
                  <span key={t.id} className="flex items-center gap-2 border border-line bg-panel2 px-2.5 py-1.5">
                    <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={18} />
                    <span className="font-disp text-[13px] font-bold uppercase">{t.cidade} {t.nome}</span>
                  </span>
                ))}
                <span className="ml-auto font-mono text-[10.5px] text-faint">recuperação de lesionados</span>
              </div>
            </Panel>
          )}
        </div>

        {/* ---------- classificação por conferência ---------- */}
        <ConferenceStandings g={g} confTab={confTab} setConfTab={setConfTab} />
      </div>
    </div>
  );
}

/* ============ classificação por conferência (AFC / NFC) ============ */
function ConferenceStandings({ g, confTab, setConfTab }: {
  g: GameState;
  confTab: Conf;
  setConfTab: (c: Conf) => void;
}) {
  const G = g;
  const seeds = useMemo(() => conferenceSeeds(G, confTab), [G, confTab]);
  const seedOf = useMemo(() => new Map(seeds.map(s => [s.teamId, s.seed])), [seeds]);
  const rows = useMemo(
    () => standings(G).filter(r => teamById(G, r.teamId).conf === confTab)
      .sort((a, b) => (b.v + b.e * 0.5) - (a.v + a.e * 0.5) || b.net - a.net),
    [G, confTab],
  );
  const inZone = new Set(seeds.map(s => s.teamId));
  const bolha = rows.filter(r => !inZone.has(r.teamId)).slice(0, 2);
  const zoneRows = seeds.map(s => rows.find(r => r.teamId === s.teamId)!).filter(Boolean);

  return (
    <Panel
      title={`Classificação · ${confTab}`}
      pad={false}
      right={
        <span className="flex gap-1">
          {(['AFC', 'NFC'] as Conf[]).map(c => (
            <button
              key={c}
              onClick={() => setConfTab(c)}
              className={`btn btn-sm ${confTab === c ? 'btn-gold' : 'btn-ghost'}`}
            >
              {c}
            </button>
          ))}
        </span>
      }
    >
      <div className="p-3.5">
        <p className="mb-2 font-mono text-[10.5px] leading-relaxed text-faint">
          7 vagas: seeds <b className="text-dim">#1–#4</b> campeões de divisão + <b className="text-dim">#5–#7</b> wild cards.
          O #1 folga no Wild Card.
        </p>

        {/* zona de playoffs */}
        <div className="space-y-1.5">
          {zoneRows.map((r, i) => {
            const t = teamById(G, r.teamId);
            const seed = seedOf.get(r.teamId)!;
            const isChamp = seed <= 4;
            const isMine = r.teamId === G.userTeam;
            return (
              <ConfRow key={r.teamId} r={r} t={t} seed={seed} isChamp={isChamp} isMine={isMine} inZone />
            );
          })}
        </div>

        {/* linha de corte */}
        <div className="my-2.5 flex items-center gap-2">
          <span className="h-px flex-1 border-t border-dashed border-line" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-faint">corte dos playoffs</span>
          <span className="h-px flex-1 border-t border-dashed border-line" />
        </div>

        {/* bolha */}
        <div className="space-y-1.5 opacity-60">
          {bolha.map(r => {
            const t = teamById(G, r.teamId);
            return (
              <ConfRow key={r.teamId} r={r} t={t} seed={null} isChamp={false} isMine={r.teamId === G.userTeam} inZone={false} />
            );
          })}
        </div>

        {/* resumo da conferência */}
        <div className="mt-3 border-t border-line2 pt-2.5">
          <div className="mb-1.5 flex justify-between font-mono text-[10.5px] text-faint">
            <span>Jogos disputados na conferência</span>
            <b className="text-dim">{rows.reduce((a, r) => a + r.j, 0) / 2}</b>
          </div>
          <Bar pct={Math.min(100, (rows[0]?.j ?? 0) / 17 * 100)} color="var(--color-gold)" h={6} />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
            <span>progresso da temporada (17 rodadas)</span>
            <span>{Math.round(((rows[0]?.j ?? 0) / 17) * 100)}%</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function ConfRow({ r, t, seed, isChamp, isMine, inZone }: {
  r: TableRow; t: { cor: string; cor2: string; sigla: string; conf: Conf };
  seed: number | null; isChamp: boolean; isMine: boolean; inZone: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 border px-2 py-1.5 transition-colors ${
        isMine ? 'border-gold/60 bg-gold/5' : 'border-line2'
      }`}
      title={`${t.sigla}: ${r.v}V ${r.e}E ${r.d}D · ${r.pf} pts pró / ${r.pc} contra`}
    >
      <span className={`grid h-6 w-6 shrink-0 place-items-center border font-disp text-[12px] font-extrabold ${
        seed === 1 ? 'border-gold text-goldhi'
          : isChamp ? 'border-grass/50 text-grass'
            : seed ? 'border-line text-dim'
              : 'border-line text-faint'
      }`}>
        {seed ? `#${seed}` : '—'}
      </span>
      <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={20} />
      <span className={`min-w-0 flex-1 truncate font-disp text-[14px] font-bold uppercase ${isMine ? 'text-goldhi' : ''}`}>
        {t.sigla}
        {isChamp && <span className="ml-1.5 text-[9px] font-mono font-normal lowercase text-grass">div</span>}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-dim">
        <b className={inZone ? 'text-grass' : 'text-ink'}>{r.v}</b>–{r.d}{r.e ? `–${r.e}` : ''}
      </span>
      <span className={`w-9 text-right font-mono text-[11px] tabular-nums ${r.net > 0 ? 'text-grass' : r.net < 0 ? 'text-blood' : 'text-faint'}`}>
        {r.net > 0 ? `+${r.net}` : r.net}
      </span>
      <span className="hidden sm:block"><SeqBadge seq={r.seq} /></span>
    </div>
  );
}
