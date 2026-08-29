/* ============================================================
 * NFLMatchEngine — coração da simulação (pura, sem UI)
 * Lógica central: DOWNS & YARDS, drive a drive.
 * Emite eventos ao vivo (play/turnover/score/quarter/qb/nerves).
 * ============================================================ */

import type {
  AttrKey, GameResult, InjuryReport, LineTipo, LiveEvent, PlayLine, Player,
  PlayerStats, Pos, Staff, Team,
} from './types';
import { Rng, clamp } from './rng';
import { INJ_TYPES, STARTER_SLOTS } from './data';

export interface Side { team: Team; players: Player[]; staff: Staff[]; pressao: number; }
interface ScrimRes {
  yds: number; ball: number; secs: number; turnover: boolean; td: boolean;
  fgMade: boolean; passY: number; rushY: number;
  gain: { p: Player; tipo: 'run' | 'pass'; yds: number } | null;
  faltaTeam?: 'off' | 'def'; // qual lado cometeu a penalidade (p/ estatísticas ao vivo)
}
interface DriveOutcome { pts: number; secs: number; net: number; passY: number; rushY: number; tos: number; }

interface ClimaDef { nome: string; icon: string; pass: number; run: number; fg: number; }
const CLIMAS: { c: ClimaDef; w: number }[] = [
  { c: { nome: 'Ensolarado', icon: '☀', pass: 0, run: 0, fg: 0 }, w: 50 },
  { c: { nome: 'Nublado', icon: '☁', pass: -2, run: -1, fg: -1 }, w: 20 },
  { c: { nome: 'Chuva', icon: '🌧', pass: -7, run: -2, fg: -3 }, w: 13 },
  { c: { nome: 'Vento forte', icon: '🌬', pass: -5, run: -1, fg: -6 }, w: 9 },
  { c: { nome: 'Neve', icon: '❄', pass: -9, run: -4, fg: -5 }, w: 8 },
];

/* risco de lesão por posição (contato/desgaste) */
const INJ_POS_MULT: Record<Pos, number> = {
  QB: 0.9, RB: 1.6, WR: 1.2, TE: 1.2, OL: 1.5,
  DL: 1.4, LB: 1.3, CB: 1.0, S: 1.05, K: 0.3, P: 0.3,
};

interface Unit {
  team: Team;
  qb: Player | null; qbBackup: boolean; qbs: Player[];
  rbs: Player[]; wrs: Player[]; te: Player | null; ol: Player[];
  k: Player | null; p: Player | null;
  dl: Player[]; lb: Player[]; cb: Player[]; s: Player[];
  passOff: number; runOff: number; passProt: number;
  runDef: number; passRush: number; coverage: number;
  gaps: string[];
}

const avg = (ps: Player[], k: AttrKey, n?: number) => {
  const list = n ? ps.slice(0, n) : ps;
  if (!list.length) return 40;
  return list.reduce((s, p) => s + p.attrs[k], 0) / list.length;
};

const shortName = (nome: string) => {
  const parts = nome.split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : nome;
};
const ORD = ['1ª', '2ª', '3ª', '4ª'];

function buildUnit(side: Side): Unit {
  const pickPos = (pos: Pos): Player[] =>
    side.players
      .filter(p => p.pos === pos && p.lesao === 0 && p.status !== 'PS')
      .sort((a, b) => (a.status === b.status ? b.ovr - a.ovr : a.status === 'TIT' ? -1 : 1));
  const slots = (pos: Pos) => pickPos(pos).slice(0, STARTER_SLOTS[pos] ?? 1);
  const all = (pos: Pos) => pickPos(pos);

  const qbs = all('QB');
  const rbs = all('RB'); const wrs = all('WR'); const tes = all('TE');
  const ol = slots('OL'); const k = slots('K')[0] ?? null; const p = slots('P')[0] ?? null;
  const dl = slots('DL'); const lb = slots('LB'); const cb = slots('CB'); const s = slots('S');

  const gaps: string[] = [];
  if (!qbs.length) gaps.push('SEM QB DISPONÍVEL');
  if (ol.length < 5) gaps.push(`OL incompleta (${ol.length}/5)`);
  if (!rbs.length) gaps.push('sem RB');
  if (!wrs.length) gaps.push('sem WR');
  if (!dl.length) gaps.push('sem DL');

  const qb = qbs[0] ?? null;
  const qbBackup = !!qb && qb.status !== 'TIT';
  const te = tes[0] ?? null;
  const olBlo = avg(ol, 'bloqueio');
  const wrRec = avg(wrs, 'recepcao', 3);
  const teRec = te ? te.attrs.recepcao : 55;
  const rbCor = avg(rbs, 'corrida', 2);
  const rbBlo = avg(rbs, 'bloqueio', 2);
  const db = (ps: Player[]) => ps.map(x => x.attrs.tackle * 0.45 + x.attrs.velocidade * 0.3 + x.attrs.recepcao * 0.25);

  return {
    team: side.team, qb, qbBackup, qbs, rbs, wrs, te, ol, k, p, dl, lb, cb, s,
    passOff: qb ? qb.attrs.passe * 0.5 + wrRec * 0.22 + teRec * 0.1 + olBlo * 0.18 : 25,
    runOff: rbCor * 0.55 + olBlo * 0.35 + (qb ? qb.attrs.corrida * 0.1 : 0),
    passProt: olBlo * 0.62 + (te ? te.attrs.bloqueio * 0.18 : 10) + rbBlo * 0.2,
    runDef: avg(dl, 'tackle') * 0.5 + avg(lb, 'tackle') * 0.5,
    passRush: avg(dl, 'tackle') * 0.6 + avg(lb, 'tackle') * 0.4,
    coverage: (cb.length ? db(cb.slice(0, 3)).reduce((a, b) => a + b, 0) / Math.min(3, cb.length) : 45) * 0.6
      + (s.length ? db(s.slice(0, 2)).reduce((a, b) => a + b, 0) / Math.min(2, s.length) : 45) * 0.4,
    gaps,
  };
}

