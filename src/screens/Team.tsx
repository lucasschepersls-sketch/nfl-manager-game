import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { playersOf, staffOf, capUsed, capHitOf, teamById, fmtM } from '../game/season';
import { ATTR_KEYS, POS_LABEL, UNIT_OF, POS_ORDER } from '../game/data';
import { Panel, PosBadge, Ovr, Bar, AttrCell, Stars } from '../components/ui';
import type { AttrKey, Focus, Player, Unit } from '../game/types';

/* ============================ ELENCO ============================ */
type SortKey = 'pos' | 'nome' | 'idade' | 'ovr' | 'salario' | 'contrato' | AttrKey;
const POS_IDX = new Map(POS_ORDER.map((p, i) => [p, i]));

export function RosterScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const [filter, setFilter] = useState<'ALL' | Unit | 'PS'>('ALL');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'ovr', dir: -1 });
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const all = useMemo(() => playersOf(g, t.id), [g, t.id]);
  const ativos = all.filter(p => p.status !== 'PS');
  const psCount = all.filter(p => p.status === 'PS');
  const folha = capUsed(g, t.id);
  const capPct = (folha / g.settings.cap) * 100;

  const roster = useMemo(() => {
    let ps = all;
    if (filter === 'PS') ps = ps.filter(p => p.status === 'PS');
    else if (filter !== 'ALL') ps = ps.filter(p => p.status !== 'PS' && UNIT_OF[p.pos] === filter);
    const val = (p: Player): number | string => {
      switch (sort.k) {
        case 'pos': return POS_IDX.get(p.pos) ?? 99;
        case 'nome': return p.nome;
        case 'idade': return p.idade;
        case 'ovr': return p.ovr;
        case 'salario': return capHitOf(p);
        case 'contrato': return p.contrato;
        default: return p.attrs[sort.k as AttrKey];
      }
    };
    return [...ps].sort((a, b) => {
      const va = val(a); const vb = val(b);
      const c = typeof va === 'string' ? String(va).localeCompare(String(vb)) : (va as number) - (vb as number);
      return c * sort.dir || b.ovr - a.ovr;
    });
  }, [all, filter, sort]);

  const clickSort = (k: SortKey) =>
    setSort(s => (s.k === k ? { k, dir: s.dir === 1 ? -1 : 1 } : { k, dir: k === 'nome' || k === 'pos' ? 1 : -1 }));
  const th = (k: SortKey, label: string, num = false) => (
    <th className={`${num ? 'num' : ''} cursor-pointer select-none hover:text-goldhi`} onClick={() => clickSort(k)} title="Clique para ordenar">
      {label}{sort.k === k ? (sort.dir === -1 ? ' ▾' : ' ▴') : ''}
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['ALL', 'Todos'], ['OF', 'Ataque'], ['DF', 'Defesa'], ['ST', 'Especiais'], ['PS', 'Practice Squad']] as const).map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${filter === k ? 'btn-gold' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <span className="ml-auto font-mono text-[12px] text-dim">
          Ativos <b className={ativos.length !== 53 ? 'text-goldhi' : 'text-ink'}>{ativos.length}</b>/53 ·
          PS <b className="text-ink">{psCount.length}</b>/10
        </span>
      </div>

      <Panel
        title={`Elenco — ${t.cidade} ${t.nome}`}
        pad={false}
        right={
          <div className="flex items-center gap-3 font-mono text-[12px]">
            <span className={folha > g.settings.cap ? 'text-blood' : 'text-dim'}>Folha: <b>{fmtM(folha)}</b> / {fmtM(g.settings.cap)}</span>
            <span className="w-28"><Bar pct={capPct} color={capPct > 100 ? 'var(--color-blood)' : capPct > 88 ? 'var(--color-gold)' : 'var(--color-grass)'} /></span>
          </div>
        }
      >
        {folha > g.settings.cap && (
          <div className="border-b border-blood/40 bg-[rgba(226,87,75,0.1)] px-3.5 py-2 font-mono text-[12px] text-blood">
            ⚠ ACIMA DO TETO SALARIAL em {fmtM(folha - g.settings.cap)} — multa da liga e proibição de contratar. Dispense contratos.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                {th('pos', 'POS')}{th('nome', 'Jogador')}{th('idade', 'Idade', true)}{th('ovr', 'OVR', true)}
                {ATTR_KEYS.map(a => th(a.k as AttrKey, a.s, true))}
                {th('salario', 'Cap hit', true)}{th('contrato', 'Contr.', true)}
                <th>Sit.</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {roster.map(p => (
                <tr key={p.id} className={p.lesao > 0 ? 'opacity-60' : ''}>
                  <td><PosBadge pos={p.pos} /></td>
                  <td className="max-w-[190px] truncate">
                    {p.nome}
                    {p.rookie && <span className="tag ml-2 border-gold/50 text-gold" title="Novato">R</span>}
                    {p.tag && <span className="tag ml-2 border-ice/60 text-ice" title="Franchise tag">TAG</span>}
                  </td>
                  <td className="num">{p.idade}</td>
                  <td className="num"><Ovr v={p.ovr} pot={p.rookie ? p.pot : undefined} /></td>
                  {ATTR_KEYS.map(a => <td key={a.k} className="num"><AttrCell v={p.attrs[a.k]} /></td>)}
                  <td className="num text-goldhi">{fmtM(capHitOf(p))}</td>
                  <td className="num">{p.contrato}a{p.contrato === 1 ? ' ⚠' : ''}</td>
                  <td>
                    {p.lesao > 0
                      ? <span className="tag border-blood/60 text-blood">DM {p.lesao}s</span>
                      : p.status === 'TIT' ? <span className="tag border-grass/60 text-grass">TIT</span>
                        : p.status === 'RES' ? <span className="tag border-line text-dim">RES</span>
                          : <span className="tag border-ice/50 text-ice">PS</span>}
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {(['TIT', 'RES', 'PS'] as const).map(s2 => (
                        <button key={s2}
                          className={`btn btn-sm ${p.status === s2 ? (s2 === 'TIT' ? 'btn-gold' : '') : 'btn-ghost'}`}
                          disabled={p.status === s2}
                          onClick={() => dispatch({ type: 'SET_STATUS', playerId: p.id, status: s2 })}>
                          {s2}
                        </button>
                      ))}
                      {p.contrato === 1 && !p.tag && p.status !== 'PS' && (
                        <button className="btn btn-sm btn-ghost text-ice" title="Aplicar franchise tag"
                          onClick={() => dispatch({ type: 'TAG', playerId: p.id })}>TAG</button>
                      )}
                    </div>
                  </td>
                  <td>
                    {confirmId === p.id ? (
                      <div className="flex gap-1">
                        <button className="btn btn-sm btn-danger" onClick={() => { dispatch({ type: 'RELEASE', playerId: p.id }); setConfirmId(null); }}>Sim</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>Não</button>
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-ghost hover:text-blood" onClick={() => setConfirmId(p.id)}>Dispensar</button>
                    )}
                  </td>
                </tr>
              ))}
              {!roster.length && <tr><td colSpan={19} className="py-6 text-center text-faint">Nenhum jogador neste filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="font-mono text-[11.5px] text-faint">
        TIT = titular (a engine usa os melhores TIT por posição) · RES = reserva ativo · PS = practice squad (não joga) ·
        Contrato ⚠ expira ao fim da temporada — use a Franchise Tag para segurar a estrela.
      </p>
    </div>
  );
}

/* ============================ TÁTICAS & TREINO ============================ */
const FOCUS_INFO: Record<Focus, { label: string; desc: string }> = {
  CORRIDA: { label: 'Jogo terrestre', desc: '+Corrida e +Bloqueio dos jovens' },
  PASSE: { label: 'Jogo aéreo', desc: '+Passe e +Recepção dos jovens' },
  DEFESA: { label: 'Defesa', desc: '+Tackle e +Velocidade dos jovens' },
  FISICO: { label: 'Condicionamento', desc: '+Resistência e +Velocidade p/ todos' },
};

export const UPGRADE_COST = (lvl: number) => Math.round((8 + lvl * 6) * 10) / 10;

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
            <input type="range" min={5} max={95} value={cor} className="w-full"
              onChange={e => setCor(+e.target.value)}
              onPointerUp={() => dispatch({ type: 'TACTICS', corrida: cor, agressividade: agg })}
              onKeyUp={() => dispatch({ type: 'TACTICS', corrida: cor, agressividade: agg })} />
            <div className="mt-1 flex justify-between font-mono text-[11px] text-faint">
              <span>« ground and pound</span><span>west coast »</span>
            </div>
          </label>
          <label className="mt-5 block">
            <div className="mb-1 flex justify-between font-disp text-[15px] font-semibold uppercase tracking-wider">
              <span className="text-dim">Agressividade</span>
              <span className={agg >= 60 ? 'text-blood' : 'text-ink'}>{agg >= 70 ? 'ALL IN' : agg >= 45 ? 'calculada' : 'conservadora'}</span>
            </div>
            <input type="range" min={0} max={100} value={agg} className="w-full"
              onChange={e => setAgg(+e.target.value)}
              onPointerUp={() => dispatch({ type: 'TACTICS', corrida: cor, agressividade: agg })}
              onKeyUp={() => dispatch({ type: 'TACTICS', corrida: cor, agressividade: agg })} />
            <div className="mt-1 font-mono text-[11px] text-faint">
              Define conversões de 4ª descida: com {agg}, o técnico arrisca até 4ª e {agg >= 70 ? 4 : agg >= 45 ? 2 : 1}.
            </div>
          </label>
          <div className="mt-4 border-t border-line2 pt-3 font-mono text-[12px] text-dim">
            A engine cruza sua tática com o cenário: chuva sufoca o passe, vantagem no placar pede relógio,
            e a batalha OL × DL decide sacks e jardas de corrida.
          </div>
        </Panel>

        <Panel title="Centro de treinamento">
          <div className="flex items-center justify-between font-mono text-[13px]">
            <span className="text-dim">Nível da estrutura</span>
            <Stars n={t.centroTreino} />
          </div>
          <div className="mt-2 font-mono text-[12px] text-dim">
            O nível acelera o desenvolvimento dos jovens e reduz o declínio dos veteranos na virada de temporada.
          </div>
          <button className="btn mt-3"
            disabled={t.centroTreino >= 5 || t.dinheiro < UPGRADE_COST(t.centroTreino)}
            onClick={() => dispatch({ type: 'UPGRADE', kind: 'centroTreino' })}>
            {t.centroTreino >= 5 ? 'Estrutura no máximo' : `Modernizar — ${fmtM(UPGRADE_COST(t.centroTreino))}`}
          </button>
          <div className="mt-5">
            <div className="mb-2 font-disp text-[15px] font-semibold uppercase tracking-wider text-dim">Foco da offseason</div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FOCUS_INFO) as Focus[]).map(f => (
                <button key={f}
                  className={`btn flex-col items-start ${g.focus === f ? 'btn-gold' : 'btn-ghost'}`}
                  style={{ textTransform: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 0 }}
                  onClick={() => dispatch({ type: 'FOCUS', focus: f })}>
                  <b className="font-disp text-[14px] uppercase tracking-wider">{FOCUS_INFO[f].label}</b>
                  <span className="text-[11px] opacity-80">{FOCUS_INFO[f].desc}</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title="Comissão técnica" pad={false}
          right={<button className="btn btn-sm" onClick={() => dispatch({ type: 'SCREEN', screen: 'comissao' })}>Gerenciar »</button>}>
          <table className="tbl">
            <thead><tr><th>Função</th><th>Profissional</th><th className="num">Nível</th><th className="num">Salário</th><th className="num">Contr.</th></tr></thead>
            <tbody>
              {staff.map(s2 => (
                <tr key={s2.id}>
                  <td className="text-dim">{s2.funcao}</td>
                  <td>{s2.nome}</td>
                  <td className="num"><Stars n={s2.nivel} /></td>
                  <td className="num text-goldhi">{fmtM(s2.salario)}</td>
                  <td className="num">{s2.contrato}a{s2.contrato === 1 ? ' ⚠' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line2 px-3.5 py-2.5 font-mono text-[11.5px] text-faint">
            Coordenadores somam bônus na engine; o médico reduz lesões. Contratos ⚠ vencem na virada da temporada.
          </p>
        </Panel>

        <Panel title="Guia de posições" pad={false}>
          <div className="max-h-[380px] overflow-y-auto">
            {Object.entries(POS_LABEL).map(([pos, label]) => (
              <div key={pos} className="flex items-center gap-3 border-b border-line2 px-3.5 py-2">
                <PosBadge pos={pos as keyof typeof POS_LABEL} />
                <span className="font-mono text-[12.5px] text-dim">{label}</span>
                <span className="ml-auto font-mono text-[11px] text-faint">
                  {UNIT_OF[pos as keyof typeof UNIT_OF] === 'OF' ? 'ataque' : UNIT_OF[pos as keyof typeof UNIT_OF] === 'DF' ? 'defesa' : 'especiais'}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============================ DEPTO. MÉDICO ============================ */
export function MedicalScreen() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const dm = playersOf(g, t.id).filter(p => p.lesao > 0).sort((a, b) => b.lesao - a.lesao);
  const medico = staffOf(g, t.id).find(s2 => s2.funcao === 'Médico');

  return (
    <div className="space-y-4">
      <Panel
        title="Departamento médico"
        right={<span className="font-mono text-[12px] text-dim">{dm.length ? `${dm.length} paciente(s)` : 'DM vazio ✓'}</span>}
        pad={false}
      >
        {dm.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="font-disp text-[26px] font-bold uppercase text-grass">Nenhuma lesão</div>
            <p className="mt-1 font-mono text-[12.5px] text-dim">Elenco inteiro à disposição do treinador.</p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>POS</th><th>Jogador</th><th>Diagnóstico</th><th className="num">Fora por</th><th className="num">OVR</th><th className="num">Cap hit</th></tr>
            </thead>
            <tbody>
              {dm.map(p => (
                <tr key={p.id}>
                  <td><PosBadge pos={p.pos} /></td>
                  <td>{p.nome}{p.status === 'TIT' && <span className="tag ml-2 border-grass/60 text-grass">TIT</span>}</td>
                  <td className="text-blood">{p.lesaoTipo}</td>
                  <td className="num font-bold text-goldhi">{p.lesao} sem.</td>
                  <td className="num"><Ovr v={p.ovr} /></td>
                  <td className="num text-goldhi">{fmtM(capHitOf(p))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="font-mono text-[11.5px] text-faint">
        Lesões ocorrem jogada a jogada (corridas e sacks são os lances de risco), com probabilidade por posição e fadiga acumulada.
        {medico ? ` Seu médico (nv. ${medico.nivel}) ${medico.nivel >= 4 ? 'reduz bastante' : medico.nivel >= 3 ? 'reduz levemente' : 'não reduz'} a taxa.` : ''}
      </p>
    </div>
  );
}
