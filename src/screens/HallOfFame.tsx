import { useGame } from '../state/store';
import { Panel, PosBadge } from '../components/ui';

export function HallOfFameScreen() {
  const { st } = useGame();
  const g = st.game!;
  const inducted = g.hallOfFame.filter(entry => entry.inducted);
  const candidates = g.hallOfFame.filter(entry => !entry.inducted);

  return (
    <div className="space-y-5">
      <Panel title="Hall of Fame" right={<span className="font-mono text-[12px] text-goldhi">{inducted.length} imortalizados</span>}>
        <p className="font-mono text-[12px] leading-relaxed text-dim">A indução exige 5 anos de aposentadoria, 5 Pro Bowls, estatísticas de elite e pelo menos um Super Bowl. A votação combina fãs, mídia e jogadores.</p>
      </Panel>
      <Panel title="Jogadores induzidos" pad={false}>
        {inducted.length === 0 ? <p className="px-4 py-7 font-mono text-[12.5px] text-faint">Nenhum jogador foi induzido ainda.</p> : (
          <table className="tbl"><thead><tr><th>POS</th><th>Jogador</th><th className="num">Pro Bowls</th><th className="num">Super Bowls</th><th className="num">Aposentado</th><th className="num">Votação</th><th>Honra</th></tr></thead><tbody>{inducted.map(entry => <tr key={entry.playerId}><td><PosBadge pos={entry.pos} /></td><td><b>{entry.nome}</b></td><td className="num">{entry.proBowls}</td><td className="num">{entry.championships}</td><td className="num">{entry.yearsRetired} anos</td><td className="num text-grass">{entry.totalVotes}%</td><td className="text-goldhi">Camisa aposentada</td></tr>)}</tbody></table>
        )}
      </Panel>
      <Panel title="Candidatos em observação" pad={false}>
        {candidates.length === 0 ? <p className="px-4 py-7 font-mono text-[12.5px] text-faint">Nenhum candidato aguardando elegibilidade.</p> : (
          <table className="tbl"><thead><tr><th>POS</th><th>Jogador</th><th className="num">Anos aposentado</th><th className="num">Pro Bowls</th><th className="num">Super Bowls</th><th>Progresso</th></tr></thead><tbody>{candidates.map(entry => <tr key={entry.playerId}><td><PosBadge pos={entry.pos} /></td><td><b>{entry.nome}</b></td><td className="num">{entry.yearsRetired}/5</td><td className="num">{entry.proBowls}/5</td><td className="num">{entry.championships}/1</td><td className="text-dim">Votação após cumprir todos os critérios</td></tr>)}</tbody></table>
        )}
      </Panel>
    </div>
  );
}
