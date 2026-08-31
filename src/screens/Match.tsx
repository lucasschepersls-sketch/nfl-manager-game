import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, crowdPressure } from '../game/season';
import { Panel, TeamCrest, PosBadge } from '../components/ui';
import type { GameState, LineTipo, LiveEvent, PlayerLine, Team } from '../game/types';

const LINE_STYLE: Record<LineTipo, string> = {
  info: 'text-faint italic',
  ok: 'text-ink',
  big: 'text-goldhi font-semibold',
  score: 'text-grass font-bold',
  turn: 'text-blood font-semibold',
  pen: 'text-ice',
  inj: 'text-blood bg-[rgba(226,87,75,0.09)] border-l-2 border-blood pl-2',
};
const NERVES_STYLE = 'text-goldhi bg-[rgba(240,180,41,0.1)] border-l-2 border-gold pl-2 font-semibold';
const ORD = ['1ª', '2ª', '3ª', '4ª'];
const SPEEDS = [
  { label: 'Lento', ms: 320, step: 1 },
  { label: 'Normal', ms: 150, step: 1 },
  { label: 'Rápido', ms: 60, step: 2 },
  { label: 'Turbo', ms: 16, step: 5 },
];

interface FieldState {
  ball: number; down: number; toGo: number;
  posse: 'casa' | 'fora'; pc: number; pf: number;
  quarter: number; clock: number;
}
const INIT: FieldState = { ball: 25, down: 1, toGo: 10, posse: 'casa', pc: 0, pf: 0, quarter: 1, clock: 0 };

function derive(events: LiveEvent[], idx: number): FieldState {
  let s = { ...INIT };
  for (const e of events.slice(0, idx)) {
    switch (e.kind) {
      case 'play':
        s = { ...s, ball: e.ball ?? s.ball, down: e.down ?? s.down, toGo: e.toGo ?? s.toGo, posse: e.posse ?? s.posse, clock: e.clock };
        break;
      case 'turnover':
        s = { ...s, ball: e.ball ?? s.ball, down: 1, toGo: 10, posse: e.posse ?? s.posse, clock: e.clock };
        break;
      case 'score':
        s = { ...s, pc: e.placarCasa ?? s.pc, pf: e.placarFora ?? s.pf, clock: e.clock };
        break;
      case 'quarter':
        s = { ...s, quarter: e.quarter ?? s.quarter, clock: e.clock };
        break;
      default:
        s = { ...s, clock: e.clock };
    }
  }
  return s;
}

