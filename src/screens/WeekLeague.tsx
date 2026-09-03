import { useGame } from '../state/store';
import { teamById } from '../game/season';
import { Panel, TeamDot } from '../components/ui';

export function WeekLeagueScreen() {
  const { st } = useGame();
  const g = st.game!;
  const { fase, semana } = g.settings;

  const jogos = g.matches.filter(m => m.fase === fase && m.rodada === semana);
  const label = fase === 'PRE' ? `Pré-temporada · Semana ${semana}`
    : fase === 'REG' ? `Temporada regular · Semana ${semana}`
      : fase === 'PO' ? `Playoffs · Rodada ${semana}` : 'Offseason';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-disp text-[26px] font-extrabold uppercase tracking-wide">{label}</h2>
        <span className="font-mono text-[12px] text-faint">{jogos.length} jogo{jogos.length !== 1 ? 's' : ''} na liga</span>
      </div>

      {jogos.length === 0 ? (
        <Panel title="Sem jogos">
          <p className="font-mono text-[13px] text-dim">Nenhuma partida programada para esta semana (offseason ou semana de bye).</p>
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {jogos.map(m => {
            const c = teamById(g, m.casa); const f = teamById(g, m.fora);
            const isMine = m.casa === g.userTeam || m.fora === g.userTeam;
            return (
              <div key={m.id} className={`border p-4 transition-all hover:-translate-y-0.5 ${isMine ? 'border-gold shadow-[0_0_16px_rgba(240,180,41,0.18)]' : 'border-line'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={`tag ${m.jogada ? 'border-line text-dim' : 'border-grass/50 text-grass'}`}>{m.jogada ? 'FINAL' : 'AGENDADO'}</span>
                  {isMine && <span className="tag border-gold/60 text-gold">SEU JOGO</span>}
                </div>
                <div className="space-y-2">
                  {[{ t: c, pts: m.placarCasa, home: true }, { t: f, pts: m.placarFora, home: false }].map(({ t, pts, home }) => (
                    <div key={t.id} className="flex items-center gap-2.5">
                      <TeamDot cor={t.cor} size={12} />
                      <span className="font-disp text-[16px] font-bold uppercase">{t.cidade} {t.nome}</span>
                      <span className="font-mono text-[10px] text-faint">{home ? 'casa' : 'fora'}</span>
                      {m.jogada && (
                        <span className={`ml-auto font-disp text-[20px] font-extrabold ${pts! >= (home ? m.placarFora! : m.placarCasa!) ? 'text-goldhi' : 'text-faint'}`}>{pts}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
