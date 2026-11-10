// merge.js — generuje engine/engine-bundle.ts z engine/src/*.ts
// Pořadí dle závislostí; odstraňuje importy; identické top-level deklarace
// (např. helper r1 v actions.ts a events.ts) deduplikuje.
const fs = require("fs");
const path = require("path");

const SRC = "/home/user/us-politics-simulator/engine/src";
const OUT = "/home/user/us-politics-simulator/engine/engine-bundle.ts";

const ORDER = ["rng", "state", "zakony", "realne-zakony", "law", "economy", "indicators", "social", "elections", "actions", "events", "audit", "game", "ai", "poradce"];

function extractTopLevelBlocks(lines) {
  // vrací pole {start, end, name, text} top-level deklarací (function/const/interface/type/class)
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = /^(?:export )?(function\*?|const|let|interface|type|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) {
      let j = i;
      let depth = 0;
      let started = false;
      for (; j < lines.length; j++) {
        const l = lines[j];
        for (const ch of l) {
          if (ch === "{") { depth++; started = true; }
          else if (ch === "}") depth--;
        }
        // jednorádkové deklarace bez závorek (např. export const X = 5;)
        if (!started && /;\s*$/.test(l)) { break; }
        // konec typu/interface bez středníku: ";"
        if (started && depth === 0) break;
        if (!started && j > i && !/^\s/.test(l) && l.trim() !== "") break;
      }
      const blockLines = lines.slice(i, j + 1);
      blocks.push({
        name: m[2],
        kind: m[1],
        start: i,
        end: j,
        text: blockLines.join("\n"),
      });
      i = j + 1;
    } else {
      i++;
    }
  }
  return blocks;
}

const sections = [];
const seenBodies = new Map(); // name+kind → text
const dropped = [];

for (const name of ORDER) {
  const raw = fs.readFileSync(path.join(SRC, name + ".ts"), "utf8");
  // odstranění importů (i multiline): od řádku s „import“ po řádek s „from“
  const srcLines = raw.split("\n");
  const kept = [];
  let skipping = false;
  for (const l of srcLines) {
    if (skipping) {
      kept.length; // pokračujeme v přeskakování
      if (/\bfrom\b/.test(l)) skipping = false;
      continue;
    }
    if (/^\s*import\b/.test(l)) {
      if (!/\bfrom\b/.test(l)) skipping = true;
      continue;
    }
    kept.push(l);
  }
  const noImports = kept.join("\n");
  const lines = noImports.split("\n");

  const blocks = extractTopLevelBlocks(lines);
  const dropRanges = [];
  for (const b of blocks) {
    const key = `${b.kind} ${b.name}`;
    if (seenBodies.has(key)) {
      const prev = seenBodies.get(key);
      if (prev === b.text.replace(/^export /m, "") || prev === b.text || prev.replace(/^export /m, "") === b.text) {
        dropRanges.push([b.start, b.end]);
        dropped.push(`${name}.ts: ${key}`);
      } else {
        throw new Error(`Konflikt deklarace ${key} v ${name}.ts — těla se liší, řešte ručně.`);
      }
    } else {
      seenBodies.set(key, b.text);
    }
  }

  let out = [];
  for (let i = 0; i < lines.length; i++) {
    const inDrop = dropRanges.some(([a, z]) => i >= a && i <= z);
    if (inDrop) continue;
    out.push(lines[i]);
  }
  sections.push(`/* ===== ${name}.ts ===== */\n` + out.join("\n").trim() + "\n");
}

const bundle = `/*
 * engine-bundle.ts — sloučený engine (všechny moduly v jednom souboru).
 * Generováno mechanicky z engine/src/*.ts; úpravy provádějte v modulech.
 * Pořadí: ${ORDER.join(", ")}.
 */

` + sections.join("\n");

fs.writeFileSync(OUT, bundle);
console.log("zapsáno", OUT, fs.statSync(OUT).size, "B");
console.log("deduplikováno:", dropped.join("; ") || "nic");