export class NFLMatchEngine {
  private lines: PlayLine[] = [];
  private events: LiveEvent[] = [];
  private deltas: Record<string, Partial<PlayerStats>> = {};
  private partes: Set<string> = new Set();
  private lesoes: InjuryReport[] = [];
  private clima!: ClimaDef;
  private uc!: Unit; private uf!: Unit;
  private scoreC = 0; private scoreF = 0;
  private injFactor = 1;
  private clock = 0;
  private snaps = new Map<string, number>();
  private faltasC = 0; private faltasF = 0;

  constructor(
    private casa: Side,
    private fora: Side,
    private rng: Rng,
    private opts?: { neutro?: boolean; clima?: ClimaDef },
  ) {
    if (opts?.clima) this.clima = opts.clima;
  }

  /* ---------------- API ---------------- */
  simulate(matchId: string, faseLabel: string): GameResult {
    if (!this.clima) {
      const total = CLIMAS.reduce((s, x) => s + x.w, 0);
      let r = this.rng.next() * total;
      this.clima = CLIMAS[0].c;
      for (const { c, w } of CLIMAS) { r -= w; if (r <= 0) { this.clima = c; break; } }
    }
    this.uc = buildUnit(this.casa);
    this.uf = buildUnit(this.fora);
    const staffLvl = (st: Staff[], fn: string) => st.find(s => s.funcao === fn)?.nivel ?? 3;
    this.applyMods(this.uc, this.casa, true);
    this.applyMods(this.uf, this.fora, false);
    this.injFactor = clamp(1 - (staffLvl(this.casa.staff, 'Médico') + staffLvl(this.fora.staff, 'Médico') - 6) * 0.08, 0.5, 1.3);

    const t = this.casa.team; const o = this.fora.team;
    this.say(`${faseLabel} — ${t.cidade} ${t.nome} × ${o.cidade} ${o.nome}`, 'info');
    this.say(`${t.estadioNome} • Clima: ${this.clima.nome} ${this.clima.icon}`, 'info');
    const pressao = this.casa.pressao;
    const quente = pressao >= 80 ? 'CALDEIRÃO FERVENDO' : pressao >= 65 ? 'torcida barulhenta' : pressao >= 45 ? 'bom público' : 'casa vazia';
    this.say(`Pressão da torcida: ${pressao}/100 — ${quente}.`, pressao >= 80 ? 'big' : 'info');
    const moralDesc = (m: number) => m >= 75 ? 'em alta — vestiário confiante' : m >= 55 ? 'estável' : m >= 40 ? 'abalada — clima tenso' : 'em crise';
    this.say(`Moral: ${t.sigla} ${Math.round(t.moral)} (${moralDesc(t.moral)}) × ${o.sigla} ${Math.round(o.moral)} (${moralDesc(o.moral)}).`, 'info');
    for (const u of [this.uc, this.uf]) for (const g of u.gaps)
      this.say(`Desfalque no ${u.team.sigla}: ${g}!`, 'pen');
    if (this.uc.qbBackup) this.say(`${t.sigla}: QB reserva em campo — ataque limitado.`, 'pen');
    if (this.uf.qbBackup) this.say(`${o.sigla}: QB reserva em campo — ataque limitado.`, 'pen');
    this.say('Bola no ar! Começa a partida.', 'info');

    for (const u of [this.uc, this.uf])
      for (const arr of [u.qb ? [u.qb] : [], u.rbs, u.wrs, u.te ? [u.te] : [], u.ol, u.dl, u.lb, u.cb, u.s, u.k ? [u.k] : [], u.p ? [u.p] : []])
        for (const p of arr) this.partes.add(p.id);

    const qC = [0, 0, 0, 0]; const qF = [0, 0, 0, 0];
    const tot = { yC: 0, yF: 0, rC: 0, rF: 0, pC: 0, pF: 0, toC: 0, toF: 0, sC: 0, sF: 0 };
    let clock = 0; let quarter = 0;
    let poss: 'casa' | 'fora' = this.rng.chance(0.5) ? 'casa' : 'fora';

    while (clock < 3600) {
      const off = poss === 'casa' ? this.uc : this.uf;
      const def = poss === 'casa' ? this.uf : this.uc;
      this.clock = clock;
      const res = this.drive(off, def);
      clock += res.secs;
      if (poss === 'casa') { tot.yC += res.net; tot.rC += res.rushY; tot.pC += res.passY; tot.toC += res.tos; tot.sC += res.secs; }
      else { tot.yF += res.net; tot.rF += res.rushY; tot.pF += res.passY; tot.toF += res.tos; tot.sF += res.secs; }
      if (res.pts > 0) {
        if (poss === 'casa') { this.scoreC += res.pts; qC[quarter] += res.pts; }
        else { this.scoreF += res.pts; qF[quarter] += res.pts; }
        this.emit({ kind: 'score', texto: '', placarCasa: this.scoreC, placarFora: this.scoreF, clock });
      }
      poss = poss === 'casa' ? 'fora' : 'casa';
      while (clock >= (quarter + 1) * 900 && quarter < 3) {
        quarter++;
        const txt = `— Fim do ${quarter}º quarto: ${t.sigla} ${this.scoreC} × ${this.scoreF} ${o.sigla} —`;
        this.log(txt, 'info');
        this.emit({ kind: 'quarter', texto: txt, quarter: quarter + 1, clock });
      }
      if (quarter === 3 && clock >= 3600) break;
    }

    // prorrogação
    if (this.scoreC === this.scoreF) {
      this.say('Tempo esgotado com empate — PRORROGAÇÃO! Morte súbita.', 'info');
      qC.push(0); qF.push(0);
      let ot = 0;
      while (ot < 8 && this.scoreC === this.scoreF) {
        const off = ot % 2 === 0 ? (poss === 'casa' ? this.uc : this.uf) : (poss === 'casa' ? this.uf : this.uc);
        const def = off === this.uc ? this.uf : this.uc;
        this.clock = 3600 + ot * 180;
        const res = this.drive(off, def);
        if (res.pts > 0) {
          if (off === this.uc) { this.scoreC += res.pts; qC[qC.length - 1] += res.pts; }
          else { this.scoreF += res.pts; qF[qF.length - 1] += res.pts; }
          if (ot % 2 === 1) break;
        }
        ot++;
      }
      if (this.scoreC === this.scoreF) this.say('Prorrogação sem pontos — partida termina EMPATADA.', 'info');
    }

    const winner = this.scoreC > this.scoreF ? t.sigla : this.scoreF > this.scoreC ? o.sigla : null;
    const fim = `FIM DE JOGO: ${t.cidade} ${t.sigla} ${this.scoreC} × ${this.scoreF} ${o.sigla} ${o.cidade}${winner ? ` — vitória do ${winner}!` : ' — empate.'}`;
    this.log(fim, 'score');
    this.emit({ kind: 'end', texto: fim, clock: this.clock });

    const publico = Math.round((t.estadio * 12500 + 9000 + t.moral * 90 + this.rng.f(0, 5000)) / 100) * 100;
    return {
      matchId, casaId: this.casa.team.id, foraId: this.fora.team.id,
      placarCasa: this.scoreC, placarFora: this.scoreF,
      clima: this.clima.nome, climaIcon: this.clima.icon,
      publico, log: this.lines, live: this.events,
      box: this.buildBox(qC, qF, tot), lesoes: this.lesoes,
      statDeltas: this.deltas, participantes: [...this.partes],
    };
  }

