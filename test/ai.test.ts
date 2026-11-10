/**
 * ai.test.ts — testy vrstvy AI chatu: parsování plánu, whitelist akcí
 * a parametrů, rozpočet AP, validace události a provedení plánu.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { vytvorNovouHru } from "../engine/src/state.ts";
import {
  systemovyPrompt,
  stavProAi,
  parsujPlan,
  provedPlan,
  extrahujJson,
  MAX_AKCI_V_PLANU,
} from "../engine/src/ai.ts";

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

test("systemovyPrompt obsahuje katalog akcí, pravidla AP a schéma JSON", () => {
  const s = novaHra();
  const p = systemovyPrompt(s);
  assert.ok(p.includes("JSON"), "prompt má žádat JSON");
  assert.ok(p.includes("networking"), "katalog obsahuje akci networking");
  assert.ok(p.includes("10 AP"), "obsahuje rozpočet AP");
  assert.ok(p.includes("pokladna"), "uvádí povolené klíče dopadů");
});

test("systemovyPrompt obsahuje personu herního mistra a režim rozhovoru", () => {
  const s = novaHra();
  const p = systemovyPrompt(s);
  assert.ok(p.includes("Herní mistr"), "prompt mluví jako herní mistr");
  assert.ok(p.includes("ROZHOVOR"), "definuje režim rozhovoru");
  assert.ok(p.includes("ZÁMĚR"), "definuje režim záměru");
  assert.ok(p.includes("Dračí doupě"), "nese téma Dračího doupěte");
});

test("parsujPlan přijímá čistě vyprávěcí odpověď bez akcí (rozhovor s herním mistrem)", () => {
  const s = novaHra();
  const r = parsujPlan(JSON.stringify({ reci: "Vy sedíte v zákouřené kanceláři a listujete dopisy voličů.", akce: [] }), s);
  assert.ok(r.ok, "rozhovor bez akcí je platný plán");
  assert.equal(r.plan?.akce.length, 0);
  assert.ok((r.plan?.reci ?? "").includes("Vy sedíte"));
});

test("stavProAi je kompaktní JSON s klíčovými poli", () => {
  const s = novaHra();
  const json = JSON.parse(stavProAi(s));
  assert.equal(json.funkce, "outsider");
  assert.equal(json.ap, 10);
  assert.ok(Array.isArray(json.npc) && json.npc.length === 4);
  assert.ok(json.rizika !== undefined);
});

test("extrahujJson odstraňuje markdown fence", () => {
  const fence = '```json\n{"reci": "ahoj"}\n```';
  assert.equal(extrahujJson(fence), '{"reci": "ahoj"}');
  assert.equal(extrahujJson('Text před {"reci": 1} text za'), '{"reci": 1}');
  assert.equal(extrahujJson("žádný json"), null);
});

test("parsujPlan: platný plán projde, nepovolené klíče se odstraní", () => {
  const s = novaHra();
  const odpoved = JSON.stringify({
    reci: "Jdu na to.",
    akce: [
      { akce: "networking", parametry: { hack: true }, duvod: "kontakty" },
      { akce: "skoleni", parametry: { dovednost: "retorika" } },
    ],
  });
  const r = parsujPlan(odpoved, s);
  assert.ok(r.ok);
  assert.equal(r.plan!.akce.length, 2);
  assert.deepEqual(r.plan!.akce[0].parametry, {}, "nepovolený parametr odstraněn");
  assert.equal(r.plan!.akce[1].parametry.dovednost, "retorika");
});

test("parsujPlan: neznámá akce je vyřazena", () => {
  const s = novaHra();
  const r = parsujPlan('{"reci": "x", "akce": [{"akce": "atentat"}, {"akce": "projev"}]}', s);
  assert.ok(r.ok);
  assert.equal(r.plan!.akce.length, 1);
  assert.equal(r.plan!.akce[0].akce, "projev");
  assert.ok(r.vyrazeno.includes("atentat"));
});

test("parsujPlan: rozpočet AP je vynucen", () => {
  const s = novaHra(); // 10 AP
  // 6 × filantropie (2 AP) = 12 AP → poslední musí být vyřazena
  const akce = Array.from({ length: 6 }, () => ({ akce: "filantropie" }));
  const r = parsujPlan(JSON.stringify({ reci: "x", akce }), s);
  assert.ok(r.ok);
  let suma = 0;
  for (const a of r.plan!.akce) {
    const def = a.akce;
    suma += def === "filantropie" ? 2 : 0;
  }
  assert.ok(suma <= 10, `plán nesmí překročit 10 AP, ale má ${suma}`);
  assert.ok(r.vyrazeno.some((v) => v.includes("nedostatek AP")));
});

test("parsujPlan: limit počtu akcí", () => {
  const s = novaHra();
  const akce = Array.from({ length: 10 }, () => ({ akce: "networking" }));
  const r = parsujPlan(JSON.stringify({ reci: "x", akce }), s);
  assert.ok(r.plan!.akce.length <= MAX_AKCI_V_PLANU);
});

test("parsujPlan: číselné clamp a nepovolená hodnota výběru", () => {
  const s = novaHra();
  const odpoved = JSON.stringify({
    reci: "x",
    akce: [
      { akce: "reklama", parametry: { castkaUSD: "1 000 000 $" } },
      { akce: "skoleni", parametry: { dovednost: "letectvi" } },
      { akce: "vyhlasit_kandidaturu", parametry: { tema: "starosta" } },
    ],
  });
  const r = parsujPlan(odpoved, s);
  assert.ok(r.ok);
  assert.equal(r.plan!.akce[0].parametry.castkaUSD, 1_000_000, "řetězec s mezerami a $ se naparsuje");
  // dovednost „letectvi" je nepovolená → klíč odstraněn → akci odmítne engine
  assert.equal(r.plan!.akce[1].parametry.dovednost, undefined);
  assert.ok(r.chyby.length > 0, "o nepovolené hodnotě existuje diagnostika");
  assert.equal(r.plan!.akce[2].parametry.tema, "starosta");
});

test("parsujPlan: událost validní i nevalidní", () => {
  const s = novaHra();
  const ok = parsujPlan(
    JSON.stringify({
      reci: "x",
      udalost: { tema: "klima", nazev: "Sucho ve státě", popis: "Zasvěticí popis dopadu sucha na zemědělství.", dopady: { znamostStat: 0.3 } },
    }),
    s
  );
  assert.ok(ok.ok && ok.plan!.udalost !== null);
  assert.equal(ok.plan!.udalost!.dopady.znamostStat, 0.3);

  const spatne = parsujPlan(
    JSON.stringify({
      reci: "x",
      udalost: { tema: "klima", nazev: "Sucho", popis: "Krátké.", dopady: { prodejnost: 5 } },
    }),
    s
  );
  assert.ok(spatne.ok);
  assert.equal(spatne.plan!.udalost, null, "magnituda > 1 → odmítnuto validátorem");
});

test("parsujPlan: volný text bez JSON se přijímá jako vyprávění; prázdná odpověď je chyba", () => {
  const s = novaHra();
  /* Herní mistr odpověděl bez JSON obálky — akceptujeme jako konverzační plán. */
  const volny = parsujPlan("Sedíte v zákouřené hospodě a starosta vás sleduje přes okraj sklenice.", s);
  assert.ok(volny.ok, "volný text je platné vyprávění");
  assert.equal(volny.plan?.akce.length, 0);
  assert.equal(parsujPlan("   ", s).ok, false, "prázdná odpověď je chyba");
  const zachraneny = parsujPlan('{"reci": "x", "akce": "ne", }', s);
  assert.equal(zachraneny.ok, true, "rozbitý JSON se zachovalým vyprávěním se zachrání jako konverzace");
  assert.equal(zachraneny.plan?.reci, "x");
});

