import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../state/store';
import { TEAMS_DEF, CAP_BASE, DIV_NAMES } from '../game/data';
import { newGame } from '../game/generate';
import { teamStrength, capUsed, playersOf } from '../game/season';
import { Panel, Bar, TeamCrest } from '../components/ui';
import type { Conf, GameState } from '../game/types';
import { clamp } from '../game/rng';

interface Preview {
  team: { cor: string; cor2: string; sigla: string; cidade: string; nome: string; conf: Conf; div: number; dinheiro: number; estadio: number; centroTreino: number; estadioNome: string };
  forca: number; cap: number; elenco: number; capMax: number;
  real: boolean; erro: string | null;
}

/* mundo gerado uma única vez para a pré-visualização (dados reais, instantâneo) */
let previewWorld: GameState | null = null;
let previewErro: string | null = null;
function getPreviewWorld(): GameState | null {
  if (previewWorld) return previewWorld;
  if (previewErro) return null;
  try {
    previewWorld = newGame('kc', 20260001);
    return previewWorld;
  } catch (e) {
    previewErro = e instanceof Error ? e.message : String(e);
    console.error('Mundo de pré-visualização falhou:', e);
    return null;
  }
}

export default function StartScreen({ onLoad }: { onLoad: () => void }) {
  const { st, dispatch } = useGame();
  const [sel, setSel] = useState('kc');
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t); }, []);

  const preview: Preview = useMemo(() => {
    const def = TEAMS_DEF.find(x => x.sigla.toLowerCase() === sel) ?? TEAMS_DEF[0];
    const id = def.sigla.toLowerCase();
    // estimativa determinística (fallback — nunca vazio)
    const est = {
      forca: clamp(50 + def.forca * 8 + (id.length % 3), 55, 95),
      cap: Math.min(CAP_BASE + 18, 128 + def.forca * 23 + (id.length % 5) * 3),
      dinheiro: Math.round(28 + def.forca * 5 + (id.charCodeAt(0) % 18)),
    };
    const base: Preview = {
      team: { cor: def.cor, cor2: def.cor2, sigla: def.sigla, cidade: def.cidade, nome: def.nome, conf: def.conf, div: def.div, dinheiro: est.dinheiro, estadio: clamp(def.forca - 1, 1, 4), centroTreino: clamp(def.forca - 1, 1, 4), estadioNome: def.estadio },
      forca: est.forca, cap: est.cap, elenco: 63, capMax: CAP_BASE, real: false, erro: previewErro,
    };
    const g = getPreviewWorld();
    const t = g?.teams.find(x => x.id === id);
    if (!g || !t) return base;
    return {
      team: t,
      forca: teamStrength(g, t.id),
      cap: capUsed(g, t.id),
      elenco: playersOf(g, t.id).length,
      capMax: g.settings.cap,
      real: true, erro: null,
    };
  }, [sel]);

  const capPct = (preview.cap / preview.capMax) * 100;

  const renderConf = (conf: Conf) => (
    <Panel key={conf} title={conf === 'AFC' ? 'AFC — Americana' : 'NFC — Nacional'} pad={false}>
      {[0, 1, 2, 3].map(div => (
        <div key={div}>
          <div className="border-b border-line2 bg-panel2/60 px-4 py-1.5 font-disp text-[13px] font-bold uppercase tracking-[0.2em] text-faint">
            Divisão {DIV_NAMES[div]}
          </div>
          {TEAMS_DEF.filter(t => t.conf === conf && t.div === div).map(t => {
            const id = t.sigla.toLowerCase();
            const on = sel === id;
            return (
              <button key={id} onClick={() => setSel(id)}
                className={`flex w-full items-center gap-3 border-b border-line2 px-4 py-2 text-left font-mono text-[13px] transition-all duration-100
                  ${on ? 'bg-[rgba(240,180,41,0.1)] shadow-[inset_3px_0_0_var(--color-gold)]' : 'hover:bg-raise'}`}>
                <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={20} />
                <span className="w-44 truncate">{t.cidade} <b className="text-ink">{t.nome}</b></span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="hidden text-[11px] text-faint md:inline">{t.estadio}</span>
                  <span className={`inline-block h-2 w-2 ${on ? 'bg-gold' : 'bg-line'}`} />
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </Panel>
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1180px] px-5 py-8">
        {/* cabeçalho */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-disp text-[15px] font-semibold uppercase tracking-[0.35em] text-gold">Modo Carreira</div>
            <h1 className="font-disp text-[64px] font-black uppercase leading-[0.95] tracking-tight">
              Gridiron<br /><span className="text-goldhi">Manager NFL</span>
            </h1>
            <p className="mt-3 max-w-xl font-mono text-[13px] leading-relaxed text-dim">
              32 franquias reais · teto salarial com inflação da TV · calendário oficial de 17 jogos ·
              draft de 7 rodadas · comissão técnica negociável · playoffs até o Super Bowl. Escolha sua franquia.
            </p>
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
            Temporada 2026<span className="blink text-gold">▮</span>
          </div>
        </div>

        <div className={`mt-6 grid gap-5 lg:grid-cols-[1fr_340px] ${ready ? 'reveal' : 'opacity-0'}`}>
          <div className="grid gap-5 md:grid-cols-2">{renderConf('AFC')}{renderConf('NFC')}</div>

          {/* painel da franquia */}
          <div className="lg:sticky lg:top-5 lg:self-start">
            <Panel title="Sua franquia">
              <div className="flex items-center gap-3">
                <TeamCrest cor={preview.team.cor} cor2={preview.team.cor2} sigla={preview.team.sigla} conf={preview.team.conf} size={52} />
                <div>
                  <div className="font-disp text-[26px] font-extrabold uppercase leading-none">{preview.team.cidade}</div>
                  <div className="font-disp text-[18px] font-bold uppercase text-goldhi">{preview.team.nome}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-faint">{preview.team.estadioNome}</div>
                </div>
              </div>

              <dl className="mt-4 space-y-2.5 font-mono text-[12.5px]">
                <div>
                  <div className="mb-1 flex justify-between text-dim"><span>Força do elenco</span><b className="text-ink">{preview.forca}</b></div>
                  <Bar pct={preview.forca} color={preview.forca >= 78 ? 'var(--color-gold)' : 'var(--color-grass)'} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-dim">
                    <span>Folha salarial</span>
                    <b className={capPct > 100 ? 'text-blood' : 'text-ink'}>${preview.cap.toFixed(0)}M / ${preview.capMax}M</b>
                  </div>
                  <Bar pct={capPct} color={capPct > 95 ? 'var(--color-blood)' : capPct > 82 ? 'var(--color-gold)' : 'var(--color-grass)'} />
                </div>
                <div className="flex justify-between text-dim"><span>Caixa disponível</span><b className="text-goldhi">${preview.team.dinheiro}M</b></div>
                <div className="flex justify-between text-dim"><span>Jogadores no elenco</span><b className="text-ink">{preview.elenco} (53 + PS)</b></div>
                <div className="flex justify-between text-dim"><span>Estádio / CT</span><b className="text-ink">Nv. {preview.team.estadio} / Nv. {preview.team.centroTreino}</b></div>
              </dl>

              {preview.erro ? (
                <div className="mt-3 border border-blood/50 bg-[rgba(226,87,75,0.08)] px-2.5 py-2 font-mono text-[11px] leading-relaxed text-blood">
                  Pré-visualização em modo estimativa — a geração reportou: <b>{preview.erro}</b>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-faint">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-grass" />
                  {preview.real ? 'Dados do mundo gerado' : 'Estimativa de scouting'}
                </div>
              )}

              <button className="btn btn-gold btn-pulse mt-5 w-full text-[18px]"
                onClick={() => dispatch({ type: 'NEW_GAME', teamId: sel })}>
                Assumir o comando »
              </button>
              {st.saveExists && (
                <button className="btn mt-2 w-full" onClick={onLoad}>Continuar carreira salva</button>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
