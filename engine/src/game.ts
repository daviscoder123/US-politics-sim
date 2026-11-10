/**
 * game.ts — orchestrace: hráčské akce, týdenní endTurn (AP, ekonomika, právo,
 * události, kalendář voleb), kariérní brance a stínová kariéra po odsouzení.
 *
 * Determinismus: veškerá náhodnost prochází Rng odvozeným ze seedu, čísla kola
 * a zbývajících AP — dvě hry se stejným seedem a skriptem jsou identické.
 */
import type { GameState, OfficeLevel } from "./state.ts";
import { rngProStav } from "./state.ts";
import { Rng } from "./rng.ts";
import {
  najdiAkci,
  dostupneAkce,
  type ParametryAkce,
  type VysledekAkce,
} from "./actions.ts";
import { prepoctiMakro, lokalkaTick, makroKrize } from "./economy.ts";
import { pravniTick } from "./law.ts";
import { slibyTick } from "./social.ts";
import { eventTick } from "./events.ts";
import {
  zavodyVRoce,
  TYDEN_PRIMAREK,
  TYDEN_VOLEB,
  simulatePrimarky,
  simulateVseobecne,
  souperProZavod,
  hracProfil,
  type TypZavodu,
} from "./elections.ts";
import { vyhodnotBranci } from "./indicators.ts";

/** Rng pro hráčskou akci — odvozený od seedu, kola a zbývajících AP. */
function rngAkce(s: GameState): Rng {
  return new Rng((s.seed ^ (s.kolo * 7919) ^ (s.ap * 104_729)) >>> 0);
}

/** Cílová úroveň závodu dle typu a aktuální pozice. */
export function cilovaUrovenProZavod(s: GameState, typ: TypZavodu): OfficeLevel {
  switch (typ) {
    case "obecni":
      return s.funkce.uroven === "radni" ? "starosta" : "radni";
    case "kongresove":
      return "kongresman";
    case "gubernatorske":
      return "guverner";
    case "prezidentske":
      return "prezident";
  }
}

/** Provede hráčskou akci: validace → aplikace → účtování AP → zápis do deníku. */
export function applyPlayerAction(s: GameState, akceId: string, p: ParametryAkce = {}): VysledekAkce {
  const def = najdiAkci(akceId);
  if (!def) {
    return { ok: false, zprava: `Neznámá akce: ${akceId}. Dostupné: ${dostupneAkce(s.funkce.uroven).map((a) => a.id).join(", ")}.`, varovani: [], apUctovano: 0 };
  }
  if (def.urovne.length > 0 && !def.urovne.includes(s.funkce.uroven)) {
    return { ok: false, zprava: `Akce ${def.nazev} není dostupná na úrovni ${s.funkce.uroven}.`, varovani: [], apUctovano: 0 };
  }
  if (s.ap < def.ap) {
    return { ok: false, zprava: `Nedostatek akčních bodů (potřeba ${def.ap}, zbývá ${s.ap}).`, varovani: [], apUctovano: 0 };
  }
  const kontrola = def.over(s, p);
  if (kontrola.chyby.length > 0) {
    return { ok: false, zprava: kontrola.chyby.join(" "), varovani: kontrola.varovani, apUctovano: 0 };
  }
  const zprava = def.apply(s, rngAkce(s), p);
  s.ap -= def.ap;
  s.denik.push({ kolo: s.kolo, typ: "akce", data: { akce: akceId, zprava } });
  return { ok: true, zprava, varovani: kontrola.varovani, apUctovano: def.ap };
}

export interface SouhrnKola {
  kolo: number;
  tyden: number;
  rok: number;
  zpravy: string[];
  volbyProbehly: boolean;
  postup: OfficeLevel | null;
}

/**
 * Ukončení kola: ticky ekonomiky, práva, slibů a událostí; přechod kalendáře;
 * primárky (týden 24) a všeobecné volby (týden 45); reset AP.
 */
