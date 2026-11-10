/**
 * harness.cjs — plnohodnotná simulace prohlížeče pro aplikaci Dračí doupě USA.
 * Mini-React s funkčními hooky, hledání prvků dle textu, reálná volání na api.mistral.ai.
 */
const fs = require("fs");
const vm = require("vm");

const KLIC = process.env.MISTRAL_API_KEY || "";
const APP = process.argv[2] === "deploy" ? "/tmp/live-app.js" : "/home/user/us-politics-simulator/site/app.js";

const storageData = new Map();
const localStorageStub = {
  getItem: (k) => (storageData.has(k) ? storageData.get(k) : null),
  setItem: (k, v) => storageData.set(k, String(v)),
  removeItem: (k) => storageData.delete(k),
};

const hooks = new Map();
let rootDescriptor = null;
let renderedTree = null;
let renderScheduled = false;
let currentPath = null;

function getHooks(path) {
  if (!hooks.has(path)) hooks.set(path, { states: [], idx: 0, eidx: 0, effSlots: [] });
  return hooks.get(path);
}
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  setImmediate(() => {
    renderScheduled = false;
    rerender();
  });
}
function renderNode(el, path) {
  if (el === null || el === undefined || el === false || el === true) return null;
  if (Array.isArray(el)) return el.map((c, i) => renderNode(c, path + "." + i));
  if (typeof el === "object" && typeof el.type === "function") {
    const h = getHooks(path);
    h.idx = 0;
    h.eidx = 0;
    const prevPath = currentPath;
    currentPath = path;
    const out = el.type(el.props);
    currentPath = prevPath;
    return renderNode(out, path);
  }
  if (typeof el === "object" && Array.isArray(el.children)) {
    el.children = el.children.map((c, i) => renderNode(c, path + "." + i));
  }
  return el;
}
function rerender() {
  renderedTree = renderNode(rootDescriptor, "root");
  const run = [];
  for (const h of hooks.values()) {
    h.effSlots.forEach((s) => {
      if (s.toRun) { run.push({ s, fn: s.toRun }); s.toRun = null; }
    });
  }
  for (const r of run) r.fn();
}


const React = {
  createElement(type, props, ...children) {
    const p = Object.assign({}, props || {});
    if (children.length === 1) p.children = children[0];
    else if (children.length > 1) p.children = children;
    return { type, props: p, children };
  },
  Fragment: "FRAGMENT",
  useState(init) {
    const h = getHooks(currentPath);
    const i = h.idx++;
    if (!(i in h.states)) h.states[i] = typeof init === "function" ? init() : init;
    const path = currentPath;
    const setter = (val) => {
      const cur = getHooks(path);
      cur.states[i] = typeof val === "function" ? val(cur.states[i]) : val;
      scheduleRender();
    };
    return [h.states[i], setter];
  },
  useRef(init) {
    const h = getHooks(currentPath);
    const i = h.idx++;
    if (!(i in h.states)) h.states[i] = { current: typeof init === "function" ? init() : init };
    return h.states[i];
  },
  useMemo(fn) {
    const h = getHooks(currentPath);
    const i = h.idx++;
    if (!(i in h.states)) h.states[i] = { v: fn() };
    return h.states[i].v;
  },
  useEffect(fn, deps) {
    const h = getHooks(currentPath);
    const i = h.eidx++;
    if (!h.effSlots[i]) h.effSlots[i] = { first: true, last: null, toRun: null };
    const s = h.effSlots[i];
    const zmena = s.first || !deps || !deps.every((v, k) => Object.is(v, s.last && s.last[k]));
    if (zmena) { s.toRun = fn; s.last = deps; s.first = false; }
  },
};

const ReactDOM = {
  createRoot() {
    return {
      render(el) {
        rootDescriptor = el;
        rerender();
      },
    };
  },
};

