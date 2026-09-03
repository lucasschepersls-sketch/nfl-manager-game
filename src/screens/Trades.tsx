import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, playersOf, capUsed } from '../game/season';
import {
  validateProposal, evaluateProposal, pickValue, playerValue,
  TRADE_DEADLINE_WEEK, ROUNDS,
} from '../game/trades';
import { Rng } from '../game/rng';
import { Panel, PosBadge, Ovr, Bar } from '../components/ui';
import type { ConditionalPickCondition, Player, TradeAsset, PickOwner } from '../game/types';

export function TradesScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const me = g.userTeam;
  const [partnerId, setPartnerId] = useState(() =>
    g.teams.find(t => t.id !== me)?.id ?? g.teams[0].id);
  const [give, setGive] = useState<TradeAsset[]>([]);
  const [get, setGet] = useState<TradeAsset[]>([]);
  const [conditionalMode, setConditionalMode] = useState(false);
  const [condition, setCondition] = useState<ConditionalPickCondition>('team_makes_playoffs');
  const [upgradedRound, setUpgradedRound] = useState(3);
  const [conditionPlayerId, setConditionPlayerId] = useState('');

  const myTeam = teamById(g, me);
  const partner = teamById(g, partnerId);

  const afterDeadline = g.settings.fase === 'REG' && g.settings.semana > TRADE_DEADLINE_WEEK;
  const weeksLeft = g.settings.fase === 'REG'
    ? Math.max(0, TRADE_DEADLINE_WEEK - g.settings.semana + 1)
    : null;

  const myPlayers = useMemo(() =>
    playersOf(g, me).filter(p => p.status !== 'PS').sort((a, b) => b.ovr - a.ovr), [g, me]);
  const theirPlayers = useMemo(() =>
    playersOf(g, partnerId).filter(p => p.status !== 'PS').sort((a, b) => b.ovr - a.ovr), [g, partnerId]);

  const picksOf = (teamId: string): { round: number; slot: number; cell: PickOwner }[] => {
    const out: { round: number; slot: number; cell: PickOwner }[] = [];
    for (let r = 1; r <= ROUNDS; r++)
      for (let slot = 0; slot < 32; slot++) {
        const cell = g.pickOwners[r - 1]?.[slot];
        if (cell && cell.owner === teamId && !cell.consumed) out.push({ round: r, slot, cell });
      }
    return out;
  };
  const myPicks = useMemo(() => picksOf(me), [g.pickOwners, me]);
  const theirPicks = useMemo(() => picksOf(partnerId), [g.pickOwners, partnerId]);

  // avaliação ao vivo (seed fixa p/ o preview; o sorteio real acontece no reducer)
  const preview = useMemo(() => {
    const prop = { from: me, to: partnerId, give, get };
    const val = validateProposal(g, prop);
    const ev = evaluateProposal(g, prop, new Rng(42));
    return { val, ev };
  }, [g, me, partnerId, give, get]);

  const toggle = (side: 'give' | 'get', asset: TradeAsset) => {
    const set = side === 'give' ? give : get;
    const key = (a: TradeAsset) => a.kind === 'player' ? `p:${a.playerId}` : `k:${a.round}:${a.slot}:${a.conditional?.condition ?? ''}:${a.conditional?.upgradedRound ?? ''}`;
    const k = key(asset);
    const next = set.some(a => key(a) === k) ? set.filter(a => key(a) !== k) : [...set, asset];
    if (side === 'give') setGive(next); else setGet(next);
  };
  const isSelected = (side: 'give' | 'get', asset: TradeAsset) => {
    const set = side === 'give' ? give : get;
    const key = (a: TradeAsset) => a.kind === 'player' ? `p:${a.playerId}` : `k:${a.round}:${a.slot}:${a.conditional?.condition ?? ''}:${a.conditional?.upgradedRound ?? ''}`;
    return set.some(a => key(a) === key(asset));
  };

  const pickLabel = (a: { round: number; slot: number; cell: PickOwner }) => {
    const from = a.cell.from && a.cell.from !== a.cell.owner ? ` (${teamById(g, a.cell.from).sigla})` : '';
    const conditional = a.cell.conditional;
    const clause = conditional ? ` · ${conditional.resolvedRound ? `resolvida R${conditional.resolvedRound}` : `cond. R${conditional.upgradedRound}`}` : '';
    return `R${a.round} #${a.slot + 1}${from}${clause}`;
  };
  const pickAsset = (pk: { round: number; slot: number; cell: PickOwner }): TradeAsset => ({
    kind: 'pick', round: pk.round, slot: pk.slot,
    conditional: pk.cell.conditional ?? (conditionalMode ? { baseRound: pk.round, condition, upgradedRound, conditionPlayerId: condition === 'player_makes_pro_bowl' ? conditionPlayerId : undefined } : undefined),
  });

  const myCap = capUsed(g, me);
  const chance = preview.ev.chance;
  const chanceColor = chance >= 60 ? 'var(--color-grass)' : chance >= 35 ? 'var(--color-gold)' : 'var(--color-blood)';

  return (
    <div className="space-y-4">
      {/* cabeçalho: prazo + seletor de parceiro */}
      <Panel pad={false}>
        <div className="flex flex-wrap items-center gap-4 px-4 py-3">
          <div>
            <div className="font-disp text-[20px] font-extrabold uppercase tracking-wide text-goldhi">Trade Machine</div>
            <div className="font-mono text-[11.5px] text-dim">
              {afterDeadline
                ? <span className="text-blood">Trade Deadline ultrapassado — apenas jogador↔jogador (sem picks).</span>
                : g.settings.fase === 'REG'
                  ? <>Deadline: semana {TRADE_DEADLINE_WEEK} · <b className="text-gold">{weeksLeft} semana(s) restantes</b> · depois só jogador↔jogador</>
                  : <>Mercado aberto (offseason/pré-temporada) · picks liberadas</>}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="font-mono text-[11.5px] text-faint">Negociar com:</span>
            <select
              value={partnerId}
              onChange={e => { setPartnerId(e.target.value); setGet([]); }}
              className="border border-line bg-panel2 px-2 py-1.5 font-disp text-[14px] font-semibold uppercase text-ink outline-none focus:border-gold"
            >
              {g.teams.filter(t => t.id !== me).map(t => (
                <option key={t.id} value={t.id}>{t.cidade} {t.nome}</option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      <Panel title="Picks condicionais">
        <label className="flex items-center gap-2 font-mono text-[12px] text-ink">
          <input type="checkbox" checked={conditionalMode} onChange={e => setConditionalMode(e.target.checked)} />
          Marcar picks selecionadas como condicionais
        </label>
        {conditionalMode && <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[12px]">
          <label>Condição <select value={condition} onChange={e => setCondition(e.target.value as ConditionalPickCondition)} className="ml-1 border border-line bg-panel2 px-2 py-1 text-ink">
            <option value="team_makes_playoffs">Time chega aos playoffs</option>
            <option value="player_makes_pro_bowl">Jogador chega ao Pro Bowl</option>
          </select></label>
          {condition === 'player_makes_pro_bowl' && <label>Jogador <select value={conditionPlayerId} onChange={e => setConditionPlayerId(e.target.value)} className="ml-1 border border-line bg-panel2 px-2 py-1 text-ink">
            <option value="">Selecione</option>
            {[...myPlayers, ...theirPlayers].map(player => <option key={player.id} value={player.id}>{player.nome} ({player.pos})</option>)}
          </select></label>}
          <label>Se cumprir, vira R<select value={upgradedRound} onChange={e => setUpgradedRound(+e.target.value)} className="ml-1 border border-line bg-panel2 px-2 py-1 text-ink">
            {[1, 2, 3, 4, 5, 6, 7].map(round => <option key={round} value={round}>{round}</option>)}
          </select></label>
        </div>}
      </Panel>

      {/* colunas de seleção */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* VOCÊ OFERECE */}
        <Panel title={`Você oferece — ${myTeam.sigla}`} pad={false}
          right={<span className="tag border-blood/50 text-blood">{give.length} item(ns)</span>}>
          <div className="max-h-[420px] overflow-y-auto">
            <div className="px-3.5 pt-2 font-disp text-[12px] font-bold uppercase tracking-widest text-faint">Jogadores</div>
            <div className="flex flex-wrap gap-1.5 px-3.5 py-2">
              {myPlayers.map(p => <PlayerChip key={p.id} p={p} sel={isSelected('give', { kind: 'player', playerId: p.id })} onClick={() => toggle('give', { kind: 'player', playerId: p.id })} />)}
            </div>
            {!afterDeadline && (
              <>
                <div className="px-3.5 pt-1 font-disp text-[12px] font-bold uppercase tracking-widest text-faint">Picks de draft</div>
                <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 pt-2">
                  {myPicks.length === 0 && <span className="font-mono text-[11px] text-faint">Nenhuma pick disponível.</span>}
                  {myPicks.map(pk => (
                    <PickChip key={`${pk.round}-${pk.slot}`} label={pickLabel(pk)} value={pickValue(pk.round)}
                      sel={isSelected('give', pickAsset(pk))}
                      onClick={() => toggle('give', pickAsset(pk))} />
                  ))}
                </div>
              </>
            )}
          </div>
        </Panel>

        {/* VOCÊ RECEBE */}
        <Panel title={`Você recebe — ${partner.sigla}`} pad={false}
          right={<span className="tag border-grass/50 text-grass">{get.length} item(ns)</span>}>
          <div className="max-h-[420px] overflow-y-auto">
            <div className="px-3.5 pt-2 font-disp text-[12px] font-bold uppercase tracking-widest text-faint">Jogadores</div>
            <div className="flex flex-wrap gap-1.5 px-3.5 py-2">
              {theirPlayers.map(p => <PlayerChip key={p.id} p={p} sel={isSelected('get', { kind: 'player', playerId: p.id })} onClick={() => toggle('get', { kind: 'player', playerId: p.id })} />)}
            </div>
            {!afterDeadline && (
              <>
                <div className="px-3.5 pt-1 font-disp text-[12px] font-bold uppercase tracking-widest text-faint">Picks de draft</div>
                <div className="flex flex-wrap gap-1.5 px-3.5 pb-3 pt-2">
                  {theirPicks.length === 0 && <span className="font-mono text-[11px] text-faint">Nenhuma pick disponível.</span>}
                  {theirPicks.map(pk => (
                    <PickChip key={`${pk.round}-${pk.slot}`} label={pickLabel(pk)} value={pickValue(pk.round)}
                      sel={isSelected('get', pickAsset(pk))}
                      onClick={() => toggle('get', pickAsset(pk))} />
                  ))}
                </div>
              </>
            )}
          </div>
        </Panel>
      </div>

      {/* painel de avaliação */}
      <Panel title="Avaliação do GM adversário" pad={false}>
        <div className="grid gap-0 md:grid-cols-[1fr_300px]">
          <div className="border-b border-line2 p-4 md:border-b-0 md:border-r">
            <div className="mb-2 flex items-baseline gap-3">
              <span className="font-mono text-[12px] text-dim">Probabilidade de aceitação</span>
              <span className="font-disp text-[26px] font-extrabold leading-none" style={{ color: chanceColor }}>{chance}%</span>
            </div>
            <Bar pct={chance} color={chanceColor} h={12} />
            <p className="mt-2.5 font-mono text-[12px] leading-relaxed text-ink">{preview.ev.parecer}</p>

            <div className="mt-3 grid grid-cols-3 gap-3 font-mono text-[11.5px]">
              <div className="border border-line2 px-2.5 py-2">
                <div className="text-faint">Ele recebe</div>
                <div className="text-[16px] font-bold text-grass">{preview.ev.valueGive} pts</div>
              </div>
              <div className="border border-line2 px-2.5 py-2">
                <div className="text-faint">Ele entrega</div>
                <div className="text-[16px] font-bold text-blood">{preview.ev.valueGet} pts</div>
              </div>
              <div className="border border-line2 px-2.5 py-2">
                <div className="text-faint">Saldo p/ ele</div>
                <div className="text-[16px] font-bold" style={{ color: preview.ev.net >= 0 ? 'var(--color-grass)' : 'var(--color-blood)' }}>
                  {preview.ev.net >= 0 ? '+' : ''}{preview.ev.net}
                </div>
              </div>
            </div>

            <div className="mt-3 font-mono text-[11.5px] text-dim">
              Seu cap após a troca: <b className={preview.val.capDepois > g.settings.cap ? 'text-blood' : 'text-ink'}>${preview.val.capDepois}M</b> / ${g.settings.cap}M
              {' · '}Elenco ativo: <b className={preview.val.rosterDepois < 44 ? 'text-blood' : 'text-ink'}>{preview.val.rosterDepois}</b> (mín. 44)
              {' · '}Cap atual: ${myCap}M
            </div>

            {preview.val.erros.length > 0 && (
              <ul className="mt-3 space-y-1 border border-blood/40 bg-[rgba(226,87,75,0.07)] px-3 py-2 font-mono text-[11.5px] text-blood">
                {preview.val.erros.map((e, i) => <li key={i}>✗ {e}</li>)}
              </ul>
            )}
          </div>

          <div className="flex flex-col justify-center gap-2.5 p-4">
            <button
              className="btn btn-gold text-[17px]"
              disabled={!preview.val.ok}
              onClick={() => {
                dispatch({ type: 'TRADE_PROPOSE', to: partnerId, give, get });
                setGive([]); setGet([]);
              }}
            >
              Propor troca »
            </button>
            <button className="btn" onClick={() => { setGive([]); setGet([]); }}>Limpar seleção</button>
            <p className="text-center font-mono text-[10.5px] leading-relaxed text-faint">
              A IA aceita quando o saldo é favorável a ela. Picks valem pela rodada; jogadores por OVR, idade, posição e necessidade.
            </p>
          </div>
        </div>
      </Panel>

      {/* histórico de trocas */}
      <Panel title={`Histórico de trocas (${g.tradeLog.length})`} pad={false}>
        {g.tradeLog.length === 0 ? (
          <p className="px-4 py-5 font-mono text-[12px] text-faint">Nenhuma troca registrada ainda nesta carreira.</p>
        ) : (
          <div className="max-h-[280px] overflow-y-auto">
            <table className="tbl">
              <thead>
                <tr><th>Temp./Sem.</th><th>Enviou</th><th>Para</th><th>Recebeu</th><th>Resultado</th></tr>
              </thead>
              <tbody>
                {g.tradeLog.map(t => (
                  <tr key={t.id}>
                    <td className="num">{t.temporada} / S{t.semana}</td>
                    <td className="max-w-[280px] truncate">{t.aGives}</td>
                    <td>{teamById(g, t.b).sigla}</td>
                    <td className="max-w-[280px] truncate">{t.bGives}</td>
                    <td>{t.aceita ? <span className="tag border-grass/50 text-grass">FECHADA</span> : <span className="tag border-blood/40 text-blood">recusada</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ---------- chips ---------- */
function PlayerChip({ p, sel, onClick }: { p: Player; sel: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px] transition-all ${sel
        ? 'border-gold bg-[rgba(240,180,41,0.14)] text-goldhi shadow-[0_0_8px_rgba(240,180,41,0.25)]'
        : 'border-line2 bg-panel2 text-dim hover:border-line hover:text-ink'}`}>
      <PosBadge pos={p.pos} />
      <span className="max-w-[110px] truncate">{p.nome}</span>
      <Ovr v={p.ovr} />
      <span className="text-faint">{playerValue(p)}pts</span>
    </button>
  );
}

function PickChip({ label, value, sel, onClick }: { label: string; value: number; sel: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`border px-2 py-1 font-mono text-[11px] transition-all ${sel
        ? 'border-gold bg-[rgba(240,180,41,0.14)] text-goldhi shadow-[0_0_8px_rgba(240,180,41,0.25)]'
        : 'border-line2 bg-panel2 text-dim hover:border-line hover:text-ink'}`}>
      {label} <span className="text-faint">{value}pts</span>
    </button>
  );
}
