/**
 * bundle.test.ts — sloučený engine-bundle.ts musí dávat identické výsledky
 * jako modulární engine (stejný seed + skript → bitově stejný otisk).
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as modularni from "../engine/src/game.ts";
import { vytvorNovouHru as vytvorModularni, ARCHETYPY } from "../engine/src/state.ts";
import {
  vytvorNovouHru as vytvorBundle,
  applyPlayerAction as akceBundle,
  endTurn as endTurnBundle,
  dostupneAkce as akceDostupne,
  hledejZakony,
  SUM_EV,
  BRANCE,
} from "../engine/engine-bundle.ts";
import { otiskStavu } from "../engine/src/audit.ts";

function skript(vytvor: typeof vytvorModularni, akce: typeof modularni.applyPlayerAction, end: typeof modularni.endTurn) {
  const s = vytvor({
    seed: 4242,
    jmeno: "Test",
    vek: 40,
    archetyp: "pravnik",
    rodneMistoUS: true,
    naturalizovany: false,
    zivotopisText: "x",
    domovskyStat: "OH",
  });
  akce(s, "prace_na_podniku");
  akce(s, "networking");
  akce(s, "konverzace", { npcId: "npc-aktivista", slibText: "Zastanu se parku." });
  akce(s, "skoleni", { dovednost: "retorika" });
  end(s);
  akce(s, "projev");
  end(s);
  akce(s, "vyhlasit_kandidaturu", { tema: "radni" });
  end(s);
  return s;
}

test("bundle: replay identický s modulárním enginem", () => {
  const a = skript(vytvorModularni, modularni.applyPlayerAction, modularni.endTurn);
  const b = skript(vytvorBundle, akceBundle, endTurnBundle);
  assert.equal(otiskStavu(a), otiskStavu(b));
});

test("bundle: veřejné API konzistentní s moduly", () => {
  assert.equal(SUM_EV, 538);
  assert.equal(ARCHETYPY.length, 12);
  assert.ok(BRANCE.prezident.pokladnaKampan === 60_000_000);
  assert.ok(akceDostupne("prezident").length >= 20);
  assert.ok(hledejZakony("buckley").length >= 1);
});
