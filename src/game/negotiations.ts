/* ============================================================
 * Contratos & negociações — jogadores e comissão técnica.
 * Sistema de felicidade: dinheiro, duração, moral → rolagem.
 * ============================================================ */

import type { ContractOffer, GameState, Player, Staff, Team } from './types';
import { Rng, clamp } from './rng';
import { capUsed, fmtM, pushNews, staffOf, teamById } from './season';

const r1 = (v: number) => Math.round(v * 10) / 10;

/* ================= jogadores ================= */
export function marketValue(p: Player, inflacao = 1): number {
  const base = 0.62 + Math.pow(Math.max(0, p.ovr - 50) / 40, 4.4) * 33;
  const posMult = p.pos === 'QB' ? 1.28 : p.pos === 'OL' ? 1.06 : p.pos === 'TE' ? 1.02 : p.pos === 'CB' ? 1.04 : p.pos === 'DL' ? 1.03 : 1;
  const ageMult = p.idade <= 25 ? 1.1 : p.idade >= 31 ? 0.88 : 1;
  return Math.max(0.6, r1(base * posMult * ageMult * inflacao));
}

export function suggestedOffer(p: Player, inflacao = 1): ContractOffer {
  const mv = marketValue(p, inflacao);
  const years = p.idade >= 31 ? 1 : p.idade >= 28 ? 2 : p.ovr >= 82 ? 4 : 3;
  return { years, base: mv, bonus: r1(mv * years * 0.12) };
}

export interface HappinessResult { value: number; parecer: string; fatores: { label: string; delta: number }[]; }

export function negotiationHappiness(p: Player, offer: ContractOffer, inflacao = 1): HappinessResult {
  const expAav = marketValue(p, inflacao);
  const fatores: { label: string; delta: number }[] = [];
  let h = 50;

  const aavOferta = r1(offer.base + offer.bonus / Math.max(1, offer.years));
  const dDinheiro = clamp((aavOferta / Math.max(0.1, expAav) - 1) * 130, -45, 45);
  h += dDinheiro;
  fatores.push({ label: `Dinheiro (${aavOferta.toFixed(1)} vs ${expAav.toFixed(1)} esperado)`, delta: Math.round(dDinheiro) });

  const querCurto = p.idade < 27;
  const alvoAnos = querCurto ? 2 : p.idade >= 31 ? 1 : 3;
  const dAnos = clamp(8 - Math.abs(offer.years - alvoAnos) * 7, -15, 8);
  h += dAnos;
  fatores.push({ label: `Duração (${offer.years} ano${offer.years > 1 ? 's' : ''})`, delta: dAnos });

  const dBonus = clamp((offer.bonus / Math.max(1, offer.years)) * 1.4, 0, 10);
  h += dBonus;
  fatores.push({ label: 'Bônus de assinatura', delta: Math.round(dBonus) });

  const dMoral = clamp((p.moral - 60) / 8, -6, 6);
  h += dMoral;
  fatores.push({ label: 'Relação com o clube', delta: Math.round(dMoral) });

  h = clamp(Math.round(h), 2, 98);
  const parecer = h >= 75 ? 'Assina empolgado' : h >= 55 ? 'Tende a aceitar' : h >= 38 ? 'Hesita — quer mais' : 'Deve recusar';
  return { value: h, parecer, fatores };
}

export const acceptanceRoll = (happiness: number, rng: Rng) => happiness >= rng.f(20, 95);

export function signWithOffer(s: GameState, playerId: string, o: ContractOffer, rng: Rng): { ok: boolean; msg: string } {
  const p = s.faPool.find(x => x.id === playerId);
  if (!p) return { ok: false, msg: 'Jogador não está mais no mercado.' };
  const usados = capUsed(s, s.userTeam);
  const capDepois = r1(usados + o.base + o.bonus / Math.max(1, o.years));
  if (capDepois > s.settings.cap)
    return { ok: false, msg: `Estouraria o cap: ${fmtM(capDepois)} > ${fmtM(s.settings.cap)}.` };
  const ativos = s.players.filter(x => x.teamId === s.userTeam && x.status !== 'PS').length;
  if (ativos >= 53) return { ok: false, msg: 'Elenco cheio (53). Dispense alguém antes.' };
  const dec = negotiationHappiness(p, o, s.settings.inflacao);
  if (!acceptanceRoll(dec.value, rng))
    return { ok: false, msg: `${p.nome} recusou a oferta (${dec.parecer.toLowerCase()}, felicidade ${dec.value}%).` };

  s.faPool = s.faPool.filter(x => x.id !== playerId);
  p.teamId = s.userTeam; p.status = 'RES';
  p.contrato = o.years; p.salario = o.base; p.bonus = o.bonus; p.origem = undefined;
  p.moral = Math.min(95, p.moral + 12);
  s.players.push(p);
  const t = teamById(s, s.userTeam);
  pushNews(s, 'CONTRATAÇÃO', `${t.cidade} ${t.nome} contrata ${p.nome} (${p.pos}, OVR ${p.ovr}): ${o.years} ano(s), ${fmtM(o.base)}/ano + ${fmtM(o.bonus)} de luvas.`);
  return { ok: true, msg: `${p.nome} assinou! (felicidade ${dec.value}%)` };
}

