/* ============================================================
 * Sistema de Treino e Desenvolvimento de Jogadores
 * Inspirado na NFL real: jogadores jovens melhoram com prática e playing time
 * ============================================================ */

import type { Player, Pos, AttrKey, Focus } from './types';

/** Mapeamento de posições para atributos primários */
const POSITION_ATTRS: Record<Pos, AttrKey[]> = {
  QB: ['passe', 'corrida'],
  RB: ['corrida', 'recepcao', 'bloqueio'],
  WR: ['recepcao', 'velocidade'],
  TE: ['recepcao', 'bloqueio'],
  OL: ['bloqueio', 'resistencia'],
  DL: ['tackle', 'resistencia'],
  LB: ['tackle', 'resistencia'],
  CB: ['tackle', 'velocidade'],
  S: ['tackle', 'velocidade'],
  K: ['chute'],
  P: ['chute'],
};

/** Foco de treino define quais atributos são priorizados */
const FOCUS_ATTRS: Record<Focus, AttrKey[]> = {
  CORRIDA: ['corrida', 'velocidade', 'resistencia'],
  PASSE: ['passe', 'recepcao', 'bloqueio'],
  DEFESA: ['tackle', 'resistencia', 'velocidade'],
  FISICO: ['resistencia', 'velocidade'],
};

/**
 * Calcula o potencial de crescimento de um jogador baseado em:
 * - Idade (jogadores mais jovens crescem mais)
 * - OVR atual vs POT (quanto menor OVR em relação ao POT, mais pode crescer)
 * - Tempo de jogo (snaps jogados)
 */
export function calculateGrowthPotential(player: Player, snapsJogados: number): number {
  const ageFactor = Math.max(0, 28 - player.idade) / 10; // Até 28 anos cresce mais
  const potentialRoom = Math.max(0, player.pot - player.ovr) / 30;
  const playingTime = Math.min(1, snapsJogados / 60); // 60 snaps = temporada completa como titular
  
  return ageFactor * 0.4 + potentialRoom * 0.4 + playingTime * 0.2;
}

/**
 * Aplica o desenvolvimento semanal do jogador baseado em:
 * - Foco de treino definido pelo usuário
 * - Tempo de jogo (snaps)
 * - Idade e potencial
 * - Moral do jogador
 */
export function applyPlayerDevelopment(
  player: Player,
  focus: Focus,
  snapsJogados: number,
  weekNumber: number,
  intensity: TrainingCenterState['intensity'] = 'NORMAL',
): { improved: boolean; attrs: Partial<Record<AttrKey, number>> } {
  if (player.idade > 30) {
    if (Math.random() < 0.15) {
      player.ovr = Math.max(20, player.ovr - 1);
      return { improved: false, attrs: {} };
    }
    return { improved: false, attrs: {} };
  }
  if (player.idade >= 25 || player.stats.jogos < 8) return { improved: false, attrs: {} };

  const growthPot = calculateGrowthPotential(player, snapsJogados);

  const attrsToImprove: Partial<Record<AttrKey, number>> = {};
  const positionAttrs = POSITION_ATTRS[player.pos] || [];
  const focusAttrs = FOCUS_ATTRS[focus] || [];
  
  // Combina atributos da posição com foco de treino
  const allAttrs = [...new Set([...positionAttrs, ...focusAttrs])];
  
  // Chance base de melhoria
  let baseChance = 0.3;
  if (snapsJogados >= 48) baseChance += 0.2;
  if (focus === 'FISICO') baseChance += 0.1;
  if (intensity === 'INTENSO') baseChance += 0.05;
  if (intensity === 'LEVE') baseChance -= 0.05;
  baseChance += growthPot * 0.1;
  
  // Bônus por moral alta
  if (player.moral >= 75) {
    baseChance += 0.1;
  } else if (player.moral <= 40) {
    baseChance -= 0.1;
  }

  // Bônus por ser rookie em seu primeiro ano
  if (player.rookie && player.jogosCarreira <= 5) {
    baseChance += 0.15;
  }

  for (const attr of allAttrs) {
    const currentAttr = player.attrs[attr as keyof typeof player.attrs];
    
    // Atributos baixos crescem mais facilmente
    const roomForGrowth = (100 - currentAttr) / 100;
    const improvementChance = Math.min(0.95, baseChance * roomForGrowth);
    
    // RNG simples para determinar se houve melhoria
    const roll = Math.random();
    if (roll < improvementChance) {
      const improvement = Math.random() < 0.7 ? 1 : 2; // 70% chance de +1, 30% de +2
      attrsToImprove[attr as keyof typeof attrsToImprove] = improvement;
    }
  }

  // Aplica melhorias aos atributos
  let totalImprovement = 0;
  for (const [attr, value] of Object.entries(attrsToImprove)) {
    const key = attr as AttrKey;
    player.attrs[key] = Math.min(99, player.attrs[key] + value);
    totalImprovement += value;
  }

  // Recalcula OVR se houve melhoria
  if (totalImprovement > 0) {
    player.ovr = recalculateOVR(player);
  }

  return { 
    improved: totalImprovement > 0, 
    attrs: attrsToImprove 
  };
}