  /* ---------------- mods de contexto ---------------- */
  private applyMods(u: Unit, side: Side, isCasa: boolean) {
    const staffLvl = (fn: string) => side.staff.find(s => s.funcao === fn)?.nivel ?? 3;
    const moral = (side.team.moral - 55) / 14;
    // "12º homem": mando de campo cresce com a pressão da torcida
    const home = isCasa && !this.opts?.neutro ? 2.5 + Math.max(0, side.pressao - 55) / 25 : 0;
    const oc = (staffLvl('Coordenador Ofensivo') - 3) * 1.4;
    const dc = (staffLvl('Coordenador Defensivo') - 3) * 1.2;
    u.passOff += home + moral + this.clima.pass + oc;
    u.runOff += home + moral + this.clima.run + oc * 0.7;
    u.runDef += home + moral * 0.6 + this.clima.run * 0.4 + dc;
    u.passRush += home + moral * 0.6 + dc;
    u.coverage += home + moral * 0.6 + this.clima.pass * 0.3 + dc;
  }

  /** Nervosismo (Away Game Pressure): pressão do estádio + inexperiência do QB. */
  private nervousness(off: Unit): number {
    if (off === this.uc) return 0; // mandante não sofre pressão da própria torcida
    const qb = off.qb;
    if (!qb) return 0.5;
    const veteranoImune = qb.ovr > 85 && qb.jogosCarreira >= 50;
    let nerv = 0.25 + this.casa.pressao / 200;
    if (!veteranoImune) {
      if (qb.jogosCarreira < 10) nerv += 0.3;
      if (qb.ovr < 70) nerv += 0.2;
      if (off.qbBackup) nerv += 0.4;
    }
    return clamp(nerv, 0, 1);
  }