export function renewPlayer(s: GameState, playerId: string, o: ContractOffer, rng: Rng): { ok: boolean; msg: string } {
  const p = s.players.find(x => x.id === playerId);
  if (!p || p.teamId !== s.userTeam) return { ok: false, msg: 'Jogador inválido.' };
  const usados = capUsed(s, s.userTeam);
  const semEle = usados - (p.salario + (p.bonus > 0 && p.contrato > 0 ? p.bonus / p.contrato : 0));
  const capDepois = r1(semEle + o.base + o.bonus / Math.max(1, o.years));
  if (capDepois > s.settings.cap)
    return { ok: false, msg: `Cap insuficiente: renovaria em ${fmtM(capDepois)} (teto ${fmtM(s.settings.cap)}).` };
  const dec = negotiationHappiness(p, o, s.settings.inflacao);
  if (!acceptanceRoll(dec.value, rng))
    return { ok: false, msg: `${p.nome} recusou a renovação (${dec.parecer.toLowerCase()}, felicidade ${dec.value}%).` };
  p.contrato = o.years; p.salario = o.base; p.bonus = o.bonus; p.tag = false;
  p.moral = Math.min(95, p.moral + 8);
  pushNews(s, 'RENOVAÇÃO', `${p.nome} (${p.pos}, OVR ${p.ovr}) renova: ${o.years} ano(s), ${fmtM(o.base)}/ano.`);
  return { ok: true, msg: `${p.nome} renovou! (felicidade ${dec.value}%)` };
}

/* ================= comissão técnica ================= */
export function staffValue(st: Staff, inflacao = 1): number {
  return Math.max(0.4, r1((0.6 + st.nivel * 1.05 + st.experiencia * 0.07) * (st.nivel >= 4 ? 1.35 : 1) * inflacao));
}

export function suggestedStaffOffer(st: Staff, inflacao = 1): ContractOffer {
  const v = staffValue(st, inflacao);
  return { years: st.nivel >= 4 ? 3 : 2, base: v, bonus: r1(v * 0.5) };
}

export function staffHappiness(st: Staff, o: ContractOffer, inflacao = 1): HappinessResult {
  const exp = staffValue(st, inflacao);
  const fatores: { label: string; delta: number }[] = [];
  let h = 50;
  const aav = r1(o.base + o.bonus / Math.max(1, o.years));
  const dDin = clamp((aav / Math.max(0.1, exp) - 1) * 120, -40, 40);
  h += dDin;
  fatores.push({ label: `Salário (${aav.toFixed(1)} vs ${exp.toFixed(1)} pedido)`, delta: Math.round(dDin) });
  const dAnos = clamp((o.years - (st.experiencia >= 15 ? 2 : 3)) * -4 + 6, -10, 8);
  h += dAnos;
  fatores.push({ label: `Duração (${o.years} ano${o.years > 1 ? 's' : ''})`, delta: dAnos });
  const dMoral = clamp((st.moral - 60) / 8, -6, 6);
  h += dMoral;
  fatores.push({ label: 'Relação com a franquia', delta: Math.round(dMoral) });
  h = clamp(Math.round(h), 2, 98);
  const parecer = h >= 75 ? 'Aceita na hora' : h >= 55 ? 'Tende a aceitar' : h >= 38 ? 'Hesita — quer mais' : 'Deve recusar';
  return { value: h, parecer, fatores };
}

const STAFF_LIMITE: Record<string, number> = {
  'Head Coach': 1, 'Coordenador Ofensivo': 1, 'Coordenador Defensivo': 1,
  'Médico': 1, 'Preparador Físico': 1, 'Olheiro': 1,
};

export function hireStaff(s: GameState, staffId: string, o: ContractOffer, rng: Rng): { ok: boolean; msg: string } {
  const st = s.staffPool.find(x => x.id === staffId);
  if (!st) return { ok: false, msg: 'Profissional não está mais no mercado.' };
  const t = teamById(s, s.userTeam);
  const meus = staffOf(s, t.id);
  const limite = STAFF_LIMITE[st.funcao] ?? 1;
  if (meus.filter(x => x.funcao === st.funcao).length >= limite)
    return { ok: false, msg: `Você já tem ${limite} ${st.funcao}(s). Dispense antes de contratar.` };
  const custo = o.base + o.bonus;
  if (t.dinheiro < custo)
    return { ok: false, msg: `Caixa insuficiente: precisa de ${fmtM(custo)}, tem ${fmtM(t.dinheiro)}.` };
  const dec = staffHappiness(st, o, s.settings.inflacao);
  if (!acceptanceRoll(dec.value, rng))
    return { ok: false, msg: `${st.nome} recusou (${dec.parecer.toLowerCase()}, felicidade ${dec.value}%).` };
  t.dinheiro = r1(t.dinheiro - custo);
  s.staffPool = s.staffPool.filter(x => x.id !== staffId);
  st.teamId = t.id; st.contrato = o.years; st.salario = o.base; st.bonus = o.bonus;
  st.moral = Math.min(95, st.moral + 12); st.origem = undefined;
  s.staff.push(st);
  pushNews(s, 'COMISSÃO', `${t.cidade} contrata ${st.funcao} ${st.nome} (nv. ${st.nivel}): ${o.years} ano(s), ${fmtM(o.base)}/ano.`);
  return { ok: true, msg: `${st.nome} contratado! (felicidade ${dec.value}%)` };
}

