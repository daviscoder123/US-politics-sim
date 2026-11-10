/**
 * social.test.ts — prestižní brána, konverzace, sliby a jejich lhůty.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { vytvorNovouHru, type GameState, type NPC } from "../engine/src/state.ts";
import {
  FUNKCE_BONUS,
  branaPrestize,
  ochota,
  provedKonverzaci,
  slibyTick,
  splnSlib,
} from "../engine/src/social.ts";

function novaHra(): GameState {
  return vytvorNovouHru({
    seed: 77,
    jmeno: "Test",
    vek: 40,
    archetyp: "pravnik",
    rodneMistoUS: true,
    naturalizovany: false,
    zivotopisText: "x",
    domovskyStat: "OH",
  });
}

function npc(overrides: Partial<NPC> = {}): NPC {
  return {
    id: "npc-1",
    jmeno: "Ředitel Hartman",
    role: "sponzor",
    prestiz: 50,
    vztah: 0,
    ochotaHistorie: [],
    pamet: [],
    sponzorTyp: "individual",
    ...overrides,
  };
}

test("brána prestiže: vzorec npc.prestiz − (sk + vztah*5 + bonus)", () => {
  const s = novaHra(); // sociální kapitál 36 (právník), úroveň outsider
  s.postava.atributy.socialniKapital = 30;
  const n = npc(); // prestiz 50
  assert.equal(branaPrestize(n, s), 20);
  assert.equal(ochota(n, s), false);
});

test("brána prestiže: bonus úřadu otvírá dveře", () => {
  const s = novaHra();
  s.postava.atributy.socialniKapital = 30;
  const n = npc();
  s.funkce.uroven = "prezident"; // bonus 20 → brána 0
  assert.equal(branaPrestize(n, s), 0);
  assert.equal(ochota(n, s), true);
  assert.equal(FUNKCE_BONUS.prezident, 20);
  assert.equal(FUNKCE_BONUS.outsider, 0);
  assert.ok(FUNKCE_BONUS.guverner > FUNKCE_BONUS.kongresman);
});

test("brána prestiže: vztah*5 funguje", () => {
  const s = novaHra();
  s.postava.atributy.socialniKapital = 30;
  const n = npc({ vztah: 4 }); // 50 − (30 + 20 + 0) = 0
  assert.equal(branaPrestize(n, s), 0);
  assert.equal(ochota(n, s), true);
  const n2 = npc({ vztah: 3 }); // 50 − (30 + 15) = 5
  assert.equal(ochota(n2, s), false);
});

test("konverzace: přijato, vztah se mění, slib uložen do paměti NPC i seznamu slibů", () => {
  const s = novaHra();
  s.postava.atributy.socialniKapital = 60; // brána otevřená
  const n = npc();
  s.npc.push(n);
  const pred = n.vztah;
  const vysl = provedKonverzaci(s, "npc-1", 0.5, "Postavím novou školu.");
  assert.equal(vysl.prijato, true);
  assert.ok(n.vztah !== pred || vysl.zmenaVztahu === 0);
  assert.equal(s.sliby.length, 1);
  assert.equal(s.sliby[0].stav, "v_progressu");
  assert.ok(n.pamet.some((z) => z.includes("Postavím novou školu")));
  assert.ok(n.ochotaHistorie.length === 1);
  assert.ok(s.postava.atributy.socialniKapital > 60 - 0.01); // roste
});

test("konverzace: odmítnutí nad bránou nemění nic", () => {
  const s = novaHra();
  s.postava.atributy.socialniKapital = 5;
  const n = npc();
  s.npc.push(n);
  const vysl = provedKonverzaci(s, "npc-1", 0.5, "Slib.");
  assert.equal(vysl.prijato, false);
  assert.equal(s.sliby.length, 0);
  assert.equal(n.pamet.length, 0);
});

test("slibyTick: nesplněný slib po lhutě je porušen (vztah −3, integrita −4)", () => {
  const s = novaHra();
  const n = npc();
  s.npc.push(n);
  s.sliby.push({
    id: "slib-1",
    text: "Snížím kriminalitu.",
    komu: "npc-1",
    koloSlibu: 10,
    lhutaKolo: 62,
    stav: "v_progressu",
  });
  s.kolo = 63;
  n.vztah = 2;
  const integritaPred = s.postava.atributy.integrita;
  const zpravy = slibyTick(s);
  assert.equal(s.sliby[0].stav, "porusen");
  assert.equal(n.vztah, -1);
  assert.equal(s.postava.atributy.integrita, integritaPred - 4);
  assert.equal(zpravy.length, 1);
  // Opakovaný tick už nepřičítá (idempotentní).
  assert.equal(slibyTick(s).length, 0);
});

test("splnSlib: splněný slib posiluje vztah a integritu", () => {
  const s = novaHra();
  const n = npc();
  s.npc.push(n);
  s.sliby.push({
    id: "slib-1",
    text: "Snížím kriminalitu.",
    komu: "npc-1",
    koloSlibu: 10,
    lhutaKolo: 62,
    stav: "v_progressu",
  });
  n.vztah = 0;
  const integritaPred = s.postava.atributy.integrita;
  const v = splnSlib(s, "slib-1");
  assert.equal(v.ok, true);
  assert.equal(s.sliby[0].stav, "splnen");
  assert.equal(n.vztah, 2);
  assert.equal(s.postava.atributy.integrita, integritaPred + 3);
  // Podruhé nelze.
  const v2 = splnSlib(s, "slib-1");
  assert.equal(v2.ok, false);
});
