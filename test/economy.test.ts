/**
 * economy.test.ts — směr ekonomických vztahů (Okun, Phillips, Taylor),
 * rating, akumulace dluhu a detekce krizí.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { vytvorNovouHru } from "../engine/src/state.ts";
import {
  prepoctiMakro,
  ratingPro,
  fedSazba,
  makroKrize,
  lokalkaTick,
  NAIRU,
  type Macro,
} from "../engine/src/economy.ts";

const ZAKLAD: Macro = {
  hdpRust: 2.1,
  inflace: 3.7,
  nezamestnanost: 4.2,
  fedSazba: 3.88,
  deficitPctHDP: 6.2,
  dluhPctHDP: 100.0,
  rating: "AA+",
};

test("prepoctiMakro: fiskální expanze zvyšuje růst i inflaci", () => {
  const expanze = prepoctiMakro(ZAKLAD, { fiscalDelta: 2, sok: 0 });
  const restrikce = prepoctiMakro(ZAKLAD, { fiscalDelta: -2, sok: 0 });
  assert.ok(expanze.hdpRust > restrikce.hdpRust, "expanze má růst rychleji");
  assert.ok(expanze.inflace > restrikce.inflace, "expanze má tláčit inflaci výš");
});

test("prepoctiMakro: Okun — rychlejší růst snižuje nezaměstnanost", () => {
  const silny = prepoctiMakro({ ...ZAKLAD, hdpRust: 5 }, { fiscalDelta: 0, sok: 0 });
  const slaby = prepoctiMakro({ ...ZAKLAD, hdpRust: -2 }, { fiscalDelta: 0, sok: 0 });
  assert.ok(silny.nezamestnanost < slaby.nezamestnanost);
});

test("prepoctiMakro: Phillips — nezaměstnanost pod NAIRU zvyšuje inflaci", () => {
  const horka = prepoctiMakro({ ...ZAKLAD, nezamestnanost: 2.5 }, { fiscalDelta: 0, sok: 0 });
  const chladna = prepoctiMakro({ ...ZAKLAD, nezamestnanost: 8 }, { fiscalDelta: 0, sok: 0 });
  assert.ok(horka.inflace > chladna.inflace, `horká inflace ${horka.inflace} má být vyšší než ${chladna.inflace}`);
  assert.equal(NAIRU, 4.3);
});

test("prepoctiMakro: dluh kumuluje deficit", () => {
  let m = { ...ZAKLAD };
  const deficit = m.deficitPctHDP;
  for (let i = 0; i < 8; i++) {
    m = prepoctiMakro(m, { fiscalDelta: 0, sok: 0 });
  }
  assert.ok(m.dluhPctHDP > ZAKLAD.dluhPctHDP + (deficit / 4) * 4 - 2, "dluh má za 2 roky znatelně vzrůst");
});

test("prepoctiMakro: exogenní šok táhne inflaci nahoru", () => {
  const sok = prepoctiMakro(ZAKLAD, { fiscalDelta: 0, sok: 2 });
  assert.ok(sok.inflace > ZAKLAD.inflace);
});

test("fedSazba: Taylorovo pravidlo — vyšší inflace → vyšší sazba", () => {
  assert.ok(fedSazba(6, 2) > fedSazba(2.5, 2));
  assert.ok(fedSazba(2, 4) > fedSazba(2, 0));
});

test("ratingPro: prahy ratingu", () => {
  assert.equal(ratingPro({ ...ZAKLAD, dluhPctHDP: 60, deficitPctHDP: 2 }), "AAA");
  assert.equal(ratingPro({ ...ZAKLAD, dluhPctHDP: 95, deficitPctHDP: 5.5 }), "AA+");
  assert.equal(ratingPro({ ...ZAKLAD, dluhPctHDP: 105, deficitPctHDP: 6.2 }), "AA");
  assert.equal(ratingPro({ ...ZAKLAD, dluhPctHDP: 115, deficitPctHDP: 7 }), "A");
  assert.equal(ratingPro({ ...ZAKLAD, dluhPctHDP: 130, deficitPctHDP: 12 }), "BBB");
});

test("makroKrize: prahy vyvolají varování", () => {
  assert.ok(makroKrize({ ...ZAKLAD, deficitPctHDP: 9 }).length > 0);
  assert.ok(makroKrize({ ...ZAKLAD, inflace: 6 }).length > 0);
  assert.ok(makroKrize({ ...ZAKLAD, nezamestnanost: 8 }).length > 0);
  assert.ok(makroKrize({ ...ZAKLAD, fedSazba: 15 }).length > 0);
  assert.equal(makroKrize(ZAKLAD).length, 0);
});

test("lokalkaTick: clamp a setrvačnost lokální nezaměstnanosti", () => {
  const s = vytvorNovouHru({
    seed: 5,
    jmeno: "T",
    vek: 40,
    archetyp: "ucitel",
    rodneMistoUS: true,
    naturalizovany: false,
    zivotopisText: "x",
    domovskyStat: "OH",
  });
  s.local.nezamestnanost = 10;
  s.macro.nezamestnanost = 4;
  const l = lokalkaTick(s, { kriminalitaDelta: 0, spokojenostDelta: 0, rozpocetDeltaPct: 0 });
  assert.ok(l.nezamestnanost < 10, "lokální nezaměstnanost se stahuje k národní");
  // Clamp: spokojenost nesmí překročit 100.
  s.local.spokojenost = 99;
  lokalkaTick(s, { kriminalitaDelta: 0, spokojenostDelta: 5, rozpocetDeltaPct: 0 });
  assert.equal(s.local.spokojenost, 100);
});
