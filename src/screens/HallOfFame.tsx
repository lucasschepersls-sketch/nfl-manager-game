import { useGame } from '../state/store';
import { Panel, PosBadge } from '../components/ui';

export function HallOfFameScreen() {
  const { st } = useGame();
  const g = st.game!;
  const inducidos = g.hallOfFame.filter(h => h.inducted);
  const elegiveis = g.hallOfFame.filter(h => !h.inducted).sort((a, b) => b.totalVotes - a.totalVotes);

  return (
    <div className="space-y-4">
      <h2 className="font-disp text-[26px] font-extrabold uppercase tracking-wide">🏛️ Hall of Fame</h2>

      <Panel title={`Imortalizados (${inducidos.length})`} pad={false}>
        {inducidos.length === 0 ? (
          <p className="px-5 py-8 text-center font-mono text-[13px] text-dim">
            Nenhum jogador foi imortalizado ainda. Aposentados com grandes carreiras entram em consideração após algumas temporadas.
          </p>
        ) : (
          <table className="tbl">
            <thead><tr><th>POS</th><th>Jogador</th><th className="num">Pro Bowls</th><th className="num">Títulos</th><th className="num">Votos</th><th>Camisa</th></tr></thead>
            <tbody>
              {inducidos.map(h => (
                <tr key={h.playerId}>
                  <td><PosBadge pos={h.pos} /></td>
                  <td><b className="text-goldhi">{h.nome}</b></td>
                  <td className="num">{h.proBowls}</td>
                  <td className="num">{h.championships}</td>
                  <td className="num">{h.totalVotes.toLocaleString('pt-BR')}</td>
                  <td>{h.jerseyRetired ? <span className="tag border-gold/60 text-gold">APOSENTADA</span> : <span className="text-faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {elegiveis.length > 0 && (
        <Panel title="Elegíveis em consideração" pad={false}>
          <table className="tbl">
            <thead><tr><th>POS</th><th>Jogador</th><th className="num">Anos aposentado</th><th className="num">Pro Bowls</th><th className="num">Votos totais</th></tr></thead>
            <tbody>
              {elegiveis.map(h => (
                <tr key={h.playerId}>
                  <td><PosBadge pos={h.pos} /></td>
                  <td>{h.nome}</td>
                  <td className="num">{h.yearsRetired}</td>
                  <td className="num">{h.proBowls}</td>
                  <td className="num text-goldhi">{h.totalVotes.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Como funciona">
        <p className="font-mono text-[12px] leading-relaxed text-dim">
          Jogadores aposentados acumulam votos de fãs, mídia e atletas ao longo das temporadas.
          Os mais votados são imortalizados no Hall of Fame e podem ter a camisa aposentada pela franquia.
        </p>
      </Panel>
    </div>
  );
}
