/* ============================================================
 * Negociações de contrato — jogadores e comissão técnica.
 * Fórmula de felicidade: salário (40) + duração (20) +
 * situação/momento (25) + moral/lealdade (15). Aceitação segue
 * o % com ±10 de personalidade.
 * ============================================================ */

import type { ContractOffer, ContractStructure, Player, PlayerContract, Staff } from './types';
import { Rng, clamp } from './rng';

/* ---------- contrato estruturado ---------- */
/** Pesos de distribuição do salário-base por estrutura (normalizados p/ qualquer duração). */
function structureWeights(structure: ContractStructure, years: number): number[] {
  if (years <= 1) return [100];
  const t = years - 1; // 0..4
  const w: number[] = [];
  for (let i = 0; i < years; i++) {
    const frac = i / t; // 0 (ano 1) .. 1 (último ano)
    if (structure === 'FRONT') w.push(1.5 - frac);        // decrescente
    else if (structure === 'BACK') w.push(0.5 + frac);    // crescente
    else w.push(1);                                        // uniforme
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => (x / sum) * 100);
}

/** Constrói um PlayerContract a partir da oferta (cap hits incluem bônus amortizado). */
export function makeContract(o: ContractOffer): PlayerContract {
  const years = clamp(o.years, 1, 5);
  const total = Math.round(o.base * years * 10) / 10;
  const ws = structureWeights(o.structure, years);
  const amort = o.bonus / years;
  const capHits = ws.map(pct => Math.round((total * pct / 100 + amort) * 10) / 10);
  // garantido: bônus (sempre) + base do ano 1 (proteção contra corte)
  const baseAno1 = total * ws[0] / 100;
  const guaranteed = Math.round((o.bonus + baseAno1) * 10) / 10;
  return { years, total, bonus: o.bonus, structure: o.structure, capHits, guaranteed };
}

export const STRUCT_LABEL: Record<ContractStructure, string> = {
  FRONT: 'Frontloaded', BALANCED: 'Balanceado', BACK: 'Backloaded',
};

/* ---------- valor de mercado ---------- */
export function marketValue(ovr: number, idade: number, inflacao = 1): number {
  const base = 0.62 + Math.pow(Math.max(0, ovr - 50) / 40, 4.4) * 33;
  const ageMult = idade <= 25 ? 1.1 : idade >= 31 ? 0.88 : 1;
  return Math.max(0.6, Math.round(base * ageMult * inflacao * 10) / 10);
}

/** Valor anual pedido pelo staff (nível 1..5 + experiência). */
export function staffMarketValue(nivel: number, experiencia: number): number {
  return Math.round((0.6 + nivel * nivel * 0.55 + experiencia * 0.03) * 10) / 10;
}

/* ---------- expectativas ---------- */
export interface Expectations { anos: number; aav: number; }

export function playerExpectations(p: Player, inflacao = 1): Expectations {
  const anos = p.idade < 25 ? 4 : p.idade <= 30 ? 3 : p.idade <= 33 ? 2 : 1;
  const estrela = p.ovr >= 85 ? 1.15 : p.ovr >= 78 ? 1.05 : 1;
  return { anos, aav: Math.round(marketValue(p.ovr, p.idade, inflacao) * estrela * 10) / 10 };
}

export function staffExpectations(st: Staff): Expectations {
  const anos = st.nivel >= 4 ? 3 : 2;
  return { anos, aav: staffMarketValue(st.nivel, st.experiencia) };
}

/* ---------- felicidade (0..100) ---------- */
export interface Happiness {
  value: number;
  partes: { salario: number; duracao: number; situacao: number; moral: number };
}

function salaryScore(oferta: number, pedido: number): number {
  const r = oferta / Math.max(0.1, pedido);
  if (r >= 1.10) return 100;
  if (r >= 1.00) return 70 + (r - 1.0) * 300;
  if (r >= 0.90) return 40 + (r - 0.9) * 300;
  return clamp(40 - (0.9 - r) * 250, 0, 40);
}

function yearsScore(oferta: number, pedido: number): number {
  const d = Math.abs(oferta - pedido);
  return d === 0 ? 100 : d === 1 ? 70 : d === 2 ? 40 : 15;
}

/** Negociação com JOGADOR. */
export function playerHappiness(p: Player, o: ContractOffer, inflacao = 1): Happiness {
  const exp = playerExpectations(p, inflacao);
  const salario = salaryScore(o.base, exp.aav);
  const duracao = yearsScore(o.years, exp.anos);
  // situação: último ano de contrato aceita mais fácil; estrela é exigente
  const situacao = p.contrato <= 1 ? 90 : p.ovr >= 85 ? 60 : 75;
  // moral + bônus de assinatura ajuda
  const moral = clamp(p.moral + (o.bonus > 0 ? 8 : 0), 0, 100);
  const value = Math.round(clamp(salario * 0.40 + duracao * 0.20 + situacao * 0.25 + moral * 0.15, 0, 100));
  return { value, partes: { salario: Math.round(salario), duracao: Math.round(duracao), situacao: Math.round(situacao), moral: Math.round(moral) } };
}

/** Negociação com TÉCNICO. */
export function staffHappiness(st: Staff, o: ContractOffer): Happiness {
  const exp = staffExpectations(st);
  const salario = salaryScore(o.base, exp.aav);
  const duracao = yearsScore(o.years, exp.anos);
  const situacao = st.contrato <= 1 ? 90 : st.nivel >= 4 ? 60 : 75;
  const moral = clamp(st.moral + (o.bonus > 0 ? 8 : 0), 0, 100);
  const value = Math.round(clamp(salario * 0.40 + duracao * 0.20 + situacao * 0.25 + moral * 0.15, 0, 100));
  return { value, partes: { salario: Math.round(salario), duracao: Math.round(duracao), situacao: Math.round(situacao), moral: Math.round(moral) } };
}

/* ---------- aceite com personalidade (±10) ---------- */
export function acceptanceRoll(value: number, rng: Rng): boolean {
  const efetivo = clamp(value + rng.int(-10, 10), 0, 100);
  return rng.chance(efetivo / 100);
}

export const happinessVerdict = (v: number) =>
  v >= 75 ? 'Muito inclinado a aceitar' :
    v >= 55 ? 'Proposta competitiva' :
      v >= 40 ? 'Hesitante — quer mais' : 'Provável recusa';

export const fmtM = (v: number) => `$${v.toFixed(1).replace('.', ',')}M`;
