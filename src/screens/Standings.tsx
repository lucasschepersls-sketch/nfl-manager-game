/* ============================================================
 * 🏆 Classificação Oficial — duas camadas.
 * CAMADA 1: campanha (Win %) sempre em primeiro lugar.
 * CAMADA 2: tiebreakers só entre campanhas idênticas, com o
 *           critério usado visível em cada linha empatada.
 * ============================================================ */

import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, divisionTable, conferenceTable, fmtM } from '../game/season';
import { fmtWinPct, fmtGB, CRITERIA_SHORT, DIVISION_CRITERIA_LABELS } from '../game/tiebreakers';
import type { Conf } from '../game/types';
import { TeamCrest, Panel } from '../components/ui';

const CONF_LABEL: Record<Conf, string> = { AFC: 'AFC', NFC: 'NFC' };
const CONF_FULL: Record<Conf, string> = {
  AFC: 'American Football Conference',
  NFC: 'National Football Conference',
};
const DIV_NAMES = ['Leste', 'Norte', 'Sul', 'Oeste'];

function RecordCell({ v, e, d }: { v: number; e: number; d: number }) {
  return (
    <span className="font-disp text-[15px] font-bold tracking-wide text-ink">
      {v}-{d}{e > 0 ? <span className="text-faint">-{e}</span> : null}
    </span>
  );
}

/* chip do critério de desempate, com tooltip explicativo */
function TiebreakChip({ k, note }: { k: string; note: string }) {
  if (!k) return <span className="font-mono text-[11px] text-faint/50">—</span>;
  const tone =
    k === 'h2h' ? 'var(--color-blood)' :
    k === 'div' || k === 'conf' ? 'var(--color-gold)' :
    k === 'sov' || k === 'sos' ? 'var(--color-ice)' : 'var(--color-dim)';
  return (
    <span
      className="tb-chip cursor-help"
      style={{ color: tone, borderColor: tone }}
      title={`${note} — aplicado porque a campanha é idêntica à do time de cima`}
    >
      {CRITERIA_SHORT[k] ?? k} <span className="opacity-70">⚠</span>
    </span>
  );
}