/**
 * Recalcula o OVR (overall) baseado nos atributos atuais
 */
export function recalculateOVR(player: Player): number {
  const attrs = player.attrs;
  const pos = player.pos;

  // Pesos diferentes por posição
  switch (pos) {
    case 'QB':
      return Math.round(
        attrs.passe * 0.5 +
        attrs.corrida * 0.2 +
        attrs.velocidade * 0.15 +
        attrs.resistencia * 0.15
      );
    case 'RB':
      return Math.round(
        attrs.corrida * 0.4 +
        attrs.recepcao * 0.25 +
        attrs.velocidade * 0.2 +
        attrs.bloqueio * 0.15
      );
    case 'WR':
    case 'TE':
      return Math.round(
        attrs.recepcao * 0.45 +
        attrs.velocidade * 0.3 +
        attrs.bloqueio * 0.15 +
        attrs.resistencia * 0.1
      );
    case 'OL':
      return Math.round(
        attrs.bloqueio * 0.6 +
        attrs.resistencia * 0.2 +
        attrs.velocidade * 0.2
      );
    case 'DL':
    case 'LB':
      return Math.round(
        attrs.tackle * 0.5 +
        attrs.resistencia * 0.3 +
        attrs.velocidade * 0.2
      );
    case 'CB':
    case 'S':
      return Math.round(
        attrs.tackle * 0.35 +
        attrs.velocidade * 0.35 +
        attrs.resistencia * 0.2 +
        attrs.recepcao * 0.1
      );
    case 'K':
    case 'P':
      return Math.round(
        attrs.chute * 0.7 +
        attrs.resistencia * 0.2 +
        attrs.velocidade * 0.1
      );
    default:
      return Math.round(
        (attrs.passe + attrs.corrida + attrs.recepcao + attrs.bloqueio +
         attrs.tackle + attrs.chute + attrs.velocidade + attrs.resistencia) / 8
      );
  }
}

/**
 * Interface para o estado do centro de treinamento
 */
export interface TrainingCenterState {
  focus: Focus;
  intensity: 'LEVE' | 'NORMAL' | 'INTENSO';
  playersTraining: string[]; // IDs dos jogadores em foco
}

/**
 * Simula uma semana de treino no centro de treinamento
 */
export function simulateTrainingWeek(
  players: Player[],
  state: TrainingCenterState,
  snapsPorJogador: Record<string, number>
): { playerId: string; nome: string; improvements: Record<string, number> }[] {
  const results: { playerId: string; nome: string; improvements: Record<string, number> }[] = [];

  for (const player of players) {
    const snaps = snapsPorJogador[player.id] || 0;
    const result = applyPlayerDevelopment(player, state.focus, snaps, 0, state.intensity);
    
    if (result.improved) {
      results.push({
        playerId: player.id,
        nome: player.nome,
        improvements: result.attrs as Record<string, number>,
      });
    }
  }

  return results;
}
