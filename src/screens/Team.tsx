import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { teamById, playersOf, staffOf, capUsed, fmtM } from '../game/season';
import { ATTR_KEYS, ATTR_FULL, UNIT_OF, POS_LABEL } from '../game/data';
import { Panel, PosBadge, Ovr, Bar, AttrCell } from '../components/ui';
import type { AttrKey, Focus, Player, PlaybookStyle, Unit } from '../game/types';

type SortKey = 'pos' | 'nome' | 'idade' | 'ovr' | 'salario' | 'contrato' | AttrKey;

export function RosterScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const [filter, setFilter] = useState<'ALL' | Unit | 'PS'>('ALL');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'ovr', dir: -1 });
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const roster = useMemo(() => {
    let ps = playersOf(g, t.id);
    if (filter === 'PS') ps = ps.filter(p => p.status === 'PS');
    else if (filter !== 'ALL') ps = ps.filter(p => p.status !== 'PS' && UNIT_OF[p.pos] === filter);
    const val = (p: Player): number | string => {
      if (sort.k === 'pos') return p.pos;
      if (sort.k === 'nome') return p.nome;
      if (sort.k in p.attrs) return p.attrs[sort.k as AttrKey];
      return (p as unknown as Record<string, number>)[sort.k] ?? 0;
    };
    return [...ps].sort((a, b) => {
      const va = val(a); const vb = val(b);
      const c = typeof va === 'string' ? String(va).localeCompare(String(vb)) : (va as number) - (vb as number);
      return c * sort.dir || b.ovr - a.ovr;
    });
  }, [g, t.id, filter, sort]);

  const ativos = playersOf(g, t.id).filter(p => p.status !== 'PS');
  const psCount = playersOf(g, t.id).filter(p => p.status === 'PS');
  const folha = capUsed(g, t.id);
  const capPct = (folha / g.settings.cap) * 100;

  const clickSort = (k: SortKey) =>
    setSort(s => (s.k === k ? { k, dir: s.dir === 1 ? -1 : 1 } : { k, dir: k === 'nome' || k === 'pos' ? 1 : -1 }));
  const th = (k: SortKey, label: string, num = false, full?: string) => (
    <th className={`${num ? 'num' : ''} cursor-pointer select-none hover:text-goldhi`} onClick={() => clickSort(k)}
      title={full ? `${full} — clique para ordenar` : 'Clique para ordenar'}>
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
          Ativos <b className={ativos.length > 53 ? 'text-blood' : 'text-ink'}>{ativos.length}</b>/53 ·
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
            ⚠ ACIMA DO TETO SALARIAL em {fmtM(folha - g.settings.cap)} — o clube não pode contratar até regularizar.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                {th('pos', 'POS', false, 'Posição')}
                {th('nome', 'Jogador', false, 'Nome')}
                {th('idade', 'Idade', true, 'Idade — jovens evoluem com tempo de jogo, veteranos declinam')}
                {th('ovr', 'OVR', true, 'Overall — média ponderada dos atributos (85+ elite, 75+ titular)')}
                <th key="clutch" className="num" title="Clutch — resposta em quarto período e jogo de até uma posse">CLT</th>
                {ATTR_KEYS.map(a => th(a.k as AttrKey, a.s, true, ATTR_FULL[a.k]))}
                {th('salario', 'Salário', true, 'Salário-base anual (cap hit inclui bônus amortizado)')}
                {th('contrato', 'Contr.', true, 'Anos restantes de contrato — 1 ano = pode renovar ou usar tag')}
                <th>Sit.</th>
                <th>Status</th>
                <th />
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
                  <td className={`num font-bold ${p.clutchRating >= 80 ? 'text-grass' : p.clutchRating <= 40 ? 'text-blood' : 'text-goldhi'}`}>{p.clutchRating}</td>
                  {ATTR_KEYS.map(a => <td key={a.k} className="num"><AttrCell v={p.attrs[a.k]} /></td>)}
                  <td className="num text-goldhi">{fmtM(p.salario)}</td>
                  <td className="num">{p.contrato}a{p.contrato === 1 ? ' ⚠' : ''}</td>
                  <td>
                    {p.lesao > 0
                      ? <span className="tag border-blood/60 text-blood">DM {p.lesao}sem</span>
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
                        <button className="btn btn-sm btn-danger" onClick={() => { dispatch({ type: 'RELEASE', playerId: p.id }); setConfirmId(null); }}>Confirmar</button>
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
    </div>
  );
}

const FOCUS_INFO: Record<Focus, { label: string; desc: string }> = {
  CORRIDA: { label: 'Jogo terrestre', desc: '+Corrida e +Bloqueio dos jovens' },
  PASSE: { label: 'Jogo aéreo', desc: '+Passe e +Recepção dos jovens' },
  DEFESA: { label: 'Defesa', desc: '+Tackle e +Velocidade dos jovens' },
  FISICO: { label: 'Condicionamento', desc: '+Resistência e +Velocidade' },
};

