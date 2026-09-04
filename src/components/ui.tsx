import type { ReactNode, CSSProperties } from 'react';
import type { Conf, Pos } from '../game/types';
import { UNIT_OF } from '../game/data';

/* ---------- painel ---------- */
export function Panel({ title, right, children, pad = true, className = '' }: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  pad?: boolean;
  className?: string;
}) {
  return (
    <section className={`panel border border-line bg-panel ${className}`}>
      {title !== undefined && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="font-disp text-[17px] font-bold uppercase tracking-wider text-ink">{title}</h2>
          {right}
        </header>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

/* ---------- escudo do time ---------- */
export function TeamCrest({ cor, cor2, sigla, conf, size = 32 }: {
  cor: string; cor2: string; sigla: string; conf: Conf; size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label={sigla} className="shrink-0">
      <path
        d="M20 2 L36 8 V20 C36 30 29 36 20 38 C11 36 4 30 4 20 V8 Z"
        fill={cor}
        stroke={cor2}
        strokeWidth="2"
      />
      <path d="M20 5 L33 10 V20 C33 28 27.5 33 20 35 C12.5 33 7 28 7 20 V10 Z" fill="rgba(0,0,0,0.25)" />
      <text
        x="20" y={sigla.length > 2 ? 24 : 25}
        textAnchor="middle"
        fontFamily="Barlow Condensed, sans-serif"
        fontWeight="700"
        fontSize={sigla.length > 2 ? 11 : 13}
        fill="#ffffff"
      >
        {sigla}
      </text>
      <text x="20" y="12.5" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="600" fontSize="6.5" fill={cor2 === '#000000' ? '#ffffff' : cor2}>
        {conf}
      </text>
    </svg>
  );
}

/* ---------- badge de posição ---------- */
export function PosBadge({ pos }: { pos: Pos }) {
  const unit = UNIT_OF[pos];
  const cls = unit === 'OF' ? 'pos-of' : unit === 'DF' ? 'pos-df' : 'pos-st';
  return <span className={`posbadge ${cls}`}>{pos}</span>;
}

/* ---------- overall ---------- */
export function Ovr({ v, pot }: { v: number; pot?: number }) {
  const cls = v >= 85 ? 'ovr-elite' : v >= 78 ? 'ovr-good' : v >= 70 ? 'ovr-mid' : 'ovr-low';
  return (
    <span className={`ovr ${cls}`}>
      {v}
      {pot !== undefined && pot > v + 4 && (
        <span className="ml-1 text-[10px] text-ice" title={`Potencial ${pot}`}>↗{pot}</span>
      )}
    </span>
  );
}

/* ---------- barra de progresso ---------- */
export function Bar({ pct, color = 'var(--color-grass)', h }: { pct: number; color?: string; h?: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-pitcho"
      style={{ height: h ? `${h}px` : '8px' }}
    >
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

/* ---------- sequência (últimos jogos) ---------- */
export function SeqBadge({ seq }: { seq: string }) {
  if (!seq) return <span className="font-mono text-[11px] text-faint">—</span>;
  return (
    <span className="inline-flex gap-0.5">
      {seq.split(' ').filter(Boolean).map((c, i) => (
        <span
          key={i}
          className="inline-flex h-4 w-4 items-center justify-center rounded-sm font-mono text-[9.5px] font-bold"
          style={{
            background: c === 'V' ? 'rgba(62,207,122,0.2)' : c === 'D' ? 'rgba(226,87,75,0.2)' : 'rgba(255,255,255,0.08)',
            color: c === 'V' ? 'var(--color-grass)' : c === 'D' ? 'var(--color-blood)' : 'var(--color-dim)',
          }}
        >
          {c}
        </span>
      ))}
    </span>
  );
}
