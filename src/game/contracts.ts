/* ============================================================
 * 💼 SISTEMA DE CONTRATOS — lógica pura (sem dependência de UI)
 *  - Estruturas: Frontloaded / Balanced / Backloaded
 *  - Expectativas do jogador por idade
 *  - Fórmula de Happiness (chance de aceitação)
 *  - Holdout / Franchise Tag / bônus de lealdade
 * ============================================================ */

import type { ContractOffer, ContractStructure, Player, PlayerContract, Pos } from './types';
import { Rng, clamp } from './rng';

/* ---------- estruturas de pagamento ---------- */
export const STRUCT_LABEL: Record<ContractStructure, string> = {
  FRONT: 'Frontloaded',
  BALANCED: 'Balanced',
  BACK: 'Backloaded',
};
export const STRUCT_DESC: Record<ContractStructure, string> = {
  FRONT: 'Mais dinheiro no início — preferido por veteranos 30+',
  BALANCED: 'Distribuição uniforme (25%/ano) — preferido aos 27–30',
  BACK: 'Mais dinheiro no final — preferido por jovens 22–27',
};

/** pesos (%) por ano, indexados por duração (1..5) */
const FRONT_W: number[][] = [
  [100],
  [60, 40],
  [45, 32, 23],
  [35, 30, 22.5, 12.5],
  [30, 26, 21, 14, 9],
];
const BACK_W: number[][] = FRONT_W.map(ws => [...ws].reverse());

export function weightsFor(structure: ContractStructure, years: number): number[] {
  const n = clamp(years, 1, 5);
  if (structure === 'FRONT') return FRONT_W[n - 1];
  if (structure === 'BACK') return BACK_W[n - 1];
  return Array(n).fill(Math.round((100 / n) * 10) / 10);
}

export const preferredStructure = (idade: number): ContractStructure =>
  idade >= 30 ? 'FRONT' : idade <= 26 ? 'BACK' : 'BALANCED';

/* ---------- valor de mercado (curva compartilhada) ---------- */
const POS_MULT: Partial<Record<Pos, number>> = {
  QB: 1.28, OL: 1.06, TE: 1.02, CB: 1.04, DL: 1.03, S: 1.01,
};
export function baseMarketValue(ovr: number, pos: Pos, idade: number, inflacao = 1): number {
  const base = 0.62 + Math.pow(Math.max(0, ovr - 50) / 40, 4.4) * 33;
  const ageMult = idade <= 25 ? 1.1 : idade >= 31 ? 0.88 : 1;
  return Math.max(0.6, Math.round(base * (POS_MULT[pos] ?? 1) * ageMult * inflacao * 10) / 10);
}

/* ---------- contrato ---------- */
/** Fração do base do ano 1 que fica garantida, por estrutura (frontloaded protege mais). */
const GUARANTEED_FACTOR: Record<ContractStructure, number> = { FRONT: 0.6, BALANCED: 0.4, BACK: 0.2 };

export function makeContract(o: ContractOffer): PlayerContract {
  const years = clamp(o.years, 1, 5);
  const total = Math.round(o.base * years * 10) / 10;
  const ws = weightsFor(o.structure, years);
  const amort = o.bonus / years;
  const capHits = ws.map(w => Math.round((total * w / 100 + amort) * 10) / 10);
  const baseAno1 = total * ws[0] / 100;
  const guaranteed = Math.round((o.bonus + baseAno1 * GUARANTEED_FACTOR[o.structure]) * 10) / 10;
  return { years, total, bonus: o.bonus, structure: o.structure, capHits, guaranteed };
}
export const offerCapHit = (o: ContractOffer): number => makeContract(o).capHits[0];

