/* ============================================================
 * Validação da NFLMatchEngine contra parâmetros reais da NFL.
 * Simula N partidas headless e confere as médias por time/jogo:
 *   - Pass attempts : 30-40  (alvo 35)
 *   - Rush attempts : 25-30  (alvo 27)
 *   - Total yards   : 280-400 (alvo 340)
 *   - Posse de bola : 27-33 min (alvo 30)
 * Rode no console do navegador:  __validateEngine()
 * ============================================================ */

import { newGame } from './generate';
import { NFLMatchEngine } from './engine';
import { sideOf } from './season';
import { Rng, newSeed } from './rng';

export interface ValidationRange { min: number; max: number; alvo: number; }

export const NFL_RANGES = {
  passAtt: { min: 30, max: 40, alvo: 35 } as ValidationRange,
  rushAtt: { min: 25, max: 30, alvo: 27 } as ValidationRange,
  totalYds: { min: 280, max: 400, alvo: 340 } as ValidationRange,
  possMin: { min: 27, max: 33, alvo: 30 } as ValidationRange,
  /* competitividade (Problema 2): mando de campo balanceado */
  homeWinPct: { min: 50, max: 63, alvo: 57 } as ValidationRange,   // NFL real: 57%
  margemVitoria: { min: 8, max: 12, alvo: 10 } as ValidationRange, // não 20+
  jogoPosse: { min: 40, max: 55, alvo: 45 } as ValidationRange,    // decididos por ≤8 pts
};

export interface ValidationReport {
  games: number;
  passAtt: number;
  rushAtt: number;
  totalPlays: number;
  totalYds: number;
  passYds: number;
  rushYds: number;
  possMin: number;
  placarMedio: number;
  homeWinPct: number;
  margemVitoria: number;
  jogoPossePct: number;
  checks: { nome: string; valor: number; range: ValidationRange; ok: boolean }[];
  aprovado: boolean;
}

/** Simula `games` partidas e devolve as médias por time/jogo. */
export function runEngineValidation(games = 100): ValidationReport {
  const rng = new Rng(newSeed());
  const state = newGame('kc', rng.int(1, 0x7fffffff));
  const ids = state.teams.map(t => t.id);

  let passAtt = 0, rushAtt = 0, totalYds = 0, passYds = 0, rushYds = 0, possSecs = 0, pontos = 0;
  let vitoriasCasa = 0, somaMargemVitoria = 0, jogosDecididos = 0, jogosPosseUnica = 0;

  for (let i = 0; i < games; i++) {
    const a = ids[rng.int(0, ids.length - 1)];
    let b = ids[rng.int(0, ids.length - 1)];
    while (b === a) b = ids[rng.int(0, ids.length - 1)];

    const engine = new NFLMatchEngine(sideOf(state, a), sideOf(state, b), new Rng(rng.int(1, 0x7fffffff)));
    const r = engine.simulate(`val-${i}`, 'Validação');

    // somas dos dois times
    for (const side of [r.rich.casa, r.rich.fora]) {
      totalYds += side.yds;
      passYds += side.passYds;
      rushYds += side.rushYds;
      possSecs += side.possSecs;
      pontos += side.pts;
    }
    for (const l of r.rich.lines) {
      passAtt += l.att ?? 0;
      rushAtt += l.rAtt ?? 0;
    }

    // competitividade: mando de campo, margem e jogos de 1 posse
    const diff = r.placarCasa - r.placarFora;
    if (diff > 0) { vitoriasCasa++; somaMargemVitoria += diff; jogosDecididos++; }
    else if (diff < 0) { somaMargemVitoria += -diff; jogosDecididos++; }
    if (Math.abs(diff) <= 8) jogosPosseUnica++;
  }

  const perTeam = games * 2; // médias por time por jogo
  const report: ValidationReport = {
    games,
    passAtt: Math.round((passAtt / perTeam) * 10) / 10,
    rushAtt: Math.round((rushAtt / perTeam) * 10) / 10,
    totalPlays: Math.round(((passAtt + rushAtt) / perTeam) * 10) / 10,
    totalYds: Math.round(totalYds / perTeam),
    passYds: Math.round(passYds / perTeam),
    rushYds: Math.round(rushYds / perTeam),
    possMin: Math.round((possSecs / perTeam / 60) * 10) / 10,
    placarMedio: Math.round((pontos / perTeam) * 10) / 10,
    homeWinPct: Math.round((vitoriasCasa / games) * 1000) / 10,
    margemVitoria: jogosDecididos > 0 ? Math.round((somaMargemVitoria / jogosDecididos) * 10) / 10 : 0,
    jogoPossePct: Math.round((jogosPosseUnica / games) * 1000) / 10,
    checks: [],
    aprovado: true,
  };

  const avaliar = (nome: string, valor: number, range: ValidationRange) => {
    const ok = valor >= range.min && valor <= range.max;
    report.checks.push({ nome, valor, range, ok });
    if (!ok) report.aprovado = false;
  };
  avaliar('Pass attempts', report.passAtt, NFL_RANGES.passAtt);
  avaliar('Rush attempts', report.rushAtt, NFL_RANGES.rushAtt);
  avaliar('Total yards', report.totalYds, NFL_RANGES.totalYds);
  avaliar('Posse (min)', report.possMin, NFL_RANGES.possMin);
  avaliar('Vitória da casa %', report.homeWinPct, NFL_RANGES.homeWinPct);
  avaliar('Margem de vitória', report.margemVitoria, NFL_RANGES.margemVitoria);
  avaliar('Jogos de 1 posse %', report.jogoPossePct, NFL_RANGES.jogoPosse);

  return report;
}

/** Formata o relatório para exibição no console. */
export function printValidation(r: ValidationReport): void {
  const line = '─'.repeat(52);
  console.log(line);
  console.log(`🏈 VALIDAÇÃO DA ENGINE — ${r.games} partidas simuladas`);
  console.log(line);
  console.log(`  Média por time/jogo:`);
  console.log(`    Tentativas de passe .... ${r.passAtt}`);
  console.log(`    Tentativas de corrida .. ${r.rushAtt}`);
  console.log(`    Jogadas totais ......... ${r.totalPlays}`);
  console.log(`    Jardas totais .......... ${r.totalYds} (passe ${r.passYds} / corrida ${r.rushYds})`);
  console.log(`    Posse de bola .......... ${r.possMin} min`);
  console.log(`    Pontos ................. ${r.placarMedio}`);
  console.log(line);
  for (const c of r.checks) {
    const mark = c.ok ? '✅' : '❌';
    console.log(`  ${mark} ${c.nome.padEnd(16)} ${String(c.valor).padEnd(7)} alvo ${c.range.alvo} (faixa ${c.range.min}-${c.range.max})`);
  }
  console.log(line);
  console.log(r.aprovado ? '✅ ENGINE APROVADA — números dentro dos padrões da NFL.' : '❌ ENGINE REPROVADA — ajuste os parâmetros de simulação.');
  console.log(line);
}

/* expõe no console do navegador para rodar manualmente */
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__validateEngine = (n?: number) => {
    const r = runEngineValidation(n ?? 100);
    printValidation(r);
    return r;
  };
}
