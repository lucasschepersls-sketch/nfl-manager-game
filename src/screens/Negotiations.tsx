import { useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { playersOf, staffOf, capUsed, capHitOf, fmtM } from '../game/season';
import {
  playerHappiness, staffHappiness, playerExpectations, staffExpectations, STRUCT_LABEL, happinessVerdict,
} from '../game/negotiations';
import { Panel, PosBadge, Ovr, Bar } from '../components/ui';
import type { ContractOffer, ContractStructure, Player, Staff } from '../game/types';

function OfferBuilder({ title, exp, hap, offer, setOffer, onSend, onCancel }: {
  title: string;
  exp: { anos: number; aav: number };
  hap: { value: number; partes: { salario: number; duracao: number; situacao: number; moral: number } };
  offer: ContractOffer;
  setOffer: (o: ContractOffer) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  return (
    <Panel title={title}>
      <p className="mb-3 font-mono text-[11.5px] text-faint">
        Pede ~<b className="text-goldhi">{fmtM(exp.aav)}/ano</b> por <b className="text-ink">{exp.anos} ano{exp.anos > 1 ? 's' : ''}</b>
      </p>
      <label className="block">
        <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Duração</span><b className="text-ink">{offer.years} ano{offer.years > 1 ? 's' : ''}</b></div>
        <input type="range" min={1} max={5} value={offer.years} className="w-full" onChange={e => setOffer({ ...offer, years: +e.target.value })} />
      </label>
      <label className="mt-3 block">
        <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Salário/ano</span><b className="text-goldhi">{fmtM(offer.base)}</b></div>
        <input type="range" min={1} max={60} value={offer.base} className="w-full" onChange={e => setOffer({ ...offer, base: +e.target.value })} />
      </label>
      <label className="mt-3 block">
        <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Bônus</span><b className="text-ink">{fmtM(offer.bonus)}</b></div>
        <input type="range" min={0} max={30} value={offer.bonus} className="w-full" onChange={e => setOffer({ ...offer, bonus: +e.target.value })} />
      </label>
      <div className="mt-3">
        <div className="mb-1 font-mono text-[11.5px] text-dim">Estrutura</div>
        <div className="flex gap-1.5">
          {(['FRONT', 'BALANCED', 'BACK'] as ContractStructure[]).map(s2 => (
            <button key={s2} className={`btn btn-sm flex-1 ${offer.structure === s2 ? 'btn-gold' : 'btn-ghost'}`}
              onClick={() => setOffer({ ...offer, structure: s2 })}>{STRUCT_LABEL[s2]}</button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim"><span>Probabilidade</span><b className="text-ink">{hap.value}% · {happinessVerdict(hap.value)}</b></div>
        <Bar pct={hap.value} color={hap.value >= 70 ? 'var(--color-grass)' : hap.value >= 40 ? 'var(--color-gold)' : 'var(--color-blood)'} />
      </div>
      <button className="btn btn-gold mt-4 w-full" onClick={onSend}>Apresentar proposta »</button>
      <button className="btn btn-ghost mt-2 w-full" onClick={onCancel}>Cancelar</button>
    </Panel>
  );
}

export function NegotiationsScreen() {
  const { st, dispatch } = useGame();
  const g = st.game!;
  const [selPlayer, setSelPlayer] = useState<Player | null>(null);
  const [selStaff, setSelStaff] = useState<Staff | null>(null);
  const [offer, setOffer] = useState<ContractOffer | null>(null);

  const players = useMemo(() => playersOf(g, g.userTeam).filter(p => p.status !== 'PS' && p.contrato <= 2).sort((a, b) => b.ovr - a.ovr), [g]);
  const staff = useMemo(() => staffOf(g, g.userTeam), [g]);

  const openPlayer = (p: Player) => {
    const exp = playerExpectations(p, g.settings.inflacao);
    setSelPlayer(p); setSelStaff(null);
    setOffer({ years: exp.anos, base: Math.round(exp.aav), bonus: Math.round(exp.aav * exp.anos * 0.1), structure: 'BALANCED' });
  };
  const openStaff = (s2: Staff) => {
    const exp = staffExpectations(s2);
    setSelStaff(s2); setSelPlayer(null);
    setOffer({ years: exp.anos, base: Math.round(exp.aav), bonus: 0, structure: 'BALANCED' });
  };

  const hap = selPlayer && offer ? playerHappiness(selPlayer, offer, g.settings.inflacao)
    : selStaff && offer ? staffHappiness(selStaff, offer) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Panel title={`Renovações — contratos com ≤2 anos (${players.length})`} pad={false}>
          <table className="tbl">
            <thead><tr><th>POS</th><th>Jogador</th><th className="num">Idade</th><th className="num">OVR</th><th className="num">Cap hit</th><th className="num">Contr.</th><th /></tr></thead>
            <tbody>
              {players.map(p => (
                <tr key={p.id}>
                  <td><PosBadge pos={p.pos} /></td>
                  <td>{p.nome}{p.tag && <span className="tag ml-2 border-ice/60 text-ice">TAG</span>}</td>
                  <td className="num">{p.idade}</td>
                  <td className="num"><Ovr v={p.ovr} /></td>
                  <td className="num text-goldhi">{fmtM(capHitOf(p))}</td>
                  <td className="num">{p.contrato}a</td>
                  <td><button className="btn btn-sm btn-gold" disabled={!!p.tag} onClick={() => openPlayer(p)}>Renovar</button></td>
                </tr>
              ))}
              {!players.length && <tr><td colSpan={7} className="py-5 text-center text-faint">Nenhum contrato perto do fim.</td></tr>}
            </tbody>
          </table>
        </Panel>

        <Panel title="Comissão técnica" pad={false}>
          <table className="tbl">
            <thead><tr><th>Função</th><th>Profissional</th><th className="num">Nível</th><th className="num">Salário</th><th className="num">Contr.</th><th /></tr></thead>
            <tbody>
              {staff.map(s2 => (
                <tr key={s2.id}>
                  <td className="text-dim">{s2.funcao}</td>
                  <td>{s2.nome}</td>
                  <td className="num"><span className="text-goldhi">{'★'.repeat(s2.nivel)}</span></td>
                  <td className="num text-goldhi">{fmtM(s2.salario)}</td>
                  <td className="num">{s2.contrato}a</td>
                  <td><button className="btn btn-sm" disabled={s2.contrato > 2} onClick={() => openStaff(s2)}>Renovar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        {offer && hap && (selPlayer || selStaff) ? (
          <OfferBuilder
            title={selPlayer ? `Renovar — ${selPlayer.nome}` : `Renovar — ${selStaff!.nome}`}
            exp={selPlayer ? playerExpectations(selPlayer, g.settings.inflacao) : staffExpectations(selStaff!)}
            hap={hap} offer={offer} setOffer={setOffer}
            onSend={() => {
              if (selPlayer) dispatch({ type: 'NEGOTIATE', playerId: selPlayer.id, offer });
              else if (selStaff) dispatch({ type: 'RENEW_STAFF', staffId: selStaff.id, offer });
              setSelPlayer(null); setSelStaff(null); setOffer(null);
            }}
            onCancel={() => { setSelPlayer(null); setSelStaff(null); setOffer(null); }}
          />
        ) : (
          <Panel title="Negociações">
            <p className="font-mono text-[12.5px] leading-relaxed text-dim">
              Selecione um jogador ou técnico com contrato acabando para montar uma proposta de renovação.
              A felicidade considera salário, duração, momento e moral.
            </p>
            <p className="mt-2 font-mono text-[11.5px] text-faint">Espaço no cap: <b className="text-goldhi">{fmtM(g.settings.cap - capUsed(g, g.userTeam))}</b></p>
          </Panel>
        )}
      </div>
    </div>
  );
}