  /* ---------------- drive ---------------- */
  private drive(off: Unit, def: Unit): DriveOutcome {
    const t = off.team;
    // QB contundido em jogo? Aciona o reserva
    if (off.qb && off.qb.lesao > 0) {
      const sub = off.qbs.filter(p => p.lesao === 0 && p !== off.qb)[0] ?? null;
      this.log(`${t.sigla}: ${shortName(off.qb.nome)} sai lesionado. ${sub ? `${shortName(sub.nome)} assume o ataque.` : 'SEM QB reserva disponível!'}`, 'inj');
      this.emit({ kind: 'qb', texto: `${t.sigla}: ${shortName(off.qb.nome)} lesionado — entra ${sub ? shortName(sub.nome) : '—'}.`, saiu: off.qb.nome, entrou: sub?.nome ?? '', clock: this.clock } as LiveEvent);
      off.qb = sub;
    }
    const aggr = t.tactics.agressividade;
    let ball = 20 + this.rng.int(0, 12);
    let down = 1; let toGo = 10;
    const start = ball;
    const out: DriveOutcome = { pts: 0, secs: 0, net: 0, passY: 0, rushY: 0, tos: 0 };
    let lastGain: ScrimRes['gain'] = null;
    let plays = 0;

    while (true) {
      if (ball >= 100) { out.pts = this.touchdown(off, lastGain); break; }
      if (plays > 24) { this.log('Drive longo se esgota no relógio.', 'info'); break; }

      if (down === 4) {
        const fgDist = 100 - ball + 17;
        const goLimit = aggr >= 70 ? 4 : aggr >= 45 ? 2 : 1;
        if (toGo <= goLimit && (aggr >= 45 || toGo <= 1)) {
          this.log(`4ª descida e ${toGo}: ${t.sigla} vai para a conversão!`, 'info');
          const r = this.scrimmage(off, def, ball, down, toGo);
          ball = clamp(r.ball, 1, 100); out.secs += r.secs; this.clock += r.secs; out.passY += r.passY; out.rushY += r.rushY;
          if (r.turnover) {
            out.tos++;
            this.log(`Conversão falha! ${def.team.sigla} assume a bola na linha de ${100 - ball}.`, 'turn');
            this.emit({ kind: 'turnover', texto: 'Turnover on downs!', posse: off === this.uc ? 'fora' : 'casa', ball: 100 - ball, down: 1, toGo: 10, clock: this.clock });
            break;
          }
          toGo -= r.yds;
          if (toGo <= 0) {
            down = 1; toGo = 10; lastGain = r.gain ?? lastGain;
            this.log(`CONVERTIDO! Primeira descida do ${t.sigla}.`, 'big');
            this.emit({
              kind: 'play', texto: 'CONVERTIDO! Primeira descida.', tipo: 'big', ball, down: 1, toGo: 10,
              posse: off === this.uc ? 'casa' : 'fora', clock: this.clock,
              tipoJogada: r.passY > 0 ? 'pass' : r.rushY > 0 ? 'run' : 'outro',
              jardas: r.yds, portador: r.gain ? shortName(r.gain.p.nome) : undefined,
            });
          }
          else {
            out.tos++;
            this.log(`Conversão falha! ${def.team.sigla} assume a bola na linha de ${100 - ball}.`, 'turn');
            this.emit({ kind: 'turnover', texto: 'Turnover on downs!', posse: off === this.uc ? 'fora' : 'casa', ball: 100 - ball, down: 1, toGo: 10, clock: this.clock });
            break;
          }
          plays++; continue;
        }
        if (fgDist <= 55 && off.k && off.k.lesao === 0) {
          if (this.fieldGoal(off, fgDist)) out.pts = 3;
          break;
        }
        if (off.p && off.p.lesao === 0) { this.punt(off, def, ball); break; }
        out.tos++;
        this.log(`Sem kicker nem punter! ${def.team.sigla} recupera a posse.`, 'turn');
        break;
      }

      const before = this.lines.length;
      const r = this.scrimmage(off, def, ball, down, toGo);
      ball = clamp(r.ball, 1, 100);
      out.secs += r.secs; this.clock += r.secs; out.passY += r.passY; out.rushY += r.rushY;
      if (r.gain) lastGain = r.gain;
      const desc = this.since(before);

      if (r.turnover) {
        out.tos++;
        this.emit({ kind: 'turnover', texto: desc.texto || 'Turnover!', tipo: 'turn', posse: off === this.uc ? 'fora' : 'casa', ball: 100 - ball, down: 1, toGo: 10, clock: this.clock });
        break;
      }
      if (r.fgMade) { out.pts = 3; break; }
      toGo -= r.yds;
      if (toGo <= 0 && ball < 100) {
        down = 1; toGo = 10;
        if (this.rng.chance(0.4)) this.log(`Primeira descida: ${t.sigla} mantém o drive vivo.`, 'ok');
      } else if (ball < 100) down++;
      plays++;
      this.emit({
        kind: 'play', texto: desc.texto, tipo: desc.tipo, ball, down, toGo: ball >= 100 ? 0 : Math.max(1, toGo),
        posse: off === this.uc ? 'casa' : 'fora', clock: this.clock,
        tipoJogada: r.passY > 0 ? 'pass' : r.rushY > 0 ? 'run' : 'outro',
        jardas: r.yds, portador: r.gain ? shortName(r.gain.p.nome) : undefined,
        falta: r.faltaTeam === 'off' ? (off === this.uc ? 'casa' : 'fora') : r.faltaTeam === 'def' ? (off === this.uc ? 'fora' : 'casa') : undefined,
      });
    }

    out.net = ball - start;
    if (ball >= 100) out.net = 100 - start;
    return out;
  }

