/* ============================================================
 * 🔄 CENTRAL DE TRADES (Trade Machine)
 * Regras aplicadas:
 *  - Trade Deadline (semana 9): depois, só jogador↔jogador.
 *  - Picks já usadas no draft não podem ser trocadas.
 *  - Cap deve comportar os contratos recebidos.
 *  - Roster mínimo de 44 ativos dos dois lados.
 *  - Picks condicionais (Pro Bowl / playoffs → rodada melhor).
 * A IA dos outros GMs avalia valor + necessidade posicional.
 * ============================================================ */

import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, playersOf, fmtM } from '../game/season';
import {
  validateProposal, evaluateProposal, pickValue, playerValue,
  TRADE_DEADLINE_WEEK,
} from '../game/trades';
import { Rng, newSeed } from '../game/rng';
import { Panel, PosBadge, Ovr, Bar, TeamCrest } from '../components/ui';
import type { ConditionalPickCondition, Player, TradeAsset, PickOwner } from '../game/types';

/* ---------- chips selecionáveis ---------- */
function PlayerChip({ p, sel, accent, onClick }: { p: Player; sel: boolean; accent: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`${p.nome} · ${p.idade} anos · valor de troca ${playerValue(p).toFixed(0)} pts`}
      className="flex items-center gap-2 border px-2.5 py-1.5 text-left transition-all duration-150 hover:-translate-y-0.5"
      style={{
        borderColor: sel ? accent : 'var(--color-line2)',
        background: sel ? 'rgba(255,255,255,0.06)' : 'transparent',
        boxShadow: sel ? `0 0 0 1px ${accent}, 0 4px 12px rgba(0,0,0,0.35)` : undefined,
      }}
    >
      <PosBadge pos={p.pos} />
      <span className="max-w-[130px] truncate font-mono text-[12px] text-ink">{p.nome}</span>
      <span className="font-mono text-[10px] text-faint">{p.idade}a</span>
      <Ovr v={p.ovr} />
      <span className="font-disp text-[12px] font-bold transition-opacity" style={{ color: accent, opacity: sel ? 1 : 0 }}>✓</span>
    </button>
  );
}

function PickChip({ label, value, sel, accent, onClick }: { label: string; value: number; sel: boolean; accent: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`Valor de troca ${value} pts`}
      className="flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[11.5px] transition-all duration-150 hover:-translate-y-0.5"
      style={{
        borderColor: sel ? accent : 'var(--color-line2)',
        color: sel ? accent : 'var(--color-dim)',
        background: sel ? 'rgba(255,255,255,0.06)' : 'transparent',
        boxShadow: sel ? `0 0 0 1px ${accent}, 0 4px 12px rgba(0,0,0,0.35)` : undefined,
      }}
    >
      🏈 {label}
      <span className="text-[9.5px] opacity-70">({value}pts)</span>
    </button>
  );
}

function Dot({ cor }: { cor: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cor }} />;
}