function DivisionCard({ conf, div, delay }: { conf: Conf; div: number; delay: number }) {
  const { st } = useGame();
  const g = st.game!;
  const rows = useMemo(() => divisionTable(g, conf, div), [g, conf, div]);
  const leader = rows[0];
  const leaderTeam = leader ? teamById(g, leader.teamId) : null;

  return (
    <div className="reveal-panel border border-line bg-panel" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2.5 border-b border-line bg-panel2 px-3.5 py-2.5">
        <span className="font-disp text-[15px] font-extrabold uppercase tracking-wider text-goldhi">
          {CONF_LABEL[conf]} {DIV_NAMES[div]}
        </span>
        {leaderTeam && (
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-faint">
            líder <TeamCrest cor={leaderTeam.cor} cor2={leaderTeam.cor2} sigla={leaderTeam.sigla} conf={leaderTeam.conf} size={18} />
          </span>
        )}
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-line2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint">
            <th className="px-2 py-1.5 text-left font-medium">#</th>
            <th className="px-1 py-1.5 text-left font-medium">Time</th>
            <th className="px-1 py-1.5 text-right font-medium">Campanha</th>
            <th className="px-1 py-1.5 text-right font-medium" title="Win Percentage — critério primário (sempre)">%</th>
            <th className="px-1 py-1.5 text-right font-medium" title="Games Behind — jogos atrás do líder">GB</th>
            <th className="hidden px-1 py-1.5 text-right font-medium sm:table-cell" title="Recorde dentro da divisão">DIV</th>
            <th className="px-2 py-1.5 text-right font-medium" title="Critério de desempate usado (só em campanhas iguais)">Desempate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const t = teamById(g, r.teamId);
            const isMe = r.teamId === g.userTeam;
            return (
              <tr
                key={r.teamId}
                className={[
                  'reveal-row border-b border-line2/60 transition-colors last:border-0 hover:bg-white/[0.04]',
                  r.tiedAbove ? 'tied-row' : '',
                  isMe ? 'bg-gold/[0.07]' : '',
                ].join(' ')}
                style={{ animationDelay: `${delay + i * 55}ms` }}
              >
                <td className="px-2 py-2 align-middle">
                  <span className={`font-disp text-[13px] font-bold ${i === 0 ? 'text-goldhi' : 'text-faint'}`}>{i + 1}</span>
                  {r.isChamp && <span className="ml-0.5 text-[10px]" title="Campeão da divisão">★</span>}
                </td>
                <td className="px-1 py-2">
                  <span className="flex items-center gap-2">
                    <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={24} />
                    <span className={`font-disp text-[14px] font-bold uppercase tracking-wide ${isMe ? 'text-goldhi' : 'text-ink'}`}>
                      {t.sigla}
                    </span>
                    {r.tiedAbove && (
                      <span className="tag border-gold/50 bg-gold/10 px-1 py-0 text-[8px] text-gold" title="Mesma campanha do time de cima — desempate aplicado">
                        EMPATE
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-1 py-2 text-right"><RecordCell v={r.v} e={r.e} d={r.d} /></td>
                <td className="px-1 py-2 text-right font-mono text-[12.5px] font-bold text-grass" title="Win Percentage — sempre o 1º critério">
                  {fmtWinPct(r.winPct ?? 0)}
                </td>
                <td className="px-1 py-2 text-right font-mono text-[12px] text-dim">{fmtGB(r.gamesBehind ?? 0)}</td>
                <td className="hidden px-1 py-2 text-right font-mono text-[12px] text-dim sm:table-cell">{r.divRec}</td>
                <td className="px-2 py-2 text-right">
                  <TiebreakChip k={r.tiebreakKey ?? ''} note={r.tiebreakNote ?? ''} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* faixa de seeds da conferência (1–7), com a zona de corte */
function SeedStrip({ conf, delay }: { conf: Conf; delay: number }) {
  const { st } = useGame();
  const g = st.game!;
  const rows = useMemo(() => conferenceTable(g, conf).filter(r => r.seed != null), [g, conf]);

  return (
    <div className="reveal-panel border border-line bg-panel2 px-3 py-2.5" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-disp text-[13px] font-extrabold uppercase tracking-wider text-ink">Seeds {CONF_LABEL[conf]}</span>
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-faint">★ = campeão de divisão · 1º folga no Wild Card</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(r => {
          const t = teamById(g, r.teamId);
          const isChamp = r.isChamp;
          const isMe = r.teamId === g.userTeam;
          return (
            <div
              key={r.teamId}
              className={[
                'flex items-center gap-1.5 border px-2 py-1',
                isMe ? 'border-gold bg-gold/10' : isChamp ? 'border-gold/40 bg-gold/[0.05]' : 'border-line bg-panel',
              ].join(' ')}
              title={`${t.cidade} ${t.nome} — seed ${r.seed} · ${fmtWinPct(r.winPct ?? 0)}`}
            >
              <span className={`font-disp text-[12px] font-extrabold ${r.seed === 1 ? 'text-goldhi' : 'text-faint'}`}>{r.seed}</span>
              <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={18} />
              <span className="font-disp text-[12.5px] font-bold uppercase text-ink">{t.sigla}</span>
              {isChamp && <span className="text-[10px] text-goldhi" title="Campeão de divisão">★</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* legenda explicando as duas camadas */
function RulesPanel() {
  const criteria: [string, string][] = [
    ['h2h', 'Head-to-head (confronto direto)'],
    ['div', 'Recorde dentro da divisão'],
    ['common', 'Recorde contra adversários comuns (mín. 4 jogos)'],
    ['conf', 'Recorde dentro da conferência'],
    ['sov', 'Strength of Victory — campanha dos times que venceu'],
    ['sos', 'Strength of Schedule — campanha dos times que enfrentou'],
    ['net', 'Pontos (marcados − sofridos)'],
    ['coin', 'Sorteio (coin toss)'],
  ];
  return (
    <Panel title="Como funciona o desempate" pad={false}>
      <div className="grid gap-0 md:grid-cols-2">
        <div className="border-b border-line px-4 py-3.5 md:border-b-0 md:border-r">
          <div className="font-disp text-[15px] font-extrabold uppercase tracking-wide text-grass">Camada 1 — Campanha</div>
          <p className="mt-1.5 font-mono text-[11.5px] leading-relaxed text-dim">
            O <b className="text-ink">Win Percentage</b> é <b className="text-ink">sempre</b> o critério primário.
            Times com campanhas diferentes <b className="text-ink">nunca</b> precisam de desempate —
            a ordem é decidida só pelo recorde.
          </p>
        </div>
        <div className="px-4 py-3.5">
          <div className="font-disp text-[15px] font-extrabold uppercase tracking-wide text-gold">Camada 2 — Só em empate</div>
          <p className="mt-1.5 font-mono text-[11.5px] leading-relaxed text-dim">
            Se dois ou mais times têm <b className="text-ink">exatamente o mesmo Win %</b>, os critérios abaixo são
            aplicados <b className="text-ink">em sequência</b> até desempatar. O critério usado aparece na coluna
            <b className="text-gold"> Desempate</b> de cada linha empatada.
          </p>
          <ol className="mt-2.5 space-y-1">
            {criteria.map(([k, label], i) => (
              <li key={k} className="flex items-baseline gap-2 font-mono text-[10.5px] text-dim">
                <span className="w-4 shrink-0 text-right font-bold text-gold/70">{i + 1}.</span>
                <span className="tag border-line px-1 py-0 text-[8.5px] text-faint">{CRITERIA_SHORT[k]}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="border-t border-line bg-panel2 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-faint">
        🏆 Regra de ouro: campeões de divisão (seeds 1–4) ficam <b className="text-goldhi">sempre</b> à frente dos wild cards (5–7), qualquer que seja o recorde.
      </div>
    </Panel>
  );
}

export function StandingsScreen() {
  const { st } = useGame();
  const g = st.game!;
  const [conf, setConf] = useState<Conf>('AFC');

  const userTeam = teamById(g, g.userTeam);
  void fmtM; void DIVISION_CRITERIA_LABELS;

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <header className="relative overflow-hidden border border-line bg-panel">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{ background: `repeating-linear-gradient(90deg, ${userTeam.cor} 0 2px, transparent 2px 110px)` }}
        />
        <div className="relative flex flex-wrap items-center gap-4 px-5 py-4">
          <div>
            <h1 className="font-disp text-[28px] font-extrabold uppercase leading-none">
              Classificação <span className="text-goldhi">Oficial</span>
            </h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              Temporada {g.settings.temporada} · Semana {g.settings.semana} · Campanha em 1º lugar, desempates só em igualdade
            </p>
          </div>
          <div className="ml-auto flex gap-1.5">
            {(['AFC', 'NFC'] as Conf[]).map(c => (
              <button
                key={c}
                onClick={() => setConf(c)}
                className={`btn btn-sm ${conf === c ? 'btn-gold' : 'btn-ghost'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      <SeedStrip conf={conf} delay={40} />

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map(div => (
          <DivisionCard key={`${conf}-${div}`} conf={conf} div={div} delay={100 + div * 70} />
        ))}
      </div>

      <RulesPanel />
    </div>
  );
}

export default StandingsScreen;