const fmtClock = (clock: number, quarter: number) => {
  if (quarter >= 5) return 'OT';
  const inQ = Math.max(0, 900 - (clock % 900));
  const m = Math.floor(inQ / 60); const ss = Math.floor(inQ % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
};

function Field({ st, casa, fora }: { st: FieldState; casa: Team; fora: Team }) {
  const off = st.posse === 'casa' ? casa : fora;
  const isHome = st.posse === 'casa';
  // A engine manda `ball` RELATIVO ao ataque (0 = endzone de quem tem a bola).
  // Convertemos para coordenada ABSOLUTA fixa (0 = endzone da casa, à esquerda)
  // para que a linha de scrimmage permaneça no MESMO lugar físico quando a posse
  // inverte — só a direção do ataque muda, como na transmissão real da NFL.
  const rel = Math.max(0, Math.min(st.ball, 100));
  const abs = isHome ? rel : 100 - rel;
  const ballX = (80 + abs * 8.4) / 10;
  // a corrente (1ª descida) fica `toGo` jardas à frente, na direção do ataque
  const chainAbs = isHome ? Math.min(rel + st.toGo, 100) : Math.max(rel - st.toGo, 0);
  const chainX = (80 + chainAbs * 8.4) / 10;
  const scrimmage = abs <= 50 ? Math.round(abs) : Math.round(100 - abs);
  const yardLabel = abs <= 50 ? `${Math.round(abs)} do ${casa.sigla}` : `${Math.round(100 - abs)} do ${fora.sigla}`;

  return (
    <div className="panel relative overflow-hidden" style={{ background: '#0b2114' }}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 font-disp text-[13px] font-bold uppercase tracking-[0.15em]">
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-blood" />
        <span className="text-dim">Posse:</span>
        <TeamCrest cor={off.cor} cor2={off.cor2} sigla={off.sigla} conf={off.conf} size={18} />
        <span style={{ color: off.cor }}>{off.sigla}</span>
        <span className="text-faint">{isHome ? 'atacando →' : '← atacando'}</span>
        <span className="ml-auto font-mono text-[11px] font-normal normal-case tracking-normal text-faint">
          {ORD[st.down - 1]} descida &amp; {st.toGo > 0 ? st.toGo : 'goal'} · {yardLabel}
        </span>
      </div>

      <div className="relative">
        <svg viewBox="0 0 1000 240" className="block w-full" aria-hidden>
          <rect x="0" y="0" width="1000" height="240" fill="#0d2818" />
          {[...Array(10)].map((_, i) => i % 2 === 0 && (
            <rect key={i} x={80 + i * 84} y="0" width="84" height="240" fill="#123320" />
          ))}
          {/* endzones fixas: casa esquerda, visitante direita */}
          <rect x="0" y="0" width="80" height="240" fill={casa.cor} opacity="0.55" />
          <rect x="920" y="0" width="80" height="240" fill={fora.cor} opacity="0.55" />
          <text x="40" y="130" textAnchor="middle" fontFamily="Anton" fontWeight="800" fontSize="28"
            fill="#fff" opacity="0.85" transform="rotate(-90 40 130)">{casa.sigla}</text>
          <text x="960" y="130" textAnchor="middle" fontFamily="Anton" fontWeight="800" fontSize="28"
            fill="#fff" opacity="0.85" transform="rotate(90 960 130)">{fora.sigla}</text>
          {[...Array(11)].map((_, i) => {
            const x = 80 + i * 84;
            const num = i <= 5 ? i * 10 : (10 - i) * 10;
            return (
              <g key={i}>
                <line x1={x} y1="0" x2={x} y2="240" stroke="rgba(255,255,255,0.3)" strokeWidth={i === 5 ? 2 : 1.2} />
                {i > 0 && i < 10 && (
                  <>
                    <text x={x} y="52" textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="700" fontSize="26" fill="rgba(255,255,255,0.42)">{num}</text>
                    <text x={x} y="208" textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="700" fontSize="26" fill="rgba(255,255,255,0.42)">{num}</text>
                  </>
                )}
              </g>
            );
          })}
          <ellipse cx="500" cy="120" rx="20" ry="11" fill="none" stroke="var(--color-gold)" strokeWidth="2" opacity="0.5" />
        </svg>

        {/* linha de scrimmage na cor do time com a posse — inverte a cor (não o lugar) na troca */}
        <div className="absolute bottom-0 top-0 w-[2px]" style={{ left: `${ballX}%`, background: off.cor, boxShadow: `0 0 8px ${off.cor}`, transition: 'left 0.55s cubic-bezier(0.25,0.9,0.3,1), background 0.3s, box-shadow 0.3s' }} />
        {st.ball < 100 && (
          <div className="absolute bottom-0 top-0 w-[3px]" style={{
            left: `${chainX}%`, background: 'var(--color-goldhi)',
            boxShadow: '0 0 8px rgba(255,211,94,0.6)', transition: 'left 0.55s cubic-bezier(0.25,0.9,0.3,1)',
          }}>
            <div className="absolute -left-[5px] top-1 h-[10px] w-[13px]" style={{ background: 'var(--color-goldhi)' }} />
          </div>
        )}
        <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${ballX}%`, transition: 'left 0.55s cubic-bezier(0.25,0.9,0.3,1)' }}>
          <div className="relative -translate-x-1/2">
            <div className="h-[15px] w-[26px] rounded-[50%] border border-[#f3ead8]/70" style={{
              background: 'radial-gradient(circle at 35% 30%, #a8622f, #6f3a14)',
              boxShadow: `0 0 14px 3px ${off.cor}aa`,
            }}>
              <div className="absolute left-1/2 top-1/2 h-[2px] w-[12px] -translate-x-1/2 -translate-y-1/2 bg-[#f3ead8]" />
            </div>
          </div>
        </div>
        {/* direção do ataque: a bola não muda de lado, só o sentido da seta */}
        <div className="absolute top-[30%] -translate-y-1/2" style={{ left: `${ballX}%`, transition: 'left 0.55s cubic-bezier(0.25,0.9,0.3,1)' }}>
          <svg width="26" height="16" viewBox="0 0 26 16" className="-translate-x-1/2" style={{ transform: `translateX(-50%) ${isHome ? '' : 'scaleX(-1)'}`, filter: `drop-shadow(0 0 4px ${off.cor})`, transition: 'transform 0.3s' }}>
            <path d="M2 8 H18 M12 2 L20 8 L12 14" fill="none" stroke={off.cor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 font-disp text-[12px] font-bold uppercase text-goldhi" style={{ textShadow: '0 1px 4px #000' }}>
          linha de {scrimmage}
        </div>
      </div>
    </div>
  );
}

type Side2 = { casa: number; fora: number };

export default function MatchScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const r = g.lastResult;
  const live: LiveEvent[] = r?.live?.length ? r.live : [];

  const [idx, setIdx] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(2);
  const [tab, setTab] = useState<'narracao' | 'stats' | 'box'>('narracao');
  const feedRef = useRef<HTMLDivElement>(null);
  const done = idx >= live.length;
  const speed = SPEEDS[speedIdx];

  useEffect(() => {
    if (!live.length || done) return;
    const t = setInterval(() => setIdx(i => Math.min(live.length, i + speed.step)), speed.ms);
    return () => clearInterval(t);
  }, [done, live.length, speed]);

  const cur = useMemo(() => derive(live, idx), [live, idx]);
  useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, [idx, tab]);

  // estatísticas acumuladas ao vivo (não o box final)
  const liveStats = useMemo(() => {
    const s = {
      rush: { casa: 0, fora: 0 } as Side2, pass: { casa: 0, fora: 0 } as Side2,
      tos: { casa: 0, fora: 0 } as Side2, faltas: { casa: 0, fora: 0 } as Side2,
    };
    for (const e of live.slice(0, idx)) {
      if (e.kind === 'play') {
        const side = e.posse ?? 'casa';
        s.rush[side] += e.runYds ?? 0;
        s.pass[side] += e.passYds ?? 0;
        s.faltas[side] += e.penalties ?? 0;
      } else if (e.kind === 'turnover') {
        const loser = (e.posse ?? 'casa') === 'casa' ? 'fora' : 'casa';
        s.rush[loser] += e.runYds ?? 0;
        s.pass[loser] += e.passYds ?? 0;
        s.faltas[loser] += e.penalties ?? 0;
        s.tos[loser]++;
      }
    }
    return s;
  }, [live, idx]);

  const feed = useMemo(() => {
    const items: { t: string; tipo: LineTipo; nerves?: boolean }[] = [];
    for (const e of live.slice(0, idx)) {
      if (!e.texto) continue;
      if (e.kind === 'nerves') { items.push({ t: `⚡ ${e.texto}`, tipo: 'pen', nerves: true }); continue; }
      for (const line of e.texto.split('\n')) {
        const tipo: LineTipo =
          e.kind === 'turnover' ? 'turn'
            : e.kind === 'qb' || e.kind === 'qbinj' ? 'inj'
              : e.kind === 'end' ? 'score'
                : e.kind === 'quarter' ? 'info'
                  : e.kind === 'play' ? (e.tipo ?? 'ok') : 'info';
        items.push({ t: line, tipo });
      }
    }
    return items;
  }, [live, idx]);

  if (!r) {
    return (
      <Panel title="Sem partida">
        <p className="font-mono text-[13px] text-dim">Nenhuma partida recente para exibir.</p>
        <button className="btn mt-3" onClick={() => dispatch({ type: 'DISMISS_RESULT' })}>Voltar ao escritório</button>
      </Panel>
    );
  }

  const casa = teamById(g, r.casaId);
  const fora = teamById(g, r.foraId);
  const userCasa = r.casaId === g.userTeam;
  const finalUser = userCasa ? r.placarCasa : r.placarFora;
  const finalOpp = userCasa ? r.placarFora : r.placarCasa;
  const resultado = done ? (finalUser > finalOpp ? 'VITÓRIA' : finalUser < finalOpp ? 'DERROTA' : 'EMPATE') : null;
  const resColor = finalUser > finalOpp ? 'var(--color-grass)' : finalUser < finalOpp ? 'var(--color-blood)' : 'var(--color-gold)';

  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <TeamCrest cor={casa.cor} cor2={casa.cor2} sigla={casa.sigla} conf={casa.conf} size={36} />
            <div className="leading-none">
              <div className="font-disp text-[20px] font-bold uppercase">{casa.cidade}</div>
              <div className="font-mono text-[11px] text-faint">{casa.nome}{userCasa ? ' · SEU TIME' : ''}</div>
            </div>
            <span key={`c${cur.pc}`} className="score-pop score-digit ml-2">{cur.pc}</span>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              {done
                ? <span className="tag border-line text-dim">ENCERRADO</span>
                : <><span className="live-dot inline-block h-2.5 w-2.5 rounded-full bg-blood" /><span className="font-disp text-[15px] font-bold uppercase tracking-[0.2em] text-blood">Ao vivo</span></>}
            </div>
            <div className="mt-1 font-disp text-[22px] font-bold text-goldhi">
              {done ? 'FINAL' : cur.quarter >= 5 ? 'PRORROGAÇÃO' : `${cur.quarter}º QUARTO`}
              <span className="ml-2 font-mono text-[16px] text-ink">{done ? '' : fmtClock(cur.clock, cur.quarter)}</span>
            </div>
            <div className="font-mono text-[11px] text-faint">
              {r.clima} {r.climaIcon} · público {r.publico.toLocaleString('pt-BR')} ·{' '}
              <span className={crowdPressure(casa) >= 80 ? 'text-blood' : ''}>pressão {crowdPressure(casa)}/100</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3">
            <span key={`f${cur.pf}`} className="score-pop score-digit mr-2">{cur.pf}</span>
            <div className="text-right leading-none">
              <div className="font-disp text-[20px] font-bold uppercase">{fora.cidade}</div>
              <div className="font-mono text-[11px] text-faint">{fora.nome}{!userCasa ? ' · SEU TIME' : ''}</div>
            </div>
            <TeamCrest cor={fora.cor} cor2={fora.cor2} sigla={fora.sigla} conf={fora.conf} size={36} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-5 py-2 font-mono text-[11.5px] text-dim">
          {resultado && <span className="font-disp text-[16px] font-bold uppercase tracking-wider" style={{ color: resColor }}>{resultado}</span>}
          {done && [...Array(Math.max(r.box.quartos.casa.length, r.box.quartos.fora.length))].map((_, i) => (
            <span key={i} className="tabular-nums">{i < 4 ? `${i + 1}ºQ` : 'OT'}: <b className="text-ink">{r.box.quartos.casa[i] ?? 0}</b>–<b className="text-ink">{r.box.quartos.fora[i] ?? 0}</b></span>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {!done && (
              <>
                <div className="flex overflow-hidden rounded-sm border border-line">
                  {SPEEDS.map((s, i) => (
                    <button key={s.label}
                      className={`px-2.5 py-1 font-disp text-[12px] font-bold uppercase tracking-wide transition-colors ${i === speedIdx ? 'bg-gold text-[#241a02]' : 'text-dim hover:text-ink'}`}
                      onClick={() => setSpeedIdx(i)}>{s.label}</button>
                  ))}
                </div>
                <button className="btn btn-sm btn-gold" onClick={() => setIdx(live.length)}>Placar final »</button>
              </>
            )}
            {done && <button className="btn btn-sm btn-gold" onClick={() => dispatch({ type: 'DISMISS_RESULT' })}>Voltar ao escritório »</button>}
          </div>
        </div>
      </div>

      <Field st={cur} casa={casa} fora={fora} />

      <div className="panel">
        <div className="flex border-b border-line">
          {([['narracao', 'Narração'], ['stats', 'Ao Vivo'], ['box', 'Box Score']] as const).map(([k, l]) => (
            <button key={k}
              className={`border-b-2 px-5 py-2.5 font-disp text-[15px] font-bold uppercase tracking-wider transition-colors ${tab === k ? 'border-gold text-goldhi' : 'border-transparent text-dim hover:text-ink'}`}
              onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {tab === 'narracao' && (
          <div ref={feedRef} className="max-h-[460px] overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[1.75]">
            {feed.map((l, i) => <div key={i} className={`feed-line ${l.nerves ? NERVES_STYLE : LINE_STYLE[l.tipo]}`}>{l.t}</div>)}
            {!done && <div className="blink text-gold">▮ narrando…</div>}
          </div>
        )}
        {tab === 'stats' && (
          <StatsView r={r} casa={casa} fora={fora} ls={liveStats} done={done} />
        )}
        {tab === 'box' && (
          <BoxScoreView r={r} casa={casa} fora={fora} done={done} />
        )}
      </div>
    </div>
  );
}

function StatsView({ r, casa, fora, ls, done }: {
  r: NonNullable<GameState['lastResult']>; casa: Team; fora: Team;
  ls: { rush: Side2; pass: Side2; tos: Side2; faltas: Side2 };
  done: boolean;
}) {
  const total: Side2 = { casa: ls.rush.casa + ls.pass.casa, fora: ls.rush.fora + ls.pass.fora };
  return (
    <div className="max-h-[460px] overflow-y-auto">
      <div className="flex items-center gap-2 px-3.5 pt-2.5">
        <span className={`inline-block h-2 w-2 rounded-full ${done ? 'bg-faint' : 'bg-blood live-dot'}`} />
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">
          {done ? 'Números finais' : 'Acumulando ao vivo…'}
        </span>
      </div>
      <table className="tbl">
        <thead><tr><th>Equipe</th><th className="num">{casa.sigla}</th><th className="num">{fora.sigla}</th></tr></thead>
        <tbody>
          <tr><td>Jardas totais</td><td className="num">{total.casa}</td><td className="num">{total.fora}</td></tr>
          <tr><td>Corrida</td><td className="num">{ls.rush.casa}</td><td className="num">{ls.rush.fora}</td></tr>
          <tr><td>Passe</td><td className="num">{ls.pass.casa}</td><td className="num">{ls.pass.fora}</td></tr>
          <tr><td>Turnovers</td><td className="num">{ls.tos.casa}</td><td className="num">{ls.tos.fora}</td></tr>
          <tr><td>Faltas</td><td className="num">{ls.faltas.casa}</td><td className="num">{ls.faltas.fora}</td></tr>
        </tbody>
      </table>
      <div className="border-t border-line px-3.5 py-2.5">
        <div className="mb-1.5 font-disp text-[13px] font-semibold uppercase tracking-widest text-faint">Destaques</div>
        {done ? r.box.leaders.map(l => (
          <div key={l.label} className="flex items-baseline gap-2 py-[3px] font-mono text-[11.5px]">
            <span className="w-[92px] shrink-0 text-faint">{l.label}</span>
            <span className="truncate text-ink">{l.casa}</span>
            <span className="ml-auto truncate pl-2 text-dim">{l.fora}</span>
          </div>
        )) : (
          <p className="py-2 font-mono text-[11.5px] text-faint">Os destaques individuais aparecem ao fim da partida.</p>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * BOX SCORE CLÁSSICO — estatística no centro, times nas laterais
 * ============================================================ */
function fmtPoss(secs: number): string {
  const m = Math.floor(secs / 60); const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function StatRow({ label, casa, fora, winCasa, winFora, sub }: {
  label: string; casa: string; fora: string;
  winCasa?: boolean; winFora?: boolean; sub?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 border-b border-line2/60 px-4 py-[7px] last:border-0">
      <span className={`text-right font-mono text-[14px] tabular-nums ${winCasa ? 'font-bold text-goldhi' : 'text-ink'}`}>{casa}</span>
      <span className="text-center">
        <span className="font-disp text-[12px] font-semibold uppercase tracking-[0.12em] text-dim">{label}</span>
        {sub && <span className="ml-1.5 font-mono text-[9.5px] text-faint">{sub}</span>}
      </span>
      <span className={`font-mono text-[14px] tabular-nums ${winFora ? 'font-bold text-goldhi' : 'text-ink'}`}>{fora}</span>
    </div>
  );
}

function BoxScoreView({ r, casa, fora, done }: {
  r: NonNullable<GameState['lastResult']>; casa: Team; fora: Team; done: boolean;
}) {
  const { rich } = r;
  const c = rich.casa; const f = rich.fora;
  if (!done) {
    return (
      <div className="px-4 py-8 text-center font-mono text-[12.5px] text-faint">
        O box score completo é fechado ao término da partida.
      </div>
    );
  }

  // líderes por categoria (maior valor de cada time)
  const leader = (key: (l: PlayerLine) => number, tid: string): PlayerLine | null => {
    let best: PlayerLine | null = null; let bv = 0;
    for (const l of rich.lines) if (l.teamId === tid) {
      const v = key(l);
      if (v > bv) { bv = v; best = l; }
    }
    return best;
  };
  const qbL = (tid: string) => leader(l => l.att ?? 0, tid);
  const rushL = (tid: string) => leader(l => l.ry ?? 0, tid);
  const recL = (tid: string) => leader(l => l.recYds ?? 0, tid);
  const sackL = (tid: string) => leader(l => l.sacks ?? 0, tid);
  const tackL = (tid: string) => leader(l => l.tackles ?? 0, tid);
  const intL = (tid: string) => leader(l => l.intDef ?? 0, tid);

  const thirdC = c.thirdAtt ? `${c.thirdConv}/${c.thirdAtt}` : '0/0';
  const thirdF = f.thirdAtt ? `${f.thirdConv}/${f.thirdAtt}` : '0/0';
  const rzC = c.rzAtt ? `${c.rzTd}/${c.rzAtt}` : '0/0';
  const rzF = f.rzAtt ? `${f.rzTd}/${f.rzAtt}` : '0/0';

  const qbCasa = qbL(casa.id); const qbFora = qbL(fora.id);
  const rushCasa = rushL(casa.id); const rushFora = rushL(fora.id);
  const recCasa = recL(casa.id); const recFora = recL(fora.id);

  return (
    <div className="max-h-[520px] space-y-5 overflow-y-auto px-1 py-3">
      {/* ---------- estatísticas de equipe ---------- */}
      <div className="panel2 mx-3 border border-line2">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line px-4 py-2.5">
          <span className="flex items-center justify-end gap-2 font-disp text-[16px] font-bold uppercase">
            {casa.sigla} <TeamCrest cor={casa.cor} cor2={casa.cor2} sigla={casa.sigla} conf={casa.conf} size={20} />
          </span>
          <span className="font-disp text-[12px] font-semibold uppercase tracking-[0.2em] text-faint">Equipe</span>
          <span className="flex items-center gap-2 font-disp text-[16px] font-bold uppercase">
            <TeamCrest cor={fora.cor} cor2={fora.cor2} sigla={fora.sigla} conf={fora.conf} size={20} /> {fora.sigla}
          </span>
        </div>
        <StatRow label="Jardas Totais" casa={String(c.yds)} fora={String(f.yds)} winCasa={c.yds > f.yds} winFora={f.yds > c.yds} />
        <StatRow label="Corrida" casa={String(c.rushYds)} fora={String(f.rushYds)} winCasa={c.rushYds > f.rushYds} winFora={f.rushYds > c.rushYds} sub="jd" />
        <StatRow label="Passe" casa={String(c.passYds)} fora={String(f.passYds)} winCasa={c.passYds > f.passYds} winFora={f.passYds > c.passYds} sub="jd" />
        <StatRow label="1ºs Downs" casa={String(c.firstDowns)} fora={String(f.firstDowns)} winCasa={c.firstDowns > f.firstDowns} winFora={f.firstDowns > c.firstDowns} />
        <StatRow label="3ª Descida" casa={thirdC} fora={thirdF}
          winCasa={c.thirdAtt ? c.thirdConv / c.thirdAtt > (f.thirdAtt ? f.thirdConv / f.thirdAtt : 0) : false}
          winFora={f.thirdAtt ? f.thirdConv / f.thirdAtt > (c.thirdAtt ? c.thirdConv / c.thirdAtt : 0) : false} sub="conv" />
        <StatRow label="Zona Vermelha" casa={rzC} fora={rzF}
          winCasa={c.rzAtt ? c.rzTd / c.rzAtt > (f.rzAtt ? f.rzTd / f.rzAtt : 0) : false}
          winFora={f.rzAtt ? f.rzTd / f.rzAtt > (c.rzAtt ? c.rzTd / c.rzAtt : 0) : false} sub="TD" />
        <StatRow label="Turnovers" casa={String(c.tos)} fora={String(f.tos)} winCasa={c.tos < f.tos} winFora={f.tos < c.tos} />
        <StatRow label="Penalidades" casa={`${c.pens} / ${c.penYds} jd`} fora={`${f.pens} / ${f.penYds} jd`} winCasa={c.penYds < f.penYds} winFora={f.penYds < c.penYds} />
        <StatRow label="Posse de Bola" casa={fmtPoss(c.possSecs)} fora={fmtPoss(f.possSecs)} winCasa={c.possSecs > f.possSecs} winFora={f.possSecs > c.possSecs} />
      </div>

      {/* ---------- destaques individuais ---------- */}
      <div className="grid gap-3 px-3 md:grid-cols-2">
        <div className="panel2 border border-line2 p-3">
          <div className="mb-2 font-disp text-[13px] font-bold uppercase tracking-[0.15em] text-goldhi">Passe</div>
          {[{ t: casa, l: qbCasa }, { t: fora, l: qbFora }].map(({ t, l }) => (
            <div key={t.id} className="flex items-baseline gap-2 py-[3px] font-mono text-[11.5px]">
              <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={13} />
              {l && (l.att ?? 0) > 0 ? (
                <span className="truncate text-ink">
                  <b>{l.nome}</b> {l.cmp}/{l.att}, {l.py} jd, {l.ptd} TD{(l.int ?? 0) ? `, ${l.int} INT` : ''}
                  <span className="ml-1.5 text-dim">· RTG <b className="text-goldhi">{l.rating}</b></span>
                </span>
              ) : <span className="text-faint">—</span>}
            </div>
          ))}
        </div>

        <div className="panel2 border border-line2 p-3">
          <div className="mb-2 font-disp text-[13px] font-bold uppercase tracking-[0.15em] text-goldhi">Corrida</div>
          {[{ t: casa, l: rushCasa }, { t: fora, l: rushFora }].map(({ t, l }) => (
            <div key={t.id} className="flex items-baseline gap-2 py-[3px] font-mono text-[11.5px]">
              <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={13} />
              {l && (l.ry ?? 0) > 0 ? (
                <span className="truncate text-ink">
                  <b>{l.nome}</b> {l.rAtt} att, {l.ry} jd{(l.rtd ?? 0) ? `, ${l.rtd} TD` : ''}
                  <span className="ml-1.5 text-dim">· longa <b className="text-goldhi">{l.longRush} jd</b></span>
                </span>
              ) : <span className="text-faint">—</span>}
            </div>
          ))}
        </div>

        <div className="panel2 border border-line2 p-3">
          <div className="mb-2 font-disp text-[13px] font-bold uppercase tracking-[0.15em] text-goldhi">Recepção</div>
          {[{ t: casa, l: recCasa }, { t: fora, l: recFora }].map(({ t, l }) => (
            <div key={t.id} className="flex items-baseline gap-2 py-[3px] font-mono text-[11.5px]">
              <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={13} />
              {l && (l.recYds ?? 0) > 0 ? (
                <span className="truncate text-ink">
                  <b>{l.nome}</b> {l.rec} rec, {l.recYds} jd{(l.recTD ?? 0) ? `, ${l.recTD} TD` : ''}
                  <span className="ml-1.5 text-dim">· longa <b className="text-goldhi">{l.longRec} jd</b></span>
                </span>
              ) : <span className="text-faint">—</span>}
            </div>
          ))}
        </div>

        <div className="panel2 border border-line2 p-3">
          <div className="mb-2 font-disp text-[13px] font-bold uppercase tracking-[0.15em] text-goldhi">Defesa</div>
          {[{ t: casa, s: sackL(casa.id), tk: tackL(casa.id), it: intL(casa.id) },
            { t: fora, s: sackL(fora.id), tk: tackL(fora.id), it: intL(fora.id) }].map(({ t, s, tk, it }) => (
            <div key={t.id} className="flex items-baseline gap-2 py-[3px] font-mono text-[11.5px]">
              <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={13} />
              <span className="truncate text-ink">
                {s && (s.sacks ?? 0) > 0 ? <><b>{s.nome}</b> {s.sacks} sack{(s.sacks ?? 0) > 1 ? 's' : ''} (−{s.sackYds} jd)</> : 'Sem sacks'}
                {tk && (tk.tackles ?? 0) > 0 && <span className="ml-1.5 text-dim">· <b>{tk.nome}</b> {tk.tackles} tackles</span>}
                {it && (it.intDef ?? 0) > 0 && <span className="ml-1.5 text-grass">· <b>{it.nome}</b> {it.intDef} INT</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- MVP + Jogada do Jogo ---------- */}
      <div className="grid gap-3 px-3 md:grid-cols-2">
        {rich.story.mvp && (
          <div className="panel2 border border-gold/50 bg-[rgba(240,180,41,0.05)] p-3">
            <div className="mb-1 flex items-center gap-2 font-disp text-[13px] font-bold uppercase tracking-[0.15em] text-goldhi">
              <span>★</span> MVP da Partida
            </div>
            <div className="flex items-center gap-2 font-mono text-[12px]">
              <PosBadge pos={rich.story.mvp.pos} />
              <span>
                <b className="text-[13px] text-goldhi">{rich.story.mvp.nome}</b>
                <span className="ml-1.5 text-faint">({rich.story.mvp.teamId.toUpperCase()})</span>
              </span>
            </div>
            <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-dim">{rich.story.mvp.linha}</p>
          </div>
        )}
        {rich.story.jogada && (
          <div className="panel2 border border-ice/40 bg-[rgba(127,196,232,0.04)] p-3">
            <div className="mb-1 flex items-center gap-2 font-disp text-[13px] font-bold uppercase tracking-[0.15em] text-ice">
              <span>⚡</span> Jogada do Jogo
            </div>
            <p className="font-mono text-[11.5px] leading-relaxed text-ink">{rich.story.jogada.texto}</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-faint">{rich.story.jogada.teamId.toUpperCase()}</p>
          </div>
        )}
      </div>
    </div>
  );
}