export function renewStaff(s: GameState, staffId: string, o: ContractOffer, rng: Rng): { ok: boolean; msg: string } {
  const st = s.staff.find(x => x.id === staffId);
  if (!st || st.teamId !== s.userTeam) return { ok: false, msg: 'Profissional não está na sua comissão.' };
  const t = teamById(s, s.userTeam);
  const custo = o.base + o.bonus;
  if (t.dinheiro < custo) return { ok: false, msg: `Caixa insuficiente: precisa de ${fmtM(custo)}, tem ${fmtM(t.dinheiro)}.` };
  const dec = staffHappiness(st, o, s.settings.inflacao);
  if (!acceptanceRoll(dec.value, rng))
    return { ok: false, msg: `${st.nome} recusou a renovação (${dec.parecer.toLowerCase()}, felicidade ${dec.value}%).` };
  t.dinheiro = r1(t.dinheiro - custo);
  st.contrato = o.years; st.salario = o.base; st.bonus = o.bonus;
  st.moral = Math.min(95, st.moral + 8);
  pushNews(s, 'COMISSÃO', `${st.funcao} ${st.nome} renova: ${o.years} ano(s), ${fmtM(o.base)}/ano.`);
  return { ok: true, msg: `${st.nome} renovou! (felicidade ${dec.value}%)` };
}

export function fireStaff(s: GameState, staffId: string): { ok: boolean; msg: string } {
  const st = s.staff.find(x => x.id === staffId);
  if (!st || st.teamId !== s.userTeam) return { ok: false, msg: 'Profissional não está na sua comissão.' };
  const t = teamById(s, s.userTeam);
  const multa = r1(st.salario * Math.max(0, st.contrato - 1) * 0.5);
  t.dinheiro = r1(t.dinheiro - multa);
  s.staff = s.staff.filter(x => x.id !== staffId);
  st.teamId = null; st.origem = t.id; st.contrato = 0; st.bonus = 0;
  st.moral = clamp(st.moral - 15, 20, 100);
  s.staffPool.push(st);
  pushNews(s, 'COMISSÃO', `${t.cidade} dispensa ${st.funcao} ${st.nome}${multa > 0 ? ` (multa de ${fmtM(multa)})` : ''}.`);
  return { ok: true, msg: `${st.nome} dispensado${multa > 0 ? ` — multa de ${fmtM(multa)} paga` : ''}.` };
}

/** Virada de temporada da comissão: experiência++, contratos--, IA renova, expirados → mercado, reposição. */
export function staffTurnover(s: GameState, rng: Rng) {
  const infl = s.settings.inflacao;
  // experiência e moral
  for (const st of [...s.staff, ...s.staffPool]) {
    st.experiencia++;
    st.moral = clamp(st.moral + rng.int(-4, 6), 30, 95);
  }
  // consome contratos
  for (const st of [...s.staff]) {
    st.contrato--;
    if (st.contrato > 0) continue;
    const t = st.teamId ? teamById(s, st.teamId) : null;
    // IA renova os bons
    if (t && st.nivel >= 3 && rng.chance(0.75)) {
      const anos = st.nivel >= 4 ? 3 : 2;
      const base = r1(staffValue(st, infl) * rng.f(0.92, 1.05));
      st.contrato = anos; st.salario = base; st.bonus = 0;
      continue;
    }
    if (t) {
      s.staff = s.staff.filter(x => x.id !== st.id);
      st.origem = t.id;
      if (t.id === s.userTeam && st.nivel >= 4)
        pushNews(s, 'COMISSÃO', `${st.funcao} ${st.nome} (nv. ${st.nivel}) deixou sua comissão — está no mercado!`);
    }
    st.teamId = null; st.contrato = 0; st.bonus = 0;
    s.staffPool.push(st);
  }
  // reposição automática das IAs (mantém as 5 funções)
  const FUNCS = ['Head Coach', 'Coordenador Ofensivo', 'Coordenador Defensivo', 'Médico', 'Preparador Físico', 'Olheiro'] as const;
  for (const t of s.teams) {
    if (t.id === s.userTeam) continue;
    for (const fn of FUNCS) {
      if (staffOf(s, t.id).some(x => x.funcao === fn)) continue;
      const cand = s.staffPool.filter(x => x.funcao === fn).sort((a, b) => b.nivel - a.nivel)[0];
      if (cand) {
        s.staffPool = s.staffPool.filter(x => x.id !== cand.id);
        cand.teamId = t.id; cand.contrato = 2;
        cand.salario = r1(staffValue(cand, infl) * rng.f(0.9, 1.0));
        s.staff.push(cand);
      }
    }
  }
}