  /* ---------------- scrimmage ---------------- */
  private scrimmage(off: Unit, def: Unit, ball: number, down: number, toGo: number): ScrimRes {
    const t = off.team;
    const res: ScrimRes = {
      yds: 0, ball, secs: 30 + this.rng.int(0, 20), turnover: false, td: false,
      fgMade: false, passY: 0, rushY: 0, gain: null,
    };
    const nerv = this.nervousness(off);

    // nervosismo alto → false start / delay of game extras
    if (nerv > 0.3 && this.rng.chance(nerv * 0.05)) {
      res.yds = -5;
      res.ball = clamp(ball + res.yds, 1, 105);
      const tipo = this.rng.chance(0.6) ? 'False start' : 'Delay of game';
      this.log(`🚩 ${tipo} do ${t.sigla} — a pressão da torcida pesa! −5 jardas.`, 'pen');
      this.nervesEvent(`${tipo} do ${t.sigla}: a torcida adversária desestabiliza o ataque!`);
      if (t === this.casa.team) this.faltasC++; else this.faltasF++;
      res.faltaTeam = 'off';
      return res;
    }

    // chamada: tática + situação
    let runProb = t.tactics.corrida / 100;
    if (toGo <= 2) runProb += 0.18;
    if (toGo >= 9) runProb -= 0.28;
    if (ball >= 75) runProb += 0.08;
    if (!off.qb) runProb = 0.8;
    const myScore = off === this.uc ? this.scoreC : this.scoreF;
    const opScore = off === this.uc ? this.scoreF : this.scoreC;
    if (myScore > opScore && toGo <= 6) runProb += 0.1;
    const isRun = this.rng.chance(clamp(runProb, 0.08, 0.92));
    const dn = `${ORD[down - 1]} descida, ${toGo > 0 ? `${toGo} jardas` : 'goal'}`;
    const spot = ball >= 50 ? `linha de ${100 - ball} do ${def.team.sigla}` : `linha de ${ball} do ${t.sigla}`;

    if (isRun) this.playRun(off, def, dn, spot, res, nerv);
    else this.playPass(off, def, dn, spot, res, nerv);

    res.ball = clamp(ball + res.yds, 1, 105);
    if (res.ball >= 100) { res.td = true; res.ball = 100; }

    // penalidades (2.5%)
    if (!res.turnover && !res.td && this.rng.chance(0.025)) {
      const isHomeTeam = t === this.casa.team;
      if (this.rng.chance(0.5)) {
        res.yds = Math.max(-15, res.yds - 10);
        res.ball = clamp(ball + res.yds, 1, 105);
        this.log(`🚩 Bandeira: holding da OL do ${t.sigla}. −10 jardas.`, 'pen');
        if (isHomeTeam) this.faltasC++; else this.faltasF++;
        res.faltaTeam = 'off';
      } else {
        res.yds += 15;
        res.ball = clamp(ball + res.yds, 1, 105);
        this.log(`🚩 Interferência de passe da defesa do ${def.team.sigla}. +15 jardas e 1ª descida automática.`, 'pen');
        res.faltaTeam = 'def';
      }
    }
    return res;
  }

