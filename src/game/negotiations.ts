/* ============================================================
 * Negociações — comissão técnica (staff).
 * Jogadores usam contracts.ts; staff usa felicidade própria.
 * ============================================================ */

import type { ContractOffer, Staff } from './types';
import { Rng, clamp } from './rng';

export interface Expectations { anos: number; aav: number; }

/** Valor anual pedido pelo staff (nível 1..5 + experiência). */
export function staffMarketValue(nivel: number, experiencia: number): number {
  return Math.round((0.6 + nivel * nivel * 0.55 + experiencia * 0.03) * 10) / 10;
}

export function staffExpectations(st: Staff): Expectations {
  const anos = st.nivel >= 4 ? 3 : 2;
  return { anos, aav: staffMarketValue(st.nivel, st.experiencia) };
}

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

export function staffHappiness(st: Staff, o: ContractOffer): Happiness {
  const exp = staffExpectations(st);
  const salario = salaryScore(o.base, exp.aav);
  const duracao = yearsScore(o.years, exp.anos);
  const situacao = st.contrato <= 1 ? 90 : st.nivel >= 4 ? 60 : 75;
  const moral = clamp(st.moral + (o.bonus > 0 ? 8 : 0), 0, 100);
  const value = Math.round(clamp(salario * 0.40 + duracao * 0.20 + situacao * 0.25 + moral * 0.15, 0, 100));
  return { value, partes: { salario: Math.round(salario), duracao: Math.round(duracao), situacao: Math.round(situacao), moral: Math.round(moral) } };
}

export function staffAcceptanceRoll(value: number, rng: Rng): boolean {
  const efetivo = clamp(value + rng.int(-10, 10), 0, 100);
  return rng.chance(efetivo / 100);
}

export const fmtM = (v: number) => `$${v.toFixed(1).replace('.', ',')}M`;
