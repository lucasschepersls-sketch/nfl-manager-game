import { useMemo, useState } from 'react';
import { loadSave, useGame } from '../state/store';
import { newGame } from '../game/generate';
import { TEAMS_DEF, DIV_NAMES, CONF_LABEL } from '../game/data';
import { teamStage, teamChemistry } from '../game/franchise';
import { capUsed } from '../game/season';
import { TeamCrest, Bar } from '../components/ui';
import type { Conf } from '../game/types';

export default function StartScreen() {
  const { dispatch } = useGame();
  const [sel, setSel] = useState('kc');
  const save = useMemo(() => loadSave(), []);

  const preview = useMemo(() => {
    try {
      const id = sel;
      const g = newGame(id, 20260001);
      const t = g.teams.find(x => x.id === id);
      if (!t) return null;
      const stg = teamStage(g, id);
      const chem = teamChemistry(g, id);
      return { t, forca: 0, cap: capUsed(g, id), capMax: g.settings.cap, stage: stg, chem };
    } catch { return null; }
  }, [sel]);

  const renderConf = (conf: Conf) => (
    <div key={conf}>
      <div className="mb-2 flex items-baseline gap-3">
        <h3 className="font-disp text-[22px] font-extrabold uppercase tracking-wide">{CONF_LABEL[conf]}</h3>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">16 franquias</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map(div => (
          <div key={div} className="border border-line bg-panel2 p-3">
            <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.24em] text-gold">Divisão {DIV_NAMES[div]}</div>
            <div className="grid grid-cols-4 gap-2">
              {TEAMS_DEF.filter(t => t.conf === conf && t.div === div).map(t => {
                const id = t.sigla.toLowerCase();
                const on = sel === id;
                return (
                  <button key={id} onClick={() => setSel(id)} title={`${t.cidade} ${t.nome}`}
                    className={`group flex flex-col items-center gap-1.5 border p-2 transition-all ${on
                      ? 'border-gold bg-[rgba(240,180,41,0.12)] shadow-[0_0_18px_rgba(240,180,41,0.25)]'
                      : 'border-line2 bg-panel hover:border-gold/50 hover:-translate-y-0.5'}`}>
                    <TeamCrest cor={t.cor} cor2={t.cor2} sigla={t.sigla} conf={t.conf} size={on ? 44 : 38} />
                    <span className={`font-disp text-[12px] font-bold uppercase tracking-wide ${on ? 'text-goldhi' : 'text-dim group-hover:text-ink'}`}>{t.sigla}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* topo */}
      <header className="border-b border-line bg-pitcho/90">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-6">
          <div>
            <div className="font-disp text-[34px] font-extrabold uppercase leading-none tracking-wide">
              The <span className="text-goldhi">American</span> Game
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.3em] text-faint">Manager · Modo Carreira · NFL</div>
          </div>
          <div className="hidden items-center gap-3 font-mono text-[12px] text-dim md:flex">
            <span className="inline-block h-2 w-2 rounded-full bg-grass" />
            <span>Temporada 2026</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1200px] gap-6 px-6 py-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <p className="max-w-2xl font-mono text-[13px] leading-relaxed text-dim">
            Assuma uma das <b className="text-ink">32 franquias</b> da liga. Gerencie elenco de 53 + practice squad,
            teto salarial com inflação de TV, draft, trades, scouting e leve seu time ao Super Bowl.
          </p>
          {renderConf('AFC')}
          {renderConf('NFC')}
        </div>

        {/* painel da franquia selecionada */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          {preview ? (
            <div className="border border-line bg-panel p-5">
              <div className="flex items-center gap-4">
                <TeamCrest cor={preview.t.cor} cor2={preview.t.cor2} sigla={preview.t.sigla} conf={preview.t.conf} size={72} />
                <div>
                  <div className="font-disp text-[26px] font-extrabold uppercase leading-none">{preview.t.cidade}</div>
                  <div className="font-disp text-[18px] font-bold uppercase text-goldhi">{preview.t.nome}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-faint">{CONF_LABEL[preview.t.conf]} · {DIV_NAMES[preview.t.div]}</div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim">
                    <span>Momento da franquia</span><b className="text-ink">{preview.stage.score}/100</b>
                  </div>
                  <Bar pct={preview.stage.score} color={preview.stage.score >= 75 ? 'var(--color-goldhi)' : preview.stage.score >= 40 ? 'var(--color-grass)' : 'var(--color-ice)'} />
                  <div className="mt-1 font-disp text-[14px] font-bold uppercase text-gold">{preview.stage.label}</div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim">
                    <span>Química do vestiário</span><b className="text-ink">{preview.chem.score}/100</b>
                  </div>
                  <Bar pct={preview.chem.score} color="var(--color-grass)" />
                </div>
                <div>
                  <div className="mb-1 flex justify-between font-mono text-[11.5px] text-dim">
                    <span>Folha salarial</span><b className="text-ink">${preview.cap}M / ${preview.capMax}M</b>
                  </div>
                  <Bar pct={(preview.cap / preview.capMax) * 100} color="var(--color-gold)" />
                </div>
                <div className="flex justify-between border-t border-line2 pt-2 font-mono text-[12px] text-dim">
                  <span>Caixa disponível</span><b className="text-goldhi">${preview.t.dinheiro}M</b>
                </div>
                <div className="flex justify-between font-mono text-[12px] text-dim">
                  <span>Estádio</span><b className="text-ink">{preview.t.estadioNome}</b>
                </div>
              </div>

              <button className="btn btn-gold btn-pulse mt-5 w-full text-[17px]"
                onClick={() => dispatch({ type: 'NEW_GAME', teamId: sel })}>
                Assumir o comando »
              </button>
            </div>
          ) : null}

          {save && (
            <button className="btn mt-4 w-full" onClick={() => dispatch({ type: 'LOAD_SAVE', game: save })}>
              Continuar carreira salva »
            </button>
          )}

          <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-widest text-faint">
            Brasões autorais · cores oficiais · sem marcas da NFL
          </p>
        </aside>
      </main>
    </div>
  );
}
