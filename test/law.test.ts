/**
 * law.test.ts — právní invarianty: ústavní volitelnost, FECA limity,
 * cizí peníze, quid pro quo, sankční kaskáda a citace do databáze zákonů.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { vytvorNovouHru, type GameState, type Postava } from "../engine/src/state.ts";
import {
  FEC_LIMITY,
  overVolitelnost,
  zkontrolujDar,
  pravniTick,
  type NavrhDaru,
} from "../engine/src/law.ts";
import { ZAKONY, najdiZakon } from "../engine/src/zakony.ts";

function novaHra(): GameState {
  return vytvorNovouHru({
    seed: 1234,
    jmeno: "Test",
    vek: 40,
    archetyp: "pravnik",
    rodneMistoUS: true,
    naturalizovany: false,
    zivotopisText: "x",
    domovskyStat: "OH",
  });
}

function postava(overrides: Partial<Postava> = {}): Postava {
  const s = novaHra();
  return { ...s.postava, ...overrides };
}

test("overVolitelnost: naturalizovaný nikdy prezidentem", () => {
  const p = postava({ naturalizovany: true });
  const v = overVolitelnost(p, "prezident");
  assert.equal(v.splneno, false);
  assert.ok(v.duvod?.includes("natural-born"));
  assert.ok(v.zakonIds?.includes("us-const-art2-s1"));
});

test("overVolitelnost: věkové prahy (35/25/18)", () => {
  assert.equal(overVolitelnost(postava({ vek: 34 }), "prezident").splneno, false);
  assert.equal(overVolitelnost(postava({ vek: 36 }), "prezident").splneno, true);
  assert.equal(overVolitelnost(postava({ vek: 24 }), "kongresman").splneno, false);
  assert.equal(overVolitelnost(postava({ vek: 26 }), "kongresman").splneno, true);
  assert.equal(overVolitelnost(postava({ vek: 17 }), "radni").splneno, false);
  assert.equal(overVolitelnost(postava({ vek: 19 }), "starosta").splneno, true);
});

test("overVolitelnost: 22. dodatek — max dvě zvolení prezidenta", () => {
  const p = postava({ vek: 60 });
  assert.equal(overVolitelnost(p, "prezident", 1).splneno, true);
  const v = overVolitelnost(p, "prezident", 2);
  assert.equal(v.splneno, false);
  assert.ok(v.duvod?.includes("22. dodatek"));
  assert.ok(v.zakonIds?.includes("us-const-dodatek-22"));
});

test("overVolitelnost: naturalizovaný smí do Kongresu a na guvernéra", () => {
  const p = postava({ naturalizovany: true, vek: 45 });
  assert.equal(overVolitelnost(p, "kongresman").splneno, true);
  assert.equal(overVolitelnost(p, "guverner").splneno, true);
});

function dar(overrides: Partial<NavrhDaru> = {}): NavrhDaru {
  return {
    npcId: "npc-1",
    typDarce: "individual",
    castkaUSD: 1_000,
    volba: "hlavni",
    slibUrednihoAktu: null,
    pocetSvedku: 0,
    koordinace: false,
    ...overrides,
  };
}

test("zkontrolujDar: legální dar pod limitem FEC", () => {
  const s = novaHra();
  const v = zkontrolujDar(s, dar({ castkaUSD: FEC_LIMITY.jednotlivecNaVolbu }));
  assert.equal(v.legalni, true);
  assert.equal(v.kriminalniRiziko, 0);
});

test("zkontrolujDar: překročení limitu FEC zvyšuje fecAuditRiziko", () => {
  const s = novaHra();
  const v = zkontrolujDar(s, dar({ castkaUSD: FEC_LIMITY.jednotlivecNaVolbu + 500 }));
  assert.equal(v.legalni, false);
  assert.ok(v.fecAuditRiziko > 0);
  assert.ok(v.zakonIds.includes("52-usc-30116"));
});

test("zkontrolujDar: cizí peníze jsou absolutně zakázané", () => {
  const s = novaHra();
  const v = zkontrolujDar(s, dar({ typDarce: "foreign", castkaUSD: 500 }));
  assert.equal(v.legalni, false);
  assert.ok(v.kriminalniRiziko >= 20);
  assert.ok(v.zakonIds.includes("52-usc-30121"));
});

test("zkontrolujDar: korporace nesmí přispívat přímo", () => {
  const s = novaHra();
  const v = zkontrolujDar(s, dar({ typDarce: "corporate", castkaUSD: 1_000 }));
  assert.equal(v.legalni, false);
  assert.ok(v.zakonIds.includes("52-usc-30118"));
});

test("zkontrolujDar: quid pro quo zvyšuje kriminalniRiziko", () => {
  const s = novaHra();
  const v = zkontrolujDar(s, dar({
    castkaUSD: 3_000,
    slibUrednihoAktu: "Zajistím státní zakázku.",
    pocetSvedku: 2,
  }));
  // Dar je pod limitem, ale se slibem úředního aktu je to úplatek.
  assert.ok(v.kriminalniRiziko > 0, `riziko má být kladné: ${v.kriminalniRiziko}`);
  assert.ok(v.varovani.some((w) => w.includes("quid pro quo")));
  assert.ok(v.zakonIds.includes("18-usc-666")); // outsider = městská oblast
});

test("zkontrolujDar: super PAC bez koordinace legální, s koordinací ne", () => {
  const s = novaHra();
  const ok = zkontrolujDar(s, dar({ typDarce: "superpac", castkaUSD: 5_000_000 }));
  assert.equal(ok.legalni, true);
  assert.ok(ok.zakonIds.includes("speechnow-v-fec"));
  const koord = zkontrolujDar(s, dar({ typDarce: "superpac", castkaUSD: 5_000_000, koordinace: true }));
  assert.equal(koord.legalni, false);
  assert.ok(koord.kriminalniRiziko > 0);
  assert.ok(koord.zakonIds.includes("11-cfr-109"));
});

test("zkontrolujDar: vlastní financování neomezené (Buckley v. Valeo)", () => {
  const s = novaHra();
  const v = zkontrolujDar(s, dar({ typDarce: "self", castkaUSD: 100_000_000 }));
  assert.equal(v.legalni, true);
  assert.ok(v.zakonIds.includes("buckley-valeo"));
});

test("pravniTick: sankční kaskáda — vyšetřování při vysokém riziku", () => {
  const s = novaHra();
  s.pravni.kriminalniRiziko = 60;
  const udalosti = pravniTick(s, 0.1); // tah < 0.005*60 → vyšetřování
  assert.ok(udalosti.some((u) => u.typ === "vysetrovani_zacatek"));
  assert.equal(s.pravni.vysetrovani.length, 1);
});

test("pravniTick: odsouzení ukončuje veřejnou kariéru", () => {
  const s = novaHra();
  s.pravni.kriminalniRiziko = 100;
  // Vyšetřování začalo před 13 koly, intenzita 1.0.
  s.pravni.vysetrovani.push({ id: "doj-1", odKola: 1, tema: "financování", intenzita: 1.0 });
  s.kolo = 15;
  const udalosti = pravniTick(s, 0.01); // tah < 0.004*100 → obžaloba; < 0.7 → odsouzení
  assert.ok(udalosti.some((u) => u.typ === "obzaloba"));
  assert.ok(udalosti.some((u) => u.typ === "odsouzeni"));
  assert.equal(s.pravni.odsouzen, true);
});

test("zkontrolujDar: všechny citace existují v databázi zákonů", () => {
  const s = novaHra();
  const scenare: NavrhDaru[] = [
    dar({ typDarce: "self", castkaUSD: 1_000_000 }),
    dar({ typDarce: "foreign", castkaUSD: 1_000 }),
    dar({ typDarce: "corporate", castkaUSD: 1_000 }),
    dar({ typDarce: "superpac", castkaUSD: 10_000_000 }),
    dar({ typDarce: "superpac", castkaUSD: 10_000_000, koordinace: true }),
    dar({ castkaUSD: 10_000 }),
    dar({ castkaUSD: 10_000, slibUrednihoAktu: "Úřední akt." }),
  ];
  for (const d of scenare) {
    const v = zkontrolujDar(s, d);
    for (const id of v.zakonIds) {
      assert.ok(najdiZakon(id), `citace ${id} chybí v databázi zákonů`);
    }
  }
});

test("overVolitelnost: všechny citace existují v databázi zákonů", () => {
  const scenare: [Postava, Parameters<typeof overVolitelnost>[1], number][] = [
    [postava(), "prezident", 0],
    [postava({ naturalizovany: true }), "prezident", 0],
    [postava({ vek: 20 }), "kongresman", 0],
    [postava({ vek: 20 }), "guverner", 0],
    [postava({ vek: 15 }), "radni", 0],
  ];
  for (const [p, uroven, obdobi] of scenare) {
    const v = overVolitelnost(p, uroven, obdobi);
    for (const id of v.zakonIds ?? []) {
      assert.ok(najdiZakon(id), `citace ${id} chybí v databázi zákonů`);
    }
  }
});

test("databáze zákonů obsahuje jádro federálního rámce", () => {
  const jadro = [
    "us-const-art1-s2",
    "us-const-art1-s3",
    "us-const-art2-s1",
    "us-const-dodatek-22",
    "us-const-dodatek-26",
    "feca-1971",
    "52-usc-30116",
    "52-usc-30118",
    "52-usc-30121",
    "11-cfr-100-5",
    "11-cfr-109",
    "buckley-valeo",
    "citizens-united",
    "speechnow-v-fec",
    "term-limits-thornton",
    "18-usc-201",
    "18-usc-666",
    "impoundment-1974",
    "anti-deficiency",
  ];
  for (const id of jadro) {
    assert.ok(najdiZakon(id), `v databázi chybí ${id}`);
  }
  assert.equal(new Set(ZAKONY.map((z) => z.id)).size, ZAKONY.length);
  for (const z of ZAKONY) {
    assert.ok(z.citace.length > 0);
    assert.ok(z.nazev.length > 0);
    assert.ok(z.shrnuti.length > 10);
    assert.ok(z.efektyVeHre.length > 0);
    assert.ok(z.zdroje.length > 0);
  }
});