export function endTurn(s: GameState): SouhrnKola {
  const rng = rngProStav(s);
  const zpravy: string[] = [];
  let volbyProbehly = false;
  let postup: OfficeLevel | null = null;

  // 1. Lokální ekonomika: mírný drift dle národního kontextu.
  lokalkaTick(s, {
    kriminalitaDelta: rng.range(-0.2, 0.2),
    spokojenostDelta: rng.range(-0.5, 0.5),
    rozpocetDeltaPct: 0,
  });

  // 2. Právní kaskáda (FEC → skandál → DOJ → odsouzení).
  const pravni = pravniTick(s, rng.next());
  for (const u of pravni) {
    zpravy.push(u.zprava);
    s.denik.push({ kolo: s.kolo, typ: "pravni", data: { typ: u.typ, zprava: u.zprava } });
  }

  // 3. Sliby: lhuty a prohřešky.
  for (const z of slibyTick(s)) {
    zpravy.push(z);
    s.denik.push({ kolo: s.kolo, typ: "system", data: { zprava: z } });
  }

  // 4. Události (šablony, 25 % šance na týden).
  eventTick(s, rng);

  // 5. Kvartální makro (každé 4. kolo).
  if (s.kolo % 4 === 0) {
    const fiskalniDelta = (s as GameState & { fiskalniDelta?: number }).fiskalniDelta ?? 0;
    s.macro = prepoctiMakro(s.macro, { fiscalDelta: fiskalniDelta, sok: 0 });
    for (const z of makroKrize(s.macro)) {
      zpravy.push(z);
      s.denik.push({ kolo: s.kolo, typ: "ekonomika", data: { zprava: z } });
    }
  }

  // 6. Odsouzený: stínová kariéra — demotion, nikdy definitivní konec.
  if (s.pravni.odsouzen && s.funkce.uroven !== "outsider") {
    const stara = s.funkce.uroven;
    s.funkce = { uroven: "outsider", odKola: s.kolo, obdobi: 0 };
    s.beziKampan = { typZavodu: null, cisloKola: null };
    const zprava = `Byl jste odsouzen a přišel o funkci ${stara}. Stínová kariéra: začínáte znovu jako outsider.`;
    zpravy.push(zprava);
    s.denik.push({ kolo: s.kolo, typ: "system", data: { zprava } });
  }

  // 7. Přechod času: kolo → týden → rok.
  s.kolo += 1;
  s.tyden += 1;
  if (s.tyden > 52) {
    s.tyden = 1;
    s.rok += 1;
  }

  // 8. Kalendář voleb pro nový týden.
  const zavody = zavodyVRoce(s.rok);
  const bezi = s.beziKampan.typZavodu;

  if (bezi && zavody.includes(bezi)) {
    const cil = cilovaUrovenProZavod(s, bezi);

    // Primárky (jen straníci; nezávislí jdou přes petice rovnou do voleb).
    if (s.tyden === TYDEN_PRIMAREK && s.postava.strana) {
      const souper = {
        ideologie: s.postava.ideologie + rng.range(-3, 3),
        znamost: rng.range(30, 70),
        integrita: rng.range(40, 70),
        prodejnost: rng.range(2, 7),
        vydajeUSD: rng.range(50_000, 500_000),
        kandidujeZnovu: rng.chance(0.3),
      };
      const primarky = simulatePrimarky(hracProfil(s), souper, rng);
      volbyProbehly = true;
      if (!primarky.postoupil) {
        zpravy.push(`Primárky prohrány: ${Math.round(primarky.share * 100)} % hlasů, delegáti ${primarky.delegatiHrac}:${primarky.delegatiSouper}. Kampaň končí.`);
        s.beziKampan = { typZavodu: null, cisloKola: null };
        s.postava.atributy.integrita = Math.max(0, s.postava.atributy.integrita - 2);
      } else {
        zpravy.push(`Primárky vyhrány: ${Math.round(primarky.share * 100)} % hlasů, delegáti ${primarky.delegatiHrac}:${primarky.delegatiSouper}. Postupujete do všeobecných voleb.`);
        s.postava.atributy.znamostStat = Math.min(100, s.postava.atributy.znamostStat + 2);
      }
      s.denik.push({
        kolo: s.kolo - 1,
        typ: "volby",
        data: { primarky: { share: primarky.share, delegatiHrac: primarky.delegatiHrac, delegatiSouper: primarky.delegatiSouper, postoupil: primarky.postoupil } },
      });
    }

    // Všeobecné volby.
    if (s.beziKampan.typZavodu === bezi && s.tyden === TYDEN_VOLEB) {
      volbyProbehly = true;
      const souper = souperProZavod(s, rng, bezi);
      const vysledek = simulateVseobecne(hracProfil(s), souper, s.macro, bezi, rng);
      if (vysledek.vyhral) {
        s.funkce = { uroven: cil, odKola: s.kolo, obdobi: 1 };
        postup = cil;
        s.postava.atributy.socialniKapital = Math.min(100, s.postava.atributy.socialniKapital + 5);
        zpravy.push(
          `VOLBY VYHRÁNY: stali jste se ${cil} s ${Math.round(vysledek.share * 100)} % hlasů.` +
          (vysledek.detail ? ` Elektorské hlasy: ${vysledek.detail.evHrac}:${vysledek.detail.evSouper}.` : "")
        );
      } else {
        zpravy.push(`Volby prohrány: ${Math.round(vysledek.share * 100)} % hlasů. Zůstává ${s.funkce.uroven}.`);
        s.postava.atributy.integrita = Math.max(0, s.postava.atributy.integrita - 1);
      }
      s.beziKampan = { typZavodu: null, cisloKola: null };
      s.finance.daryTentoCyklus = {};
      s.denik.push({
        kolo: s.kolo - 1,
        typ: "volby",
        data: {
          typ: bezi,
          cil,
          vyhral: vysledek.vyhral,
          share: vysledek.share,
          detail: vysledek.detail
            ? { evHrac: vysledek.detail.evHrac, evSouper: vysledek.detail.evSouper, staty: vysledek.detail.staty }
            : null,
        },
      });
    }
  }

  // 9. Kariérní brance: hlášení připravenosti (jednou za čtvrt roku).
  const brance = vyhodnotBranci(s);
  if (!brance.splneno && s.kolo % 13 === 0) {
    zpravy.push(`Kariérní brance pro další úroveň: chybí — ${brance.chybejici.join("; ")}.`);
  }

  // 10. Nové kolo: reset akčních bodů.
  s.ap = 10;

  return { kolo: s.kolo, tyden: s.tyden, rok: s.rok, zpravy, volbyProbehly, postup };
}