export function TradesScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;

  const [toId, setToId] = useState(() => g.teams.find(t => t.id !== g.userTeam)!.id);
  const [give, setGive] = useState<TradeAsset[]>([]);
  const [get, setGet] = useState<TradeAsset[]>([]);
  const [conditionalMode, setConditionalMode] = useState(false);
  const [condition, setCondition] = useState<ConditionalPickCondition>('team_makes_playoffs');
  const [upgradedRound, setUpgradedRound] = useState(3);
  const [conditionPlayerId, setConditionPlayerId] = useState('');

  const me = teamById(g, g.userTeam);
  const them = teamById(g, toId);

  const myPlayers = useMemo(() => playersOf(g, g.userTeam).filter(p => p.status !== 'PS').sort((a, b) => b.ovr - a.ovr), [g]);
  const theirPlayers = useMemo(() => playersOf(g, toId).filter(p => p.status !== 'PS').sort((a, b) => b.ovr - a.ovr), [g, toId]);

  const afterDeadline = g.settings.fase === 'REG' && g.settings.semana > TRADE_DEADLINE_WEEK;
  const inPlayoffs = g.settings.fase === 'PO';
  const picksLocked = afterDeadline || inPlayoffs;

  /* picks que cada lado detém (não consumidas) */
  const myPicks = useMemo(() => {
    const out: { round: number; slot: number; cell: PickOwner }[] = [];
    g.pickOwners.forEach((row, ri) => row.forEach((cell, si) => {
      if (cell.owner === g.userTeam && !cell.consumed) out.push({ round: ri + 1, slot: si, cell });
    }));
    return out;
  }, [g]);
  const theirPicks = useMemo(() => {
    const out: { round: number; slot: number; cell: PickOwner }[] = [];
    g.pickOwners.forEach((row, ri) => row.forEach((cell, si) => {
      if (cell.owner === toId && !cell.consumed) out.push({ round: ri + 1, slot: si, cell });
    }));
    return out;
  }, [g, toId]);

  const proposal = { from: g.userTeam, to: toId, give, get };
  const val = validateProposal(g, proposal);
  const ev = useMemo(
    () => (give.length && get.length ? evaluateProposal(g, proposal, new Rng(newSeed())) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g, toId, give, get],
  );

  /* identidade estável de um asset (inclui cláusula condicional) */
  const key = (a: TradeAsset) =>
    a.kind === 'player'
      ? `p:${a.playerId}`
      : `k:${a.round}:${a.slot}:${a.conditional?.condition ?? ''}:${a.conditional?.upgradedRound ?? ''}`;

  const toggle = (side: 'give' | 'get', asset: TradeAsset) => {
    const set = side === 'give' ? give : get;
    const setter = side === 'give' ? setGive : setGet;
    const k = key(asset);
    setter(set.some(a => key(a) === k) ? set.filter(a => key(a) !== k) : [...set, asset]);
  };
  const isSelected = (side: 'give' | 'get', asset: TradeAsset) => {
    const set = side === 'give' ? give : get;
    const k = key(asset);
    return set.some(a => key(a) === k);
  };

  const pickLabel = (pk: { round: number; slot: number; cell: PickOwner }) => {
    const from = pk.cell.from && pk.cell.from !== pk.cell.owner ? ` (${teamById(g, pk.cell.from).sigla})` : '';
    const cond = pk.cell.conditional;
    const clause = cond ? ` · ${cond.resolvedRound ? `resolvida R${cond.resolvedRound}` : `cond. R${cond.upgradedRound}`}` : '';
    return `R${pk.round} #${pk.slot + 1}${from}${clause}`;
  };
  const pickAsset = (pk: { round: number; slot: number; cell: PickOwner }): TradeAsset => ({
    kind: 'pick', round: pk.round, slot: pk.slot,
    conditional: pk.cell.conditional ?? (conditionalMode
      ? { baseRound: pk.round, condition, upgradedRound, conditionPlayerId: condition === 'player_makes_pro_bowl' ? conditionPlayerId : undefined }
      : undefined),
  });

  const reset = () => { setGive([]); setGet([]); };

  return (
    <div className="space-y-4">
      {/* aviso de bloqueio */}
      {(afterDeadline || inPlayoffs) && (
        <div className="border border-blood/50 bg-[rgba(226,87,75,0.08)] px-4 py-3 font-mono text-[12.5px] text-blood">
          {inPlayoffs
            ? '⛔ Trades fechados durante os playoffs.'
            : `⛔ Trade Deadline (semana ${TRADE_DEADLINE_WEEK}) ultrapassado — apenas jogador↔jogador, sem picks.`}
        </div>
      )}

      {/* cabeçalho da negociação */}
      <header className="relative overflow-hidden border border-line bg-panel">
        <div className="absolute inset-0 opacity-[0.07]" style={{ background: `repeating-linear-gradient(90deg, ${me.cor} 0 2px, transparent 2px 110px)` }} />
        <div className="relative flex flex-wrap items-center gap-4 px-5 py-4">
          <TeamCrest cor={me.cor} cor2={me.cor2} sigla={me.sigla} conf={me.conf} size={50} />
          <span className="font-disp text-[26px] font-extrabold text-faint">×</span>
          <TeamCrest cor={them.cor} cor2={them.cor2} sigla={them.sigla} conf={them.conf} size={50} />
          <div>
            <h1 className="font-disp text-[26px] font-extrabold uppercase leading-none">
              Central de <span className="text-goldhi">Trades</span>
            </h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              Semana {g.settings.semana} · {g.settings.fase === 'REG' ? 'Temporada Regular' : g.settings.fase === 'PRE' ? 'Pré-temporada' : 'Offseason'}
            </p>
          </div>
          <label className="ml-auto flex items-center gap-2 font-mono text-[12px] text-dim">
            Parceiro:
            <select className="sel" value={toId} onChange={e => { setToId(e.target.value); setGet([]); }}>
              {g.teams.filter(t => t.id !== g.userTeam).map(t => (
                <option key={t.id} value={t.id}>{t.cidade} {t.nome}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* picks condicionais */}
      <Panel title="📋 Picks condicionais">
        <label className="flex cursor-pointer items-center gap-2 font-mono text-[12px] text-ink">
          <input type="checkbox" checked={conditionalMode} onChange={e => setConditionalMode(e.target.checked)} className="accent-[var(--color-gold)]" />
          Marcar as picks selecionadas como <b className="text-goldhi">condicionais</b>
        </label>
        {conditionalMode && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line2 pt-3 font-mono text-[12px]">
            <label className="flex items-center gap-2 text-dim">
              Condição
              <select value={condition} onChange={e => setCondition(e.target.value as ConditionalPickCondition)} className="sel">
                <option value="team_makes_playoffs">Time chega aos playoffs</option>
                <option value="player_makes_pro_bowl">Jogador chega ao Pro Bowl</option>
              </select>
            </label>
            {condition === 'player_makes_pro_bowl' && (
              <label className="flex items-center gap-2 text-dim">
                Jogador
                <select value={conditionPlayerId} onChange={e => setConditionPlayerId(e.target.value)} className="sel">
                  <option value="">Selecione…</option>
                  {[...myPlayers, ...theirPlayers].map(p => (
                    <option key={p.id} value={p.id}>{p.nome} ({p.pos})</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 text-dim">
              Se cumprir, vira rodada
              <select value={upgradedRound} onChange={e => setUpgradedRound(+e.target.value)} className="sel">
                {[1, 2, 3, 4, 5, 6, 7].map(r => <option key={r} value={r}>R{r}</option>)}
              </select>
            </label>
          </div>
        )}
      </Panel>

      {/* colunas de seleção */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* VOCÊ OFERECE */}
        <Panel
          title={`Você oferece — ${me.sigla}`}
          pad={false}
          right={<span className="tag border-blood/50 text-blood">{give.length} item(ns)</span>}
        >
          <div className="max-h-[400px] overflow-y-auto">
            <div className="px-3.5 pt-2 font-disp text-[12px] font-bold uppercase tracking-widest text-faint">Jogadores</div>
            <div className="flex flex-wrap gap-1.5 px-3.5 py-2">
              {myPlayers.map(p => (
                <PlayerChip key={p.id} p={p} sel={isSelected('give', { kind: 'player', playerId: p.id })} accent="var(--color-blood)" onClick={() => toggle('give', { kind: 'player', playerId: p.id })} />
              ))}
            </div>
            {!picksLocked && (
              <>
                <div className="px-3.5 pt-1 font-disp text-[12px] font-bold uppercase tracking-widest text-faint">Picks de draft</div>
                <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 pt-2">
                  {myPicks.length === 0 && <span className="font-mono text-[11px] text-faint">Nenhuma pick disponível.</span>}
                  {myPicks.map(pk => (
                    <PickChip key={`${pk.round}-${pk.slot}`} label={pickLabel(pk)} value={pickValue(pk.round)} sel={isSelected('give', pickAsset(pk))} accent="var(--color-blood)" onClick={() => toggle('give', pickAsset(pk))} />
                  ))}
                </div>
              </>
            )}
            {picksLocked && (
              <div className="px-3.5 pb-3 font-mono text-[11px] text-faint">🔒 Picks bloqueadas (deadline/playoffs).</div>
            )}
          </div>
        </Panel>

        {/* VOCÊ RECEBE */}
        <Panel
          title={`Você recebe — ${them.sigla}`}
          pad={false}
          right={<span className="tag border-grass/50 text-grass">{get.length} item(ns)</span>}
        >
          <div className="max-h-[400px] overflow-y-auto">
            <div className="px-3.5 pt-2 font-disp text-[12px] font-bold uppercase tracking-widest text-faint">Jogadores</div>
            <div className="flex flex-wrap gap-1.5 px-3.5 py-2">
              {theirPlayers.map(p => (
                <PlayerChip key={p.id} p={p} sel={isSelected('get', { kind: 'player', playerId: p.id })} accent="var(--color-grass)" onClick={() => toggle('get', { kind: 'player', playerId: p.id })} />
              ))}
            </div>
            {!picksLocked && (
              <>
                <div className="px-3.5 pt-1 font-disp text-[12px] font-bold uppercase tracking-widest text-faint">Picks de draft</div>
                <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 pt-2">
                  {theirPicks.length === 0 && <span className="font-mono text-[11px] text-faint">Nenhuma pick disponível.</span>}
                  {theirPicks.map(pk => (
                    <PickChip key={`${pk.round}-${pk.slot}`} label={pickLabel(pk)} value={pickValue(pk.round)} sel={isSelected('get', pickAsset(pk))} accent="var(--color-grass)" onClick={() => toggle('get', pickAsset(pk))} />
                  ))}
                </div>
              </>
            )}
            {picksLocked && (
              <div className="px-3.5 pb-3 font-mono text-[11px] text-faint">🔒 Picks bloqueadas (deadline/playoffs).</div>
            )}
          </div>
        </Panel>
      </div>

      {/* avaliação da proposta */}
      <Panel title="⚖️ Avaliação da proposta">
        {!val.ok ? (
          <ul className="space-y-1.5">
            {val.erros.map((e, i) => <li key={i} className="border-l-2 border-blood pl-3 font-mono text-[12px] text-blood">{e}</li>)}
            {!val.erros.length && <li className="font-mono text-[12px] text-faint">Selecione ao menos 1 item de cada lado.</li>}
          </ul>
        ) : ev ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between font-mono text-[12px] text-dim">
                <span>Chance de <b className="text-ink">{them.sigla}</b> aceitar</span>
                <b className="text-ink">{ev.chance}% · {ev.parecer}</b>
              </div>
              <Bar pct={ev.chance} color={ev.chance >= 60 ? 'var(--color-grass)' : ev.chance >= 35 ? 'var(--color-gold)' : 'var(--color-blood)'} />
            </div>
            <div className="grid grid-cols-3 gap-3 font-mono text-[12px]">
              <div className="border border-line2 px-3 py-2">
                <span className="text-faint">Valor entregue</span>
                <div className="font-disp text-[18px] font-bold text-ink">{ev.valueGive} pts</div>
              </div>
              <div className="border border-line2 px-3 py-2">
                <span className="text-faint">Valor recebido</span>
                <div className="font-disp text-[18px] font-bold text-ink">{ev.valueGet} pts</div>
              </div>
              <div className="border border-line2 px-3 py-2">
                <span className="text-faint">Saldo p/ parceiro</span>
                <div className="font-disp text-[18px] font-bold" style={{ color: ev.net >= 0 ? 'var(--color-grass)' : 'var(--color-blood)' }}>
                  {ev.net >= 0 ? '+' : ''}{ev.net} pts
                </div>
              </div>
            </div>
            <div className="flex justify-between border-t border-line2 pt-2 font-mono text-[12px] text-dim">
              <span>Seu cap após a troca</span>
              <b className="text-ink">{fmtM(val.capDepois)} / {fmtM(g.settings.cap)}</b>
            </div>
            <button
              className="btn btn-gold w-full text-[16px]"
              onClick={() => { dispatch({ type: 'TRADE_PROPOSE', proposal }); reset(); }}
            >
              Propor troca a {them.sigla} »
            </button>
          </div>
        ) : (
          <p className="font-mono text-[12.5px] text-faint">Monte a troca selecionando itens dos dois lados para ver a avaliação.</p>
        )}
      </Panel>

      {/* histórico de negociações */}
      {g.tradeLog.length > 0 && (
        <Panel title="📜 Histórico de negociações" pad={false}>
          <div className="max-h-[260px] overflow-y-auto">
            {g.tradeLog.slice(0, 20).map(tr => {
              const a = teamById(g, tr.a); const b = teamById(g, tr.b);
              return (
                <div key={tr.id} className="flex items-center gap-3 border-b border-line2 px-4 py-2 font-mono text-[12px]">
                  <span className={`tag shrink-0 ${tr.aceita ? 'border-grass/60 text-grass' : 'border-blood/60 text-blood'}`}>
                    {tr.aceita ? 'FECHADA' : 'RECUSADA'}
                  </span>
                  <span className="inline-flex items-center gap-1.5"><Dot cor={a.cor} /><b>{a.sigla}</b></span>
                  <span className="truncate text-dim">envia {tr.aGives} e recebe {tr.bGives}</span>
                  <span className="ml-auto shrink-0 text-faint">Sem {tr.semana}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