test("parsujPlan: useknutý JSON (limit tokenů) se opraví a použije", () => {
  const s = novaHra();
  const plne = JSON.stringify({ reci: "Zakládáte výbor a město šeptá.", akce: [{ akce: "networking" }, { akce: "projev" }] });
  for (const podil of [0.5, 0.6, 0.8]) {
    const useknuto = plne.slice(0, Math.floor(plne.length * podil));
    const r = parsujPlan(useknuto, s);
    assert.ok(r.ok, "useknutý JSON na " + podil + " se opraví");
    assert.ok((r.plan?.reci ?? "").length > 0, "vyprávění se zachová");
  }
});

test("provedPlan: provede akce a vede deník", () => {
  const s = novaHra();
  const r = parsujPlan(
    JSON.stringify({ reci: "Jdeme na to.", akce: [{ akce: "networking" }, { akce: "projev" }] }),
    s
  );
  assert.ok(r.ok);
  const vysledek = provedPlan(s, r.plan!);
  assert.equal(vysledek.provedeno.length, 2);
  assert.ok(vysledek.provedeno.every((p) => p.ok));
  assert.equal(s.ap, 8, "2 AP účtovány");
  assert.ok(s.denik.some((e) => e.typ === "akce"));
});

test("provedPlan: událost se zapíše do stavu", () => {
  const s = novaHra();
  const r = parsujPlan(
    JSON.stringify({
      reci: "x",
      udalost: { tema: "ekonomika", nazev: "Regionální investice", popis: "Do města míří nová továrna na baterie.", dopady: { spokojenost: 0.2 } },
    }),
    s
  );
  const vysledek = provedPlan(s, r.plan!);
  assert.equal(vysledek.udalostZprava, 'Událost „Regionální investice" propukla ve světě hry.');
  assert.equal(s.udalosti.length, 1);
  assert.ok(s.denik.some((e) => e.typ === "udalost"));
});

test("AI plán je replaovatelný: stejný vstup → identický otisk", () => {
  function beh(): string {
    const s = novaHra();
    const r = parsujPlan(
      JSON.stringify({
        reci: "Plán.",
        akce: [
          { akce: "skoleni", parametry: { dovednost: "retorika" } },
          { akce: "dar", parametry: { castkaUSD: 1000, typDarce: "individual", volba: "hlavni" } },
        ],
      }),
      s
    );
    provedPlan(s, r.plan!);
    return JSON.stringify({ ap: s.ap, atributy: s.postava.atributy, denik: s.denik });
  }
  assert.equal(beh(), beh());
});
