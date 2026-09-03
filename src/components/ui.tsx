import React from 'react';
import type { Conf, GradeLetter, Pos } from '../game/types';
import { UNIT_OF } from '../game/data';

/* ================= painel ================= */
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

/* ================= badges ================= */
export function PosBadge({ pos }: { pos: Pos }) {
  const u = UNIT_OF[pos];
  return <span className={`posbadge ${u === 'OF' ? 'pos-of' : u === 'DF' ? 'pos-df' : 'pos-st'}`}>{pos}</span>;
}

export function Ovr({ v, pot }: { v: number; pot?: number }) {
  const cls = v >= 85 ? 'ovr-elite' : v >= 75 ? 'ovr-good' : v >= 65 ? 'ovr-mid' : 'ovr-low';
  return (
    <span className={`ovr ${cls}`} title={`Overall ${v}${pot != null ? ` · potencial ${pot}` : ''}`}>
      {v}
      {pot != null && pot > v + 3 && (
        <span className="ml-1 font-normal text-ice" title={`Potencial ${pot}`}>↗{pot}</span>
      )}
    </span>
  );
}

export function GradeBadge({ grade, exact, title }: { grade: GradeLetter; exact?: boolean; title?: string }) {
  const tone =
    grade.startsWith('A') ? 'text-goldhi' :
      grade.startsWith('B') ? 'text-grass' :
        grade.startsWith('C') ? 'text-ink' : 'text-faint';
  return (
    <span
      className={`ovr ${tone} ${exact ? 'underline decoration-dotted' : ''}`}
      title={title ?? (exact ? 'Avaliação exata' : 'Estimativa do scout')}
    >
      {grade}
    </span>
  );
}

/* ================= barras ================= */
export function Bar({ pct, color = 'var(--color-grass)', h }: { pct: number; color?: string; h?: number }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="bar w-full" style={h ? { height: h } : undefined}>
      <i style={{ width: `${p}%`, background: color }} />
    </div>
  );
}

/* ================= dots & células ================= */
export function TeamDot({ cor, size = 10 }: { cor: string; size?: number }) {
  return <span className="inline-block shrink-0" style={{ width: size, height: size, background: cor, border: '1px solid rgba(0,0,0,.4)' }} />;
}

export function AttrCell({ v }: { v: number }) {
  const color = v >= 82 ? 'var(--color-goldhi)' : v >= 72 ? 'var(--color-grass)' : v >= 60 ? 'var(--color-ink)' : 'var(--color-faint)';
  return <span className="font-mono tabular-nums" style={{ color }}>{v}</span>;
}

