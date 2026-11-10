/**
 * actions.test.ts — katalog akcí přes orchestraci applyPlayerAction:
 * AP rozpočet, úrovňové restrikce, kariérní brance, právní kontrola darů.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { vytvorNovouHru, type GameState } from "../engine/src/state.ts";
import { applyPlayerAction } from "../engine/src/game.ts";
import { AKCE, dostupneAkce, najdiAkci } from "../engine/src/actions.ts";
import { FEC_LIMITY } from "../engine/src/law.ts";

function novaHra(): GameState {
  return vytvorNovouHru({
    seed: 321,
    jmeno: "Test",
    vek: 40,
    archetyp: "pravnik",
    rodneMistoUS: true,
    naturalizovany: false,
    zivotopisText: "x",
    domovskyStat: "OH",
  });
}

test("katalog: unikátní id, kladné AP, popisy", () => {
  const ids = AKCE.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of AKCE) {
    assert.ok(a.ap >= 1 && a.ap <= 10);
    assert.ok(a.nazev.length > 0);
    assert.ok(a.popis.length > 0);
  }
  assert.ok(AKCE.length >= 20);
  assert.equal(najdiAkci("neexistujici"), undefined);
});

test("neznámá akce je odmítnuta", () => {
  const s = novaHra();
  const v = applyPlayerAction(s, "kouzlo_neexistuje");
  assert.equal(v.ok, false);
  assert.equal(v.apUctovano, 0);
  assert.ok(v.zprava.includes("Neznámá akce"));
  assert.equal(s.ap, 10);
});

test("AP: akce strhávají body a po vyčerpání další akce selže", () => {
  const s = novaHra();
  const v1 = applyPlayerAction(s, "networking"); // 1 AP
  assert.equal(v1.ok, true);
  assert.equal(s.ap, 9);
  const v2 = applyPlayerAction(s, "skoleni", { dovednost: "retorika" }); // 2 AP
  assert.equal(v2.ok, true);
  assert.equal(s.ap, 7);
  // Vyčerpání: networking 7× do nuly.
  for (let i = 0; i < 7; i++) {
    const v = applyPlayerAction(s, "networking");
    assert.equal(v.ok, true, `iterace ${i}`);
  }
  assert.equal(s.ap, 0);
  const v3 = applyPlayerAction(s, "networking");
  assert.equal(v3.ok, false);
  assert.ok(v3.zprava.includes("akčních bodů"));
  assert.equal(s.ap, 0);
});

test("rozpocet_mesta: nedostupná pro outsidery", () => {
  const s = novaHra();
  const v = applyPlayerAction(s, "rozpocet_mesta", { vyrovnanost: 1 });
  assert.equal(v.ok, false);
  assert.ok(v.zprava.includes("není dostupná"));
  // Starosta ji provést smí.
  s.funkce.uroven = "starosta";
  const v2 = applyPlayerAction(s, "rozpocet_mesta", { vyrovnanost: -2 });
  assert.equal(v2.ok, true);
  assert.ok(s.local.deficitPct < -3.2 + 0.01);
});

test("vyhlasit_kandidaturu: bez prostředků selže na kariérní branci", () => {
  const s = novaHra(); // pokladna 0, znamostStat 3
  const v = applyPlayerAction(s, "vyhlasit_kandidaturu", { tema: "radni" });
  assert.equal(v.ok, false);
  assert.ok(v.zprava.includes("brance"), `zpráva: ${v.zprava}`);
  // Se splněnou brancí projde.
  s.finance.pokladnaKampane = 50_000;
  s.postava.atributy.znamostStat = 10;
  s.postava.atributy.socialniKapital = 30;
  s.postava.atributy.etika = 4;
  const v2 = applyPlayerAction(s, "vyhlasit_kandidaturu", { tema: "radni" });
  assert.equal(v2.ok, true);
  assert.equal(s.beziKampan.typZavodu, "obecni");
});

test("dar: překročení FEC limitu je odmítnuto s citací, pokladna nezměněná", () => {
  const s = novaHra();
  s.finance.vyborZalozen = true;
  const pokladnaPred = s.finance.pokladnaKampane;
  const v = applyPlayerAction(s, "dar", { castkaUSD: FEC_LIMITY.jednotlivecNaVolbu + 2_000, typDarce: "individual" });
  assert.equal(v.ok, true); // akce proběhla, ale dar byl odmítnut právní vrstvou
  assert.ok(v.zprava.includes("Dar odmítnut"), `zpráva: ${v.zprava}`);
  assert.ok(v.zprava.includes("52 U.S.C."), "zpráva obsahuje citaci");
  assert.equal(s.finance.pokladnaKampane, pokladnaPred);
  assert.ok(s.pravni.fecAuditRiziko > 0);
});

test("dar: legální dar pod limitem přijat", () => {
  const s = novaHra();
  s.finance.vyborZalozen = true;
  const v = applyPlayerAction(s, "dar", { castkaUSD: 1_000, typDarce: "individual" });
  assert.equal(v.ok, true);
  assert.equal(s.finance.pokladnaKampane, 1_000);
  assert.equal(s.finance.daryTentoCyklus["individual-hlavni"], 1_000);
});

test("fundraiser: bez výboru varování a +12 rizika FEC auditu", () => {
  const s = novaHra();
  assert.equal(s.finance.vyborZalozen, false);
  const v = applyPlayerAction(s, "fundraiser");
  assert.equal(v.ok, true);
  assert.ok(v.varovani.some((w) => w.includes("nezákonné")));
  assert.ok(v.zprava.includes("bez registrovaného výboru"));
  assert.equal(s.pravni.fecAuditRiziko, 12);
  // Po registraci výboru je fundraisering legální.
  s.finance.vyborZalozen = true;
  const v2 = applyPlayerAction(s, "fundraiser");
  assert.equal(v2.ok, true);
  assert.ok(!v2.zprava.includes("bez registrovaného výboru"));
  assert.ok(s.finance.pokladnaKampane > 0);
});

test("vyhlasit_kandidaturu: naturalizovaný nesmí na prezidenta", () => {
  const s = novaHra();
  s.postava.naturalizovany = true;
  s.finance.pokladnaKampane = 100_000_000;
  s.postava.atributy.znamostStat = 90;
  s.postava.atributy.socialniKapital = 90;
  s.postava.atributy.etika = 9;
  const v = applyPlayerAction(s, "vyhlasit_kandidaturu", { tema: "prezident" });
  assert.equal(v.ok, false);
  assert.ok(v.zprava.includes("natural-born") || v.zprava.includes("Art. II"));
});

test("dostupneAkce: filtr dle úrovně úřadu", () => {
  const outsider = dostupneAkce("outsider").map((a) => a.id);
  assert.ok(!outsider.includes("zakon"));
  assert.ok(!outsider.includes("federalni_rozpocet"));
  const prezident = dostupneAkce("prezident").map((a) => a.id);
  assert.ok(prezident.includes("zakon"));
  assert.ok(prezident.includes("federalni_rozpocet"));
  assert.ok(prezident.includes("exekutivni_prikaz"));
});
