import React from 'react';
import type { Conf, Pos } from '../game/types';
import { UNIT_OF } from '../game/data';

export function Panel({ title, right, children, className = '', pad = true }: {
  title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
  className?: string; pad?: boolean;
}) {
  return (
    <section className={`panel ${className}`}>
      {title != null && (
        <header className="panel-hd">
          <h2>{title}</h2>
          {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={pad ? 'p-3.5' : ''}>{children}</div>
    </section>
  );
}

export function PosBadge({ pos }: { pos: Pos }) {
  const u = UNIT_OF[pos];
  return <span className={`posbadge ${u === 'OF' ? 'pos-of' : u === 'DF' ? 'pos-df' : 'pos-st'}`}>{pos}</span>;
}

export function Ovr({ v, pot }: { v: number; pot?: number }) {
  const cls = v >= 85 ? 'ovr-elite' : v >= 75 ? 'ovr-good' : v >= 65 ? 'ovr-mid' : 'ovr-low';
  return (
    <span className={`ovr ${cls}`}>
      {v}
      {pot != null && pot > v + 3 && <span className="text-ice ml-1 font-normal" title={`Potencial ${pot}`}>↗{pot}</span>}
    </span>
  );
}

export function Bar({ pct, color = 'var(--color-grass)', h }: { pct: number; color?: string; h?: number }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="bar w-full" style={h ? { height: h } : undefined}>
      <i style={{ width: `${p}%`, background: color }} />
    </div>
  );
}

export function TeamDot({ cor, size = 10 }: { cor: string; size?: number }) {
  return <span className="inline-block shrink-0" style={{ width: size, height: size, background: cor, border: '1px solid rgba(0,0,0,.4)' }} />;
}

/** contraste automático p/ texto sobre a cor do time */
function inkFor(hex: string): string {
  const m = hex.replace('#', '');
  if (m.length < 6) return '#fff';
  const r = parseInt(m.slice(0, 2), 16); const g = parseInt(m.slice(2, 4), 16); const b = parseInt(m.slice(4, 6), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 140 ? '#10130c' : '#f4f7ef';
}

/** Brasão autoral da franquia (cores oficiais, arte própria — AFC escudo, NFC hexágono). */
export function TeamCrest({ cor, cor2, sigla, conf, size = 22 }: { cor: string; cor2: string; sigla: string; conf: Conf; size?: number }) {
  const ink = inkFor(cor);
  const shape = conf === 'AFC'
    ? 'M5 1 H27 V19 L16 31 L5 19 Z'
    : 'M16 1 L29 8.5 V23.5 L16 31 L3 23.5 V8.5 Z';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ display: 'inline-block', verticalAlign: 'middle', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}>
      <path d={shape} fill={cor} stroke={cor2} strokeWidth="2" />
      <path d={shape} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" transform="translate(1.2 1.2) scale(0.925)" />
      {conf === 'AFC'
        ? <path d="M16 5 l1.2 2.6 2.8 .3 -2.1 1.9 .6 2.8 -2.5 -1.5 -2.5 1.5 .6 -2.8 -2.1 -1.9 2.8 -.3 Z" fill={ink} opacity="0.9" />
        : <circle cx="16" cy="8" r="2.2" fill={ink} opacity="0.9" />}
      <text x="16" y={conf === 'AFC' ? 22 : 21} textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="800"
        fontSize={sigla.length > 2 ? 8.5 : 10} fill={ink} letterSpacing="0.5">{sigla}</text>
    </svg>
  );
}

export function AttrCell({ v }: { v: number }) {
  const color = v >= 82 ? 'var(--color-goldhi)' : v >= 72 ? 'var(--color-grass)' : v >= 60 ? 'var(--color-ink)' : 'var(--color-faint)';
  return <span className="font-mono tabular-nums" style={{ color }}>{v}</span>;
}

export function SeqBadge({ seq }: { seq: string }) {
  if (!seq) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex gap-[3px]">
      {seq.split(' ').map((c, i) => (
        <span key={i} className="inline-block w-[16px] text-center text-[11px] font-bold"
          style={{
            color: c === 'V' ? '#0a1a12' : c === 'D' ? '#ffd9d3' : 'var(--color-dim)',
            background: c === 'V' ? 'var(--color-grass)' : c === 'D' ? '#7e2c23' : 'transparent',
            border: c === 'E' ? '1px solid var(--color-line)' : 'none',
          }}>{c}</span>
      ))}
    </span>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-goldhi">{'★'.repeat(Math.max(0, Math.min(5, n)))}</span>
      <span className="text-faint">{'★'.repeat(Math.max(0, 5 - n))}</span>
    </span>
  );
}

/* ícones SVG minimalistas */
const ic = (d: string) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export const Icons = {
  home: ic('M3 11 L12 3 L21 11 M6 10 V20 H18 V10'),
  roster: ic('M4 5 H20 M4 10 H20 M4 15 H20 M4 20 H14'),
  standings: ic('M5 20 V12 M10 20 V6 M15 20 V9 M20 20 V4'),
  market: ic('M4 8 H20 L18 20 H6 Z M9 8 V6 a3 3 0 0 1 6 0 V8'),
  draft: ic('M12 3 V16 M12 16 L7 11 M12 16 L17 11 M5 20 H19'),
  whistle: ic('M14 9 L21 5 M14 9 a5 5 0 1 0 3 9 a5 5 0 0 0 -3 -9 Z'),
  money: ic('M4 7 H20 V17 H4 Z M4 10 H20 M14 14 H17'),
  play: ic('M7 4 L19 12 L7 20 Z'),
  offseason: ic('M20 12 a8 8 0 1 1 -2.3 -5.7 M20 3 V9 H14'),
  out: ic('M14 4 H5 V20 H14 M10 12 H21 M18 8 L22 12 L18 16'),
  medical: ic('M12 5 V19 M5 12 H19'),
  contract: ic('M6 3 H18 V21 H6 Z M9 8 H15 M9 12 H15 M9 16 H13 M13 19 l2 2 4 -4'),
  scout: ic('M10.5 4 a6.5 6.5 0 1 0 0 13 a6.5 6.5 0 0 0 0 -13 Z M15.2 15.2 L21 21 M8 10.5 a2.5 2.5 0 0 1 5 0'),
};
