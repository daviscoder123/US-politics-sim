#!/usr/bin/env node
/**
 * sestav-static.cjs — generuje statický web pro GitHub Pages bez bundleru.
 * Výstup: site/app.js (engine + UI v jednom souboru, bez ESM importů Reactu)
 *        site/index.html (React/ReactDOM/Babel/Tailwind z CDN, transform TSX
 *        v prohlížeči pomocí @babel/standalone).
 *
 * Proč bez Vite: v uzavřeném prostředí není dostupný npm install. Transform
 * v prohlížeči je pro prototyp dostatečně rychlý (~1 s) a jediný soubor
 * app.js se načítá až po stažení.
 */
const fs = require("fs");
const path = require("path");

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

/* 3) Slepení + spouštěč */
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
fs.writeFileSync(path.join(cil, "app.js"), hlavicka + bundle + "\n" + app + spousteni);

/* 4) index.html */
const index = `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#020617" />
    <meta name="description" content="Politický simulátor USA — od zakladatele firmy k Bílému domu. Hratelné bez registrace; volitelně s API klíčem Mistral AI." />
    <title>Politický simulátor USA</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>
    <style>
      body { margin: 0; background: #020617; color: #e2e8f0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      #nacitani { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; }
      #nacitani .pruh { width: 200px; height: 6px; border-radius: 9999px; background: #1e293b; overflow: hidden; }
      #nacitani .vypln { height: 100%; width: 40%; border-radius: 9999px; background: linear-gradient(90deg, #10b981, #14b8a6); animation: nacitani 1.1s ease-in-out infinite; }
      @keyframes nacitani { 0% { transform: translateX(-100%);} 100% { transform: translateX(350%);} }
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
    <script>
      fetch("./app.js")
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        })
        .then(function (src) {
          var vysledek = Babel.transform(src, {
            filename: "app.tsx",
            presets: [["react", { runtime: "classic" }], "typescript"],
          });
          var script = document.createElement("script");
          script.text = vysledek.code + "\\nwindow.__render();";
          document.body.appendChild(script);
        })
        .catch(function (e) {
          var root = document.getElementById("root");
          root.textContent = "Hru se nepodařilo načíst: " + e.message;
        });
    </script>
  </body>
</html>
`;
fs.writeFileSync(path.join(cil, "index.html"), index);
fs.writeFileSync(path.join(cil, "404.html"), index);

console.log("site/app.js:", fs.statSync(path.join(cil, "app.js")).size, "B");
console.log("site/index.html:", fs.statSync(path.join(cil, "index.html")).size, "B");
console.log("OK — site hotový v", cil);
