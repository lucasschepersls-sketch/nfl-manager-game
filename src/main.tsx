import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

/* Diagnóstico global: qualquer erro fatal aparece na tela (nunca branco silencioso). */
function fatalOverlay(msg: string) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#0a1a12;padding:24px;font-family:monospace;';
  el.innerHTML = `<div style="max-width:560px;border:2px solid #e2574b;background:#10241a;padding:28px;color:#e9f2e6">
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:800;text-transform:uppercase;color:#e2574b">Falha no pontapé inicial</div>
    <p style="margin:10px 0;font-size:13px;color:#8fab98">Um erro interrompeu o jogo. Detalhes abaixo — seu save automático está intacto.</p>
    <div style="font-size:11px;color:#7fc4e8;word-break:break-word">${msg}</div>
    <button onclick="location.reload()" style="margin-top:16px;padding:8px 18px;background:#f0b429;color:#241a02;border:none;font-weight:bold;font-family:'Barlow Condensed',sans-serif;font-size:15px;text-transform:uppercase;cursor:pointer">Recarregar</button>
  </div>`;
  document.body.appendChild(el);
}
/* Erros de ambiente (HMR do Vite, WebSocket, recursos) não são bugs do jogo —
   ignoramos para que só falhas reais da aplicação acionem o diagnóstico. */
function isEnvNoise(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('websocket') ||
    m.includes('hmr') ||
    m.includes('vite') ||
    m.includes('hot update') ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('load failed') ||
    m.includes('aborterror') ||
    m.includes('resizeobserver') ||
    m.length === 0
  );
}
window.addEventListener('error', e => {
  // Falha de carregamento de recurso (script/img) vem sem message — não é exceção de código
  if (!e.message && e.filename) return;
  const msg = `${e.message} @ ${e.filename}:${e.lineno}`;
  if (isEnvNoise(e.message ?? '')) return;
  fatalOverlay(msg);
});
window.addEventListener('unhandledrejection', e => {
  const msg = String(e.reason);
  if (isEnvNoise(msg)) return;
  fatalOverlay(msg);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
