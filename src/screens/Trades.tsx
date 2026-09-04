import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, playersOf } from '../game/season';
import { evaluateProposal, validateProposal, TRADE_DEADLINE_WEEK, ROSTER_MIN_ACTIVE } from '../game/trades';
import type { GameState, Player, TradeAsset } from '../game/types';
import { Panel, TeamCrest, PosBadge, Ovr } from '../components/ui';
import { Rng } from '../game/rng';

type PickInfo = { round: number; slot: number; from: string | null };

function collectPicks(g: GameState, teamId: string): PickInfo[] {
  const picks: PickInfo[] = [];
  for (let r = 0; r < g.pickOwners.length; r++) {
    const row = g.pickOwners[r];
    if (!row) continue;
    for (let s = 0; s < row.length; s++) {
      const po = row[s];
      if (po && po.owner === teamId && !po.consumed) {
        picks.push({ round: r + 1, slot: s, from: po.from });
      }
    }
  }
  return picks.sort((a, b) => a.round - b.round || a.slot - b.slot);
}

const pickKey = (p: PickInfo) => `${p.round}-${p.slot}`;
const keyToPick = (key: string): TradeAsset => {
  const [round, slot] = key.split('-').map(Number);
  return { kind: 'pick', round, slot };
};

/* ---------- coluna de ativos (jogadores + picks) ---------- */
function AssetColumn({
  title, accent, players, picks, selPlayers, selPickKeys, onTogglePlayer, onTogglePick, emptyLabel, hidePicks,
}: {
  title: string;
  accent: string;
  players: Player[];
  picks: PickInfo[];
  selPlayers: string[];
  selPickKeys: string[];
  onTogglePlayer: (id: string) => void;
  onTogglePick: (key: string) => void;
  emptyLabel: string;
  hidePicks?: boolean;
}) {
  return (
    <div className="border border-line bg-panel">
      <div className="border-b border-line px-4 py-2.5" style={{ boxShadow: `inset 3px 0 0 ${accent}` }}>
        <span className="font-disp text-[16px] font-bold uppercase tracking-wider" style={{ color: accent }}>{title}</span>
        <span className="ml-2 font-mono text-[11px] text-faint">
          {selPlayers.length + selPickKeys.length} selecionado{selPlayers.length + selPickKeys.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-2">
        <div className="mb-1 px-1 font-mono text-[10px] uppercase tracking-[0.15em] text-faint">Jogadores</div>
        {players.map(p => {
          const sel = selPlayers.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => onTogglePlayer(p.id)}
              className="group mb-1 flex w-full items-center gap-2 border px-2 py-1.5 text-left transition-all duration-150"
              style={{
                borderColor: sel ? accent : 'var(--color-line2)',
                background: sel ? 'rgba(255,255,255,0.05)' : 'transparent',
              }}
            >
              <PosBadge pos={p.pos} />
              <span className="flex-1 truncate font-mono text-[12.5px] text-ink group-hover:text-goldhi">{p.nome}</span>
              <span className="font-mono text-[10.5px] text-faint">{p.idade}a</span>
              <Ovr v={p.ovr} />
              <span
                className="font-disp text-[11px] font-bold uppercase transition-opacity"
                style={{ color: accent, opacity: sel ? 1 : 0 }}
              >
                ✓
              </span>
            </button>
          );
        })}

        <div className="mb-1 mt-3 px-1 font-mono text-[10px] uppercase tracking-[0.15em] text-faint">Picks de draft</div>
        {hidePicks ? (
          <div className="px-2 py-1 font-mono text-[11px] text-faint">🔒 Bloqueadas após o Trade Deadline.</div>
        ) : picks.length === 0 ? (
          <div className="px-2 py-1 font-mono text-[11px] text-faint">Nenhuma escolha disponível.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5 px-1">
            {picks.map(p => {
              const key = pickKey(p);
              const sel = selPickKeys.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => onTogglePick(key)}
                  className="border px-2 py-1 font-mono text-[11px] transition-all duration-150"
                  style={{
                    borderColor: sel ? accent : 'var(--color-line2)',
                    color: sel ? accent : 'var(--color-dim)',
                    background: sel ? 'rgba(255,255,255,0.05)' : 'transparent',
                  }}
                  title={p.from ? `Recebida de ${p.from}` : 'Escolha original'}
                >
                  R{p.round} · #{p.slot + 1}{p.from ? ` (${p.from})` : ''}
                </button>
              );
            })}
          </div>
        )}

        {players.length === 0 && <div className="px-2 py-3 font-mono text-[11.5px] text-faint">{emptyLabel}</div>}
      </div>
    </div>
  );
}

