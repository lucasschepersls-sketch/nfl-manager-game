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
    <span className={`ovr ${cls}`} title={`Overall ${v} — média ponderada dos atributos${pot != null ? ` · potencial ${pot}` : ''}`}>
      {v}
      {pot != null && pot > v + 3 && (
        <span className="ml-1 font-normal text-ice" title={`Potencial ${pot} — teto que este jogador pode atingir com desenvolvimento`}>↗{pot}</span>
      )}
    </span>
  );
}

const GRADE_COLOR: Record<string, string> = {
  'A+': 'var(--color-goldhi)', 'A': 'var(--color-goldhi)', 'A-': 'var(--color-goldhi)',
  'B+': 'var(--color-grass)', 'B': 'var(--color-grass)', 'B-': 'var(--color-grass)',
  'C+': 'var(--color-ink)', 'C': 'var(--color-ink)', 'C-': 'var(--color-ink)',
  'D': 'var(--color-dim)', 'F': 'var(--color-blood)',
};

/** Nota de scout em letra (A+..F) com cor por tier. */
export function GradeBadge({ grade, title, exact }: { grade: string; title?: string; exact?: boolean }) {
  return (
    <span
      className={`ovr ${exact ? 'underline decoration-dotted underline-offset-2' : ''}`}
      style={{ color: GRADE_COLOR[grade] ?? 'var(--color-ink)' }}
      title={title ?? `Nota ${grade}`}
    >
      {grade}
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

/** Contraste automático pela luminância da cor de fundo. */
function onColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16); const g = parseInt(c.slice(2, 4), 16); const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#101820' : '#ffffff';
}

/** Brasão autoral (cores oficiais + forma distinta por conferência). */
export function TeamCrest({ cor, cor2, sigla, conf, size = 24 }: {
  cor: string; cor2: string; sigla: string; conf: Conf; size?: number;
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const fg = onColor(cor);
  const isAFC = conf === 'AFC';
  // padrão derivado da sigla (estável por time)
  const pat = sigla.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % 4;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${uid}`}>
          {isAFC
            ? <path d="M24 3 L43 9 V24 C43 35 35 43 24 46 C13 43 5 35 5 24 V9 Z" />
            : <path d="M24 3 L42 13 V35 L24 45 L6 35 V13 Z" />}
        </clipPath>
      </defs>
      <g clipPath={`url(#c${uid})`}>
        <rect x="0" y="0" width="48" height="48" fill={cor} />
        {pat === 0 && <rect x="-10" y="28" width="70" height="10" fill={cor2} opacity="0.85" transform="rotate(-18 24 24)" />}
        {pat === 1 && <><rect x="0" y="30" width="48" height="6" fill={cor2} opacity="0.85" /><rect x="0" y="12" width="48" height="6" fill={cor2} opacity="0.85" /></>}
        {pat === 2 && <path d="M24 8 L40 20 L40 28 L24 16 L8 28 L8 20 Z" fill={cor2} opacity="0.85" />}
        {pat === 3 && <rect x="30" y="0" width="18" height="48" fill={cor2} opacity="0.85" />}
        <rect x="0" y="0" width="48" height="48" fill={`url(#g${uid})`} />
      </g>
      {isAFC
        ? <path d="M24 3 L43 9 V24 C43 35 35 43 24 46 C13 43 5 35 5 24 V9 Z" fill="none" stroke={cor2} strokeWidth="2" />
        : <path d="M24 3 L42 13 V35 L24 45 L6 35 V13 Z" fill="none" stroke={cor2} strokeWidth="2" />}
      <text x="24" y={isAFC ? 29 : 30} textAnchor="middle" fontFamily="Barlow Condensed, sans-serif"
        fontWeight="800" fontSize={sigla.length > 2 ? 13 : 15} fill={fg} stroke="rgba(0,0,0,0.35)" strokeWidth="0.6">
        {sigla}
      </text>
      {isAFC
        ? <path d="M24 7 l1.5 3 3.3.4-2.4 2.2.6 3.2-3-1.6-3 1.6.6-3.2-2.4-2.2 3.3-.4z" fill={fg} opacity="0.9" />
        : <path d="M24 6 L28 10 L24 14 L20 10 Z" fill={fg} opacity="0.9" />}
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

const ic = (d: string) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export const Icons = {
  home: ic('M3 11 L12 3 L21 11 M6 10 V20 H18 V10'),
  roster: ic('M4 5 H20 M4 10 H20 M4 15 H20 M4 20 H14'),
  tactics: ic('M4 18 L9 12 L13 15 L20 6 M20 6 H15 M20 6 V11'),
  calendar: ic('M5 5 H19 V20 H5 Z M5 9 H19 M8 3 V6 M16 3 V6'),
  standings: ic('M5 20 V12 M10 20 V6 M15 20 V9 M20 20 V4'),
  market: ic('M4 8 H20 L18 20 H6 Z M9 8 V6 a3 3 0 0 1 6 0 V8'),
  draft: ic('M12 3 V16 M12 16 L7 11 M12 16 L17 11 M5 20 H19'),
  money: ic('M4 7 H20 V17 H4 Z M4 10 H20 M14 14 H17'),
  medical: ic('M12 5 V19 M5 12 H19'),
  play: ic('M7 4 L19 12 L7 20 Z'),
  staff: ic('M12 4 a4 4 0 1 0 0 8 a4 4 0 0 0 0 -8 M4 20 c0 -4 4 -6 8 -6 s8 2 8 6'),
  trade: ic('M4 8 H17 M17 8 L13 4 M17 8 L13 12 M20 16 H7 M7 16 L11 12 M7 16 L11 20'),
  contract: ic('M6 3 H15 L18 6 V21 H6 Z M15 3 V6 H18 M9 11 H15 M9 14 H15 M9 17 H12'),
  shield: ic('M12 3 L20 6 V11 C20 16 16.5 19.5 12 21 C7.5 19.5 4 16 4 11 V6 Z'),
  trophy: ic('M8 4 H16 V9 a4 4 0 0 1 -8 0 Z M8 5 H5 a3 3 0 0 0 3 4 M16 5 H19 a3 3 0 0 1 -3 4 M12 13 V16 M9 20 H15 M10 16 H14 L15 20 H9 Z'),
  grid: ic('M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M14 14 H20 V20 H14 Z'),
  whistle: ic('M13 9 L21 5 M13 9 a5 5 0 1 0 3.5 8.6 a5 5 0 0 0 -3.5 -8.6 Z M11 13.5 h2'),
  scout: ic('M10.5 4 a6.5 6.5 0 1 0 0 13 a6.5 6.5 0 0 0 0 -13 Z M15.2 15.2 L21 21'),
  offseason: ic('M20 12 a8 8 0 1 1 -2.3 -5.7 M20 3 V9 H14'),
  out: ic('M14 4 H5 V20 H14 M10 12 H21 M18 8 L22 12 L18 16'),
};
