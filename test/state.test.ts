/**
 * state.test.ts — vytvoření nové hry a katalog archetypů.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { vytvorNovouHru, ARCHETYPY, rngProStav } from "../engine/src/state.ts";

function novaHra(overrides: Partial<Parameters<typeof vytvorNovouHru>[0]> = {}) {
  return vytvorNovouHru({
    seed: 777,
    jmeno: "Test Hráč",
    vek: 38,
    archetyp: "software-podnikatel",
    rodneMistoUS: true,
    naturalizovany: false,
    zivotopisText: "Zakladatel startupu.",
    domovskyStat: "OH",
    ...overrides,
  });
}

test("vytvorNovouHru: výchozí hodnoty stavu", () => {
  const s = novaHra();
  assert.equal(s.kolo, 1);
  assert.equal(s.tyden, 1);
  assert.equal(s.rok, 2027);
  assert.equal(s.ap, 10);
  assert.equal(s.funkce.uroven, "outsider");
  assert.equal(s.finance.pokladnaKampane, 0);
  assert.equal(s.finance.vyborZalozen, false);
  assert.equal(s.pravni.kriminalniRiziko, 0);
  assert.equal(s.pravni.odsouzen, false);
  assert.equal(s.beziKampan.typZavodu, null);
  // Kalibrace makra (podzim 2026): CBO FY2026.
  assert.equal(s.macro.inflace, 3.7);
  assert.equal(s.macro.deficitPctHDP, 6.2);
  assert.equal(s.macro.dluhPctHDP, 100.0);
  assert.equal(s.macro.rating, "AA+");
});

test("vytvorNovouHru: archetyp se promítne do atributů", () => {
  const s = novaHra({ archetyp: "software-podnikatel" });
  assert.equal(s.postava.atributy.majetekUSD, 12_400_000);
  assert.equal(s.postava.dovednosti.finance, 8);
  assert.equal(s.postava.ideologie, 0);
  const s2 = novaHra({ archetyp: "ochranar-krajiny", seed: 778 });
  assert.equal(s2.postava.atributy.majetekUSD, 180_000);
  assert.equal(s2.postava.ideologie, -6);
});

test("vytvorNovouHru: neznámý archetyp vyhodí chybu", () => {
  assert.throws(() => novaHra({ archetyp: "neexistuje" }));
});

test("ARCHETYPY: 12 archetypů, unikátní id, ideologie v mezích", () => {
  assert.equal(ARCHETYPY.length, 12);
  const ids = ARCHETYPY.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ARCHETYPY) {
    assert.ok(a.ideologie >= -10 && a.ideologie <= 10, `ideologie mimo rozsah: ${a.id}`);
    assert.ok(a.majetekUSD > 0);
    assert.ok(a.socialniKapital > 0 && a.socialniKapital <= 100);
  }
});

test("rngProStav: deterministické odvození ze seedu a kola", () => {
  const s = novaHra();
  const r1 = rngProStav(s);
  const r2 = rngProStav({ ...s });
  assert.equal(r1.next(), r2.next());
  s.kolo = 5;
  const r3 = rngProStav(s);
  assert.notEqual(r1.seed(), r3.seed());
});
