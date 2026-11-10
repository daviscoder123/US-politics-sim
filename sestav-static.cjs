#!/usr/bin/env node
/**
 * sestav-static.cjs — generuje statický web pro GitHub Pages bez bundleru.
 *
 * Výstup:
 *   site/app.js                  — engine + UI, PŘELOŽENÉ (plain JS, žádný JSX/TS
 *                                  v prohlížeči, žádný runtime Babel)
 *   site/react.production.min.js — vestavěný React (bez CDN)
 *   site/react-dom.production.min.js — vestavěný ReactDOM (bez CDN)
 *   site/index.html / 404.html   — načítací stránka s viditelnou diagnostikou
 *
 * Proč bez Vite/npm: v uzavřeném prostředí není dostupný npm install.
 * Vestavěný React a přeložený app.js odstraňují závislost na unpkg — jediné
 * externí CDN zůstává Tailwind (s náhradní adresou a varováním při výpadku).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const cil = path.join(root, "site");
fs.mkdirSync(cil, { recursive: true });

/* 1) Engine bez export klíčových slov */
let bundle = fs.readFileSync(path.join(root, "engine/engine-bundle.ts"), "utf8");
bundle = bundle.replace(/^export /gm, "");

/* 2) Tělo App.tsx bez importního bloku (importy nahradí globální React) */
let app = fs.readFileSync(path.join(root, "app/App.tsx"), "utf8");
app = app.replace(/^import React[^\n]*\n/, "");
app = app.replace(/^import \{[\s\S]*?\} from "\.\.\/engine\/engine-bundle\.ts";\n/, "");
app = app.replace(/^export default function App\(\) \{/m, "function App() {");
if (app.includes("export default")) {
  throw new Error("V app těle zbyl neočekávaný export default.");
}

/* 3) Slepení + spouštěč (zdroj v TSX — přeloží se v kroku 4) */
const hlavicka = `/* Vygenerováno sestav-static.cjs — neupravovat ručně. */
const { useEffect, useMemo, useRef, useState } = React;
`;
const spousteni = `
window.__render = function () {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Chybí element #root.");
  ReactDOM.createRoot(rootEl).render(React.createElement(App));
};
`;
const tsxZdroj = hlavicka + bundle + "\n" + app + spousteni;

/* 4) Překlad TSX -> plain JS pomocí @babel/standalone (build-time).
 *    V prohlížeči už žádný Babel není — jen hotový JS.
 *    Vestavěnou kopii drží vendor/babel.min.js; chybí-li, stáhne se jednou. */
const babelCesta = path.join(root, "vendor/babel.min.js");
if (!fs.existsSync(babelCesta) || fs.statSync(babelCesta).size < 1000000) {
  const { execSync } = require("child_process");
  console.log("Stahuji @babel/standalone do vendor/babel.min.js…");
  execSync('curl -sSfL "https://unpkg.com/@babel/standalone@7.26.4/babel.min.js" -o "' + babelCesta + '"', { stdio: "inherit", timeout: 120000 });
}
if (!fs.existsSync(babelCesta) || fs.statSync(babelCesta).size < 1000000) {
  throw new Error("Babel se nepodařilo stáhnout ani najít ve vendor/babel.min.js.");
}
const babelZdroj = fs.readFileSync(babelCesta, "utf8");
const babelKontext = { console, window: {}, self: {}, global: {}, setTimeout: () => {} };
vm.createContext(babelKontext);
vm.runInContext(babelZdroj, babelKontext, { timeout: 60000 });
const Babel = babelKontext.Babel || babelKontext.window.Babel;
if (!Babel || typeof Babel.transform !== "function") {
  throw new Error("Vestavěný Babel se nepodařilo inicializovat.");
}
const prelozeno = Babel.transform(tsxZdroj, {
  filename: "app.tsx",
  presets: [["react", { runtime: "classic" }], "typescript"],
});
fs.writeFileSync(path.join(cil, "app.js"), prelozeno.code);

/* 5) Vestavěný React a ReactDOM do site/ (bez CDN) */
fs.copyFileSync(path.join(root, "vendor/react.production.min.js"), path.join(cil, "react.production.min.js"));
fs.copyFileSync(path.join(root, "vendor/react-dom.production.min.js"), path.join(cil, "react-dom.production.min.js"));

/* 6) index.html — vše lokálně kromě Tailwind (s fallbackem a diagnostikou) */
const index = `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#020617" />
    <meta name="description" content="Politický simulátor USA — od zakladatele firmy k Bílému domu. Hratelné bez registrace; volitelně s API klíčem Mistral AI." />
    <title>Politický simulátor USA</title>
    <script>
      /* Tailwind CDN s náhradní adresou; výpadek stylů hru nepřeruší. */
      (function () {
        var n = document.createElement("script");
        n.src = "https://cdn.tailwindcss.com";
        n.onerror = function () {
          var f = document.createElement("script");
          f.src = "https://cdn.jsdelivr.net/npm/tailwindcss-cdn@0.0.1/cdn.min.js";
          document.head.appendChild(f);
        };
        document.head.appendChild(n);
      })();
    </script>
    <script src="./react.production.min.js"></script>
    <script src="./react-dom.production.min.js"></script>
    <style>
      body { margin: 0; background: #020617; color: #e2e8f0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      #nacitani { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; }
      #nacitani .pruh { width: 200px; height: 6px; border-radius: 9999px; background: #1e293b; overflow: hidden; }
      #nacitani .vypln { height: 100%; width: 40%; border-radius: 9999px; background: linear-gradient(90deg, #10b981, #14b8a6); animation: nacitani 1.1s ease-in-out infinite; }
      @keyframes nacitani { 0% { transform: translateX(-100%);} 100% { transform: translateX(350%);} }
      #diagnostika { display: none; position: fixed; left: 12px; bottom: 12px; right: 12px; max-width: 560px; margin: 0 auto; padding: 12px 16px; border-radius: 12px; background: #450a0a; color: #fecaca; font-size: 13px; line-height: 1.5; z-index: 50; }
    </style>
  </head>
  <body>
    <div id="root">
      <div id="nacitani">
        <div style="font-weight: 700; letter-spacing: 0.05em;">POLITICKÝ SIMULÁTOR USA</div>
        <div class="pruh"><div class="vypln"></div></div>
        <div style="font-size: 12px; color: #94a3b8;">Sestavuji štáb…</div>
      </div>
    </div>
    <div id="diagnostika"></div>
    <script>
      function ukazChybu(txt) {
        var d = document.getElementById("diagnostika");
        if (!d) return;
        d.style.display = "block";
        d.textContent = txt;
      }
      window.addEventListener("error", function (e) {
        ukazChybu("Běh hry narazil na chybu: " + (e.message || "neznámá chyba"));
      });
    </script>
    <script src="./app.js" onerror="ukazChybu('Nepodařilo se stáhnout soubor hry (app.js). Zkuste obnovit stránku.')"></script>
    <script>
      if (typeof window.__render === "function") {
        try {
          window.__render();
        } catch (e) {
          ukazChybu("Hra se nespustila: " + (e && e.message ? e.message : e));
        }
      } else {
        ukazChybu("Hra se nenačetla — chybí přeložený soubor hry. Zkuste obnovit stránku (Ctrl+Shift+R).");
      }
    </script>
  </body>
</html>
`;
fs.writeFileSync(path.join(cil, "index.html"), index);
fs.writeFileSync(path.join(cil, "404.html"), index);

console.log("site/app.js:", fs.statSync(path.join(cil, "app.js")).size, "B");
console.log("site/index.html:", fs.statSync(path.join(cil, "index.html")).size, "B");
console.log("OK — site hotový v", cil);
