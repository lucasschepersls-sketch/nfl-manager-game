import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, crowdPressure } from '../game/season';
import { Panel, TeamCrest } from '../components/ui';
import type { GameState, LineTipo, LiveEvent, Team } from '../game/types';

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
  const def = st.posse === 'casa' ? fora : casa;
  const ballX = (80 + Math.min(st.ball, 100) * 8.4) / 10;
  const chainX = (80 + Math.min(st.ball + st.toGo, 100) * 8.4) / 10;
  const yardLabel = st.ball >= 50 ? `${100 - Math.round(st.ball)} do ${def.sigla}` : `${Math.round(st.ball)} do ${off.sigla}`;

  return (
    <div className="panel relative overflow-hidden" style={{ background: '#0b2114' }}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 font-disp text-[13px] font-bold uppercase tracking-[0.15em]">
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-blood" />
        <span className="text-dim">Posse:</span>
        <TeamCrest cor={off.cor} cor2={off.cor2} sigla={off.sigla} conf={off.conf} size={18} />
        <span style={{ color: off.cor === '#A5ACAF' || off.cor === '#D3BC8D' || off.cor === '#FFB612' ? '#fff' : off.cor }}>{off.sigla}</span>
        <span className="text-faint">atacando →</span>
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
          <rect x="0" y="0" width="80" height="240" fill={off.cor} opacity="0.55" />
          <rect x="920" y="0" width="80" height="240" fill={def.cor} opacity="0.55" />
          <text x="40" y="130" textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="800" fontSize="30"
            fill="#fff" opacity="0.85" transform="rotate(-90 40 130)">{off.sigla}</text>
          <text x="960" y="130" textAnchor="middle" fontFamily="Barlow Condensed" fontWeight="800" fontSize="30"
            fill="#fff" opacity="0.85" transform="rotate(90 960 130)">{def.sigla}</text>
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
          {[...Array(20)].map((_, i) => (
            <g key={i} stroke="rgba(255,255,255,0.22)" strokeWidth="1.4">
              <line x1={101 + i * 42} y1="86" x2={101 + i * 42} y2="94" />
              <line x1={101 + i * 42} y1="146" x2={101 + i * 42} y2="154" />
            </g>
          ))}
          <ellipse cx="500" cy="120" rx="20" ry="11" fill="none" stroke="var(--color-gold)" strokeWidth="2" opacity="0.5" />
        </svg>

        <div className="absolute bottom-0 top-0 w-[2px] bg-ice/80" style={{ left: `${ballX}%`, transition: 'left 0.55s cubic-bezier(0.25,0.9,0.3,1)' }} />
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
            <div className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap font-disp text-[13px] font-bold uppercase tracking-wide"
              style={{ color: 'var(--color-goldhi)', textShadow: '0 1px 4px #000' }}>
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
  const feedRef = useRef<HTMLDivElement>(null);
  const done = idx >= live.length;

  useEffect(() => {
    if (!live.length || done) return;
    const t = setInterval(() => setIdx(i => Math.min(live.length, i + (speed < 60 ? 4 : 1))), speed);
    return () => clearInterval(t);
  }, [done, live.length, speed]);

  const cur = useMemo(() => derive(live, idx), [live, idx]);
  useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, [idx]);

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

  const qbAlert = useMemo(() => {
    const evs = live.slice(0, idx);
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i];
      if (e.kind === 'qb' || e.kind === 'qbinj') return e;
      if (e.kind === 'play' || e.kind === 'turnover' || e.kind === 'score') return null;
    }
    return null;
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
      {/* placar ao vivo */}
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
              {cur.quarter >= 5 ? 'PRORROGAÇÃO' : `${cur.quarter}º QUARTO`}
              <span className="ml-2 font-mono text-[16px] text-ink">{fmtClock(cur.clock, cur.quarter)}</span>
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

        {qbAlert && (
          <div className={`qb-banner flex items-center gap-3 border-t px-4 py-2 font-disp text-[16px] font-bold uppercase tracking-wider ${qbAlert.kind === 'qbinj' ? 'border-blood/60 bg-[rgba(226,87,75,0.16)] text-blood' : 'border-gold/60 bg-[rgba(240,180,41,0.14)] text-goldhi'}`}>
            {qbAlert.kind === 'qbinj'
              ? <>⚠ {qbAlert.texto}</>
              : <>Troca de QB: {qbAlert.texto}</>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-5 py-2 font-mono text-[11.5px] text-dim">
          {resultado && <span className="font-disp text-[16px] font-bold uppercase tracking-wider" style={{ color: resColor }}>{resultado}</span>}
          {done && [...Array(Math.max(r.box.quartos.casa.length, r.box.quartos.fora.length))].map((_, i) => (
            <span key={i} className="tabular-nums">{i < 4 ? `${i + 1}ºQ` : 'OT'}: <b className="text-ink">{r.box.quartos.casa[i] ?? 0}</b>–<b className="text-ink">{r.box.quartos.fora[i] ?? 0}</b></span>
          ))}
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

      <Field st={cur} casa={casa} fora={fora} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel title="Narração em tempo real" pad={false}
          right={<span className="font-mono text-[11px] text-faint">{idx}/{live.length} eventos</span>}>
          <div ref={feedRef} className="max-h-[460px] overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[1.75]">
            {feed.map((l, i) => <div key={i} className={`feed-line ${l.nerves ? NERVES_STYLE : LINE_STYLE[l.tipo]}`}>{l.t}</div>)}
            {!done && <div className="blink text-gold">▮ narrando…</div>}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Súmula" pad={false}>
            <table className="tbl">
              <thead><tr><th>Equipe</th><th className="num">{casa.sigla}</th><th className="num">{fora.sigla}</th></tr></thead>
              <tbody>
                <tr><td>Jardas totais</td><td className="num">{r.box.yds.casa}</td><td className="num">{r.box.yds.fora}</td></tr>
                <tr><td>Corrida</td><td className="num">{r.box.rush.casa}</td><td className="num">{r.box.rush.fora}</td></tr>
                <tr><td>Passe</td><td className="num">{r.box.pass.casa}</td><td className="num">{r.box.pass.fora}</td></tr>
                <tr><td>Turnovers</td><td className="num">{r.box.tos.casa}</td><td className="num">{r.box.tos.fora}</td></tr>
                <tr><td>Faltas</td><td className="num">{r.box.faltas.casa}</td><td className="num">{r.box.faltas.fora}</td></tr>
              </tbody>
            </table>
            <div className="border-t border-line px-3.5 py-2.5">
              <div className="mb-1.5 font-disp text-[13px] font-semibold uppercase tracking-widest text-faint">Destaques</div>
              {r.box.leaders.map(l => (
                <div key={l.label} className="flex items-baseline gap-2 py-[3px] font-mono text-[11.5px]">
                  <span className="w-[92px] shrink-0 text-faint">{l.label}</span>
                  <span className="truncate text-ink">{l.casa}</span>
                  <span className="ml-auto truncate pl-2 text-dim">{l.fora}</span>
                </div>
              ))}
            </div>
          </Panel>

          {r.lesoes.length > 0 && (
            <Panel title="Boletim médico da partida">
              <ul className="space-y-1.5 font-mono text-[12px]">
                {r.lesoes.map((l, i) => (
                  <li key={i} className="text-blood">⚕ {l.nome} ({l.pos}, {teamById(g, l.teamId).sigla}) — {l.tipo}, {l.semanas} sem.</li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

export type { GameState };
