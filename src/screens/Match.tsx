import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../state/store';
import { teamById } from '../game/season';
import { Panel, TeamCrest, PosBadge } from '../components/ui';
import type { LineTipo, LiveEvent } from '../game/types';

const LINE_STYLE: Record<LineTipo, string> = {
  info: 'text-faint italic',
  ok: 'text-ink',
  big: 'text-goldhi font-semibold',
  score: 'text-grass font-bold',
  turn: 'text-blood font-semibold',
  pen: 'text-ice',
  inj: 'text-blood bg-[rgba(226,87,75,0.09)] border-l-2 border-blood pl-2',
};
const NERVES = 'text-goldhi bg-[rgba(240,180,41,0.1)] border-l-2 border-gold pl-2 font-semibold';
const ORD = ['1ª', '2ª', '3ª', '4ª'];

interface FieldState { ball: number; down: number; toGo: number; posse: 'casa' | 'fora'; pc: number; pf: number; quarter: number; clock: number; }
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
  return `${Math.floor(inQ / 60)}:${String(Math.floor(inQ % 60)).padStart(2, '0')}`;
};

function Field({ st, casaCor, casaSig, foraCor, foraSig }: {
  st: FieldState; casaCor: string; casaSig: string; foraCor: string; foraSig: string;
}) {
  const offCor = st.posse === 'casa' ? casaCor : foraCor;
  const offSig = st.posse === 'casa' ? casaSig : foraSig;
  const defSig = st.posse === 'casa' ? foraSig : casaSig;
  const ballX = (80 + Math.min(st.ball, 100) * 8.4) / 10;
  const chainX = (80 + Math.min(st.ball + st.toGo, 100) * 8.4) / 10;
  const yardLabel = st.ball >= 50 ? `${100 - Math.round(st.ball)} do ${defSig}` : `${Math.round(st.ball)} do ${offSig}`;

  return (
    <div className="relative overflow-hidden border border-line" style={{ background: '#0b2114' }}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 font-disp text-[13px] font-bold uppercase tracking-[0.15em]">
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-blood" />
        <span className="text-dim">Posse:</span>
        <span style={{ color: offCor === '#A5ACAF' || offCor === '#D3BC8D' || offCor === '#FFB612' ? '#fff' : offCor }}>{offSig}</span>
        <span className="text-faint">atacando →</span>
        <span className="ml-auto font-mono text-[11px] font-normal normal-case tracking-normal text-faint">
          {ORD[st.down - 1]} descida &amp; {st.toGo > 0 ? st.toGo : 'goal'} · {yardLabel}
        </span>
      </div>
      <div className="relative">
        <svg viewBox="0 0 1000 220" className="block w-full" aria-hidden>
          <rect x="0" y="0" width="1000" height="220" fill="#0d2818" />
          {[...Array(10)].map((_, i) => i % 2 === 0 && <rect key={i} x={80 + i * 84} y="0" width="84" height="220" fill="#123320" />)}
          <rect x="0" y="0" width="80" height="220" fill={casaCor} opacity="0.55" />
          <rect x="920" y="0" width="80" height="220" fill={foraCor} opacity="0.55" />
          <text x="40" y="118" textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="800" fontSize="26" fill="#fff" opacity="0.85" transform="rotate(-90 40 118)">{casaSig}</text>
          <text x="960" y="118" textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="800" fontSize="26" fill="#fff" opacity="0.85" transform="rotate(90 960 118)">{foraSig}</text>
          {[...Array(11)].map((_, i) => {
            const x = 80 + i * 84;
            const num = i <= 5 ? i * 10 : (10 - i) * 10;
            return (
              <g key={i}>
                <line x1={x} y1="0" x2={x} y2="220" stroke="rgba(255,255,255,0.3)" strokeWidth={i === 5 ? 2 : 1.2} />
                {i > 0 && i < 10 && <text x={x} y="46" textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="700" fontSize="22" fill="rgba(255,255,255,0.4)">{num}</text>}
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-0 top-0 w-[2px] bg-ice/80" style={{ left: `${ballX}%`, transition: 'left 0.55s cubic-bezier(0.25,0.9,0.3,1)' }} />
        {st.ball < 100 && (
          <div className="absolute bottom-0 top-0 w-[3px]" style={{ left: `${chainX}%`, background: 'var(--color-goldhi)', boxShadow: '0 0 8px rgba(255,211,94,0.6)', transition: 'left 0.55s cubic-bezier(0.25,0.9,0.3,1)' }}>
            <div className="absolute -left-[5px] top-1 h-[10px] w-[13px]" style={{ background: 'var(--color-goldhi)' }} />
          </div>
        )}
        <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `${ballX}%`, transition: 'left 0.55s cubic-bezier(0.25,0.9,0.3,1)' }}>
          <div className="relative -translate-x-1/2">
            <div className="h-[15px] w-[26px] rounded-[50%] border border-[#f3ead8]/70" style={{ background: 'radial-gradient(circle at 35% 30%, #a8622f, #6f3a14)', boxShadow: `0 0 14px 3px ${offCor}aa` }}>
              <div className="absolute left-1/2 top-1/2 h-[2px] w-[12px] -translate-x-1/2 -translate-y-1/2 bg-[#f3ead8]" />
            </div>
            <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap font-disp text-[13px] font-bold uppercase" style={{ color: 'var(--color-goldhi)', textShadow: '0 1px 4px #000' }}>
              {ORD[st.down - 1]} &amp; {st.toGo > 0 ? st.toGo : 'goal'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MatchScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const r = g.lastResult;
  const live: LiveEvent[] = r?.live?.length ? r.live : [];

  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(150);
  const [tab, setTab] = useState<'narracao' | 'box'>('narracao');
  const feedRef = useRef<HTMLDivElement>(null);
  const done = idx >= live.length;

  useEffect(() => {
    if (!live.length || done) return;
    const t = setInterval(() => setIdx(i => Math.min(live.length, i + (speed < 60 ? 4 : 1))), speed);
    return () => clearInterval(t);
  }, [done, live.length, speed]);

  const cur = useMemo(() => derive(live, idx), [live, idx]);
  useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, [idx, tab]);

  const feed = useMemo(() => {
    const items: { t: string; tipo: LineTipo; nerves?: boolean }[] = [];
    for (const e of live.slice(0, idx)) {
      if (!e.texto) continue;
      if (e.kind === 'nerves') { items.push({ t: `⚡ ${e.texto}`, tipo: 'pen', nerves: true }); continue; }
      const tipo: LineTipo =
        e.kind === 'turnover' ? 'turn'
          : e.kind === 'qb' || e.kind === 'qbinj' ? 'inj'
            : e.kind === 'end' ? 'score'
              : e.kind === 'quarter' ? 'info'
                : e.kind === 'play' ? (e.tipo ?? 'ok') : 'info';
      items.push({ t: e.texto, tipo });
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
      {/* placar */}
      <div className="border border-line bg-panel">
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
              {done ? <span className="tag border-line text-dim">ENCERRADO</span>
                : <><span className="live-dot inline-block h-2.5 w-2.5 rounded-full bg-blood" /><span className="font-disp text-[15px] font-bold uppercase tracking-[0.2em] text-blood">Ao vivo</span></>}
            </div>
            <div className="mt-1 font-disp text-[20px] font-bold text-goldhi">
              {cur.quarter >= 5 ? 'PRORROGAÇÃO' : `${cur.quarter}º QUARTO`}
              <span className="ml-2 font-mono text-[15px] text-ink">{fmtClock(cur.clock, cur.quarter)}</span>
            </div>
            <div className="font-mono text-[11px] text-faint">{r.clima} {r.climaIcon} · público {r.publico.toLocaleString('pt-BR')}</div>
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
          <div className="ml-auto flex gap-2">
            {!done && (
              <>
                <button className="btn btn-sm" onClick={() => setSpeed(s => (s === 150 ? 45 : 150))}>{speed === 150 ? 'Rápido' : 'Normal'}</button>
                <button className="btn btn-sm btn-gold" onClick={() => setIdx(live.length)}>Pular »</button>
              </>
            )}
            {done && <button className="btn btn-sm btn-gold" onClick={() => dispatch({ type: 'DISMISS_RESULT' })}>Voltar ao escritório »</button>}
          </div>
        </div>
      </div>

      <Field st={cur} casaCor={casa.cor} casaSig={casa.sigla} foraCor={fora.cor} foraSig={fora.sigla} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel pad={false}
          title={
            <div className="flex gap-1">
              {([['narracao', 'Narração'], ['box', 'Box Score']] as const).map(([k, l]) => (
                <button key={k} className={`btn btn-sm ${tab === k ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
          }>
          {tab === 'narracao' ? (
            <div ref={feedRef} className="max-h-[460px] overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[1.75]">
              {feed.map((l, i) => <div key={i} className={`feed-line ${l.nerves ? NERVES : LINE_STYLE[l.tipo]}`}>{l.t}</div>)}
              {!done && <div className="blink text-gold">▮ narrando…</div>}
            </div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto p-4">
              {r.rich.story.mvp && (
                <div className="mb-3 border border-gold/40 bg-[rgba(240,180,41,0.08)] p-3">
                  <div className="font-disp text-[14px] font-bold uppercase text-goldhi">🏅 MVP da partida</div>
                  <div className="mt-1 font-mono text-[12.5px] text-ink"><b>{r.rich.story.mvp.nome}</b> ({r.rich.story.mvp.pos}) — {r.rich.story.mvp.linha}</div>
                </div>
              )}
              {r.rich.story.jogada && (
                <div className="mb-3 border border-line bg-panel2 p-3">
                  <div className="font-disp text-[14px] font-bold uppercase text-dim">⚡ Jogada do jogo</div>
                  <div className="mt-1 font-mono text-[12px] text-ink">{r.rich.story.jogada.texto}</div>
                </div>
              )}
              <table className="tbl">
                <thead><tr><th>Equipe</th><th className="num">{casa.sigla}</th><th className="num">{fora.sigla}</th></tr></thead>
                <tbody>
                  <tr><td>Jardas totais</td><td className="num">{r.rich.casa.yds}</td><td className="num">{r.rich.fora.yds}</td></tr>
                  <tr><td>Corrida</td><td className="num">{r.rich.casa.rushYds}</td><td className="num">{r.rich.fora.rushYds}</td></tr>
                  <tr><td>Passe</td><td className="num">{r.rich.casa.passYds}</td><td className="num">{r.rich.fora.passYds}</td></tr>
                  <tr><td>1ºs Downs</td><td className="num">{r.rich.casa.firstDowns}</td><td className="num">{r.rich.fora.firstDowns}</td></tr>
                  <tr><td>3ª descida</td><td className="num">{r.rich.casa.thirdConv}/{r.rich.casa.thirdAtt}</td><td className="num">{r.rich.fora.thirdConv}/{r.rich.fora.thirdAtt}</td></tr>
                  <tr><td>Zona vermelha</td><td className="num">{r.rich.casa.rzTd}/{r.rich.casa.rzAtt}</td><td className="num">{r.rich.fora.rzTd}/{r.rich.fora.rzAtt}</td></tr>
                  <tr><td>Turnovers</td><td className="num">{r.rich.casa.tos}</td><td className="num">{r.rich.fora.tos}</td></tr>
                  <tr><td>Penalidades</td><td className="num">{r.rich.casa.pens} / −{r.rich.casa.penYds}jd</td><td className="num">{r.rich.fora.pens} / −{r.rich.fora.penYds}jd</td></tr>
                </tbody>
              </table>
              <div className="mt-3 border-t border-line pt-2">
                <div className="mb-1.5 font-disp text-[13px] font-semibold uppercase tracking-widest text-faint">Líderes individuais</div>
                {[...r.rich.lines].sort((a, b) => ((b.py ?? 0) + (b.ry ?? 0) + (b.recYds ?? 0)) - ((a.py ?? 0) + (a.ry ?? 0) + (a.recYds ?? 0))).slice(0, 6).map(l => (
                  <div key={l.id} className="flex items-center gap-2 border-b border-line2 py-1.5 font-mono text-[11.5px]">
                    <PosBadge pos={l.pos} />
                    <span className="truncate text-ink">{l.nome}</span>
                    <span className="ml-auto text-dim">
                      {(l.py ?? 0) > 0 && `${l.cmp}/${l.att}, ${l.py}jd, ${l.ptd}TD `}
                      {(l.ry ?? 0) > 0 && `${l.ry}jd corr `}
                      {(l.recYds ?? 0) > 0 && `${l.rec} rec, ${l.recYds}jd `}
                      {(l.sacks ?? 0) > 0 && `${l.sacks} sacks `}
                      {(l.tackles ?? 0) > 0 && `${l.tackles} tack `}
                      {(l.intDef ?? 0) > 0 && `${l.intDef} INT`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          {r.lesoes.length > 0 && (
            <Panel title="Boletim médico da partida">
              <ul className="space-y-1.5 font-mono text-[12px]">
                {r.lesoes.map((l, i) => (
                  <li key={i} className="text-blood">⚕ {l.nome} ({l.pos}, {teamById(g, l.teamId).sigla}) — {l.tipo}, {l.semanas} sem.</li>
                ))}
              </ul>
            </Panel>
          )}
          {g.weekResults.length > 0 && (
            <Panel title="Resto da rodada" pad={false}>
              <div className="max-h-[280px] overflow-y-auto">
                {g.weekResults.map(m => {
                  const c = teamById(g, m.casa); const f = teamById(g, m.fora);
                  return (
                    <div key={m.id} className="flex items-center gap-2 border-b border-line2 px-3.5 py-[7px] font-mono text-[12px]">
                      <span className="inline-block h-[9px] w-[9px]" style={{ background: c.cor }} />
                      <span className={m.placarCasa! >= m.placarFora! ? 'font-semibold text-ink' : 'text-dim'}>{c.sigla} {m.placarCasa}</span>
                      <span className="text-faint">×</span>
                      <span className={m.placarFora! >= m.placarCasa! ? 'font-semibold text-ink' : 'text-dim'}>{m.placarFora} {f.sigla}</span>
                      <span className="inline-block h-[9px] w-[9px]" style={{ background: f.cor }} />
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
