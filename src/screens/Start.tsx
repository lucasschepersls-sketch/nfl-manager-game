import { useEffect, useMemo, useState } from 'react';
import { useGame, loadSave } from '../state/store';
import { newGame } from '../game/generate';
import { teamStrength, capUsed, playersOf } from '../game/season';
import { TEAMS_DEF, DIV_NAMES, CONF_LABEL } from '../game/data';
import type { Conf } from '../game/types';
import { TeamCrest, Bar } from '../components/ui';

export default function StartScreen() {
  const { dispatch } = useGame();
  const [sel, setSel] = useState('kc');
  const [ready, setReady] = useState(false);
  const save = useMemo(() => loadSave(), []);

  useEffect(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t); }, []);

  const preview = useMemo(() => {
    const def = TEAMS_DEF.find(d => d.sigla.toLowerCase() === sel) ?? TEAMS_DEF[0];
    const id = def.sigla.toLowerCase();
    try {
      const g = newGame(id, 20260001);
      const t = g.teams.find(x => x.id === id);
      if (!t) return null;
      return {
        t, forca: teamStrength(g, id), cap: capUsed(g, id), capMax: g.settings.cap,
        elenco: playersOf(g, id).length,
      };
    } catch { return null; }
  }, [sel]);

  const capPct = preview ? (preview.cap / preview.capMax) * 100 : 0;

  const renderConf = (conf: Conf) => {
    const teams = TEAMS_DEF.filter(d => d.conf === conf);
    return (
      <div key={conf} className="panel">
        <header className="panel-hd"><h2>{CONF_LABEL[conf]}</h2></header>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map(div => (
            <div key={div}>
              <div className="mb-2 font-disp text-[13px] font-bold uppercase tracking-[0.2em] text-faint">Divisão {DIV_NAMES[div]}</div>
              <div className="grid grid-cols-4 gap-2">
                {teams.filter(d => d.div === div).map(d => {
                  const id = d.sigla.toLowerCase();
                  const on = sel === id;
                  return (
                    <button key={id} title={`${d.cidade} ${d.nome}`}
                      onClick={() => setSel(id)}
                      className={`group flex flex-col items-center gap-1.5 border p-2 transition-all ${on ? 'border-gold bg-[rgba(240,180,41,0.1)]' : 'border-line2 hover:border-line hover:bg-raise'}`}>
                      <span className={`transition-transform ${on ? 'scale-110' : 'group-hover:scale-105'}`}>
                        <TeamCrest cor={d.cor} cor2={d.cor2} sigla={d.sigla} conf={d.conf} size={40} />
                      </span>
                      <span className={`font-disp text-[12px] font-bold uppercase tracking-wide ${on ? 'text-goldhi' : 'text-dim'}`}>{d.sigla}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen px-4 py-8 transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}>
      <div className="mx-auto max-w-[1100px] space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-disp text-[52px] font-extrabold uppercase leading-[0.95] tracking-tight">
              The American Game <span style={{ color: 'var(--color-goldhi)' }}>Manager</span>
            </h1>
            <p className="mt-2 max-w-xl font-mono text-[13px] leading-relaxed text-dim">
              Modo carreira · 32 franquias (AFC/NFC) · teto salarial com inflação da TV ·
              draft de 7 rodadas · calendário oficial de 17 jogos em 18 semanas + playoffs até o Super Bowl.
            </p>
          </div>
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
            NFL · temporada 2026<span className="blink text-gold">▮</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            {renderConf('AFC')}
            {renderConf('NFC')}
          </div>

          <div className="space-y-5">
            {preview && (
              <div className="panel p-5">
                <div className="flex items-center gap-3">
                  <TeamCrest cor={preview.t.cor} cor2={preview.t.cor2} sigla={preview.t.sigla} conf={preview.t.conf} size={64} />
                  <div>
                    <div className="font-disp text-[22px] font-extrabold uppercase leading-tight">{preview.t.cidade}</div>
                    <div className="font-disp text-[16px] font-bold uppercase" style={{ color: 'var(--color-goldhi)' }}>{preview.t.nome}</div>
                    <div className="font-mono text-[10.5px] uppercase tracking-wider text-faint">{preview.t.estadioNome}</div>
                  </div>
                </div>
                <dl className="mt-4 space-y-3 font-mono text-[12.5px]">
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
                  <div className="flex justify-between text-dim"><span>Caixa disponível</span><b className="text-goldhi">${preview.t.dinheiro}M</b></div>
                  <div className="flex justify-between text-dim"><span>Jogadores</span><b className="text-ink">{preview.elenco} (53 + PS)</b></div>
                  <div className="flex justify-between text-dim"><span>Estádio / CT</span><b className="text-ink">Nv. {preview.t.estadio} / Nv. {preview.t.centroTreino}</b></div>
                </dl>
                <button className="btn btn-gold btn-pulse mt-5 w-full text-[17px]" onClick={() => dispatch({ type: 'NEW_GAME', teamId: sel })}>
                  Assumir o comando »
                </button>
              </div>
            )}

            {save && (
              <div className="panel p-5">
                <div className="font-disp text-[16px] font-bold uppercase tracking-wide">Save detectado</div>
                <p className="mt-1 font-mono text-[11.5px] text-dim">
                  Temporada {save.settings.temporada} · {save.teams.find(t => t.id === save.userTeam)?.sigla}
                </p>
                <button className="btn mt-3 w-full" onClick={() => dispatch({ type: 'LOAD_SAVE', game: save })}>
                  Continuar carreira »
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