  /* ---------------- corrida ---------------- */
  private playRun(off: Unit, def: Unit, dn: string, spot: string, res: ScrimRes, nerv: number) {
    const t = off.team;
    const fresh = off.rbs.filter(p => p.lesao === 0);
    const rb = this.rng.chance(0.7) ? (fresh[0] ?? off.qb) : (fresh[1] ?? fresh[0] ?? off.qb);
    if (!rb) { res.yds = 0; res.secs = 20; return; }
    this.snap(rb); this.snap(off.qb);
    // qualidade relativa desloca PROBABILIDADES (não soma jardas brutas)
    const qn = clamp((off.runOff - def.runDef) / 22, -1, 1);
    const bigP = clamp(0.045 + qn * 0.03 + (rb.attrs.velocidade - def.coverage) * 0.001, 0.02, 0.11);
    const big = this.rng.chance(bigP);
    let yds: number;
    if (big) yds = 12 + this.rng.int(0, 22);
    else {
      const stuffP = clamp(0.26 - qn * 0.12, 0.14, 0.38);
      if (this.rng.chance(stuffP)) yds = this.rng.int(-2, 1);
      else yds = this.rng.weighted([2, 3, 4, 5, 6, 7, 8], [13, 21, 23, 19, 13, 8, 3]) + this.rng.int(0, 1);
    }
    yds = Math.round(yds + qn * 0.8);

    const tackler = this.rng.pick([...def.lb, ...def.dl, ...def.s]);
    if (tackler && yds < 8) this.addStat(tackler.id, 'tackles', 1);

    // fumble (nervosismo aumenta o risco)
    const fumP = clamp(0.011 + (qn < 0 ? 0.008 : 0) + nerv * 0.012, 0.005, 0.04) * this.injFactor;
    if (this.rng.chance(fumP)) {
      const rec = this.rng.pick([...def.lb, ...def.dl, ...def.s]);
      this.log(`${dn}, ${spot} — ${shortName(rb.nome)} sofre FUMBLE! ${rec ? shortName(rec.nome) : def.team.sigla} recupera para o ${def.team.sigla}.`, 'turn');
      if (nerv > 0.25) this.nervesEvent(`Sob pressão da torcida, ${shortName(rb.nome)} solta a bola — FUMBLE!`);
      res.turnover = true; res.yds = 0; res.secs = 34;
      if (rec) this.addStat(rec.id, 'tackles', 1);
      this.maybeInjury(off, def);
      return;
    }

    if (big) this.log(`${dn}, ${spot} — ${shortName(rb.nome)} rompe o tackle de ${tackler ? shortName(tackler.nome) : 'um defensor'} e DISPARA ${yds} jardas!`, 'big');
    else if (yds <= 0) this.log(`${dn}, ${spot} — ${shortName(rb.nome)} é parado no backfield (${yds} jd). A defesa do ${def.team.sigla} segura.`, 'ok');
    else this.log(`${dn}, ${spot} — ${shortName(rb.nome)} corre pelo meio e ganha ${yds} jardas.`, 'ok');
    this.addStat(rb.id, 'ry', Math.max(0, yds));
    res.rushY += Math.max(0, yds);
    res.yds = yds;
    res.gain = { p: rb, tipo: 'run', yds: Math.max(1, yds) };
    res.secs = this.rng.chance(0.2) ? 12 : 30 + this.rng.int(0, 18);
    this.maybeInjury(off, def, 0.006);
  }

  /* ---------------- passe ---------------- */
  private playPass(off: Unit, def: Unit, dn: string, spot: string, res: ScrimRes, nerv: number) {
    const qb = off.qb;
    if (!qb) { this.playRun(off, def, dn, spot, res, nerv); return; }
    this.snap(qb);
    const t = off.team;
    // qualidade relativa desloca PROBABILIDADES (não soma jardas brutas)
    const qn = clamp((off.passOff - def.coverage) / 25, -1, 1);
    const pressure = clamp((def.passRush - off.passProt) / 6, -3, 4.5);
    const complP = clamp(0.53 + qn * 0.08 - pressure * 0.04 + this.clima.pass * 0.004 - nerv * 0.10, 0.28, 0.68);
    const sackP = clamp(0.06 + pressure * 0.025 - qn * 0.008 - qb.attrs.velocidade * 0.0003, 0.02, 0.15);
    const intP = clamp(0.02 + pressure * 0.006 - qn * 0.006 + nerv * 0.018, 0.006, 0.10);
    const rusher = this.rng.pick([...def.dl, ...def.lb]);

    if (this.rng.chance(sackP)) {
      const loss = -(5 + this.rng.int(0, 5));
      this.log(`${dn}, ${spot} — ${rusher ? shortName(rusher.nome) : 'a defesa'} derruba ${shortName(qb.nome)} atrás da linha! SACK de ${-loss} jardas.`, 'turn');
      if (rusher) this.addStat(rusher.id, 'sacks', 1);
      res.yds = loss; res.secs = 36;
      this.maybeInjury(off, def, 0.02);
      return;
    }
    if (this.rng.chance(intP)) {
      const db = this.rng.chance(0.65) ? this.rng.pick(def.cb) : this.rng.pick(def.s);
      this.log(`${dn}, ${spot} — ${shortName(qb.nome)} força o passe e ${db ? shortName(db.nome) : 'o defensor'} INTERCEPTA! Bola do ${def.team.sigla}.`, 'turn');
      if (nerv > 0.25) {
        const inexperiente = qb.jogosCarreira < 10;
        this.nervesEvent(`QB ${inexperiente ? 'inexperiente' : 'sob pressão'} ${shortName(qb.nome)} sente a torcida e lança interceptação!`);
      }
      this.addStat(qb.id, 'int', 1);
      if (db) this.addStat(db.id, 'tackles', 1);
      res.turnover = true; res.yds = 0; res.secs = 32;
      return;
    }
    if (!this.rng.chance(complP)) {
      const alvo = this.receiver(off);
      this.log(`${dn}, ${spot} — passe incompleto de ${shortName(qb.nome)} para ${shortName(alvo.nome)}${pressure > 1.5 ? ' sob pressão' : ''}.`, 'ok');
      res.yds = 0; res.secs = 9;
      return;
    }

    const alvo = this.receiver(off);
    const deep = this.rng.chance(clamp(0.055 + qn * 0.035, 0.02, 0.12));
    let base = deep ? 14 + this.rng.int(0, 14) : this.rng.weighted([3, 5, 7, 9, 11, 13], [20, 25, 21, 16, 11, 7]);
    base += qn * 0.9;
    const yac = clamp(Math.round((alvo.attrs.velocidade - 72) * 0.06 + this.rng.int(0, 2)), 0, 5);
    const yds = Math.max(2, Math.round(base + yac));

    this.addStat(qb.id, 'py', yds);
    this.addStat(alvo.id, 'rec', 1);
    this.addStat(alvo.id, 'recYds', yds);
    res.passY += yds;
    res.gain = { p: alvo, tipo: 'pass', yds };
    if (yds >= 20 || deep) this.log(`${dn}, ${spot} — BOMBA! ${shortName(qb.nome)} conecta passe de ${yds} jardas para ${shortName(alvo.nome)}!`, 'big');
    else this.log(`${dn}, ${spot} — ${shortName(qb.nome)} completa passe de ${yds} jardas para ${shortName(alvo.nome)}.`, 'ok');
    res.yds = yds;
    res.secs = this.rng.chance(0.25) ? 14 : 30 + this.rng.int(0, 16);
    this.maybeInjury(off, def, 0.004);
  }

