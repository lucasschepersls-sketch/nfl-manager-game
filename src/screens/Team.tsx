import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, playersOf, staffOf, capUsed, capHitOf, fmtM, FOCUS_INFO, upgrade } from '../game/season';
import { ATTR_KEYS, UNIT_OF, POS_LABEL } from '../game/data';
import { Panel, PosBadge, Ovr, Bar, AttrCell, TeamCrest } from '../components/ui';
import type { AttrKey, Focus, PStatus, Unit } from '../game/types';

/* ================= ELENCO ================= */
export function RosterScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const [filter, setFilter] = useState<'ALL' | Unit | 'PS'>('ALL');
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const roster = useMemo(() => {
    let ps = playersOf(g, t.id);
    if (filter === 'PS') ps = ps.filter(p => p.status === 'PS');
    else if (filter !== 'ALL') ps = ps.filter(p => p.status !== 'PS' && UNIT_OF[p.pos] === filter);
    return [...ps].sort((a, b) => b.ovr - a.ovr);
  }, [g, t.id, filter]);

  const ativos = playersOf(g, t.id).filter(p => p.status !== 'PS');
  const cap = capUsed(g, t.id);
  const capPct = (cap / g.settings.cap) * 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['ALL', 'Todos'], ['OF', 'Ataque'], ['DF', 'Defesa'], ['ST', 'Especiais'], ['PS', 'Practice Squad']] as const).map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${filter === k ? 'btn-gold' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <span className="ml-auto font-mono text-[12px] text-dim">
          Ativos <b className={ativos.length > 53 ? 'text-blood' : 'text-ink'}>{ativos.length}</b>/53
        </span>
      </div>

      <Panel title={`Elenco — ${t.cidade} ${t.nome}`} pad={false}
        right={
          <div className="flex items-center gap-3 font-mono text-[12px]">
            <span className={cap > g.settings.cap ? 'text-blood' : 'text-dim'}>Folha <b>{fmtM(cap)}</b> / {fmtM(g.settings.cap)}</span>
            <span className="w-28"><Bar pct={capPct} color={capPct > 100 ? 'var(--color-blood)' : capPct > 88 ? 'var(--color-gold)' : 'var(--color-grass)'} /></span>
          </div>
        }>
        {cap > g.settings.cap && (
          <div className="border-b border-blood/40 bg-[rgba(226,87,75,0.1)] px-3.5 py-2 font-mono text-[12px] text-blood">
            ⚠ Acima do teto em {fmtM(cap - g.settings.cap)} — corte jogadores para ficar em conformidade.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>POS</th><th>Jogador</th><th className="num">Idade</th><th className="num">OVR</th>
                {ATTR_KEYS.map(a => <th key={a.k} className="num">{a.s}</th>)}
                <th className="num">Salário</th><th className="num">Contr.</th><th>Sit.</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {roster.map(p => (
                <tr key={p.id} className={p.lesao > 0 ? 'opacity-60' : ''}>
                  <td><PosBadge pos={p.pos} /></td>
                  <td className="max-w-[190px] truncate">
                    {p.nome}
                    {p.rookie && <span className="tag ml-2 border-gold/50 text-gold">R</span>}
                    {p.tag && <span className="tag ml-2 border-ice/60 text-ice">TAG</span>}
                  </td>
                  <td className="num">{p.idade}</td>
                  <td className="num"><Ovr v={p.ovr} pot={p.rookie ? p.pot : undefined} /></td>
                  {ATTR_KEYS.map(a => <td key={a.k} className="num"><AttrCell v={p.attrs[a.k]} /></td>)}
                  <td className="num text-goldhi">{fmtM(capHitOf(p))}</td>
                  <td className="num">{p.contrato}a{p.contrato === 1 ? ' ⚠' : ''}</td>
                  <td>
                    {p.lesao > 0 ? <span className="tag border-blood/60 text-blood">DM {p.lesao}sem</span>
                      : p.status === 'TIT' ? <span className="tag border-grass/60 text-grass">TIT</span>
                        : p.status === 'RES' ? <span className="tag border-line text-dim">RES</span>
                          : <span className="tag border-ice/50 text-ice">PS</span>}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {(['TIT', 'RES', 'PS'] as PStatus[]).map(s2 => (
                        <button key={s2} className={`btn btn-sm ${p.status === s2 ? (s2 === 'TIT' ? 'btn-gold' : '') : 'btn-ghost'}`}
                          disabled={p.status === s2}
                          onClick={() => dispatch({ type: 'SET_STATUS', playerId: p.id, status: s2 })}>{s2}</button>
                      ))}
                      {p.contrato === 1 && !p.tag && p.status !== 'PS' && (
                        <button className="btn btn-sm btn-ghost text-ice" onClick={() => dispatch({ type: 'TAG', playerId: p.id })}>TAG</button>
                      )}
                    </div>
                  </td>
                  <td>
                    {confirmId === p.id ? (
                      <div className="flex gap-1">
                        <button className="btn btn-sm btn-danger" onClick={() => { dispatch({ type: 'RELEASE', playerId: p.id }); setConfirmId(null); }}>Cortar</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>Não</button>
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-ghost hover:text-blood" onClick={() => setConfirmId(p.id)}>Dispensar</button>
                    )}
                  </td>
                </tr>
              ))}
              {!roster.length && <tr><td colSpan={18} className="py-6 text-center text-faint">Nenhum jogador neste filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* ================= TÁTICAS & TREINO ================= */
export function TacticsScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const [cor, setCor] = useState(t.tactics.corrida);
  const [agg, setAgg] = useState(t.tactics.agressividade);
  const staff = staffOf(g, t.id);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        <Panel title="Plano de jogo">
          <label className="block">
            <div className="mb-1 flex justify-between font-disp text-[15px] font-semibold uppercase tracking-wider">
              <span className={cor >= 50 ? 'text-goldhi' : 'text-dim'}>Corrida {cor}%</span>
              <span className={cor < 50 ? 'text-goldhi' : 'text-dim'}>Passe {100 - cor}%</span>
            </div>
            <input type="range" min={5} max={95} value={cor} className="w-full" onChange={e => setCor(+e.target.value)} />
          </label>
          <label className="mt-5 block">
            <div className="mb-1 flex justify-between font-disp text-[15px] font-semibold uppercase tracking-wider">
              <span className="text-dim">Agressividade</span>
              <span className={agg >= 60 ? 'text-blood' : 'text-ink'}>{agg >= 70 ? 'ALL IN' : agg >= 45 ? 'calculada' : 'conservadora'}</span>
            </div>
            <input type="range" min={0} max={100} value={agg} className="w-full" onChange={e => setAgg(+e.target.value)} />
          </label>
          <button className="btn btn-gold mt-4" onClick={() => dispatch({ type: 'TACTICS', corrida: cor, agressividade: agg })}>
            Aplicar táticas
          </button>
        </Panel>

        <Panel title="Centro de treinamento">
          <div className="flex items-center justify-between font-mono text-[13px]">
            <span className="text-dim">Nível da estrutura</span>
            <span className="font-bold text-goldhi">{'★'.repeat(t.centroTreino)}{'☆'.repeat(5 - t.centroTreino)}</span>
          </div>
          <button className="btn mt-3" disabled={t.centroTreino >= 5}
            onClick={() => dispatch({ type: 'UPGRADE', kind: 'centroTreino' })}>
            {t.centroTreino >= 5 ? 'Estrutura no máximo' : 'Modernizar'}
          </button>
          <div className="mt-5">
            <div className="mb-2 font-disp text-[15px] font-semibold uppercase tracking-wider text-dim">Foco de treino (offseason)</div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FOCUS_INFO) as Focus[]).map(f => (
                <button key={f} className={`btn flex-col items-start ${g.focus === f ? 'btn-gold' : 'btn-ghost'}`}
                  onClick={() => dispatch({ type: 'FOCUS', focus: f })}>
                  <span className="font-disp text-[14px] uppercase">{FOCUS_INFO[f].label}</span>
                  <span className="font-mono text-[10.5px] opacity-80">{FOCUS_INFO[f].desc}</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Comissão técnica" pad={false}>
        <table className="tbl">
          <thead><tr><th>Função</th><th>Profissional</th><th className="num">Nível</th><th className="num">Salário</th></tr></thead>
          <tbody>
            {staff.map(s2 => (
              <tr key={s2.id}>
                <td className="text-dim">{s2.funcao}</td>
                <td>{s2.nome}</td>
                <td className="num"><span className="text-goldhi">{'★'.repeat(s2.nivel)}</span><span className="text-faint">{'★'.repeat(5 - s2.nivel)}</span></td>
                <td className="num text-goldhi">{fmtM(s2.salario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

/* ================= DEPARTAMENTO MÉDICO ================= */
export function MedicalScreen() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const dm = playersOf(g, t.id).filter(p => p.lesao > 0).sort((a, b) => b.lesao - a.lesao);

  return (
    <Panel title="Departamento médico" pad={false}
      right={<span className="font-mono text-[12px] text-dim">{dm.length ? `${dm.length} paciente(s)` : 'DM vazio ✓'}</span>}>
      {dm.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="font-disp text-[26px] font-bold uppercase text-grass">Nenhuma lesão</div>
          <p className="mt-1 font-mono text-[12.5px] text-dim">Elenco inteiro à disposição do treinador.</p>
        </div>
      ) : (
        <table className="tbl">
          <thead><tr><th>POS</th><th>Jogador</th><th>Diagnóstico</th><th className="num">Fora</th><th className="num">Recuperação</th><th className="num">OVR</th></tr></thead>
          <tbody>
            {dm.map(p => {
              const total = p.lesaoTotal ?? p.lesao;
              const pct = Math.max(0, Math.round(((total - p.lesao) / total) * 100));
              return (
                <tr key={p.id}>
                  <td><PosBadge pos={p.pos} /></td>
                  <td>{p.nome}{p.status === 'TIT' && <span className="tag ml-2 border-grass/60 text-grass">TIT</span>}</td>
                  <td className="text-blood">{p.lesaoTipo}</td>
                  <td className="num font-bold text-goldhi">{p.lesao} sem.</td>
                  <td className="num"><div className="flex items-center gap-2"><Bar pct={pct} color="var(--color-grass)" /><span className="w-9 text-right">{pct}%</span></div></td>
                  <td className="num"><Ovr v={p.ovr} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

/* ================= ELENCOS DA LIGA ================= */
export function LeagueRostersScreen() {
  const { st } = useGame();
  const g = st.game!;
  const [selTeam, setSelTeam] = useState(g.teams[0].id);
  const t = teamById(g, selTeam);
  const roster = playersOf(g, selTeam).filter(p => p.status !== 'PS').sort((a, b) => b.ovr - a.ovr);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {g.teams.map(tm => (
          <button key={tm.id} className={`btn btn-sm ${selTeam === tm.id ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setSelTeam(tm.id)}>
            {tm.sigla}
          </button>
        ))}
      </div>
      <Panel title={`${t.cidade} ${t.nome} — ${roster.length} ativos`} pad={false}
        right={<TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={30} />}>
        <table className="tbl">
          <thead><tr><th>POS</th><th>Jogador</th><th className="num">Idade</th><th className="num">OVR</th><th className="num">Salário</th></tr></thead>
          <tbody>
            {roster.map(p => (
              <tr key={p.id}>
                <td><PosBadge pos={p.pos} /></td>
                <td>{p.nome}{p.lesao > 0 && <span className="tag ml-2 border-blood/60 text-blood">DM</span>}</td>
                <td className="num">{p.idade}</td>
                <td className="num"><Ovr v={p.ovr} /></td>
                <td className="num text-goldhi">{fmtM(capHitOf(p))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