/* ---------- medidor de veredicto da IA ---------- */
function VerdictMeter({ chance, net, valueGive, valueGet, parecer }: {
  chance: number; net: number; valueGive: number; valueGet: number; parecer: string;
}) {
  const aceita = chance >= 50;
  const tone = chance >= 75 ? 'var(--color-grass)' : chance >= 45 ? 'var(--color-gold)' : 'var(--color-blood)';
  return (
    <div className="flex h-full flex-col items-center justify-center border border-line bg-panel px-4 py-5 text-center">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">Balança da troca</div>

      <div
        className="mt-3 font-disp text-[44px] font-extrabold leading-none tabular-nums"
        style={{ color: tone }}
      >
        {chance}%
      </div>
      <div
        className="mt-1 font-disp text-[17px] font-bold uppercase tracking-wider"
        style={{ color: aceita ? 'var(--color-grass)' : 'var(--color-blood)' }}
      >
        {aceita ? 'Provável aceite' : 'Provável recusa'}
      </div>

      <div className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full bg-pitcho">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500"
          style={{ width: `${chance}%`, background: tone }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-gold/70" />
      </div>
      <div className="mt-1.5 flex w-full justify-between font-mono text-[9.5px] uppercase text-faint">
        <span>recusa</span>
        <span>aceite</span>
      </div>

      <div className="mt-4 w-full space-y-1 border-t border-line2 pt-3 text-left">
        <div className="flex justify-between font-mono text-[11px] text-dim">
          <span>Parceiro recebe</span>
          <span className="font-bold text-grass">+{valueGive} pts</span>
        </div>
        <div className="flex justify-between font-mono text-[11px] text-dim">
          <span>Parceiro entrega</span>
          <span className="font-bold text-blood">−{valueGet} pts</span>
        </div>
        <div className="flex justify-between border-t border-line2 pt-1 font-mono text-[11.5px] text-ink">
          <span>Saldo p/ o parceiro</span>
          <span className="font-bold" style={{ color: net >= 0 ? 'var(--color-grass)' : 'var(--color-blood)' }}>
            {net >= 0 ? `+${net}` : net} pts
          </span>
        </div>
      </div>

      <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-faint">{parecer}</p>
    </div>
  );
}

export function TradesScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const myTeam = teamById(g, g.userTeam);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [givePlayers, setGivePlayers] = useState<string[]>([]);
  const [getPlayers, setGetPlayers] = useState<string[]>([]);
  const [givePickKeys, setGivePickKeys] = useState<string[]>([]);
  const [getPickKeys, setGetPickKeys] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const partner = partnerId ? teamById(g, partnerId) : null;
  const otherTeams = g.teams.filter(t => t.id !== g.userTeam);

  const myRoster = useMemo(
    () => playersOf(g, g.userTeam).filter(p => p.status !== 'PS').sort((a, b) => b.ovr - a.ovr),
    [g],
  );
  const partnerRoster = useMemo(
    () => (partner ? playersOf(g, partner.id).filter(p => p.status !== 'PS').sort((a, b) => b.ovr - a.ovr) : []),
    [g, partner],
  );
  const myPicks = useMemo(() => collectPicks(g, g.userTeam), [g]);
  const partnerPicks = useMemo(() => (partner ? collectPicks(g, partner.id) : []), [g, partner]);

  const proposal = useMemo(() => {
    if (!partnerId) return null;
    const give: TradeAsset[] = [
      ...givePlayers.map(playerId => ({ kind: 'player' as const, playerId })),
      ...givePickKeys.map(keyToPick),
    ];
    const get: TradeAsset[] = [
      ...getPlayers.map(playerId => ({ kind: 'player' as const, playerId })),
      ...getPickKeys.map(keyToPick),
    ];
    return { from: g.userTeam, to: partnerId, give, get };
  }, [partnerId, givePlayers, getPlayers, givePickKeys, getPickKeys, g.userTeam]);

  const hasTrade = !!proposal && proposal.give.length > 0 && proposal.get.length > 0;

  const evaluation = useMemo(() => {
    if (!hasTrade || !proposal) return null;
    return evaluateProposal(g, proposal, new Rng(1337));
  }, [g, proposal, hasTrade]);

  const validation = useMemo(() => {
    if (!proposal) return null;
    return validateProposal(g, proposal);
  }, [g, proposal]);

  const afterDeadline = g.settings.fase === 'REG' && g.settings.semana > TRADE_DEADLINE_WEEK;

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const clearSelection = () => {
    setGivePlayers([]); setGetPlayers([]);
    setGivePickKeys([]); setGetPickKeys([]);
  };
  const cancel = () => { setPartnerId(null); clearSelection(); };

  const submit = () => {
    if (!proposal || !hasTrade) return;
    dispatch({ type: 'TRADE_PROPOSE', proposal });
    clearSelection();
  };

  const headerAccent = partner ? partner.cor : myTeam.cor;

  return (
    <div className="space-y-5">
      {/* cabeçalho */}
      <header className="relative overflow-hidden border border-line bg-panel">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{ background: `repeating-linear-gradient(90deg, ${headerAccent} 0 2px, transparent 2px 110px)` }}
        />
        <div className="relative flex flex-wrap items-center gap-5 px-5 py-4">
          <TeamCrest cor={myTeam.cor} cor2={myTeam.cor2} sigla={myTeam.sigla} conf={myTeam.conf} size={54} />
          {partner && (
            <>
              <span className="font-disp text-[26px] font-extrabold text-faint">×</span>
              <TeamCrest cor={partner.cor} cor2={partner.cor2} sigla={partner.sigla} conf={partner.conf} size={54} />
            </>
          )}
          <div>
            <h1 className="font-disp text-[28px] font-extrabold uppercase leading-none">
              Central de <span className="text-goldhi">Trades</span>
            </h1>
            <p className="mt-1 font-mono text-[11.5px] uppercase tracking-[0.2em] text-faint">
              {partner ? `Negociando com ${partner.cidade} ${partner.nome}` : 'Escolha um parceiro para negociar'}
            </p>
          </div>
          <button className="btn btn-ghost ml-auto" onClick={() => setShowHistory(v => !v)}>
            Histórico ({g.tradeLog.length})
          </button>
        </div>
      </header>

      {/* aviso de trade deadline */}
      {afterDeadline && (
        <div className="flex items-center gap-3 border border-gold/50 bg-[rgba(240,180,41,0.08)] px-4 py-2.5">
          <span className="font-disp text-[16px]">⏰</span>
          <span className="font-mono text-[11.5px] text-dim">
            <b className="text-goldhi">Trade Deadline (semana {TRADE_DEADLINE_WEEK}) ultrapassado.</b> Agora apenas trocas jogador↔jogador — picks não podem mais ser negociadas nesta temporada.
          </span>
        </div>
      )}

      {/* seletor de parceiro */}
      {!partner && (
        <Panel title="Escolha o parceiro de negociação" pad={false}>
          <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4 xl:grid-cols-8">
            {otherTeams.map(t => (
              <button
                key={t.id}
                onClick={() => { setPartnerId(t.id); clearSelection(); }}
                className="group flex flex-col items-center gap-2 border border-line2 px-2 py-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-gold"
              >
                <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={38} />
                <span className="font-disp text-[14px] font-bold uppercase text-dim group-hover:text-goldhi">{t.sigla}</span>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* mesa de negociação */}
      {partner && proposal && (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_240px_1fr]">
            <AssetColumn
              title={`Você oferece — ${myTeam.sigla}`}
              accent="var(--color-blood)"
              players={myRoster}
              picks={myPicks}
              selPlayers={givePlayers}
              selPickKeys={givePickKeys}
              onTogglePlayer={id => toggle(givePlayers, setGivePlayers, id)}
              onTogglePick={key => toggle(givePickKeys, setGivePickKeys, key)}
              emptyLabel="Sem jogadores."
              hidePicks={afterDeadline}
            />

            {evaluation
              ? <VerdictMeter chance={evaluation.chance} net={evaluation.net} valueGive={evaluation.valueGive} valueGet={evaluation.valueGet} parecer={evaluation.parecer} />
              : (
                <div className="flex h-full flex-col items-center justify-center border border-line bg-panel px-4 py-5 text-center">
                  <div className="font-disp text-[20px] font-extrabold uppercase text-faint">Balança</div>
                  <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">
                    Selecione ao menos um item de cada lado para avaliar a troca.
                  </p>
                </div>
              )}

            <AssetColumn
              title={`Você recebe — ${partner.sigla}`}
              accent="var(--color-grass)"
              players={partnerRoster}
              picks={partnerPicks}
              selPlayers={getPlayers}
              selPickKeys={getPickKeys}
              onTogglePlayer={id => toggle(getPlayers, setGetPlayers, id)}
              onTogglePick={key => toggle(getPickKeys, setGetPickKeys, key)}
              emptyLabel="Sem jogadores."
              hidePicks={afterDeadline}
            />
          </div>

          {/* validações / impedimentos */}
          {validation && validation.erros.length > 0 && (
            <div className="border border-blood/50 bg-[rgba(226,87,75,0.08)] px-4 py-3">
              <div className="font-disp text-[14px] font-bold uppercase tracking-wider text-blood">Troca inválida</div>
              <ul className="mt-1.5 space-y-1">
                {validation.erros.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 font-mono text-[11.5px] text-ink">
                    <span className="text-blood">✗</span>{e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {validation && validation.erros.length === 0 && hasTrade && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 font-mono text-[11px] text-dim">
              <span>Cap após a troca: <b className={validation.capDepois > g.settings.cap ? 'text-blood' : 'text-grass'}>${validation.capDepois}M</b> / ${g.settings.cap}M</span>
              <span>Seu elenco: <b className={validation.rosterDepois < ROSTER_MIN_ACTIVE ? 'text-blood' : 'text-ink'}>{validation.rosterDepois}</b> ativos (mín. {ROSTER_MIN_ACTIVE})</span>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <button className="btn btn-ghost" onClick={cancel}>Trocar de parceiro</button>
            <button className="btn btn-ghost" onClick={clearSelection} disabled={!hasTrade}>Limpar seleção</button>
            <button className="btn btn-gold btn-pulse" onClick={submit} disabled={!hasTrade}>
              Propor troca {hasTrade && evaluation ? (evaluation.chance >= 50 ? '✓' : '⚠') : ''}
            </button>
          </div>
        </>
      )}

      {/* histórico */}
      {showHistory && (
        <Panel title="Histórico de trocas" pad={false}>
          {g.tradeLog.length === 0 ? (
            <div className="px-4 py-5 font-mono text-[12px] text-faint">Nenhuma troca realizada até o momento.</div>
          ) : (
            <div className="max-h-[340px] overflow-y-auto">
              {[...g.tradeLog].reverse().map(tl => {
                const a = teamById(g, tl.a);
                const b = teamById(g, tl.b);
                return (
                  <div key={tl.id} className="flex flex-wrap items-center gap-3 border-b border-line2 px-4 py-2.5">
                    <span className="font-mono text-[10px] uppercase text-faint">T{tl.temporada} · S{tl.semana}</span>
                    <TeamCrest cor={a.cor} cor2={a.cor2} sigla={a.sigla} conf={a.conf} size={22} />
                    <span className="font-mono text-[12px] text-ink">{tl.aGives}</span>
                    <span className="font-disp text-[13px] font-bold text-goldhi">⇄</span>
                    <span className="font-mono text-[12px] text-ink">{tl.bGives}</span>
                    <TeamCrest cor={b.cor} cor2={b.cor2} sigla={b.sigla} conf={b.conf} size={22} />
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

export default TradesScreen;
