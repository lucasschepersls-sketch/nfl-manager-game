import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, standings, conferenceSeeds, type TableRow } from '../game/season';
import { Panel, TeamCrest, SeqBadge, Bar } from '../components/ui';
import type { Conf, GameState, Phase, Match } from '../game/types';

/** Semana selecionável: pré-temporada (2) + temporada regular (18) + playoffs (4). */
type WeekSel = { fase: 'PRE' | 'REG' | 'PO'; semana: number };

/** Rodadas dos playoffs. */
const PO_ROUNDS: { semana: number; label: string; nome: string }[] = [
  { semana: 1, label: 'WC', nome: 'Wild Card' },
  { semana: 2, label: 'DIV', nome: 'Divisional' },
  { semana: 3, label: 'CONF', nome: 'Final de Conferência' },
  { semana: 4, label: 'SB', nome: 'Super Bowl' },
];

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

  // semana inicial: a atual, senão a semana 1 da temporada regular
  const [sel, setSel] = useState<WeekSel>(() =>
    fase === 'PRE' || fase === 'REG' || fase === 'PO' ? { fase, semana } : { fase: 'REG', semana: 1 },
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

  // mapa teamId -> seed (para exibir seeds nos jogos de playoffs)
  const seedOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const conf of ['AFC', 'NFC'] as Conf[]) {
      for (const s of conferenceSeeds(g, conf)) m.set(s.teamId, s.seed);
    }
    return m;
  }, [g]);

  const isCurrent = sel.fase === fase && sel.semana === semana;
  const encerrados = jogos.filter(m => m.jogada).length;

  const titulo = sel.fase === 'PRE'
    ? `Pré-temporada · Semana ${sel.semana}`
    : sel.fase === 'REG'
      ? `Temporada regular · Semana ${sel.semana}`
      : `Playoffs · ${PO_ROUNDS[sel.semana - 1].nome}`;

  /* ---------- trilho de semanas ---------- */
  const weekPills: WeekSel[] = [
    { fase: 'PRE', semana: 1 }, { fase: 'PRE', semana: 2 },
    ...Array.from({ length: 18 }, (_, i) => ({ fase: 'REG' as const, semana: i + 1 })),
    ...Array.from({ length: 4 }, (_, i) => ({ fase: 'PO' as const, semana: i + 1 })),
  ];

  // índice linear para comparação de anterior/atual/posterior
  const idxOf = (f: Phase, s: number) => (f === 'PRE' ? s : f === 'REG' ? 2 + s : 20 + s);

  const pillLabel = (w: WeekSel) =>
    w.fase === 'PRE' ? `P${w.semana}` : w.fase === 'REG' ? String(w.semana) : PO_ROUNDS[w.semana - 1].label;

  const pillState = (w: WeekSel): 'done' | 'now' | 'todo' => {
    const cur = idxOf(fase, semana);
    const th = idxOf(w.fase, w.semana);
    if (fase === 'OFF') return 'done';
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
                  <span className="font-disp text-[15px] font-bold text-blood">
                    {sel.fase === 'PO' ? 'RODADA ATUAL' : 'SEMANA ATUAL'}
                  </span>
                </span>
              )}
            </h2>
            <p className="mt-1 font-mono text-[12px] text-faint">
              {jogos.length > 0
                ? <>{jogos.length} jogo{jogos.length !== 1 ? 's' : ''} na liga</>
                : sel.fase === 'PO' ? 'Confrontos ainda não definidos' : 'Sem jogos'}
              {sel.fase === 'REG' && byes.length > 0 && <> · {byes.length} time{byes.length !== 1 ? 's' : ''} de folga</>}
              {jogos.length > 0 && <> · {encerrados}/{jogos.length} encerrados</>}
            </p>
          </div>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setSel(fase === 'PRE' || fase === 'REG' || fase === 'PO' ? { fase, semana } : { fase: 'REG', semana: 1 })}
          >
            ⟳ Ir para a {fase === 'PO' ? 'rodada' : 'semana'} atual
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
            const isPO = w.fase === 'PO';
            return (
              <button
                key={`${w.fase}-${w.semana}`}
                onClick={() => setSel(w)}
                title={`${w.fase === 'PRE' ? 'Pré-temporada' : w.fase === 'REG' ? 'Temporada regular' : `Playoffs · ${PO_ROUNDS[w.semana - 1].nome}`} · ${isPO ? PO_ROUNDS[w.semana - 1].nome : `Semana ${w.semana}`}${hasMine ? ' · seu time joga' : ''}`}
                className={`relative flex h-8 items-center justify-center border px-1.5 font-disp text-[13px] font-bold transition-all hover:-translate-y-px ${
                  isPO ? 'min-w-[40px]' : 'min-w-[34px]'
                } ${
                  active
                    ? isPO
                      ? 'border-blood bg-blood/15 text-blood shadow-[0_0_12px_rgba(226,87,75,0.3)]'
                      : 'border-gold bg-gold/15 text-goldhi shadow-[0_0_12px_rgba(240,180,41,0.25)]'
                    : state === 'done'
                      ? 'border-grass/40 bg-grass/5 text-grass'
                      : state === 'now'
                        ? 'border-line text-ink'
                        : isPO
                          ? 'border-blood/25 text-blood/60'
                          : 'border-line text-faint'
                } ${w.fase === 'PRE' ? 'mr-1' : ''} ${isPO && w.semana === 1 ? 'ml-1 border-l-2 border-l-blood/40' : ''}`}
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
            <span className="mr-2"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-gold" />seu time joga</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full border border-blood/50" />playoffs</span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        {/* ---------- jogos da semana/rodada ---------- */}
        <div className="space-y-4">
          {jogos.length === 0 ? (
            <Panel title={sel.fase === 'PO' ? 'Confrontos a definir' : 'Sem jogos'}>
              <p className="font-mono text-[13px] text-dim">
                {sel.fase === 'PO'
                  ? `Os confrontos da rodada "${PO_ROUNDS[sel.semana - 1].nome}" ainda não foram definidos. Eles serão preenchidos automaticamente assim que a rodada anterior for concluída e os vencedores avançarem.`
                  : 'Nenhuma partida nesta semana — pode ser uma semana de bye coletiva ou a temporada ainda não começou.'}
              </p>
            </Panel>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {jogos.map(m => (
                <MatchCard key={m.id} m={m} g={g} seedOf={seedOf} isPO={sel.fase === 'PO'} />
              ))}
            </div>
          )}

          {/* byes da semana (temporada regular) */}
          {sel.fase === 'REG' && byes.length > 0 && (
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

          {/* folga dos seeds #1 no Wild Card */}
          {sel.fase === 'PO' && sel.semana === 1 && (
            <Panel title="Folgam no Wild Card (seeds #1)" pad={false}>
              <div className="flex flex-wrap items-center gap-2 p-3.5">
                {(['AFC', 'NFC'] as Conf[]).map(conf => {
                  const top = conferenceSeeds(g, conf).find(s => s.seed === 1);
                  if (!top) return null;
                  const t = teamById(g, top.teamId);
                  return (
                    <span key={conf} className="flex items-center gap-2 border border-gold/50 bg-gold/5 px-2.5 py-1.5">
                      <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={18} />
                      <span className="font-disp text-[13px] font-bold uppercase">{t.cidade} {t.nome}</span>
                      <span className="font-mono text-[10px] text-gold">#{conf}</span>
                    </span>
                  );
                })}
                <span className="ml-auto font-mono text-[10.5px] text-faint">avançam direto ao Divisional</span>
              </div>
            </Panel>
          )}
        </div>

        {/* ---------- coluna direita ---------- */}
        <div className="space-y-4">
          {sel.fase === 'PO' && <PlayoffBracket g={g} sel={sel} setSel={setSel} seedOf={seedOf} />}
          <ConferenceStandings g={g} confTab={confTab} setConfTab={setConfTab} />
        </div>
      </div>
    </div>
  );
}

/* ============ card de partida (com seeds nos playoffs) ============ */
function MatchCard({ m, g, seedOf, isPO }: {
  m: Match; g: GameState; seedOf: Map<string, number>; isPO: boolean;
}) {
  const c = teamById(g, m.casa); const f = teamById(g, m.fora);
  const isMine = m.casa === g.userTeam || m.fora === g.userTeam;
  const isDiv = c.conf === f.conf && c.div === f.div;
  const isInter = c.conf !== f.conf;
  const winCasa = (m.placarCasa ?? 0) >= (m.placarFora ?? 0);

  return (
    <div
      className={`border p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(0,0,0,0.35)] ${
        isMine ? 'border-gold shadow-[0_0_16px_rgba(240,180,41,0.18)]' : isPO ? 'border-blood/40' : 'border-line'
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className={`tag ${m.jogada ? 'border-line text-dim' : 'border-grass/50 text-grass'}`}>
          {m.jogada ? 'FINAL' : `AGENDADO · ${horario(m.id)}`}
        </span>
        <span className="flex items-center gap-1.5">
          {isPO && <span className="tag border-blood/50 text-blood" title="Jogo de playoffs">PO</span>}
          {!isPO && isDiv && <span className="tag border-gold/50 text-gold" title="Jogo de divisão">DIV</span>}
          {!isPO && isInter && <span className="tag border-blood/50 text-blood" title="Interconferência">{c.conf}×{f.conf}</span>}
          {isMine && <span className="tag border-gold/60 text-gold">SEU JOGO</span>}
        </span>
      </div>
      <div className="space-y-2">
        {[{ t: c, pts: m.placarCasa, home: true, won: m.jogada && winCasa },
          { t: f, pts: m.placarFora, home: false, won: m.jogada && !winCasa }].map(({ t, pts, home, won }) => (
          <div key={t.id} className={`flex items-center gap-2.5 ${m.jogada && !won ? 'opacity-70' : ''}`}>
            {isPO && seedOf.has(t.id) && (
              <span className="grid h-5 w-6 shrink-0 place-items-center border border-line font-mono text-[10px] font-bold text-dim">
                {seedOf.get(t.id)}
              </span>
            )}
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
}

/* ============ chaveamento dos playoffs (preenche conforme os confrontos são definidos) ============ */
function PlayoffBracket({ g, sel, setSel, seedOf }: {
  g: GameState; sel: WeekSel; setSel: (w: WeekSel) => void; seedOf: Map<string, number>;
}) {
  return (
    <Panel title="Chaveamento · Playoffs" pad={false}>
      <div className="space-y-2.5 p-3.5">
        {PO_ROUNDS.map(rd => {
          const jogosRodada = g.matches.filter(m => m.fase === 'PO' && m.rodada === rd.semana);
          const ativa = sel.fase === 'PO' && sel.semana === rd.semana;
          const encerradosRodada = jogosRodada.filter(m => m.jogada).length;
          return (
            <button
              key={rd.semana}
              onClick={() => setSel({ fase: 'PO', semana: rd.semana })}
              className={`block w-full border p-2.5 text-left transition-all hover:-translate-y-px ${
                ativa ? 'border-blood bg-blood/10 shadow-[0_0_12px_rgba(226,87,75,0.2)]' : 'border-line2 hover:border-line'
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className={`font-disp text-[14px] font-extrabold uppercase tracking-wide ${ativa ? 'text-blood' : 'text-ink'}`}>
                  {rd.label} · {rd.nome}
                </span>
                <span className="font-mono text-[10px] text-faint">
                  {jogosRodada.length === 0 ? 'a definir' : `${encerradosRodada}/${jogosRodada.length}`}
                </span>
              </div>
              <div className="space-y-1">
                {jogosRodada.length === 0 ? (
                  <p className="font-mono text-[10.5px] italic text-faint">Confrontos serão definidos após a rodada anterior.</p>
                ) : (
                  jogosRodada.map(m => {
                    const c = teamById(g, m.casa); const f = teamById(g, m.fora);
                    const winC = m.jogada && (m.placarCasa ?? 0) >= (m.placarFora ?? 0);
                    const winF = m.jogada && (m.placarFora ?? 0) > (m.placarCasa ?? 0);
                    return (
                      <div key={m.id} className="font-mono text-[11px]">
                        <div className={`flex items-center gap-1.5 ${m.jogada && !winC ? 'text-faint' : 'text-dim'}`}>
                          <span className={`w-3 text-right ${seedOf.get(m.casa) ? '' : 'text-faint'}`}>{seedOf.get(m.casa) ?? '–'}</span>
                          <span className={`truncate ${winC ? 'font-bold text-goldhi' : ''}`}>{c.sigla}</span>
                          {m.jogada && <span className={`ml-auto ${winC ? 'font-bold text-goldhi' : 'text-faint'}`}>{m.placarCasa}</span>}
                        </div>
                        <div className={`flex items-center gap-1.5 ${m.jogada && !winF ? 'text-faint' : 'text-dim'}`}>
                          <span className={`w-3 text-right ${seedOf.get(m.fora) ? '' : 'text-faint'}`}>{seedOf.get(m.fora) ?? '–'}</span>
                          <span className={`truncate ${winF ? 'font-bold text-goldhi' : ''}`}>{f.sigla}</span>
                          {m.jogada && <span className={`ml-auto ${winF ? 'font-bold text-goldhi' : 'text-faint'}`}>{m.placarFora}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </button>
          );
        })}
        <p className="pt-1 font-mono text-[10px] leading-relaxed text-faint">
          Clique em uma rodada para ver os jogos completos. Os confrontos são preenchidos
          automaticamente conforme cada rodada é concluída.
        </p>
      </div>
    </Panel>
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
  const seedOfConf = useMemo(() => new Map(seeds.map(s => [s.teamId, s.seed])), [seeds]);
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
          {zoneRows.map(r => {
            const t = teamById(G, r.teamId);
            const seed = seedOfConf.get(r.teamId)!;
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
