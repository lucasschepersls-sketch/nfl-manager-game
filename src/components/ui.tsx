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

/** Luminância aproximada (0..255) de uma cor hex. */
const lum = (hex: string): number => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/**
 * Brasão autoral da franquia — escudo esportivo em camadas, derivado apenas
 * das cores oficiais (marca própria: variação de padrão por time, anel na cor
 * secundária, monograma biselado e emblema de conferência).
 */
export function TeamCrest({ cor, cor2, sigla, conf, size = 22 }: { cor: string; cor2: string; sigla: string; conf: Conf; size?: number }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const dark = lum(cor) < 120;
  const ink = dark ? '#f4f6f1' : '#0c1410';
  // cor de acento: secundária, com fallback prateado quando ela "some" no fundo
  const accent = lum(cor2) < 30 && lum(cor) < 140 ? '#c9ced4' : cor2;
  // variação de padrão determinística por franquia
  const h = sigla.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const pattern = h % 4;
  const id = `cr-${uid}`;
  const shape = 'M50 4 L88 16 V52 C88 76 72 90 50 97 C28 90 12 76 12 52 V16 Z';

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden
      style={{ display: 'inline-block', verticalAlign: 'middle', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}>
      <defs>
        <clipPath id={id}><path d={shape} /></clipPath>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
      </defs>

      {/* base + padrões */}
      <g clipPath={`url(#${id})`}>
        <rect x="0" y="0" width="100" height="100" fill={cor} />
        {pattern === 0 && <rect x="-30" y="34" width="170" height="26" fill={accent} opacity="0.9" transform="rotate(-24 50 47)" />}
        {pattern === 1 && <><rect x="0" y="14" width="100" height="15" fill={accent} /><rect x="0" y="78" width="100" height="9" fill={accent} /></>}
        {pattern === 2 && <><path d="M0 62 L50 44 L100 62 V76 L50 58 L0 76 Z" fill={accent} /><path d="M0 80 L50 62 L100 80 V92 L50 74 L0 92 Z" fill={accent} opacity="0.55" /></>}
        {pattern === 3 && <rect x="62" y="0" width="38" height="100" fill={accent} opacity="0.85" />}
        <rect x="0" y="0" width="100" height="100" fill={`url(#${id}-sheen)`} />
      </g>

      {/* anel interno + contorno */}
      <path d={shape} fill="none" stroke={accent} strokeWidth="4" transform="translate(3 3) scale(0.94)" />
      <path d={shape} fill="none" stroke={dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)'} strokeWidth="2.4" />

      {/* emblema de conferência: estrela (AFC) / losango (NFC) */}
      {conf === 'AFC'
        ? <path d="M50 12 l2.6 5.6 6.1 .7 -4.5 4.2 1.2 6.1 -5.4 -3.1 -5.4 3.1 1.2 -6.1 -4.5 -4.2 6.1 -.7 Z" fill={ink} opacity="0.92" />
        : <path d="M50 11 L56 19 L50 27 L44 19 Z" fill={ink} opacity="0.92" />}

      {/* monograma biselado */}
      <text x="50" y={pattern === 0 ? 60 : 64} textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="800"
        fontSize={sigla.length > 3 ? 24 : sigla.length === 3 ? 27 : 30} letterSpacing="1"
        stroke={dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)'} strokeWidth="1.4" paintOrder="stroke" fill={ink}>{sigla}</text>
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
