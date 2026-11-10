/**
 * events.test.ts — šablony událostí a validátor AI návrhů (schema validace,
 * povolené klíče efektů, magnituda −1..1).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { vytvorNovouHru } from "../engine/src/state.ts";
import { Rng } from "../engine/src/rng.ts";
import {
  SABLONY,
  eventTick,
  validateAiEventProposal,
  applyAiEvent,
  POVOLENE_KLICE_EFEKTU,
} from "../engine/src/events.ts";

function novaHra() {
  return vytvorNovouHru({
    seed: 8,
    jmeno: "Test",
    vek: 40,
    archetyp: "pravnik",
    rodneMistoUS: true,
    naturalizovany: false,
    zivotopisText: "x",
    domovskyStat: "OH",
  });
}

test("šablony: kladné váhy, popisy, témata", () => {
  const s = novaHra();
  assert.ok(SABLONY.length >= 6);
  for (const t of SABLONY) {
    assert.ok(t.vaha(s) > 0, `šablona ${t.id} má kladnou váhu`);
    assert.ok(t.nazev.length > 0);
    assert.ok(t.popis.length > 10);
  }
});

test("eventTick: 25 % šance týdně, událost se zapíše do stavu", () => {
  let provedeno = 0;
  for (let i = 0; i < 200; i++) {
    const s = novaHra();
    s.kolo = i + 1;
    const rng = new Rng(i * 17 + 3);
    const udalosti = eventTick(s, rng);
    if (udalosti.length > 0) {
      provedeno++;
      assert.ok(s.udalosti.length >= 1);
      assert.ok(udalosti[0].popis.length > 0);
    }
  }
  assert.ok(provedeno > 20 && provedeno < 80, `události měly proběhnout zhruba v 25 % týdnů, proběhlo ${provedeno}/200`);
});

test("validátor AI: platný návrh projde", () => {
  const v = validateAiEventProposal({
    tema: "klima",
    nazev: "Povodeň v povodí Ohio",
    popis: "Bouřková vlna zaplavila centrum města.",
    dopady: { spokojenost: -0.4, znamostLokal: 0.3 },
  });
  assert.equal(v.platny, true);
  assert.deepEqual(v.chyby, []);
  assert.deepEqual(v.ocisteneDopady, { spokojenost: -0.4, znamostLokal: 0.3 });
});

test("validátor AI: nepovolený klíč a magnituda mimo rozsah jsou odmítnuty", () => {
  const v1 = validateAiEventProposal({
    nazev: "Titul",
    popis: "Dostatečně dlouhý popis události.",
    dopady: { evHrac: 538 }, // klíč mimo schema
  });
  assert.equal(v1.platny, false);
  assert.ok(v1.chyby.some((c) => c.includes("Nepovolený klíč")));

  const v2 = validateAiEventProposal({
    nazev: "Titul",
    popis: "Dostatečně dlouhý popis události.",
    dopady: { spokojenost: 5 }, // magnituda > 1
  });
  assert.equal(v2.platny, false);
  assert.ok(v2.chyby.some((c) => c.includes("rozsah")));

  const v3 = validateAiEventProposal({ nazev: "X", popis: "krátké" });
  assert.equal(v3.platny, false);
  assert.ok(v3.chyby.length >= 2);
});

test("applyAiEvent: očištěné dopady se aplikují s clampem", () => {
  const s = novaHra();
  const validace = validateAiEventProposal({
    nazev: "Energetický šok",
    popis: "Výpadek sítě zvedl ceny elektřiny.",
    dopady: { spokojenost: -0.5, pokladna: -0.2 },
  });
  const spokojenostPred = s.local.spokojenost;
  const pokladnaPred = s.finance.pokladnaKampane;
  const udalost = applyAiEvent(s, validace, validace.ocisteneDopady ? "Energetický šok" : "", "popis", "energetika");
  assert.ok(udalost);
  assert.equal(s.local.spokojenost, Math.max(0, spokojenostPred - 10));
  assert.equal(s.finance.pokladnaKampane, Math.max(0, pokladnaPred - 20_000));
  assert.equal(s.udalosti.length, 1);
  // Neplatný návrh se nepoužije.
  const neplatna = validateAiEventProposal({ nazev: "", popis: "x", dopady: { evHrac: 1 } });
  assert.equal(applyAiEvent(s, neplatna, "n", "p", "klima"), null);
  assert.equal(s.udalosti.length, 1);
});

test("povolené klíče efektů pokrývají atributy, finance, obec i makro", () => {
  for (const k of ["pokladna", "socialniKapital", "etika", "prodejnost", "znamostLokal", "znamostStat", "znamostNarod", "spokojenost", "kriminalita", "inflaceDelta", "hdpDelta"]) {
    assert.ok((POVOLENE_KLICE_EFEKTU as readonly string[]).includes(k));
  }
});