  private receiver(off: Unit): Player {
    let opts: Player[] = [...off.wrs.slice(0, 3)];
    if (off.te) opts.push(off.te);
    if (off.rbs[0]) opts.push(off.rbs[0]);
    opts = opts.filter(p => p.lesao === 0);
    if (!opts.length) opts = [...off.wrs, ...(off.te ? [off.te] : [])];
    if (!opts.length) return off.qb!;
    const w = opts.map((p, i) => (i < 3 ? 30 : off.te === p ? 16 : 9) * (0.6 + p.attrs.recepcao / 100));
    return this.rng.weighted(opts, w);
  }

  /* ---------------- especiais ---------------- */
  private touchdown(off: Unit, gain: ScrimRes['gain']): number {
    const t = off.team;
    if (gain && gain.tipo === 'pass' && off.qb) {
      this.log(`TOUCHDOWN do ${t.sigla}! ${shortName(off.qb.nome)} encontra ${shortName(gain.p.nome)} na end zone (${gain.yds} jd).`, 'score');
      this.addStat(off.qb.id, 'ptd', 1);
      this.addStat(gain.p.id, 'recTD', 1);
    } else {
      const rb = gain?.p ?? off.rbs[0] ?? off.qb;
      this.log(`TOUCHDOWN do ${t.sigla}! ${rb ? shortName(rb.nome) : t.sigla} invade a end zone.`, 'score');
      if (rb) this.addStat(rb.id, 'rtd', 1);
    }
    if (off.k && off.k.attrs.chute > 40) {
      this.log(`Extra point convertido por ${shortName(off.k.nome)}. +7 pontos.`, 'ok');
      return 7;
    }
    this.log(`Extra point BLOQUEADO! Apenas 6 pontos.`, 'turn');
    return 6;
  }

  private fieldGoal(off: Unit, dist: number): boolean {
    const k = off.k!;
    const prob = clamp(0.97 - (dist - 20) * 0.013 + this.clima.fg * 0.012 + (k.attrs.chute - 70) * 0.003, 0.2, 0.98);
    this.addStat(k.id, 'fgT', 1);
    if (this.rng.chance(prob)) {
      this.log(`Field goal de ${dist} jardas convertido por ${shortName(k.nome)}! +3 para o ${off.team.sigla}.`, 'score');
      this.addStat(k.id, 'fgM', 1);
      return true;
    }
    this.log(`${shortName(k.nome)} ERRA o field goal de ${dist} jardas! Posse devolvida ao adversário.`, 'turn');
    return false;
  }

  private punt(off: Unit, def: Unit, ball: number) {
    const p = off.p!;
    const yds = 36 + Math.round(p.attrs.chute * 0.16) + this.rng.int(0, 12);
    this.log(`Punt de ${yds} jardas de ${shortName(p.nome)}. ${def.team.sigla} assume a posse.`, 'ok');
  }

