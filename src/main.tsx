import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

/* Overlay de diagnóstico global: um erro real nunca vira "tela branca" silenciosa.
   Erros de ambiente (HMR/WebSocket/Vite) são ignorados. */
function isEnvNoise(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("websocket") ||
    m.includes("hot update") ||
    m.includes("hmr") ||
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("loading chunk") ||
    m.includes("import.meta") ||
    m.includes("vite")
  );
}

function showFatal(title: string, detail: string) {
  if (document.getElementById("fatal-overlay")) return;
  const el = document.createElement("div");
  el.id = "fatal-overlay";
  el.style.cssText =
    "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(7,19,12,0.92);padding:24px;";
  el.innerHTML =
    '<div style="max-width:560px;width:100%;border:1px solid #26492f;background:#10241a;padding:28px;font-family:monospace;">' +
    '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:26px;font-weight:800;text-transform:uppercase;color:#e2574b;">' + title + "</div>" +
    '<p style="color:#8fab98;font-size:13px;margin:10px 0 16px;">Um erro interrompeu o jogo. Seu save automático está intacto.</p>' +
    '<pre style="color:#ffd35e;font-size:11px;white-space:pre-wrap;word-break:break-word;background:#0d1e15;border:1px solid #1a3a26;padding:12px;max-height:160px;overflow:auto;">' + detail + "</pre>" +
    '<button onclick="window.location.reload()" style="margin-top:18px;font-family:\'Barlow Condensed\',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:15px;color:#241a02;background:linear-gradient(180deg,#ffd35e,#f0b429);border:1px solid #b57f0e;padding:9px 22px;cursor:pointer;">Voltar ao jogo</button>' +
    "</div>";
  document.body.appendChild(el);
}

window.addEventListener("error", (e) => {
  const msg = e.message || (e.error && e.error.message) || "erro desconhecido";
  if (!isEnvNoise(msg)) showFatal("Falha no pontapé inicial", msg);
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason ? String(e.reason.message || e.reason) : "rejeição desconhecida";
  if (!isEnvNoise(msg)) showFatal("Falha no pontapé inicial", msg);
});

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
