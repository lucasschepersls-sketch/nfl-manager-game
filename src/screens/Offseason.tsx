import { useGame } from '../state/store';
import {
  OFF_PHASES, validateRoster, capUsed, playersOf, fmtM, teamById,
} from '../game/season';
import { Panel, Bar } from '../components/ui';

export function OffseasonScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const t = teamById(g, g.userTeam);
  const ph = g.offPhase ?? 1;
  const chk = validateRoster(g);
  const ativos = playersOf(g, g.userTeam).filter(p => p.status !== 'PS').length;
  const ps = playersOf(g, g.userTeam).filter(p => p.status === 'PS').length;
  const folha = capUsed(g, g.userTeam);
  const capPct = (folha / g.settings.cap) * 100;
  const draftDone = g.draftState?.done ?? false;

  const irPara = (destino: string) => dispatch({ type: 'SCREEN', screen: destino as never });

  return (
    <div className="space-y-5">
      <div className="panel px-5 py-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="font-disp text-[13px] font-semibold uppercase tracking-[0.25em] text-faint">Offseason {g.settings.temporada}</div>
            <h2 className="font-disp text-[30px] font-extrabold uppercase leading-tight">
              Fase {ph} de 4 — <span style={{ color: 'var(--color-goldhi)' }}>{OFF_PHASES[ph - 1].titulo}</span>
            </h2>
          </div>
          <div className="flex gap-1.5">
            {OFF_PHASES.map(p => (
              <span key={p.n} className={`h-2 w-10 ${p.n < ph ? 'bg-grass' : p.n === ph ? 'bg-gold' : 'bg-line'}`} />
            ))}
          </div>
        </div>
        <p className="mt-1 font-mono text-[12.5px] text-dim">{OFF_PHASES[ph - 1].desc}</p>
      </div>

      {/* stepper das 4 fases */}
      <div className="grid gap-3 md:grid-cols-4">
        {OFF_PHASES.map(p => {
          const done = p.n < ph;
          const current = p.n === ph;
          return (
            <button key={p.n}
              onClick={() => irPara(p.destino)}
              className={`panel p-4 text-left transition-all hover:-translate-y-[2px] ${current ? 'border-gold' : ''} ${done ? 'opacity-70' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`grid h-8 w-8 place-items-center border font-disp text-[16px] font-bold ${done ? 'border-grass text-grass' : current ? 'border-gold text-goldhi' : 'border-line text-faint'}`}>
                  {done ? '✓' : p.n}
                </span>
                <span className={`font-disp text-[16px] font-bold uppercase tracking-wide ${current ? 'text-goldhi' : 'text-dim'}`}>{p.titulo}</span>
              </div>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-faint">{p.desc}</p>
            </button>
          );
        })}
      </div>

      {/* ações da fase atual */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" onClick={() => irPara(OFF_PHASES[ph - 1].destino)}>
          Abrir {OFF_PHASES[ph - 1].titulo} »
        </button>
        {ph === 3 && !draftDone && (
          <button className="btn btn-ghost" onClick={() => dispatch({ type: 'DRAFT_ALL' })}>Deixar a IA draftar por mim</button>
        )}
        {ph < 4 ? (
          <button className="btn btn-gold ml-auto"
            onClick={() => dispatch({ type: 'ADVANCE_OFFPHASE' })}
            disabled={ph === 3 && !draftDone}
            title={ph === 3 && !draftDone ? 'Conclua o Draft antes de avançar' : ''}>
            Avançar para Fase {ph + 1} »
          </button>
        ) : (
          <button className="btn btn-gold btn-pulse ml-auto"
            disabled={!chk.ok}
            title={chk.ok ? 'Tudo certo — iniciar nova temporada' : chk.erros[0]}
            onClick={() => dispatch({ type: 'START_SEASON' })}>
            Iniciar temporada {g.settings.temporada + 1} »
          </button>
        )}
      </div>

      {/* validação final */}
      <Panel
        title="Validação Final — Elenco & Salary Cap"
        pad={false}
        right={chk.ok
          ? <span className="tag border-grass/60 text-grass">✓ PRONTO PARA A TEMPORADA</span>
          : <span className="tag border-blood/60 text-blood">{chk.erros.length} PENDÊNCIA(S)</span>}
      >
        <div className="grid gap-5 p-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between font-mono text-[12px] text-dim">
                <span>Elenco ativo</span>
                <b className={ativos === 53 ? 'text-grass' : 'text-blood'}>{ativos}/53</b>
              </div>
              <Bar pct={(ativos / 53) * 100} color={ativos === 53 ? 'var(--color-grass)' : 'var(--color-blood)'} />
            </div>
            <div>
              <div className="mb-1 flex justify-between font-mono text-[12px] text-dim">
                <span>Practice Squad</span>
                <b className={ps <= 10 ? 'text-ink' : 'text-blood'}>{ps}/10</b>
              </div>
              <Bar pct={(ps / 10) * 100} color={ps <= 10 ? 'var(--color-ice)' : 'var(--color-blood)'} />
            </div>
            <div>
              <div className="mb-1 flex justify-between font-mono text-[12px] text-dim">
                <span>Folha salarial</span>
                <b className={folha <= g.settings.cap ? 'text-ink' : 'text-blood'}>{fmtM(folha)} / {fmtM(g.settings.cap)}</b>
              </div>
              <Bar pct={capPct} color={capPct > 100 ? 'var(--color-blood)' : capPct > 88 ? 'var(--color-gold)' : 'var(--color-grass)'} />
            </div>
            <button className="btn btn-ghost" onClick={() => dispatch({ type: 'AUTO_FIX' })}>
              ⚡ Auto-Fix (cortes/contratações automáticas)
            </button>
          </div>

          <div>
            <div className="mb-2 font-disp text-[14px] font-bold uppercase tracking-wider text-dim">Checklist</div>
            {chk.ok ? (
              <div className="space-y-2">
                {['Elenco ativo com exatamente 53 jogadores', 'Practice Squad dentro do limite (10)', 'Folha salarial dentro do cap', 'Ao menos 1 QB no elenco'].map(x => (
                  <div key={x} className="flex items-center gap-2 font-mono text-[12px] text-grass">✓ {x}</div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {chk.erros.map((e, i) => (
                  <div key={i} className="border-l-2 border-blood bg-[rgba(226,87,75,0.08)] px-3 py-2 font-mono text-[12px] text-blood">✗ {e}</div>
                ))}
                <p className="pt-1 font-mono text-[11.5px] text-faint">
                  Ajuste no Elenco (dispensar/contratar) ou use o Auto-Fix. Sem validar, a temporada não inicia.
                </p>
              </div>
            )}
          </div>
        </div>
      </Panel>

      <p className="font-mono text-[11.5px] text-faint">
        {t.cidade} {t.nome} · Caixa ${t.dinheiro}M · Cap {fmtM(g.settings.cap)} (cresce {g.settings.tvGrowth.toFixed(1).replace('.', ',')}% na próxima temporada pela receita de TV).
      </p>
    </div>
  );
}
