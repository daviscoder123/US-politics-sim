/**
 * game.test.ts — orchestrace: deterministický replay, přechod času,
 * stínová kariéra po odsouzení a volební scénář.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { vytvorNovouHru, type GameState } from "../engine/src/state.ts";
import { applyPlayerAction, endTurn, cilovaUrovenProZavod } from "../engine/src/game.ts";
import { otiskStavu, stavyStejne } from "../engine/src/audit.ts";

function novaHra(seed: number): GameState {
  return vytvorNovouHru({
    seed,
    jmeno: "Test",
    vek: 40,
    archetyp: "pravnik",
    rodneMistoUS: true,
    naturalizovany: false,
    zivotopisText: "x",
    domovskyStat: "OH",
  });
}

test("replay determinismus: stejný seed + skript → identický stav", () => {
  const skript = (s: GameState) => {
    applyPlayerAction(s, "prace_na_podniku");
    applyPlayerAction(s, "networking");
    applyPlayerAction(s, "skoleni", { dovednost: "retorika" });
    endTurn(s);
    applyPlayerAction(s, "projev");
    applyPlayerAction(s, "prace_na_podniku");
    endTurn(s);
    endTurn(s);
    applyPlayerAction(s, "filantropie");
    endTurn(s);
  };
  const a = novaHra(777);
  const b = novaHra(777);
  skript(a);
  skript(b);
  assert.equal(stavyStejne(a, b), true);
  assert.equal(otiskStavu(a), otiskStavu(b));
  // Odlišný seed dává odlišný stav (kontrola, že test není triviální).
  const c = novaHra(778);
  skript(c);
  assert.equal(stavyStejne(a, c), false);
});

test("endTurn: posun času, reset AP", () => {
  const s = novaHra(11);
  applyPlayerAction(s, "networking"); // AP 9
  const souhrn = endTurn(s);
  assert.equal(s.kolo, 2);
  assert.equal(s.tyden, 2);
  assert.equal(s.rok, 2027);
  assert.equal(s.ap, 10);
  assert.equal(souhrn.kolo, 2);
  // Přechod roku: týden 52 → 1.
  s.tyden = 52;
  endTurn(s);
  assert.equal(s.tyden, 1);
  assert.equal(s.rok, 2028);
});

test("endTurn: odsouzený ztrácí funkci a vrací se jako outsider (stínová kariéra)", () => {
  const s = novaHra(22);
  s.funkce = { uroven: "starosta", odKola: 10, obdobi: 1 };
  s.pravni.odsouzen = true;
  const souhrn = endTurn(s);
  assert.equal(s.funkce.uroven, "outsider");
  assert.equal(s.funkce.obdobi, 0);
  assert.equal(s.beziKampan.typZavodu, null);
  assert.ok(souhrn.zpravy.some((z) => z.includes("odsouzen")));
  // Odsouzený nemůže znovu kandidovat.
  const v = applyPlayerAction(s, "vyhlasit_kandidaturu", { tema: "radni" });
  assert.equal(v.ok, false);
  assert.ok(v.zprava.includes("Odsouzený"));
});

test("volební scénář: obecní kampaň v týdnu 45 vede k funkci radního", () => {
  const s = novaHra(33);
  s.tyden = 44;
  s.rok = 2027; // lichý rok → obecní závody
  s.finance.pokladnaKampane = 200_000;
  s.finance.vyborZalozen = true;
  s.postava.atributy.znamostLokal = 90;
  s.postava.atributy.znamostStat = 30;
  s.postava.atributy.integrita = 95;
  s.postava.atributy.prodejnost = 0;
  s.beziKampan = { typZavodu: "obecni", cisloKola: 40 };
  const souhrn = endTurn(s); // nový týden = 45 → všeobecné volby
  assert.equal(souhrn.volbyProbehly, true);
  assert.equal(souhrn.postup, "radni");
  assert.equal(s.funkce.uroven, "radni");
  assert.equal(s.funkce.obdobi, 1);
  assert.equal(s.beziKampan.typZavodu, null);
  assert.ok(souhrn.zpravy.some((z) => z.includes("VOLBY VYHRÁNY")));
  // Kampaň vyčistila evidence darů pro nový cyklus.
  assert.equal(Object.keys(s.finance.daryTentoCyklus).length, 0);
});

test("volební scénář: slabá kampaň končí prohrou", () => {
  const s = novaHra(44);
  s.tyden = 44;
  s.rok = 2027;
  s.finance.pokladnaKampane = 0;
  s.postava.atributy.znamostLokal = 2;
  s.postava.atributy.integrita = 10;
  s.postava.atributy.prodejnost = 10;
  s.beziKampan = { typZavodu: "obecni", cisloKola: 40 };
  const souhrn = endTurn(s);
  assert.equal(souhrn.volbyProbehly, true);
  assert.equal(souhrn.postup, null);
  assert.equal(s.funkce.uroven, "outsider");
  assert.ok(souhrn.zpravy.some((z) => z.includes("Volby prohrány")));
});

test("cilovaUrovenProZavod: radní kandiduje na starostu, outsider na radního", () => {
  const s = novaHra(55);
  assert.equal(cilovaUrovenProZavod(s, "obecni"), "radni");
  s.funkce.uroven = "radni";
  assert.equal(cilovaUrovenProZavod(s, "obecni"), "starosta");
  assert.equal(cilovaUrovenProZavod(s, "kongresove"), "kongresman");
  assert.equal(cilovaUrovenProZavod(s, "gubernatorske"), "guverner");
  assert.equal(cilovaUrovenProZavod(s, "prezidentske"), "prezident");
});

test("primárky: straník prochází týdnem 24, nezávislý nikoli", () => {
  const s = novaHra(66);
  s.postava.strana = "dem";
  s.tyden = 23;
  s.rok = 2027;
  s.beziKampan = { typZavodu: "obecni", cisloKola: 40 };
  s.postava.atributy.znamostLokal = 90;
  s.postava.atributy.integrita = 90;
  const souhrn = endTurn(s); // týden 24 → primárky
  assert.equal(souhrn.volbyProbehly, true);
  // Nezávislý kandidát primárky nemá.
  const s2 = novaHra(66);
  s2.postava.strana = null;
  s2.tyden = 23;
  s2.rok = 2027;
  s2.beziKampan = { typZavodu: "obecni", cisloKola: 40 };
  const souhrn2 = endTurn(s2);
  assert.equal(souhrn2.volbyProbehly, false);
});
