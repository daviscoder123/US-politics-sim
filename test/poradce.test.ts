/**
 * poradce.test.ts — testy místního poradce štábu (bez AI): determinismus,
 * whitelist dostupných akcí, rozpočet AP, kmeny klíčových slov a parametry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { vytvorNovouHru } from "../engine/src/state.ts";
import { sestavPlanBezAi, normalizujText, vytazejCastku, provedPlanPoradce } from "../engine/src/poradce.ts";

function novaHra() {
  return vytvorNovouHru({
    seed: 2027,
    jmeno: "Alexander Grant",
    vek: 42,
    archetyp: "software-podnikatel",
    rodneMistoUS: true,
    naturalizovany: false,
    zivotopisText: "test",
    domovskyStat: "OH",
  });
}

test("normalizuj odstraňuje diakritiku a sjednocuje mezery", () => {
  assert.equal(normalizujText("  Projev   za PřÍliš šumné   ráno "), "projev za prilis sumne rano");
});

test("vytazejCastku rozumí formátům 5 000, $5000, 10k i 3 tis.", () => {
  assert.equal(vytazejCastku("dar 5 000 dolaru"), 5000);
  assert.equal(vytazejCastku("$5000"), 5000);
  assert.equal(vytazejCastku("reklama za 10k"), 10000);
  assert.equal(vytazejCastku("dej 3 tis. na spot"), 3000);
  assert.equal(vytazejCastku("bez cisla"), null);
});

test("sestavPlanBezAi je deterministický — stejný vstup, stejný plán", () => {
  const zamer = "Založ volební výbor a dej 5 000 $ na reklamu";
  const p1 = sestavPlanBezAi(zamer, novaHra());
  const p2 = sestavPlanBezAi(zamer, novaHra());
  assert.deepEqual(p1.plan, p2.plan);
  assert.deepEqual(p1.rozbor, p2.rozbor);
});

test("poradce rozpozná diakritiku i bez ní a sestaví akce se správnými parametry", () => {
  const s = novaHra();
  const v = sestavPlanBezAi("Založ volební výbor a dej 5 000 na reklamu", s);
  const ids = v.plan.akce.map((a) => a.akce);
  assert.ok(ids.includes("zalozit_vybor"));
  assert.ok(ids.includes("reklama"));
  const reklama = v.plan.akce.find((a) => a.akce === "reklama");
  assert.equal(reklama?.parametry.castkaUSD, 5000);
});

test("poradce respektuje rozpočet AP a limit šesti akcí", () => {
  const s = novaHra();
  s.ap = 3;
  const v = sestavPlanBezAi("projev, tiskovka, debata, fundraising a networking", s);
  assert.ok(v.plan.akce.length > 0);
  assert.ok(v.plan.akce.length <= 6);
  assert.ok(v.rozbor.some((r) => r.includes("rozpočtu AP")), "rozpočet AP musí omezit plán");
});

test("provedení plánu poradce vrací výsledky pro každou akci plánu", () => {
  const s = novaHra();
  const v = sestavPlanBezAi("založ volební výbor", s);
  const vysledek = provedPlanPoradce(s, v);
  assert.equal(vysledek.provedeno.length, v.plan.akce.length);
  assert.ok(v.plan.akce.every((a) => a.akce === "zalozit_vybor"));
});

test("poradce rozumí českému skloňování (kmenová shoda)", () => {
  const s = novaHra();
  const v1 = sestavPlanBezAi("chci konverzaci s Whitmorem", s);
  assert.ok(v1.plan.akce.some((a) => a.akce === "konverzace"));
  const konverzace = v1.plan.akce.find((a) => a.akce === "konverzace");
  assert.equal(konverzace?.parametry.npcId, "npc-sponzor");
  const v2 = sestavPlanBezAi("obejdu sousedy a projetu se v televizi", s);
  const ids2 = v2.plan.akce.map((a) => a.akce);
  assert.ok(ids2.includes("otisky_dveri"));
  assert.ok(ids2.includes("projev"));
});

test("poradenská otázka vrací radu ze stavu bez akcí", () => {
  const s = novaHra();
  const v = sestavPlanBezAi("Co bys mi doporučil tento týden? Zhodnoť silné stránky.", s);
  assert.equal(v.plan.akce.length, 0);
  assert.ok(v.plan.reci.includes("Rada místního poradce"));
  assert.ok(v.plan.reci.includes("volební výbor"));
});

test("neznámý záměr vrátí prázdný plán a nápovědu", () => {
  const v = sestavPlanBezAi("zazpívat operu", novaHra());
  assert.equal(v.plan.akce.length, 0);
  assert.ok(v.plan.reci.includes("nepodařilo") || v.plan.reci.includes("nerozpoznal"));
});

test("poradce nenavrhuje akce mimo úroveň úřadu", () => {
  const s = novaHra(); // outsider — bez federálních akcí
  const v = sestavPlanBezAi("přijmi zákon a uprav federální rozpočet", s);
  assert.equal(v.plan.akce.length, 0);
  assert.ok(v.rozbor.some((r) => r.includes("není na této úrovni")));
});