const PLAYBOOK_INFO: Record<PlaybookStyle, { label: string; desc: string }> = {
  pass_heavy: { label: 'Pass-heavy', desc: '+10% passe · -5% corrida · QB +3 rating' },
  run_heavy: { label: 'Run-heavy', desc: '+10% corrida · -5% passe · +2 min posse' },
  balanced: { label: 'Balanced', desc: 'Equilíbrio entre passe e jogo terrestre' },
  west_coast: { label: 'West Coast', desc: 'Passe curto · eficiência e controle' },
};

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
              onPointerUp={() => dispatch({ type: 'TACTICS', corrida: cor, agressividade: agg })} />
          </label>
          <label className="mt-5 block">
            <div className="mb-1 flex justify-between font-disp text-[15px] font-semibold uppercase tracking-wider">
              <span className="text-dim">Agressividade</span>
              <span className={agg >= 60 ? 'text-blood' : 'text-ink'}>{agg >= 70 ? 'ALL IN' : agg >= 45 ? 'calculada' : 'conservadora'}</span>
            </div>
            <input type="range" min={0} max={100} value={agg} className="w-full"
              onChange={e => setAgg(+e.target.value)}
              onPointerUp={() => dispatch({ type: 'TACTICS', corrida: cor, agressividade: agg })} />
            <div className="mt-1 font-mono text-[11px] text-faint">
              Com {agg}, o técnico arrisca até 4ª e {agg >= 70 ? 4 : agg >= 45 ? 2 : 1}.
            </div>
          </label>
        </Panel>

        <Panel title="Playbook da franquia">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(PLAYBOOK_INFO) as PlaybookStyle[]).map(playbook => (
              <button key={playbook}
                className={`btn flex-col items-start ${t.tactics.playbook === playbook ? 'btn-gold' : 'btn-ghost'}`}
                style={{ textTransform: 'none', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 0 }}
                onClick={() => dispatch({ type: 'PLAYBOOK', playbook })}>
                <b className="font-disp text-[14px] uppercase tracking-wider">{PLAYBOOK_INFO[playbook].label}</b>
                <span className="text-[11px] opacity-80">{PLAYBOOK_INFO[playbook].desc}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Centro de treinamento">
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
          <div className="mt-4 border-t border-line2 pt-3">
            <div className="mb-2 font-disp text-[13px] font-semibold uppercase tracking-wider text-faint">Intensidade semanal</div>
            <div className="grid grid-cols-3 gap-2">
              {(['LEVE', 'NORMAL', 'INTENSO'] as const).map(intensity => (
                <button key={intensity}
                  className={`btn ${g.trainingState.intensity === intensity ? 'btn-gold' : 'btn-ghost'}`}
                  onClick={() => dispatch({ type: 'TRAINING_INTENSITY', intensity })}>
                  {intensity}
                </button>
              ))}
            </div>
            <div className="mt-2 font-mono text-[11px] text-faint">Jovens precisam de 8 jogos para desbloquear evolução; intensidade alta acelera o desenvolvimento.</div>
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
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

        <Panel title="Guia de posições" pad={false}>
          <div className="max-h-[380px] overflow-y-auto">
            {Object.entries(POS_LABEL).map(([pos, label]) => (
              <div key={pos} className="flex items-center gap-3 border-b border-line2 px-3.5 py-2">
                <PosBadge pos={pos as never} />
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

export function MedicalScreen() {
  const { st } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const dm = playersOf(g, t.id).filter(p => p.lesao > 0).sort((a, b) => b.lesao - a.lesao);
  const header = dm.length ? `${dm.length} paciente(s)` : 'DM vazio';

  return (
    <div className="space-y-4">
      <Panel title="Departamento médico" right={<span className="font-mono text-[12px] text-dim">{header}</span>} pad={false}>
        {dm.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="font-disp text-[26px] font-bold uppercase text-grass">Nenhuma lesão</div>
            <p className="mt-1 font-mono text-[12.5px] text-dim">Elenco inteiro à disposição do treinador.</p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>POS</th><th>Jogador</th><th>Diagnóstico</th><th className="num">Retorno</th><th>Recuperação</th><th className="num">OVR</th><th className="num">Salário</th></tr>
            </thead>
            <tbody>
              {dm.map(p => (
                <tr key={p.id}>
                  <td><PosBadge pos={p.pos} /></td>
                  <td>{p.nome}{p.status === 'TIT' && <span className="tag ml-2 border-grass/60 text-grass">TIT</span>}</td>
                  <td className="text-blood">{p.lesaoTipo}</td>
                  <td className="num font-bold text-goldhi">{p.lesao} sem.</td>
                  <td className="min-w-[150px]">
                    {(() => {
                      const total = Math.max(p.lesaoTotal ?? p.lesao, 1);
                      const recovery = Math.round((1 - p.lesao / total) * 100);
                      return (
                        <div title={`${recovery}% recuperado · ${p.lesao} semana(s) restante(s)`}>
                          <div className="mb-1 flex justify-between font-mono text-[11px]">
                            <span className={recovery >= 75 ? 'text-grass' : 'text-dim'}>{recovery}%</span>
                            <span className="text-faint">{total} sem. total</span>
                          </div>
                          <Bar pct={recovery} color={recovery >= 75 ? 'var(--color-grass)' : 'var(--color-blood)'} h={6} />
                        </div>
                      );
                    })()}
                  </td>
                  <td className="num"><Ovr v={p.ovr} /></td>
                  <td className="num text-goldhi">{fmtM(p.salario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="font-mono text-[11.5px] text-faint">
        Lesões ocorrem jogada a jogada (corridas e sacks são os lances de risco, agravados pela fadiga). A contagem regressiva acontece a cada semana simulada.
      </p>
    </div>
  );
}

type LeagueRosterSort = 'rating' | 'idade' | 'contrato';

export function LeagueRostersScreen() {
  const { st } = useGame();
  const g = st.game!;
  const [teamId, setTeamId] = useState(g.userTeam);
  const [position, setPosition] = useState<'ALL' | Player['pos']>('ALL');
  const [sort, setSort] = useState<LeagueRosterSort>('rating');
  const team = teamById(g, teamId);
  const roster = useMemo(() => {
    const players = playersOf(g, teamId).filter(player => position === 'ALL' || player.pos === position);
    return [...players].sort((a, b) => {
      if (sort === 'idade') return a.idade - b.idade || b.ovr - a.ovr;
      if (sort === 'contrato') return a.contrato - b.contrato || b.ovr - a.ovr;
      return b.ovr - a.ovr || a.idade - b.idade;
    });
  }, [g, teamId, position, sort]);
  const stats = (player: Player) => `${player.stats.jogos}J · ${player.stats.py + player.stats.ry + player.stats.recYds} jardas · ${player.stats.ptd + player.stats.rtd + player.stats.recTD} TD`;

  return (
    <div className="space-y-5">
      <Panel title="Elencos da Liga" right={<span className="font-mono text-[12px] text-dim">{roster.length} jogadores</span>}>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
          <label className="block font-mono text-[11px] uppercase tracking-wider text-faint">
            Franquia
            <select value={teamId} onChange={event => setTeamId(event.target.value)} className="mt-1 block w-full border border-line bg-panel2 px-2.5 py-2 font-disp text-[15px] font-semibold uppercase text-ink outline-none focus:border-gold">
              {g.teams.map(option => <option key={option.id} value={option.id}>{option.sigla} · {option.cidade} {option.nome}</option>)}
            </select>
          </label>
          <label className="block font-mono text-[11px] uppercase tracking-wider text-faint">
            Posição
            <select value={position} onChange={event => setPosition(event.target.value as typeof position)} className="mt-1 block w-full border border-line bg-panel2 px-2.5 py-2 font-disp text-[15px] font-semibold uppercase text-ink outline-none focus:border-gold">
              <option value="ALL">Todas</option>
              {(['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'] as const).map(pos => <option key={pos} value={pos}>{pos}</option>)}
            </select>
          </label>
          <div className="flex gap-1.5">
            {([['rating', 'Rating'], ['idade', 'Idade'], ['contrato', 'Contrato']] as const).map(([key, label]) => (
              <button key={key} className={`btn btn-sm ${sort === key ? 'btn-gold' : 'btn-ghost'}`} onClick={() => setSort(key)}>{label}</button>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title={`${team.cidade} ${team.nome}`} pad={false} right={<span className="font-mono text-[12px] text-dim">{team.conf} · Divisão {team.div + 1}</span>}>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>POS</th><th>Jogador</th><th className="num">Idade</th><th className="num">OVR</th><th>Contrato</th><th>Stats da temporada</th><th>Status</th></tr></thead>
            <tbody>{roster.map(player => <tr key={player.id} className={player.lesao > 0 ? 'opacity-65' : undefined}>
              <td><PosBadge pos={player.pos} /></td>
              <td><b>{player.nome}</b>{player.status === 'TIT' && <span className="tag ml-2 border-grass/60 text-grass">TIT</span>}</td>
              <td className="num">{player.idade}</td>
              <td className="num"><Ovr v={player.ovr} /></td>
              <td><span className="font-mono text-ink">{player.contrato} ano{player.contrato === 1 ? '' : 's'}</span><span className="ml-2 font-mono text-[11px] text-goldhi">{fmtM(player.salario)}</span></td>
              <td className="font-mono text-[11.5px] text-dim">{stats(player)}</td>
              <td>{player.lesao > 0 ? <span className="tag border-blood/60 text-blood">Lesionado · {player.lesao} sem.</span> : <span className="tag border-grass/60 text-grass">Saudável</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