export function SeqBadge({ seq }: { seq: string }) {
  if (!seq) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex gap-[3px]">
      {seq.split(' ').filter(Boolean).map((c, i) => (
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

/* ================= brasão da franquia (SVG autoral) ================= */
const luminance = (hex: string): number => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Escudo esportivo autoral (não é o logo oficial — estes são marcas da NFL).
 * Formato AFC = escudo clássico, NFC = hexágono. Padrão derivado da sigla.
 */
export function TeamCrest({ cor, cor2, sigla, conf, size = 24 }: {
  cor: string; cor2: string; sigla: string; conf: Conf; size?: number;
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const isAFC = conf === 'AFC';
  const inkOn = luminance(cor) > 0.45 ? '#101810' : '#f4f7f2';
  const pattern = (sigla.charCodeAt(0) + (sigla.charCodeAt(1) ?? 0)) % 4;
  const accent = luminance(cor2) > 0.85 ? cor2 : cor2;

  const shield = 'M50 4 L92 16 V52 C92 78 74 92 50 97 C26 92 8 78 8 52 V16 Z';
  const hex = 'M50 3 L93 25 V75 L50 97 L7 75 V25 Z';
  const shape = isAFC ? shield : hex;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-label={sigla} className="shrink-0"
      style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.5))' }}>
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={cor} stopOpacity="1" />
          <stop offset="1" stopColor={cor} stopOpacity="0.78" />
        </linearGradient>
        <linearGradient id={`s${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        <clipPath id={`c${uid}`}><path d={shape} /></clipPath>
      </defs>
      <path d={shape} fill={`url(#g${uid})`} stroke={accent} strokeWidth="4" />
      <g clipPath={`url(#c${uid})`}>
        <path d={shape} fill={`url(#s${uid})`} />
        {/* padrão decorativo derivado da sigla */}
        {pattern === 0 && <g stroke={accent} strokeWidth="5" opacity="0.5">
          <line x1="-10" y1="80" x2="80" y2="-10" /><line x1="20" y1="110" x2="110" y2="20" />
        </g>}
        {pattern === 1 && <g stroke={accent} strokeWidth="5" opacity="0.45">
          <line x1="0" y1="20" x2="100" y2="20" /><line x1="0" y1="80" x2="100" y2="80" />
        </g>}
        {pattern === 2 && <g stroke={accent} strokeWidth="5" opacity="0.5" fill="none">
          <polyline points="10,70 50,34 90,70" /><polyline points="10,88 50,52 90,88" />
        </g>}
        {pattern === 3 && <rect x="66" y="0" width="26" height="100" fill={accent} opacity="0.32" />}
        {/* emblema de conferência */}
        {isAFC
          ? <polygon points="50,12 52.5,18 59,18.5 54,22.5 55.5,29 50,25.5 44.5,29 46,22.5 41,18.5 47.5,18" fill="#f0b429" opacity="0.9" />
          : <rect x="45" y="13" width="10" height="10" transform="rotate(45 50 18)" fill="#f0b429" opacity="0.9" />}
      </g>
      {/* monograma */}
      <text x="50" y={isAFC ? 66 : 63} textAnchor="middle"
        fontFamily="Barlow Condensed, sans-serif" fontWeight="800"
        fontSize={sigla.length >= 3 ? 30 : 36} letterSpacing="1"
        fill={inkOn} stroke="rgba(0,0,0,0.35)" strokeWidth="1" paintOrder="stroke">
        {sigla}
      </text>
    </svg>
  );
}

/* ================= ícones (SVG inline, traço próprio) ================= */
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
  whistle: ic('M14 9 L21 5 M14 9 a5 5 0 1 0 3 9 a5 5 0 0 0 -3 -9 Z'),
  save: ic('M5 4 H17 L20 7 V20 H5 Z M8 4 V9 H16 V4 M8 20 V14 H16 V20'),
  out: ic('M14 4 H5 V20 H14 M10 12 H21 M18 8 L22 12 L18 16'),
  trade: ic('M4 8 H17 M17 8 L13 4 M17 8 L13 12 M20 16 H7 M7 16 L11 12 M7 16 L11 20'),
  contract: ic('M6 3 H15 L18 6 V21 H6 Z M15 3 V6 H18 M9 11 H15 M9 14 H15 M9 17 H12'),
  grid: ic('M4 4 H10 V10 H4 Z M14 4 H20 V10 H14 Z M4 14 H10 V20 H4 Z M14 14 H20 V20 H14 Z'),
  trophy: ic('M8 4 H16 V9 a4 4 0 0 1 -8 0 Z M8 5 H5 a3 3 0 0 0 3 4 M16 5 H19 a3 3 0 0 1 -3 4 M12 13 V17 M8 20 H16 M10 17 H14 V20'),
  scout: ic('M10.5 4 a6.5 6.5 0 1 0 0 13 a6.5 6.5 0 0 0 0 -13 Z M15.2 15.2 L21 21 M8 10.5 a2.5 2.5 0 0 1 5 0'),
  shield: ic('M12 3 L20 6 V11 C20 16 16.5 19.5 12 21 C7.5 19.5 4 16 4 11 V6 Z'),
  offseason: ic('M20 12 a8 8 0 1 1 -2.3 -5.7 M20 3 V9 H14'),
};