/* ---------- expectativas do jogador ---------- */
export interface Expectations {
  anos: number;
  aav: number;
  structure: ContractStructure;
  total: number;
}
export function calcExpectations(p: Player, inflacao = 1): Expectations {
  // idade <25: espera 4-5 anos · 25-30: 3-5 · 30+: 1-3
  const anos = p.idade < 25 ? 4 : p.idade <= 27 ? 4 : p.idade <= 30 ? 3 : p.idade <= 32 ? 2 : 1;
  const aav = baseMarketValue(p.ovr, p.pos, p.idade, inflacao);
  const structure = preferredStructure(p.idade);
  return { anos, aav, structure, total: Math.round(aav * anos * 10) / 10 };
}

/* ---------- fórmula de happiness ---------- */
export interface Happiness {
  salary: number;      // 0..100
  years: number;
  structure: number;
  situation: number;
  lealdade: number;    // +10 em renovações
  total: number;       // 0..100
}
export function negotiationHappiness(
  p: Player, o: ContractOffer, inflacao: number, opts?: { lealdade?: boolean },
): Happiness {
  const exp = calcExpectations(p, inflacao);
  const mv = exp.aav;

  // salário: +10% = 100 · no valor = 70 · -10% = 40 (linear, clamp)
  const ratio = mv > 0 ? o.base / mv : 2;
  const salary = clamp(Math.round(70 + (ratio - 1) * 300), 0, 100);

  // duração: exato = 100 · ±1 = 70 · ±2 = 40 · além = 10
  const diff = Math.abs(o.years - exp.anos);
  const years = diff === 0 ? 100 : diff === 1 ? 70 : diff === 2 ? 40 : 10;

  // estrutura: match = 100 · balanced intermediário = 70 · mismatch = 40
  const structure = o.structure === exp.structure
    ? 100
    : (o.structure === 'BALANCED' || exp.structure === 'BALANCED') ? 70 : 40;

  // situação: último ano = 90 (alavancagem) · estrela = 60 · normal = 75
  const situation = p.contrato <= 1 ? 90 : p.ovr >= 85 ? 60 : 75;

  const lealdade = opts?.lealdade ? 10 : 0;
  const total = clamp(Math.round(
    salary * 0.40 + years * 0.20 + structure * 0.20 + situation * 0.20 + lealdade,
  ), 0, 100);

  return { salary, years, structure, situation, lealdade, total };
}

/** A negociação segue o % exibido, com variação de personalidade ±10. */
export function acceptanceRoll(total: number, rng: Rng): boolean {
  const chance = clamp((total + rng.f(-10, 10)) / 100, 0.02, 0.98);
  return rng.chance(chance);
}

export function happinessVerdict(total: number): { label: string; tone: 'good' | 'mid' | 'bad' } {
  if (total >= 70) return { label: 'Provável aceite', tone: 'good' };
  if (total >= 40) return { label: 'Na corda bamba', tone: 'mid' };
  return { label: 'Agente vai recusar', tone: 'bad' };
}

/* ---------- regras especiais ---------- */
/** Holdout: último ano de contrato + happiness-baseline < 40% → recusa jogar. */
export function shouldHoldout(p: Player, inflacao: number): boolean {
  if (p.contrato !== 1 || p.tag || p.holdout) return false;
  if (p.ovr < 74) return false; // só jogadores relevantes pressionam
  const mv = baseMarketValue(p.ovr, p.pos, p.idade, inflacao);
  const ratio = mv > 0 ? p.salario / mv : 1;
  // salário muito abaixo do mercado → happiness-baseline < 40%
  return ratio < 0.88;
}

/** Franchise Tag: 1 ano, salário médio dos top 5 da posição na liga. */
export function franchiseTagValue(pos: Pos, allPlayers: Player[]): number {
  const top = allPlayers
    .filter(p => p.pos === pos && p.teamId !== null)
    .sort((a, b) => b.salario - a.salario)
    .slice(0, 5);
  if (!top.length) return 8;
  const avg = top.reduce((s, p) => s + p.salario, 0) / top.length;
  return Math.max(8, Math.round(avg * 10) / 10);
}
export function makeTagContract(value: number): PlayerContract {
  return makeContract({ years: 1, base: value, bonus: 0, structure: 'BALANCED' });
}
