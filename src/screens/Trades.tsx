import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { playersOf, teamById, capUsed, fmtM } from '../game/season';
import { validateProposal, evaluateProposal, playerValue, TRADE_DEADLINE_WEEK } from '../game/trades';
import { newSeed, Rng } from '../game/rng';
import { Panel, PosBadge, Ovr, TeamDot, Bar } from '../components/ui';
import type { TradeAsset } from '../game/types';

export function TradesScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const [toId, setToId] = useState(g.teams.find(t => t.id !== g.userTeam)!.id);
  const [give, setGive] = useState<TradeAsset[]>([]);
  const [get, setGet] = useState<TradeAsset[]>([]);

  const me = teamById(g, g.userTeam);
  const them = teamById(g, toId);
  const myPlayers = useMemo(() => playersOf(g, g.userTeam).filter(p => p.status !== 'PS').sort((a, b) => b.ovr - a.ovr), [g]);
  const theirPlayers = useMemo(() => playersOf(g, toId).filter(p => p.status !== 'PS').sort((a, b) => b.ovr - a.ovr), [g]);

  const afterDeadline = g.settings.fase === 'REG' && g.settings.semana > TRADE_DEADLINE_WEEK;
  const inPlayoffs = g.settings.fase === 'PO';

  // picks que cada lado detém (não consumidas)
  const myPicks = useMemo(() => {
    const out: { round: number; slot: number }[] = [];
    g.pickOwners.forEach((roundArr, ri) => roundArr.forEach((cell, si) => {
      if (cell.owner === g.userTeam && !cell.consumed) out.push({ round: ri + 1, slot: si });
    }));
    return out;
  }, [g]);
  const theirPicks = useMemo(() => {
    const out: { round: number; slot: number }[] = [];
    g.pickOwners.forEach((roundArr, ri) => roundArr.forEach((cell, si) => {
      if (cell.owner === toId && !cell.consumed) out.push({ round: ri + 1, slot: si });
    }));
    return out;
  }, [g, toId]);

  const proposal = { from: g.userTeam, to: toId, give, get };
  const val = validateProposal(g, proposal);
  const ev = useMemo(() => (give.length && get.length ? evaluateProposal(g, proposal, new Rng(newSeed())) : null), [g, toId, give, get]);

  const toggle = (list: TradeAsset[], set: (a: TradeAsset[]) => void, a: TradeAsset) => {
    const key = (x: TradeAsset) => x.kind === 'player' ? `p:${x.playerId}` : `k:${x.round}:${x.slot}`;
    const has = list.some(x => key(x) === key(a));
    set(has ? list.filter(x => key(x) !== key(a)) : [...list, a]);
  };

  const playerCard = (p: typeof myPlayers[number], side: 'give' | 'get') => {
    const list = side === 'give' ? give : get;
    const set = side === 'give' ? setGive : setGet;
    const on = list.some(x => x.kind === 'player' && x.playerId === p.id);
    return (
      <button key={p.id} onClick={() => toggle(list, set, { kind: 'player', playerId: p.id })}
        className={`flex w-full items-center gap-2 border px-2.5 py-1.5 text-left transition-all ${on ? 'border-gold bg-[rgba(240,180,41,0.12)]' : 'border-line2 hover:border-gold/40'}`}>
        <PosBadge pos={p.pos} />
        <span className="truncate font-mono text-[12px]">{p.nome}</span>
        <span className="ml-auto"><Ovr v={p.ovr} /></span>
        <span className="font-mono text-[10.5px] text-faint">{playerValue(p)}pts</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {(afterDeadline || inPlayoffs) && (
        <div className="border border-blood/50 px-4 py-3 font-mono text-[12.5px] text-blood">
          {inPlayoffs ? '⛔ Trades fechados durante os playoffs.' : `⛔ Trade Deadline (semana ${TRADE_DEADLINE_WEEK}) ultrapassado — apenas jogador↔jogador, sem picks.`}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[12px] text-dim">Parceiro de troca:</span>
        <select className="sel" value={toId} onChange={e => { setToId(e.target.value); setGet([]); }}>
          {g.teams.filter(t => t.id !== g.userTeam).map(t => <option key={t.id} value={t.id}>{t.cidade} {t.nome}</option>)}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Você entrega (${give.length})`} pad={false}>
          <div className="max-h-[300px] space-y-1.5 overflow-y-auto p-3">
            {myPlayers.slice(0, 30).map(p => playerCard(p, 'give'))}
          </div>
          {!afterDeadline && !inPlayoffs && (
            <div className="border-t border-line p-3">
              <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-faint">Suas picks</div>
              <div className="flex flex-wrap gap-1.5">
                {myPicks.slice(0, 14).map(pk => {
                  const a: TradeAsset = { kind: 'pick', round: pk.round, slot: pk.slot };
                  const on = give.some(x => x.kind === 'pick' && x.round === pk.round && x.slot === pk.slot);
                  return (
                    <button key={`${pk.round}-${pk.slot}`} className={`btn btn-sm ${on ? 'btn-gold' : 'btn-ghost'}`}
                      onClick={() => toggle(give, setGive, a)}>R{pk.round}.{pk.slot + 1}</button>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>

        <Panel title={`Você recebe (${get.length})`} pad={false}>
          <div className="max-h-[300px] space-y-1.5 overflow-y-auto p-3">
            {theirPlayers.slice(0, 30).map(p => playerCard(p, 'get'))}
          </div>
          {!afterDeadline && !inPlayoffs && (
            <div className="border-t border-line p-3">
              <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-faint">Picks de {them.sigla}</div>
              <div className="flex flex-wrap gap-1.5">
                {theirPicks.slice(0, 14).map(pk => {
                  const a: TradeAsset = { kind: 'pick', round: pk.round, slot: pk.slot };
                  const on = get.some(x => x.kind === 'pick' && x.round === pk.round && x.slot === pk.slot);
                  return (
                    <button key={`${pk.round}-${pk.slot}`} className={`btn btn-sm ${on ? 'btn-gold' : 'btn-ghost'}`}
                      onClick={() => toggle(get, setGet, a)}>R{pk.round}.{pk.slot + 1}</button>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Avaliação da proposta">
        {!val.ok ? (
          <ul className="space-y-1.5">
            {val.erros.map((e, i) => <li key={i} className="border-l-2 border-blood pl-3 font-mono text-[12px] text-blood">{e}</li>)}
            {!val.erros.length && <li className="font-mono text-[12px] text-faint">Selecione ao menos 1 item de cada lado.</li>}
          </ul>
        ) : ev ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between font-mono text-[12px] text-dim">
                <span>Chance de {them.sigla} aceitar</span>
                <b className="text-ink">{ev.chance}% — {ev.parecer}</b>
              </div>
              <Bar pct={ev.chance} color={ev.chance >= 60 ? 'var(--color-grass)' : ev.chance >= 35 ? 'var(--color-gold)' : 'var(--color-blood)'} />
            </div>
            <div className="grid grid-cols-3 gap-3 font-mono text-[12px]">
              <div><span className="text-faint">Valor entregue:</span> <b className="text-ink">{ev.valueGive}pts</b></div>
              <div><span className="text-faint">Valor recebido:</span> <b className="text-ink">{ev.valueGet}pts</b></div>
              <div><span className="text-faint">Saldo p/ parceiro:</span> <b style={{ color: ev.net >= 0 ? 'var(--color-grass)' : 'var(--color-blood)' }}>{ev.net >= 0 ? '+' : ''}{ev.net}pts</b></div>
            </div>
            <div className="flex justify-between border-t border-line2 pt-2 font-mono text-[12px] text-dim">
              <span>Seu cap após a troca</span><b className="text-ink">{fmtM(val.capDepois)} / {fmtM(g.settings.cap)}</b>
            </div>
            <button className="btn btn-gold w-full text-[16px]" onClick={() => { dispatch({ type: 'TRADE_PROPOSE', to: toId, give, get }); setGive([]); setGet([]); }}>
              Propor troca a {them.sigla} »
            </button>
          </div>
        ) : (
          <p className="font-mono text-[12.5px] text-faint">Monte a troca selecionando itens dos dois lados para ver a avaliação.</p>
        )}
      </Panel>

      {g.tradeLog.length > 0 && (
        <Panel title="Histórico de negociações" pad={false}>
          <div className="max-h-[260px] overflow-y-auto">
            {g.tradeLog.slice(0, 20).map(tr => {
              const a = teamById(g, tr.a); const b = teamById(g, tr.b);
              return (
                <div key={tr.id} className="flex items-center gap-3 border-b border-line2 px-4 py-2 font-mono text-[12px]">
                  <span className={`tag shrink-0 ${tr.aceita ? 'border-grass/60 text-grass' : 'border-blood/60 text-blood'}`}>{tr.aceita ? 'FECHADA' : 'RECUSADA'}</span>
                  <span className="inline-flex items-center gap-1.5"><TeamDot cor={a.cor} /><b>{a.sigla}</b></span>
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
