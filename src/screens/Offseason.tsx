import { useGame } from '../state/store';
import { validateRoster, playersOf, capUsed, fmtM } from '../game/season';
import { OFF_PHASES } from '../game/season';
import { Panel } from '../components/ui';

export function OffseasonScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const ph = g.offPhase ?? 1;
  const chk = validateRoster(g);
  const ativos = playersOf(g, g.userTeam).filter(p => p.status !== 'PS').length;
  const cap = capUsed(g, g.userTeam);

  const dest = { 1: 'mercado', 2: 'negociacoes', 3: 'draft', 4: 'offseason' } as const;

  return (
    <div className="space-y-5">
      {/* stepper */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {OFF_PHASES.map(f => {
          const done = ph > f.n;
          const on = ph === f.n;
          return (
            <button key={f.n} onClick={() => dispatch({ type: 'SCREEN', screen: dest[f.n] })}
              className={`border p-3 text-left transition-all ${on
                ? 'border-gold bg-[rgba(240,180,41,0.12)] shadow-[0_0_16px_rgba(240,180,41,0.2)]'
                : done ? 'border-grass/40 bg-panel2' : 'border-line bg-panel2 opacity-70'}`}>
              <div className="flex items-center justify-between">
                <span className="font-disp text-[15px] font-bold uppercase">{f.n}. {f.titulo}</span>
                <span className={`text-[13px] ${done ? 'text-grass' : on ? 'text-gold blink' : 'text-faint'}`}>{done ? '✓' : on ? '●' : '○'}</span>
              </div>
              <div className="mt-1 font-mono text-[10.5px] leading-snug text-faint">{f.desc}</div>
            </button>
          );
        })}
      </div>

      {/* validação final */}
      <Panel title="Validação final (Fase 4)" pad={false}
        right={<span className={`tag ${chk.ok ? 'border-grass/60 text-grass' : 'border-blood/60 text-blood'}`}>{chk.ok ? '✓ TUDO CERTO' : `${chk.erros.length} PENDÊNCIA(S)`}</span>}>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="space-y-2 font-mono text-[12.5px]">
            <div className="flex justify-between"><span className="text-dim">Elenco ativo</span>
              <b style={{ color: ativos === 53 ? 'var(--color-grass)' : 'var(--color-blood)' }}>{ativos}/53</b></div>
            <div className="flex justify-between"><span className="text-dim">Folha salarial</span>
              <b style={{ color: cap > g.settings.cap ? 'var(--color-blood)' : 'var(--color-grass)' }}>{fmtM(cap)} / {fmtM(g.settings.cap)}</b></div>
            <div className="flex justify-between"><span className="text-dim">QB no elenco</span>
              <b className={playersOf(g, g.userTeam).some(p => p.pos === 'QB' && p.status !== 'PS') ? 'text-grass' : 'text-blood'}>
                {playersOf(g, g.userTeam).some(p => p.pos === 'QB' && p.status !== 'PS') ? '✓' : '✗'}</b></div>
            <div className="flex justify-between"><span className="text-dim">Kicker (K)</span>
              <b className={playersOf(g, g.userTeam).some(p => p.pos === 'K' && p.status !== 'PS') ? 'text-grass' : 'text-blood'}>
                {playersOf(g, g.userTeam).some(p => p.pos === 'K' && p.status !== 'PS') ? '✓' : '✗'}</b></div>
            <div className="flex justify-between"><span className="text-dim">Punter (P)</span>
              <b className={playersOf(g, g.userTeam).some(p => p.pos === 'P' && p.status !== 'PS') ? 'text-grass' : 'text-blood'}>
                {playersOf(g, g.userTeam).some(p => p.pos === 'P' && p.status !== 'PS') ? '✓' : '✗'}</b></div>
          </div>

          <div>
            {!chk.ok && (
              <ul className="mb-3 space-y-1.5">
                {chk.erros.map((e, i) => (
                  <li key={i} className="border-l-2 border-blood pl-3 font-mono text-[12px] text-blood">{e}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => dispatch({ type: 'AUTO_FIX' })}>🔧 Auto-Fix (cortes automáticos)</button>
              <button className="btn btn-ghost" onClick={() => dispatch({ type: 'SCREEN', screen: 'mercado' })}>Contratar Free Agents</button>
              <button className="btn btn-ghost" onClick={() => dispatch({ type: 'SCREEN', screen: 'elenco' })}>Gerenciar Elenco</button>
            </div>
            <button className="btn btn-gold btn-pulse mt-4 w-full text-[17px]" disabled={!chk.ok || ph !== 4}
              title={chk.ok ? '' : 'Resolva as pendências antes'}
              onClick={() => dispatch({ type: 'START_SEASON' })}>
              Iniciar Temporada {g.settings.temporada + 1} »
            </button>
            {!chk.ok && <p className="mt-2 text-center font-mono text-[11px] text-faint">O botão habilita quando todas as validações passarem.</p>}
          </div>
        </div>
      </Panel>

      {/* guia */}
      <Panel title="Como funciona a offseason">
        <ol className="list-decimal space-y-1.5 pl-5 font-mono text-[12.5px] leading-relaxed text-dim">
          <li><b className="text-ink">Free Agency:</b> contrate agentes livres com ofertas (salário + bônus + estrutura). A IA também disputa o mercado.</li>
          <li><b className="text-ink">Renovações:</b> garanta suas estrelas e comissão técnica antes que virem FA.</li>
          <li><b className="text-ink">Draft:</b> 7 rodadas, ordem pela campanha. Use o Scouting para revelar avaliações exatas.</li>
          <li><b className="text-ink">Validação:</b> feche com 53 ativos, dentro do cap e com QB/K/P para iniciar a temporada.</li>
        </ol>
      </Panel>
    </div>
  );
}
