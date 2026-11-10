// overeni.cjs — konzervativní kontrola App.tsx bez kompilátoru:
// 1) balance závorek mimo řetězce/komentáře
// 2) párování JSX tagů
// 3) importované identifikátory existují v engine-bundle
const fs = require("fs");

const app = fs.readFileSync("/home/user/us-politics-simulator/app/App.tsx", "utf8");
const bundle = fs.readFileSync("/home/user/us-politics-simulator/engine/engine-bundle.ts", "utf8");

/* --- 1) token balance --- */
function balance(text) {
  const stack = [];
  let mode = "code"; // code | str' | str" | tpl | line | block | regex | charclass
  let tplDepth = 0;
  const pairs = { ")": "(", "]": "[", "}": "{" };
  let line = 1;
  /* Poslední významný znak a slovo před ním — podle nich rozhodneme,
   * zda lomítko začíná literál regulárního výrazu, nebo je dělením. */
  let prev = "";
  let prevWord = "";
  const klicova = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "case", "do", "else", "yield", "await", "throw"]);
  const zacatekRegexu = () => {
    if (prev === "") return true;
    if (prev === "<") return false; // </div> apod. — JSX uzavírací tag, ne regex
    if (prev === ")") return false;
    if (prev === "]") return false;
    if (prev === "}") return false; // /> — JSX samouzavírací tag, ne regex
    if (prev === '"' || prev === "'" || prev === "`") return false; // za uzavřeným řetězcem nemůže být regex
    if (/[0-9]/.test(prev)) return false;
    if (/[a-zA-Z_$]/.test(prev)) return klicova.has(prevWord);
    return true;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "\n") line++;
    if (mode === "line") { if (c === "\n") mode = "code"; continue; }
    if (mode === "block") { if (c === "*" && n === "/") { mode = "code"; i++; } continue; }
    if (mode === "str'") { if (c === "\\") { i++; continue; } if (c === "'") mode = "code"; continue; }
    if (mode === 'str"') { if (c === "\\") { i++; continue; } if (c === '"') mode = "code"; continue; }
    if (mode === "tpl") {
      if (c === "\\") { i++; continue; }
      if (c === "`") { mode = "code"; continue; }
      if (c === "$" && n === "{") { stack.push({ ch: "{", line, tpl: true }); mode = "code"; i++; continue; }
      continue;
    }
    if (mode === "regex") {
      if (c === "\\") { i++; continue; }
      if (c === "[") { mode = "charclass"; continue; }
      if (c === "/") { mode = "code"; prev = "/"; prevWord = ""; continue; }
      continue;
    }
    if (mode === "charclass") {
      if (c === "\\") { i++; continue; }
      if (c === "]") mode = "regex";
      continue;
    }
    // code
    if (c === "/" && n === "/") { mode = "line"; i++; continue; }
    if (c === "/" && n === "*") { mode = "block"; i++; continue; }
    if (c === "/") {
      if (zacatekRegexu()) { mode = "regex"; prev = ""; prevWord = ""; continue; }
      prev = "/"; prevWord = ""; continue;
    }
    if (c === "'") { mode = "str'"; prev = "'"; prevWord = ""; continue; }
    if (c === '"') { mode = 'str"'; prev = '"'; prevWord = ""; continue; }
    if (c === "`") { mode = "tpl"; prev = "`"; prevWord = ""; continue; }
    if (c === "(" || c === "[" || c === "{") { stack.push({ ch: c, line, tpl: false }); prev = c; prevWord = ""; continue; }
    if (c === ")" || c === "]" || c === "}") {
      const top = stack.pop();
      if (!top || top.ch !== pairs[c]) {
        return `NEVYVÁŽENO: '${c}' na řádku ${line}, očekáváno '${top ? top.ch : "nic"}' (otevřeno na řáku ${top ? top.line : "?"})`;
      }
      if (top.tpl && c === "}") mode = "tpl";
      prev = c; prevWord = ""; continue;
    }
    if (!/\s/.test(c)) {
      prevWord = /[a-zA-Z_$0-9]/.test(c) ? (/[a-zA-Z_$0-9]/.test(prev) ? prevWord + c : c) : "";
      prev = c;
    }
  }
  if (stack.length > 0) return `NEVYVÁŽENO: neuzavřeno ${stack.length} závorek, první na řádku ${stack[0].line} (${stack[0].ch})`;
  return "OK";
}

console.log("balance App.tsx:", balance(app));
console.log("balance bundle:", balance(bundle));

/* --- 2) párování JSX tagů (hrubě: spočítáme výskyty <Tag ...> a </Tag>) --- */
const otevreneTagy = {};
const tagRe = /<\/?([A-Za-z][\w.]*)[^>]*?>/g;
let m;
let selfClosing = 0;
while ((m = tagRe.exec(app))) {
  const full = m[0];
  const name = m[1];
  if (full.startsWith("</")) {
    otevreneTagy[name] = (otevreneTagy[name] ?? 0) - 1;
  } else if (full.endsWith("/>")) {
    selfClosing++;
  } else if (full.endsWith(">") && !full.endsWith("=>")) {
    otevreneTagy[name] = (otevreneTagy[name] ?? 0) + 1;
  }
}
const nesparovane = Object.entries(otevreneTagy).filter(([k, v]) => v !== 0);
console.log("JSX self-closing tagů:", selfClosing);
console.log("JSX nespárované tagy:", nesparovane.length === 0 ? "OK" : JSON.stringify(nesparovane));

/* --- 3) importované identifikátory existují v bundle --- */
const importMatch = app.match(/import\s*\{([\s\S]*?)\}\s*from\s*"..\/engine\/engine-bundle\.ts"/);
if (importMatch) {
  const names = importMatch[1].split(",").map((s) => s.trim().replace(/^type\s+/, "")).filter(Boolean);
  const missing = names.filter((n) => !new RegExp(`\\b${n}\\b`).test(bundle));
  console.log("chybějící exporty bundle:", missing.length === 0 ? "OK (vše nalezeno)" : JSON.stringify(missing));
} else {
  console.log("CHYBA: import z engine-bundle nenalezen!");
}

/* --- 4) MAPA_RADKY vs STATY_EV --- */
const mapuKody = [...app.matchAll(/"([A-Z]{2})"/g)].map((x) => x[1]);
const radyText = app.slice(app.indexOf("MAPA_RADKY"), app.indexOf("EV_TABULKA"));
const kodyMapy = [...new Set([...radyText.matchAll(/"([A-Z]{2})"/g)].map((x) => x[1]))];
const evKody = [...bundle.matchAll(/\{ stat: "([A-Z]{2})", ev: \d+, lean: -?\d+ \}/g)].map((x) => x[1]);
console.log("kódů v mapě:", kodyMapy.length, "· států v STATY_EV:", new Set(evKody).size);
const rozdil = kodyMapy.filter((k) => !evKody.includes(k));
console.log("kódy mapy mimo STATY_EV:", rozdil.length === 0 ? "OK" : JSON.stringify(rozdil));