const ctx = {
  React,
  ReactDOM,
  fetch,
  console,
  setTimeout,
  clearTimeout,
  setImmediate,
  window: { localStorage: localStorageStub },
  document: { getElementById: () => ({ id: "root" }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);

const app = fs.readFileSync(APP, "utf8");
vm.runInContext(app, ctx, { timeout: 60000 });
ctx.window.__render();
if (!renderedTree) throw new Error("render nevytvořil strom");

function collect(el, out) {
  if (el === null || el === undefined) return out;
  if (Array.isArray(el)) {
    for (const c of el) collect(c, out);
    return out;
  }
  if (typeof el === "object") {
    if (typeof el.children !== "undefined") collect(el.children, out);
  }
  if (typeof el === "string" || typeof el === "number") out.push(String(el));
  return out;
}
const textStr = () => collect(renderedTree, []).join(" ");
const chatState = () => hooks.get("root").states[1];

function najdi(pred, what) {
  const found = [];
  const walk = (el) => {
    if (el === null || el === undefined) return;
    if (Array.isArray(el)) return el.forEach(walk);
    if (typeof el !== "object") return;
    if (pred(el)) found.push(el);
    if (el.children) el.children.forEach(walk);
  };
  walk(renderedTree);
  if (found.length === 0) throw new Error("NENALEZENO: " + what);
  return found[0];
}
const buttonText = (t) => najdi((n) => n.type === "button" && collect(n.children, []).join(" ").trim() === t, "tlačítko " + t);
const inputPlaceholder = (t) => najdi((n) => n.type === "input" && String(n.props.placeholder || "").includes(t), "input " + t);
const tick = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
async function klikni(el) { el.props.onClick({ preventDefault: () => {} }); await tick(); }
async function vyplnit(el, value) { el.props.onChange({ target: { value } }); await tick(); }

(async () => {
  const log = (s) => console.log("•", s);
  const konec = (ok, msg) => { console.log(ok ? "=== ÚSPĚCH ===" : "=== SELHÁNÍ ===", msg || ""); process.exit(ok ? 0 : 1); };

  /* 1) Prolog */
  if (!textStr().includes("Dračí doupě USA")) konec(false, "prolog nevidí titul");
  log("1 · Prolog načten");

  /* 2) Start + úvodní karta */
  await klikni(buttonText("Vstoupit do doupěte"));
  if (!textStr().includes("Rozhovor s herním mistrem")) konec(false, "karta rozhovoru se nevykreslila (obsah karet!)");
  if (!textStr().includes("Herní mistr usedá ke stolu")) konec(false, "chybí uvítací zpráva");
  log("2 · Hra odstartována — karta rozhovoru vykreslena, uvítací zpráva v chatu");

  /* 3) Klíč */
  await klikni(buttonText("AI"));
  await vyplnit(inputPlaceholder("vložte klíč"), KLIC);
  if (!textStr().includes("Herní mistr: Mistral AI")) konec(false, "štítek Mistral AI neaktivní");
  log("3 · Klíč vložen");

  /* 4) Ověření klíče — reálné volání */
  await klikni(buttonText("Ověřit klíč Mistral"));
  for (let s = 0; s < 15 && !textStr().includes("Klíč je platný"); s++) await new Promise((r) => setTimeout(r, 1000));
  if (!textStr().includes("Klíč je platný")) konec(false, "ověření klíče nedopadlo: " + textStr().slice(-300));
  log("4 · Klíč ověřen naživo („Klíč je platný“)");

  /* 5) Záměr — reálné AI volání */
  const chatInput = inputPlaceholder("Záměr, otázka");
  await vyplnit(chatInput, "Založ volební výbor a dej 5 000 na reklamu.");
  await klikni(buttonText("Odeslat"));
  let hotovo5 = false;
  for (let s = 0; s < 25; s++) {
    await new Promise((r) => setTimeout(r, 1000));
    const c = chatState();
    const hrac = c.some((m) => m.role === "hrac");
    const aiOdpoved = c.some((m) => m.role === "ai");
    const akce = c.some((m) => m.akce && m.akce.length > 0);
    if (hrac && aiOdpoved && akce) { hotovo5 = true; break; }
    if (s === 4) log("5 · mezikrok: hráč v chatu=" + hrac + ", AI odpověď=" + aiOdpoved + ", akce=" + akce);
  }
  if (!hotovo5) {
    console.log("CHAT NA SELHÁNÍ:", JSON.stringify(chatState().map((m) => ({ role: m.role, text: (m.text || "").slice(0, 200), akce: m.akce, poznamka: m.poznamka })), null, 1));
    konec(false, "AI odpověď nedorazila");
  }
  const akceTxt = JSON.stringify(chatState().flatMap((m) => m.akce || []));
  log("5 · Herní mistr odpověděl a vykonal akce: " + akceTxt.slice(0, 200));

  /* 6) Rozhovorový režim */
  await vyplnit(inputPlaceholder("Záměr, otázka"), "Herní mistře, kdo mi ve městě nejvíc škodí? Pověz vyprávěním, žádné akce.");
  await klikni(buttonText("Odeslat"));
  let hotovo6 = false;
  for (let s = 0; s < 25; s++) {
    await new Promise((r) => setTimeout(r, 1000));
    const c = chatState();
    const posledni = c[c.length - 1];
    if (posledni && posledni.role === "ai" && (!posledni.akce || posledni.akce.length === 0) && (posledni.text || "").length > 60) { hotovo6 = true; break; }
  }
  if (!hotovo6) {
    console.log("CHAT:", JSON.stringify(chatState().map((m) => ({ role: m.role, text: (m.text || "").slice(0, 150), akce: m.akce })), null, 1));
    konec(false, "rozhovorový režim neodpověděl");
  }
  log("6 · Rozhovorový režim: herní mistr odpověděl čistým vyprávěním bez akcí");
  log("   „" + String(chatState()[chatState().length - 1].text).slice(0, 160) + "…“");

  konec(true, "AI POLE JE PLNĚ FUNKČNÍ: karty, klíč, ověření, záměry i rozhovor.");
})().catch((e) => { console.error("VÝJIMKA:", e.message); process.exit(1); });
