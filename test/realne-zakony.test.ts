/**
 * realne-zakony.test.ts — katalog historických zákonů USA a složení SCOTUS:
 * integrity dat, ověřená hlasování Kongresu (faktické kotvy) a fulltext.
 * Hlasování ověřena z více zdrojů (Wikipedia, congress.gov).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  REALNE_ZAKONY,
  SCOTUS_SOUDCI,
  najdiRealnyZakon,
  hledejRealneZakony,
} from "../engine/src/realne-zakony.ts";

const RE_HLASOVANI = /^\d{1,3}–\d{1,3}$/;

function rozdel(hlasy: string): [number, number] {
  const [a, b] = hlasy.split("–").map((x) => Number(x));
  return [a, b];
}

test("katalog: šest historických zákonů, unikátní id, kompletní pole", () => {
  assert.equal(REALNE_ZAKONY.length, 6);
  const ids = REALNE_ZAKONY.map((z) => z.id);
  assert.equal(new Set(ids).size, 6);
  for (const z of REALNE_ZAKONY) {
    assert.ok(z.titul.length > 0);
    assert.ok(z.oficTitul.includes("P.L."), `oficiální titul ${z.id} má obsahovat veřejný zákon`);
    assert.ok(z.rok >= 2009 && z.rok <= 2022);
    assert.ok(z.nakladyMldUSD > 0, `náklady ${z.id} mají být kladné`);
    assert.ok(z.klicovaUstanoveni.length >= 3);
    assert.ok(z.shrnuti.length > 50);
    assert.ok(z.dopad.length > 20);
    assert.ok(z.zdroje.length >= 1 && z.zdroje.every((s) => s.startsWith("https://")));
  }
});

test("faktické kotvy: ověřená závěrečná hlasování Kongresu", () => {
  const ocekavane: Record<string, [string, string]> = {
    "ira-2022": ["51–50", "220–207"], // rozhodující hlas viceprezidentky Harrisové
    "chips-2022": ["64–33", "243–187"],
    "iija-2021": ["69–30", "228–206"],
    "tcja-2017": ["51–49", "227–203"], // jediný republikán proti: Corker (TN)
    "aca-2010": ["60–39", "219–212"], // filibuster-proof většina před ztrátou křesla v MA
    "bsca-2022": ["65–33", "234–193"],
  };
  for (const [id, [senat, snemovna]] of Object.entries(ocekavane)) {
    const z = najdiRealnyZakon(id);
    assert.ok(z, `zákon ${id} chybí v katalogu`);
    assert.equal(z!.senatHlasy, senat, `${id}: senát má být ${senat}`);
    assert.equal(z!.snemovnaHlasy, snemovna, `${id}: sněmovna má být ${snemovna}`);
  }
});

test("hlasování: formát, mantinely komor, vítězná strana", () => {
  for (const z of REALNE_ZAKONY) {
    assert.match(z.senatHlasy, RE_HLASOVANI, `${z.id}: formát senátu`);
    assert.match(z.snemovnaHlasy, RE_HLASOVANI, `${z.id}: formát sněmovny`);
    const [sAno, sNe] = rozdel(z.senatHlasy);
    const [hAno, hNe] = rozdel(z.snemovnaHlasy);
    // Senát má 100 senátorů; při rovnosti rozhoduje viceprezident (101. hlas).
    assert.ok(sAno + sNe <= 101, `${z.id}: senát má max 101 hlasů včetně viceprezidenta`);
    if (sAno + sNe === 101) {
      assert.equal(z.senatHlasy, "51–50", `${z.id}: 101 hlasů je možné jen při rozhodujícím hlasu viceprezidenta`);
    }
    assert.ok(hAno + hNe <= 435, `${z.id}: sněmovna má max 435 hlasujících`);
    assert.ok(sAno > sNe, `${z.id}: senátní většina pro`);
    assert.ok(hAno > hNe, `${z.id}: sněmovní většina pro`);
  }
});

test("veřejné zákony (Public Law) jsou uvedeny správně", () => {
  const ocekavane: Record<string, string> = {
    "ira-2022": "117-169",
    "chips-2022": "117-167",
    "iija-2021": "117-58",
    "tcja-2017": "115-97",
    "aca-2010": "111-148",
    "bsca-2022": "117-159",
  };
  for (const [id, pl] of Object.entries(ocekavane)) {
    assert.ok(najdiRealnyZakon(id)!.oficTitul.includes(pl), `${id}: má obsahovat P.L. ${pl}`);
  }
});

test("SCOTUS: devět soudců, unikátní jména, 6 konzervativních a 3 liberální", () => {
  assert.equal(SCOTUS_SOUDCI.length, 9);
  const jmena = SCOTUS_SOUDCI.map((s) => s.jmeno);
  assert.equal(new Set(jmena).size, 9);
  const konz = SCOTUS_SOUDCI.filter((s) => s.ideologie === "konzervativni").length;
  const lib = SCOTUS_SOUDCI.filter((s) => s.ideologie === "liberalni").length;
  assert.equal(konz, 6);
  assert.equal(lib, 3);
  assert.equal(SCOTUS_SOUDCI.filter((s) => s.titul.includes("Předseda")).length, 1);
  for (const s of SCOTUS_SOUDCI) {
    assert.ok(s.jmenovan.length > 0);
    assert.ok(s.bio.length > 30);
  }
  // Poslední jmenovaná soudkyně: Ketanji Brown Jackson (Biden, 2022).
  const jackson = SCOTUS_SOUDCI.find((s) => s.jmeno.includes("Jackson"));
  assert.ok(jackson);
  assert.ok(jackson!.jmenovan.includes("Biden"));
  assert.equal(jackson!.ideologie, "liberalni");
});

test("fulltextové vyhledávání v katalogu (tolerantní k diakritice a skloňování)", () => {
  assert.equal(hledejRealneZakony("").length, 6);
  assert.ok(hledejRealneZakony("čipy").length >= 1, "výraz „čipy“ najde CHIPS");
  assert.ok(hledejRealneZakony("daně").length >= 1, "výraz „daně“ najde TCJA (i přes tvar „daňových“)");
  assert.ok(hledejRealneZakony("2017").length >= 1, "rok 2017 najde TCJA");
  assert.ok(hledejRealneZakony("infrastructure").length >= 1, "anglický výraz najde IIJA");
  assert.equal(hledejRealneZakony("mars").length, 0);
  assert.ok(najdiRealnyZakon("tcja-2017"));
  assert.equal(najdiRealnyZakon("neexistuje"), undefined);
});
