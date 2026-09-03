import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, standings } from '../game/season';
import { TeamCrest } from '../components/ui';
import type { Match, Phase } from '../game/types';

/* Navegação: P1, P2 | semanas 1-18 | WC, DV, CF, SB */
type WeekRef = { fase: Phase; rodada: number; label: string };
const WEEKS: WeekRef[] = [
  { fase: 'PRE', rodada: 1, label: 'P1' },
  { fase: 'PRE', rodada: 2, label: 'P2' },
  ...[...Array(18)].map((_, i) => ({ fase: 'REG' as Phase, rodada: i + 1, label: `${i + 1}` })),
  { fase: 'PO', rodada: 1, label: 'WC' },
  { fase: 'PO', rodada: 2, label: 'DV' },
  { fase: 'PO', rodada: 3, label: 'CF' },
  { fase: 'PO', rodada: 4, label: 'SB' },
];
const PO_NOMES = ['Wild Card', 'Divisional', 'Final de Conferência', 'Super Bowl'];

function horaJogo(m: Match): string {
  // horário de abertura determinístico por jogo (13:00, 14:25, 17:05, 21:20)
  let h = 0;
  for (const c of m.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const slots = ['13:00', '14:25', '17:05', '21:20'];
  return slots[h % 4];
}

export function WeekLeagueScreen() {
  const { st } = useGame();
  const g = st.game!;
  const faseAtual = g.settings.fase;
  const semanaAtual = g.settings.semana;

  const [sel, setSel] = useState<WeekRef>(() => {
    if (faseAtual === 'PO') return WEEKS.find(w => w.fase === 'PO' && w.rodada === Math.min(semanaAtual, 4))!;
    if (faseAtual === 'REG') return WEEKS.find(w => w.fase === 'REG' && w.rodada === semanaAtual)!;
    if (faseAtual === 'PRE') return WEEKS.find(w => w.fase === 'PRE' && w.rodada === semanaAtual)!;
    return WEEKS[2]; // offseason → semana 1
  });

  const jogos = useMemo(
    () => g.matches.filter(m => m.fase === sel.fase && m.rodada === sel.rodada),
    [g.matches, sel],
  );
  const byId = useMemo(() => new Map(standings(g).map(r => [r.teamId, r])), [g]);
  const byeTeams = useMemo(() => {
    if (sel.fase !== 'REG') return [];
    const jogando = new Set(jogos.flatMap(m => [m.casa, m.fora]));
    return g.teams.filter(t => !jogando.has(t.id));
  }, [g.teams, jogos, sel]);

  const stats = useMemo(() => {
    const enc = jogos.filter(m => m.jogada);
    const pontos = enc.reduce((s, m) => s + (m.placarCasa ?? 0) + (m.placarFora ?? 0), 0);
    let maior: Match | null = null; let maiorMargem = -1;
    for (const m of enc) {
      const margem = Math.abs((m.placarCasa ?? 0) - (m.placarFora ?? 0));
      if (margem > maiorMargem) { maiorMargem = margem; maior = m; }
    }
    return { encerrados: enc.length, total: jogos.length, pontos, maior, maiorMargem };
  }, [jogos]);

  const titulo = sel.fase === 'PRE' ? `Pré-Temporada · Semana ${sel.rodada}`
    : sel.fase === 'REG' ? `Semana ${String(sel.rodada).padStart(2, '0')}`
      : PO_NOMES[sel.rodada - 1] ?? 'Playoffs';
  const sub = sel.fase === 'REG' && sel.rodada === 18 ? 'Rodada final — 100% jogos de divisão'
    : sel.fase === 'PO' ? 'Eliminatórias — jogo único'
      : sel.fase === 'PRE' ? 'Amistosos — não contam na classificação'
        : '';
  const faseAtiva = faseAtual === sel.fase && (faseAtual !== 'REG' || semanaAtual === sel.rodada) && (faseAtual !== 'PO' || semanaAtual === sel.rodada) && (faseAtual !== 'PRE' || semanaAtual === sel.rodada);

  const camp = (id: string) => {
    const r = byId.get(id);
    return r ? `${r.v}–${r.d}${r.e ? `–${r.e}` : ''}` : '0–0';
  };

  return (
    <div className="space-y-5">
      {/* cabeçalho da semana */}
      <div className="panel relative overflow-hidden px-6 py-5">
        <div className="pointer-events-none absolute -right-2 -top-10 select-none font-disp text-[150px] font-extrabold leading-none text-gold/[0.06]">
          {sel.fase === 'REG' ? sel.rodada : sel.label}
        </div>
        <div className="relative">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <h1 className="font-disp text-[34px] font-extrabold uppercase leading-none tracking-wide">{titulo}</h1>
            {sub && <span className="mb-1 font-mono text-[12px] text-gold/90">{sub}</span>}
            {faseAtiva && faseAtual !== 'PO' && faseAtual !== 'OFF' && (
              <span className="mb-1.5 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-blood">
                <span className="live-dot inline-block h-2 w-2 rounded-full bg-blood" /> rodada em andamento
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[12px] text-dim">
            <span><b className="text-ink">{stats.encerrados}</b>/{stats.total} jogos encerrados</span>
            <span><b className="text-ink">{stats.pontos}</b> pontos marcados</span>
            {stats.maior && (
              <span>
                maior margem: <b className="text-goldhi">{stats.maiorMargem} pts</b>{' '}
                ({teamById(g, (stats.maior.placarCasa ?? 0) >= (stats.maior.placarFora ?? 0) ? stats.maior.casa : stats.maior.fora).sigla})
              </span>
            )}
            {byeTeams.length > 0 && <span><b className="text-ink">{byeTeams.length}</b> de folga</span>}
          </div>
        </div>
      </div>

      {/* navegação de semanas */}
      <div className="flex flex-wrap items-center gap-1.5">
        {WEEKS.map((w, i) => {
          const isNow = (faseAtual === w.fase &&
            ((w.fase === 'REG' && semanaAtual === w.rodada) ||
              (w.fase === 'PRE' && semanaAtual === w.rodada) ||
              (w.fase === 'PO' && semanaAtual === w.rodada)));
          const separador = (i === 2 || i === 20) && <span key={`sep${i}`} className="mx-1 h-5 w-px bg-line" />;
          return (
            <span key={`${w.fase}${w.rodada}`} className="contents">
              {separador}
              <button
                className={`week-pill ${sel.fase === w.fase && sel.rodada === w.rodada ? 'on' : ''}`}
                onClick={() => setSel(w)}
                title={w.fase === 'PRE' ? `Pré-temporada ${w.rodada}` : w.fase === 'REG' ? `Semana ${w.rodada}` : PO_NOMES[w.rodada - 1]}
              >
                {w.label}
                {isNow && faseAtual !== 'OFF' && <span className="now-dot" />}
              </button>
            </span>
          );
        })}
        {!(faseAtiva && faseAtual !== 'OFF') && faseAtual !== 'OFF' && (
          <button
            className="btn btn-ghost btn-sm ml-2"
            onClick={() => setSel(
              faseAtual === 'PO' ? WEEKS.find(w => w.fase === 'PO' && w.rodada === Math.min(semanaAtual, 4))!
                : faseAtual === 'REG' ? WEEKS.find(w => w.fase === 'REG' && w.rodada === semanaAtual)!
                  : WEEKS.find(w => w.fase === 'PRE' && w.rodada === semanaAtual)!)
            }
          >
            Ir p/ atual »
          </button>
        )}
      </div>

      {/* jogos */}
      {jogos.length === 0 ? (
        <div className="panel px-6 py-14 text-center">
          <div className="font-disp text-[24px] font-bold uppercase text-dim">
            {faseAtual === 'OFF' && sel.fase === 'REG' && sel.rodada === 1 ? 'Offseason — o calendário da nova temporada será gerado ao iniciar' : 'Sem jogos definidos'}
          </div>
          {sel.fase === 'PO' && (
            <p className="mt-2 font-mono text-[12.5px] text-faint">
              Esta rodada dos playoffs ainda não foi sorteada pela liga.
            </p>
          )}
        </div>
      ) : (
        <div key={`${sel.fase}${sel.rodada}`} className="card-stagger grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
          {jogos.map(m => {
            const casa = teamById(g, m.casa);
            const fora = teamById(g, m.fora);
            const mine = m.casa === g.userTeam || m.fora === g.userTeam;
            const winC = m.jogada && (m.placarCasa ?? 0) > (m.placarFora ?? 0);
            const winF = m.jogada && (m.placarFora ?? 0) > (m.placarCasa ?? 0);
            const isDiv = casa.conf === fora.conf && casa.div === fora.div;
            const inter = casa.conf !== fora.conf;
            return (
              <div key={m.id} className={`week-card ${mine ? 'mine' : ''} flex flex-col`}>
                <div className="flex items-center justify-between border-b border-line2 px-3.5 py-1.5">
                  <span className={`font-mono text-[10.5px] uppercase tracking-wider ${m.jogada ? 'text-faint' : 'text-grass'}`}>
                    {m.jogada ? 'Final' : faseAtiva ? 'Hoje' : `Agendado · ${horaJogo(m)}`}
                  </span>
                  <span className="flex gap-1">
                    {isDiv && <span className="tag border-gold/60 text-gold">DIV</span>}
                    {inter && <span className="tag border-blood/50 text-blood">AFC×NFC</span>}
                  </span>
                </div>

                <div className="flex flex-1 flex-col justify-center gap-2 px-3.5 py-3">
                  {[{ t: casa, fora: false, win: winC, sc: m.placarCasa }, { t: fora, fora: true, win: winF, sc: m.placarFora }].map(({ t, fora: isFora, win, sc }) => (
                    <div key={t.id} className="flex items-center gap-2.5">
                      <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={26} />
                      <div className="min-w-0 leading-tight">
                        <div className={`truncate font-disp text-[16px] font-bold uppercase ${m.jogada && !win ? 'text-dim' : 'text-ink'}`}>
                          {t.cidade} <span className={win ? 'text-goldhi' : ''}>{t.nome}</span>
                        </div>
                        <div className="font-mono text-[10.5px] text-faint">{camp(t.id)}{isFora ? ' · visitante' : ''}</div>
                      </div>
                      <span className={`ml-auto font-disp text-[26px] font-extrabold tabular-nums leading-none ${m.jogada ? (win ? 'text-goldhi' : 'text-dim') : 'text-faint/50'}`}>
                        {m.jogada ? sc : '–'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-line2 px-3.5 py-1.5">
                  <span className="truncate font-mono text-[10.5px] text-faint">{casa.estadioNome}</span>
                  {mine && <span className="tag shrink-0 border-gold/60 text-goldhi">SEU</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* byes da semana */}
      {byeTeams.length > 0 && (
        <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
          <span className="font-disp text-[15px] font-bold uppercase tracking-wider text-gold">Folgam na semana</span>
          {byeTeams.map(t => (
            <span key={t.id} className="inline-flex items-center gap-2 font-mono text-[12px] text-dim">
              <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={18} />
              {t.cidade} <b className="text-ink">{t.nome}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