  /* ---------------- lesões (posição + fadiga) ---------------- */
  private snap(p: Player | null) {
    if (p) this.snaps.set(p.id, (this.snaps.get(p.id) ?? 0) + 1);
  }
  private maybeInjury(off: Unit, def: Unit, baseP = 0.0045) {
    const offense = this.rng.chance(0.72);
    let pool: Player[];
    if (offense) {
      pool = [
        ...(off.qb ? [off.qb] : []), ...off.rbs.slice(0, 2), ...off.wrs.slice(0, 3),
        ...(off.te ? [off.te] : []), ...off.ol.slice(0, 5),
      ];
    } else {
      pool = [...def.dl, ...def.lb, ...def.cb, ...def.s];
    }
    if (!pool.length) return;
    const p = this.rng.pick(pool);
    if (p.lesao > 0) return;
    // probabilidade = base × risco da posição × fadiga (snaps acumulados)
    const fadiga = 1 + Math.min(0.9, (this.snaps.get(p.id) ?? 0) / 45);
    const prob = clamp(baseP * INJ_POS_MULT[p.pos] * fadiga * this.injFactor, 0.001, 0.09);
    if (!this.rng.chance(prob)) return;
    const inj = this.rng.pick(INJ_TYPES);
    const semanas = this.rng.int(inj.min, inj.max);
    p.lesao = semanas; p.lesaoTipo = inj.tipo;
    this.lesoes.push({ playerId: p.id, nome: p.nome, pos: p.pos, semanas, tipo: inj.tipo, teamId: off.team.id });
    this.log(`⚕ LESÃO: ${p.nome} (${p.pos}, ${off.team.sigla}) — ${inj.tipo}. Fora por ~${semanas} semana(s).`, 'inj');
    if (p.pos === 'QB') this.emit({ kind: 'qbinj', texto: `${off.team.sigla}: QB ${shortName(p.nome)} lesionado!`, nome: p.nome, clock: this.clock } as LiveEvent);
  }

  /* ---------------- utilidades ---------------- */
  private addStat(id: string, key: keyof PlayerStats, v: number) {
    const d = this.deltas[id] ?? (this.deltas[id] = {});
    (d as Record<string, number>)[key] = ((d as Record<string, number>)[key] ?? 0) + v;
  }
  private log(t: string, tipo: PlayLine['tipo']) {
    this.lines.push({ t, tipo });
  }
  private emit(e: LiveEvent) { this.events.push(e); }
  private say(texto: string, tipo: LineTipo) {
    this.log(texto, tipo);
    this.emit({ kind: 'info', texto, tipo, clock: this.clock });
  }
  private nervesEvent(texto: string) {
    this.log(`⚡ ${texto}`, 'pen');
    this.emit({ kind: 'nerves', texto, clock: this.clock });
  }
  private since(before: number): { texto: string; tipo: LineTipo } {
    const ls = this.lines.slice(before);
    if (!ls.length) return { texto: '', tipo: 'info' };
    return {
      texto: ls.map(l => l.t).join('  •  '),
      tipo: ls.some(l => l.tipo === 'pen') ? 'pen' : ls[0].tipo,
    };
  }

  private buildBox(qC: number[], qF: number[], tot: { yC: number; yF: number; rC: number; rF: number; pC: number; pF: number; toC: number; toF: number }) {
    const leader = (key: keyof PlayerStats, unit: Unit, label: string) => {
      let best: Player | null = null; let bv = 0;
      const seen = new Set<string>();
      for (const arr of [unit.qb ? [unit.qb] : [], unit.rbs, unit.wrs, unit.te ? [unit.te] : [], unit.ol, unit.dl, unit.lb, unit.cb, unit.s])
        for (const p of arr) {
          const v = (this.deltas[p.id]?.[key] ?? 0) as number;
          if (v > bv && !seen.has(p.id)) { bv = v; best = p; }
          seen.add(p.id);
        }
      return best ? `${shortName(best.nome)} — ${bv}${label}` : '—';
    };
    const c = this.uc; const f = this.uf;
    return {
      quartos: { casa: qC, fora: qF },
      yds: { casa: Math.max(0, Math.round(tot.yC)), fora: Math.max(0, Math.round(tot.yF)) },
      rush: { casa: Math.max(0, Math.round(tot.rC)), fora: Math.max(0, Math.round(tot.rF)) },
      pass: { casa: Math.max(0, Math.round(tot.pC)), fora: Math.max(0, Math.round(tot.pF)) },
      tos: { casa: tot.toC, fora: tot.toF },
      faltas: { casa: this.faltasC, fora: this.faltasF },
      leaders: [
        { label: 'Passe (jd)', casa: leader('py', c, ' jd'), fora: leader('py', f, ' jd') },
        { label: 'Corrida (jd)', casa: leader('ry', c, ' jd'), fora: leader('ry', f, ' jd') },
        { label: 'Recepções (jd)', casa: leader('recYds', c, ' jd'), fora: leader('recYds', f, ' jd') },
        { label: 'Sacks', casa: leader('sacks', c, ''), fora: leader('sacks', f, '') },
        { label: 'Tackles', casa: leader('tackles', c, ''), fora: leader('tackles', f, '') },
      ],
    };
  }
}
