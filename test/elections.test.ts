/**
 * elections.test.ts — Electoral College invarianty, kalendář voleb,
 * pravděpodobnosti vítězství a primárky s delegáty.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Rng } from "../engine/src/rng.ts";
import {
  STATY_EV,
  SUM_EV,
  zavodyVRoce,
  souperProZavod,
  simulatePrezidentske,
  pravdepodobnostVitezstvi,
  simulatePrimarky,
  type KandidatProfil,
} from "../engine/src/elections.ts";
import { vytvorNovouHru } from "../engine/src/state.ts";
import type { Macro } from "../engine/src/state.ts";

const MAKRO: Macro = {
  hdpRust: 2.1,
  inflace: 3.7,
  nezamestnanost: 4.2,
  fedSazba: 3.88,
  deficitPctHDP: 6.2,
  dluhPctHDP: 100.0,
  rating: "AA+",
};

test("Electoral College: 51 záznamů, součet EV = 538, unikátní státy", () => {
  assert.equal(STATY_EV.length, 51);
  assert.equal(SUM_EV, 538);
  const kody = STATY_EV.map((s) => s.stat);
  assert.equal(new Set(kody).size, 51);
  for (const s of STATY_EV) {
    assert.ok(s.ev >= 3 && s.ev <= 55, `EV mimo rozsah: ${s.stat} = ${s.ev}`);
  }
});

test("kalendář: 2028 prezidentské i kongresové, 2027 obecní, 2030 midterm", () => {
  const z2028 = zavodyVRoce(2028);
  assert.ok(z2028.includes("prezidentske"));
  assert.ok(z2028.includes("kongresove"));
  assert.deepEqual(zavodyVRoce(2027), ["obecni"]);
  const z2030 = zavodyVRoce(2030);
  assert.ok(z2030.includes("kongresove"));
  assert.ok(z2030.includes("gubernatorske"));
  assert.ok(!z2030.includes("prezidentske"));
  // Sudé roky vždy kongresové, liché nikdy.
  for (let rok = 2027; rok <= 2036; rok++) {
    const z = zavodyVRoce(rok);
    assert.equal(z.includes("kongresove"), rok % 2 === 0);
  }
});

const SILNY: KandidatProfil = {
  ideologie: 0,
  znamost: 100,
  integrita: 100,
  prodejnost: 0,
  vydajeUSD: 1_000_000_000,
  kandidujeZnovu: false,
};

const SLABY: KandidatProfil = {
  ideologie: 0,
  znamost: 10,
  integrita: 20,
  prodejnost: 10,
  vydajeUSD: 100_000,
  kandidujeZnovu: false,
};

test("prezidentské: favorit vyhrává s pravděpodobností ≥ 0,98", () => {
  const rng = new Rng(42);
  const p = pravdepodobnostVitezstvi(SILNY, SLABY, MAKRO, true, rng, 50);
  assert.ok(p >= 0.98, `favorit vyhrává jen v ${p}`);
  const detail = simulatePrezidentske(SILNY, SLABY, MAKRO, true, new Rng(7));
  assert.equal(detail.vyhral, true);
  assert.ok(detail.evHrac > 270);
  assert.equal(detail.evHrac + detail.evSouper, 538);
});

test("prezidentské: vyrovnané profily → pravděpodobnost 0,3–0,7", () => {
  // Neutrální makro (nulový ekonomický term) + totožné profily = ideálně vyrovnaný zápas.
  const neutralni: Macro = { ...MAKRO, hdpRust: 2.0, inflace: 3.0, nezamestnanost: 4.3 };
  const rng = new Rng(1234);
  const p = pravdepodobnostVitezstvi(SILNY, { ...SILNY }, neutralni, false, rng, 100);
  assert.ok(p >= 0.3 && p <= 0.7, `vyrovnaný zápas má p ≈ 0,5, ne ${p}`);
});

test("prezidentské: EV v jednotlivých státech se sčítají k výsledku", () => {
  const rng = new Rng(99);
  const detail = simulatePrezidentske(SILNY, { ...SILNY, znamost: 95, integrita: 95 }, MAKRO, true, rng);
  assert.equal(detail.evHrac, detail.staty.filter((s) => s.hracVyhrava).reduce((a, s) => a + s.ev, 0));
  assert.equal(detail.evSouper, detail.staty.filter((s) => !s.hracVyhrava).reduce((a, s) => a + s.ev, 0));
});

test("souperProZavod: parametry v mezích úrovně závodu", () => {
  const s = vytvorNovouHru({
    seed: 1,
    jmeno: "T",
    vek: 40,
    archetyp: "pravnik",
    rodneMistoUS: true,
    naturalizovany: false,
    zivotopisText: "x",
    domovskyStat: "OH",
  });
  for (const typ of ["obecni", "kongresove", "gubernatorske", "prezidentske"] as const) {
    const souper = souperProZavod(s, new Rng(typ.length * 31), typ);
    assert.ok(souper.znamost >= 0 && souper.znamost <= 100);
    assert.ok(souper.ideologie >= -10 && souper.ideologie <= 10);
    assert.ok(souper.vydajeUSD > 0);
  }
});

test("primárky: pod práh 15 % kandidát nepostoupí", () => {
  const rng = new Rng(5);
  const slabyHrac: KandidatProfil = { ...SLABY, vydajeUSD: 10_000 };
  const silnySouper: KandidatProfil = { ...SILNY, prodejnost: 0 };
  const vysl = simulatePrimarky(slabyHrac, silnySouper, rng);
  assert.equal(vysl.postoupil, false);
  assert.ok(vysl.share < 0.15, `share ${vysl.share} má být pod 15 %`);
});

test("primárky: nad prahem se delegáti sčítají k 4000", () => {
  const rng = new Rng(6);
  for (let i = 0; i < 30; i++) {
    const vysl = simulatePrimarky({ ...SILNY, znamost: 60 }, { ...SILNY, znamost: 55 }, rng);
    if (vysl.share >= 0.15 && vysl.share <= 0.85) {
      assert.equal(vysl.delegatiHrac + vysl.delegatiSouper, 4000);
      // Bonus vítěze: vítěz delegátů má víc než polovinu.
      const vitez = Math.max(vysl.delegatiHrac, vysl.delegatiSouper);
      assert.ok(vitez > 2000, "vítěz primárek má mít většinu delegátů");
    }
  }
});
