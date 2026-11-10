/**
 * actions.ts — katalog herních akcí. Každá akce má cenu v akčních bodech (AP),
 * povolené úrovně úřadu, validaci (včetně právních varování) a aplikaci efektů.
 * Volající orchestrace (game.ts) účtuje AP a zajišťuje deterministický Rng.
 */
import type { GameState, OfficeLevel } from "./state.ts";
import type { Rng } from "./rng.ts";
import {
  FEC_LIMITY,
  KRIMINALNI_KONSTANTY,
  zkontrolujDar,
  overVolitelnost,
  type NavrhDaru,
  type TypDarce,
} from "./law.ts";
import { provedKonverzaci, splnSlib } from "./social.ts";
import { dvoucestnyShare, hracProfil, souperProZavod, type TypZavodu } from "./elections.ts";
import { BRANCE } from "./indicators.ts";
import { citujZakony } from "./zakony.ts";

export interface ParametryAkce {
  npcId?: string;
  slibText?: string;
  castkaUSD?: number;
  typDarce?: TypDarce;
  volba?: "primarky" | "hlavni";
  slibUrednihoAktu?: string | null;
  pocetSvedku?: number;
  koordinace?: boolean;
  text?: string;
  dovednost?: "diplomacie" | "retorika" | "finance" | "vyjednavani" | "medialnost";
  tema?: "ekonomika" | "socialni" | "beznacnost" | "zdravotnictvi" | "infrastruktura";
  vyrovnanost?: number; // −2..+2: restrikce vs. stimul
  slibId?: string;
}

export interface VysledekAkce {
  ok: boolean;
  zprava: string;
  varovani: string[];
  apUctovano: number;
}

interface AkceDef {
  id: string;
  nazev: string;
  ap: number;
  urovne: OfficeLevel[]; // prázdné pole = všechny úrovně
  popis: string;
  over: (s: GameState, p: ParametryAkce) => { chyby: string[]; varovani: string[] };
  apply: (s: GameState, rng: Rng, p: ParametryAkce) => string;
}

function zapisDoDeniku(s: GameState, typ: "akce" | "ekonomika", data: Record<string, unknown>): void {
  s.denik.push({ kolo: s.kolo, typ, data });
}

/** Zaokrouhlení na 1 desetinné místo. */
function r1(x: number): number {
  return Math.round(x * 10) / 10;
}

export const AKCE: AkceDef[] = [
  {
    id: "prace_na_podniku",
    nazev: "Práce na podniku",
    ap: 1,
    urovne: [],
    popis: "Týden v podnikání: příjem, kontakty, malý růst známosti.",
    over: () => ({ chyby: [], varovani: [] }),
    apply: (s, rng) => {
      const prijem = rng.int(5, 20) * 1_000;
      s.postava.atributy.majetekUSD += prijem;
      s.postava.atributy.znamostLokal = Math.min(100, r1(s.postava.atributy.znamostLokal + 0.2));
      zapisDoDeniku(s, "ekonomika", { prijem });
      return `Výdělek ${prijem.toLocaleString("en-US")} $; známost lokálně +0,2.`;
    },
  },
  {
    id: "networking",
    nazev: "Networking",
    ap: 1,
    urovne: [],
    popis: "Večer na recepcích: nové kontakty, pomalý růst sociálního kapitálu.",
    over: () => ({ chyby: [], varovani: [] }),
    apply: (s, rng) => {
      const prirustek = rng.range(0.5, 1.5) + s.postava.dovednosti.diplomacie / 12;
      s.postava.atributy.socialniKapital = Math.min(100, r1(s.postava.atributy.socialniKapital + prirustek));
      return `Sociální kapitál +${r1(prirustek)}.`;
    },
  },
  {
    id: "filantropie",
    nazev: "Filantropie",
    ap: 2,
    urovne: [],
    popis: "Dar 50 000 $ na veřejnou věc: známost a integrita rostou, majetek klesá.",
    over: (s) => {
      if (s.postava.atributy.majetekUSD < 50_000) {
        return { chyby: ["Nemáte dostatečný majetek (min. 50 000 $)."], varovani: [] };
      }
      return { chyby: [], varovani: [] };
    },
    apply: (s) => {
      s.postava.atributy.majetekUSD -= 50_000;
      s.postava.atributy.znamostLokal = Math.min(100, r1(s.postava.atributy.znamostLokal + 1.5));
      s.postava.atributy.integrita = Math.min(100, s.postava.atributy.integrita + 2);
      return "Veřejný dar 50 000 $; známost lokálně +1,5, integrita +2.";
    },
  },
  {
    id: "projev",
    nazev: "Veřejný projev",
    ap: 1,
    urovne: [],
    popis: "Projev na místní akci; efekt dle rétoriky.",
    over: () => ({ chyby: [], varovani: [] }),
    apply: (s, rng) => {
      const efekt = rng.range(0.3, 0.8) * (s.postava.dovednosti.retorika / 5);
      s.postava.atributy.znamostLokal = Math.min(100, r1(s.postava.atributy.znamostLokal + efekt));
      if (s.funkce.uroven === "starosta" || s.funkce.uroven === "radni") {
        s.local.spokojenost = Math.min(100, r1(s.local.spokojenost + efekt / 2));
      }
      return `Známost lokálně +${r1(efekt)}.`;
    },
  },
  {
    id: "skoleni",
    nazev: "Školení",
    ap: 2,
    urovne: [],
    popis: "Kurz za 10 000 $: +1 k vybrané dovednosti.",
    over: (s, p) => {
      if (!p.dovednost) return { chyby: ["Zvolte dovednost k tréninku."], varovani: [] };
      if (s.postava.atributy.majetekUSD < 10_000) return { chyby: ["Nedostatečný majetek (10 000 $)."], varovani: [] };
      if (s.postava.dovednosti[p.dovednost] >= 10) return { chyby: ["Dovednost již je na maximu (10)."], varovani: [] };
      return { chyby: [], varovani: [] };
    },
    apply: (s, _rng, p) => {
      const d = p.dovednost!;
      s.postava.atributy.majetekUSD -= 10_000;
      s.postava.dovednosti[d] += 1;
      return `Dovednost ${d} +1 (nyní ${s.postava.dovednosti[d]}).`;
    },
  },
  {
    id: "zalozit_vybor",
    nazev: "Založit volební výbor",
    ap: 1,
    urovne: [],
    popis: `Registrace kampaně (práh ${FEC_LIMITY.registracniPrag.toLocaleString("en-US")} $). Bez výboru je fundraising nezákonný.`,
    over: (s) => {
      if (s.finance.vyborZalozen) return { chyby: ["Výbor již je založen."], varovani: [] };
      if (s.postava.atributy.majetekUSD < FEC_LIMITY.registracniPrag) {
        return { chyby: [`Registrace vyžaduje ${FEC_LIMITY.registracniPrag.toLocaleString("en-US")} $.`], varovani: [] };
      }
      return { chyby: [], varovani: [] };
    },
    apply: (s) => {
      s.postava.atributy.majetekUSD -= FEC_LIMITY.registracniPrag;
      s.finance.vyborZalozen = true;
      zapisDoDeniku(s, "akce", { registrace: FEC_LIMITY.registracniPrag });
      return "Volební výbor registrován. Nyní můžete shromažďovat legální dary." + citujZakony(["11-cfr-100-5"]);
    },
  },
  {
    id: "fundraiser",
    nazev: "Fundraisering",
    ap: 2,
    urovne: [],
    popis: "Malý dárský večer dle známosti a sociálního kapitálu.",
    over: (s) => {
      if (!s.finance.vyborZalozen) {
        return {
          chyby: [],
          varovani: [
            "Bez registrovaného výboru je shromažďování darů nezákonné — riziko FEC auditu prudce roste.",
          ],
        };
      }
      return { chyby: [], varovani: [] };
    },
    apply: (s, rng) => {
      if (!s.finance.vyborZalozen) {
        s.pravni.fecAuditRiziko += 12;
        return "Přijali jste dary bez registrovaného výboru. FEC audit je otázkou času (+12 riziko)." + citujZakony(["11-cfr-100-5"]);
      }
      const zaklad = 400 + s.postava.atributy.znamostLokal * 80 + s.postava.atributy.socialniKapital * 30;
      const vynos = Math.round(zaklad * rng.range(0.8, 1.4));
      s.finance.pokladnaKampane += vynos;
      s.postava.atributy.prodejnost = Math.min(10, r1(s.postava.atributy.prodejnost + 0.1));
      zapisDoDeniku(s, "akce", { vynos });
      return `Fundraisering vynesl ${vynos.toLocaleString("en-US")} $.`;
    },
  },
  {
    id: "dar",
    nazev: "Přijmout dar",
    ap: 1,
    urovne: [],
    popis: "Dar s plnou právní kontrolou FEC (limity, cizí peníze, quid pro quo).",
    over: (s, p) => {
      if (!p.castkaUSD || p.castkaUSD <= 0) return { chyby: ["Zadejte kladnou částku."], varovani: [] };
      if (!s.finance.vyborZalozen) return { chyby: [], varovani: ["Dar bez výboru porušuje FECA — zvažte nejprve založit výbor."] };
      return { chyby: [], varovani: [] };
    },
    apply: (s, rng, p) => {
      const navrh: NavrhDaru = {
        npcId: p.npcId ?? null,
        typDarce: p.typDarce ?? "individual",
        castkaUSD: p.castkaUSD!,
        volba: p.volba ?? "hlavni",
        slibUrednihoAktu: p.slibUrednihoAktu ?? null,
        pocetSvedku: p.pocetSvedku ?? rng.int(0, 3),
        koordinace: p.koordinace ?? false,
      };
      const kontrola = zkontrolujDar(s, navrh);
      if (!kontrola.legalni) {
        s.pravni.fecAuditRiziko += kontrola.fecAuditRiziko;
        s.pravni.kriminalniRiziko += kontrola.kriminalniRiziko;
        zapisDoDeniku(s, "pravni", { odmitnutyDar: p.castkaUSD, duvod: kontrola.duvod });
        return `Dar odmítnut: ${kontrola.duvod ?? "nezákonný dar"}.` + citujZakony(kontrola.zakonIds);
      }
      s.finance.pokladnaKampane += navrh.castkaUSD;
      s.pravni.fecAuditRiziko += kontrola.fecAuditRiziko;
      s.pravni.kriminalniRiziko += kontrola.kriminalniRiziko;
      const key = `${navrh.typDarce}-${navrh.volba}`;
      s.finance.daryTentoCyklus[key] = (s.finance.daryTentoCyklus[key] ?? 0) + navrh.castkaUSD;
      if (navrh.typDarce !== "self") {
        s.postava.atributy.prodejnost = Math.min(10, r1(s.postava.atributy.prodejnost + 0.05));
      }
      zapisDoDeniku(s, "akce", { dar: navrh.castkaUSD, typDarce: navrh.typDarce });
      const varovani = kontrola.varovani.length > 0 ? ` (${kontrola.varovani.join(" ")})` : "";
      return `Dar ${navrh.castkaUSD.toLocaleString("en-US")} $ přijat${varovani}.` + citujZakony(kontrola.zakonIds);
    },
  },
  {
    id: "reklama",
    nazev: "Reklamní kampaň",
    ap: 2,
    urovne: [],
    popis: "Nákup médií z pokladny kampaně; klesající výnosy.",
    over: (s, p) => {
      const castka = p.castkaUSD ?? 0;
      if (castka <= 0) return { chyby: ["Zadejte kladnou částku."], varovani: [] };
      if (s.finance.pokladnaKampane < castka) return { chyby: ["Nedostatek prostředků v pokladně kampaně."], varovani: [] };
      return { chyby: [], varovani: [] };
    },
    apply: (s, _rng, p) => {
      const castka = p.castkaUSD!;
      s.finance.pokladnaKampane -= castka;
      const efekt = 3.5 * Math.log2(1 + castka / 10_000);
      const cil =
        s.funkce.uroven === "outsider" || s.funkce.uroven === "kandidat" || s.funkce.uroven === "radni" || s.funkce.uroven === "starosta"
          ? "znamostLokal"
          : s.funkce.uroven === "kongresman"
            ? "znamostStat"
            : "znamostNarod";
      s.postava.atributy[cil] = Math.min(100, r1(s.postava.atributy[cil] + efekt));
      return `Reklama za ${castka.toLocaleString("en-US")} $: ${cil} +${r1(efekt)}.`;
    },
  },
  {
    id: "otisky_dveri",
    nazev: "Otisky dveří",
    ap: 2,
    urovne: [],
    popis: "Volební dveřování: autentický růst známosti a integrity.",
    over: () => ({ chyby: [], varovani: [] }),
    apply: (s, rng) => {
      const efekt = rng.range(0.6, 1.6) * (1 + s.postava.dovednosti.medialnost / 10);
      s.postava.atributy.znamostLokal = Math.min(100, r1(s.postava.atributy.znamostLokal + efekt));
      s.postava.atributy.integrita = Math.min(100, r1(s.postava.atributy.integrita + 0.3));
      return `Dveřování: známost lokálně +${r1(efekt)}, integrita +0,3.`;
    },
  },
  {
    id: "debata",
    nazev: "Debata",
    ap: 2,
    urovne: [],
    popis: "Souboj v debatě; výsledek dle rétoriky a prodejnosti.",
    over: () => ({ chyby: [], varovani: [] }),
    apply: (s, rng) => {
      const roll = rng.next();
      const sila = (s.postava.dovednosti.retorika + s.postava.dovednosti.medialnost) / 20 + roll * 0.5;
      if (sila > 0.6) {
        s.postava.atributy.znamostLokal = Math.min(100, r1(s.postava.atributy.znamostLokal + 1.5));
        s.postava.atributy.znamostStat = Math.min(100, r1(s.postava.atributy.znamostStat + 0.5));
        return "Debata byla vyhrána — známost roste.";
      }
      if (s.postava.atributy.prodejnost > 5) {
        s.postava.atributy.integrita = Math.max(0, r1(s.postava.atributy.integrita - 1));
        return "Debata dopadla hůře: soupeř využil Vaší útočné plochy.";
      }
      return "Debata proběhla vyrovnaně.";
    },
  },
  {
    id: "stab",
    nazev: "Budovat štáb",
    ap: 2,
    urovne: [],
    popis: "Profesionální tým za 25 000 $ z pokladny kampaně.",
    over: (s) => {
      if (s.finance.pokladnaKampane < 25_000) return { chyby: ["Pokladna kampaně nemá 25 000 $."], varovani: [] };
      return { chyby: [], varovani: [] };
    },
    apply: (s) => {
      s.finance.pokladnaKampane -= 25_000;
      s.postava.atributy.socialniKapital = Math.min(100, r1(s.postava.atributy.socialniKapital + 2));
      return "Štáb najat: sociální kapitál +2.";
    },
  },
  {
    id: "rozpocet_mesta",
    nazev: "Rozpočet města",
    ap: 3,
    urovne: ["starosta"],
    popis: "Parametr −2..+2: restrikce (deficit klesá, spokojenost klesá) vs. stimul (opačně).",
    over: (_s, p) => {
      const v = p.vyrovnanost ?? 0;
      if (v < -2 || v > 2) return { chyby: ["Vyrovnanost musí být v rozsahu −2..+2."], varovani: [] };
      return { chyby: [], varovani: [] };
    },
    apply: (s, _rng, p) => {
      const v = p.vyrovnanost!;
      // Stimul (v > 0) zhoršuje deficit a zvyšuje spokojenost; restrikce opačně.
      s.local.deficitPct = Math.max(-15, Math.min(20, r1(s.local.deficitPct + v * 0.8)));
      s.local.spokojenost = Math.max(0, Math.min(100, r1(s.local.spokojenost + v * 1.5)));
      s.local.kriminalita = Math.max(10, Math.min(120, r1(s.local.kriminalita + (v > 0 ? -0.5 : 0.5))));
      return `Rozpočet nastaven (vyrovnanost ${v > 0 ? "+" : ""}${v}): deficit ${r1(s.local.deficitPct)} %, spokojenost ${Math.round(s.local.spokojenost)} %.`;
    },
  },
  {
    id: "zonace",
    nazev: "Zónování a rozvoj",
    ap: 2,
    urovne: ["starosta"],
    popis: "Revize územního plánu: spokojenost, kriminalita vs. zájmy developerů.",
    over: () => ({ chyby: [], varovani: [] }),
    apply: (s, rng) => {
      if (rng.chance(0.7)) {
        s.local.spokojenost = Math.min(100, r1(s.local.spokojenost + 2));
        s.local.kriminalita = Math.max(10, r1(s.local.kriminalita - 1));
        return "Zónování schváleno: spokojenost +2, kriminalita −1.";
      }
      s.postava.atributy.socialniKapital = Math.max(0, r1(s.postava.atributy.socialniKapital - 1));
      return "Developři zablokovali revizi: sociální kapitál −1.";
    },
  },
  {
    id: "tiskovka",
    nazev: "Tisková konference",
    ap: 1,
    urovne: [],
    popis: "Vystoupení pro média dle mediálního důvtipu.",
    over: (s) => {
      if (s.pravni.kriminalniRiziko > 30) {
        return { chyby: [], varovani: ["Vysoké kriminální riziko: novináři mohou otevřít téma financování."] };
      }
      return { chyby: [], varovani: [] };
    },
    apply: (s, rng) => {
      const roll = rng.next();
      const efekt = s.postava.dovednosti.medialnost / 10 + roll * 0.8;
      if (s.pravni.kriminalniRiziko > 30 && roll < 0.25) {
        s.postava.atributy.integrita = Math.max(0, r1(s.postava.atributy.integrita - 3));
        s.postava.atributy.prodejnost = Math.min(10, r1(s.postava.atributy.prodejnost + 0.5));
        return "Tiskovka sklouzla k tématu financování — integrita −3, prodejnost +0,5.";
      }
      const cil = s.funkce.uroven === "kongresman" ? "znamostStat" : s.funkce.uroven === "guverner" || s.funkce.uroven === "prezident" ? "znamostNarod" : "znamostLokal";
      s.postava.atributy[cil] = Math.min(100, r1(s.postava.atributy[cil] + efekt));
      return `Tiskovka úspěšná: ${cil} +${r1(efekt)}.`;
    },
  },
  {
    id: "superpac_koordinace",
    nazev: "Tajná koordinace se Super PAC",
    ap: 2,
    urovne: [],
    popis: "Nelegální: velké peníze, vysoké kriminální riziko (illegal coordination).",
    over: () => ({ chyby: [], varovani: ["Koordinace se Super PAC je trestný čin dle FECA — doporučujeme nepoužít."] }),
    apply: (s, rng) => {
      const vynos = Math.round(rng.range(500_000, 2_000_000));
      s.finance.pokladnaKampane += vynos;
      s.pravni.kriminalniRiziko += KRIMINALNI_KONSTANTY.rizikoSuperpacKoordinace + rng.int(0, 4);
      zapisDoDeniku(s, "pravni", { superpacKoordinace: vynos, kolo: s.kolo });
      return `Koordinovaná výpomoc Super PAC: +${vynos.toLocaleString("en-US")} $. Kriminální riziko výrazně roste.` + citujZakony(["11-cfr-109", "citizens-united"]);
    },
  },
  {
    id: "uplacek",
    nazev: "Úplatek",
    ap: 1,
    urovne: [],
    popis: "Úplatek úředníkovi (§666): rychlý výsledek, katastrofální riziko.",
    over: () => ({ chyby: [], varovani: ["Zplacení úředníka je trestný čin (18 U.S.C. §201, §666)."] }),
    apply: (s, rng, p) => {
      const castka = p.castkaUSD ?? 10_000;
      const svedku = p.pocetSvedku ?? rng.int(0, 2);
      s.local.spokojenost = Math.min(100, r1(s.local.spokojenost + rng.range(1.2, 2)));
      const riziko = 4 + (castka / 1000) * KRIMINALNI_KONSTANTY.rizikoZaTisic + KRIMINALNI_KONSTANTY.rizikoZaSvedka * svedku;
      s.pravni.kriminalniRiziko += Math.round(riziko * 10) / 10;
      zapisDoDeniku(s, "pravni", { uplacek: castka, kolo: s.kolo });
      return `Úplatek ${castka.toLocaleString("en-US")} $ vzal; riziko vyšetřování prudce roste.` + citujZakony(["18-usc-201", "18-usc-666"]);
    },
  },
  {
    id: "zakon",
    nazev: "Předložit zákon",
    ap: 4,
    urovne: ["kongresman", "guverner", "prezident"],
    popis: "Legislativní iniciativa dle tématu; úspěch dle dovedností a sociálního kapitálu.",
    over: (_s, p) => {
      if (!p.tema) return { chyby: ["Zvolte téma zákona."], varovani: [] };
      return { chyby: [], varovani: [] };
    },
    apply: (s, rng, p) => {
      const tema = p.tema!;
      const sila =
        (s.postava.dovednosti.vyjednavani + s.postava.dovednosti.diplomacie) / 20 +
        s.postava.atributy.socialniKapital / 150 +
        rng.next() * 0.4;
      if (sila > 0.75) {
        s.postava.atributy.integrita = Math.min(100, r1(s.postava.atributy.integrita + 2));
        s.postava.atributy.znamostNarod = Math.min(100, r1(s.postava.atributy.znamostNarod + 1));
        switch (tema) {
          case "ekonomika":
            s.macro.hdpRust = r1(s.macro.hdpRust + 0.2);
            break;
          case "socialni":
            s.local.spokojenost = Math.min(100, r1(s.local.spokojenost + 3));
            break;
          case "beznacnost":
            s.local.kriminalita = Math.max(10, r1(s.local.kriminalita - 2));
            break;
          case "zdravotnictvi":
            s.local.spokojenost = Math.min(100, r1(s.local.spokojenost + 2));
            break;
          case "infrastruktura":
            s.macro.hdpRust = r1(s.macro.hdpRust + 0.1);
            s.local.spokojenost = Math.min(100, r1(s.local.spokojenost + 1));
            break;
        }
        zapisDoDeniku(s, "akce", { zakon: tema, vysledek: "prijat" });
        return `Zákon (${tema}) prošel — integrita +2, známost národně +1.`;
      }
      zapisDoDeniku(s, "akce", { zakon: tema, vysledek: "zamitnut" });
      return `Zákon (${tema}) nenašel podporu a zamítl se.`;
    },
  },
  {
    id: "federalni_rozpocet",
    nazev: "Federální rozpočet",
    ap: 4,
    urovne: ["prezident"],
    popis: "Parametr −2..+2: konsolidace vs. expanze; vstupuje do fiskálního delta makra.",
    over: (_s, p) => {
      const v = p.vyrovnanost ?? 0;
      if (v < -2 || v > 2) return { chyby: ["Vyrovnanost musí být v rozsahu −2..+2."], varovani: [] };
      return { chyby: [], varovani: [] };
    },
    apply: (s, _rng, p) => {
      const v = p.vyrovnanost!;
      (s as GameState & { fiskalniDelta?: number }).fiskalniDelta = v;
      s.macro.deficitPctHDP = Math.max(-6, Math.min(20, r1(s.macro.deficitPctHDP + v)));
      s.local.spokojenost = Math.max(0, Math.min(100, r1(s.local.spokojenost + v * 2)));
      return `Federální rozpočet nastaven: deficit ${r1(s.macro.deficitPctHDP)} % HDP, fiskální delta ${v > 0 ? "+" : ""}${v} p.b.`;
    },
  },
  {
    id: "exekutivni_prikaz",
    nazev: "Exekutivní příkaz",
    ap: 3,
    urovne: ["prezident"],
    popis: "Rychlá exekutiva bez Kongresu; roste prodejnost (kritika překročení pravomocí).",
    over: () => ({ chyby: [], varovani: [] }),
    apply: (s, rng, p) => {
      const efekt = 1 + rng.next();
      switch (p.tema ?? "ekonomika") {
        case "ekonomika":
          s.macro.hdpRust = r1(s.macro.hdpRust + 0.15);
          break;
        case "socialni":
          s.local.spokojenost = Math.min(100, r1(s.local.spokojenost + efekt));
          break;
        default:
          s.local.spokojenost = Math.min(100, r1(s.local.spokojenost + efekt / 2));
      }
      s.postava.atributy.prodejnost = Math.min(10, r1(s.postava.atributy.prodejnost + 0.3));
      return "Exekutivní příkaz vydán; prodejnost +0,3 (kritika překročení pravomocí).";
    },
  },
  {
    id: "konverzace",
    nazev: "Konverzace s osobou",
    ap: 1,
    urovne: [],
    popis: "Přístup přes prestižní bránu; volitelný slib se ukládá do paměti NPC.",
    over: (s, p) => {
      if (!p.npcId) return { chyby: ["Zvolte osobu (npcId)."], varovani: [] };
      if (!s.npc.find((n) => n.id === p.npcId)) return { chyby: ["Osoba nebyla nalezena."], varovani: [] };
      return { chyby: [], varovani: [] };
    },
    apply: (s, rng, p) => {
      const vysl = provedKonverzaci(s, p.npcId!, rng.next(), p.slibText ?? null);
      zapisDoDeniku(s, "akce", { npc: p.npcId, prijato: vysl.prijato });
      return vysl.zprava;
    },
  },
  {
    id: "pruzkum",
    nazev: "Průzkum veřejného mínění",
    ap: 1,
    urovne: [],
    popis: "Odhad podílu hlasů proti generickému soupeři za 20 000 $.",
    over: (s) => {
      if (s.finance.pokladnaKampane < 20_000 && s.postava.atributy.majetekUSD < 20_000) {
        return { chyby: ["Nemáte prostředky na průzkum (20 000 $)."], varovani: [] };
      }
      return { chyby: [], varovani: [] };
    },
    apply: (s, rng, p) => {
      if (s.finance.pokladnaKampane >= 20_000) s.finance.pokladnaKampane -= 20_000;
      else s.postava.atributy.majetekUSD -= 20_000;
      const typ: TypZavodu =
        p.tema === "prezidentske" ? "prezidentske"
        : p.tema === "gubernatorske" ? "gubernatorske"
        : p.tema === "kongresove" ? "kongresove"
        : "obecni";
      const hrac = hracProfil(s);
      const souper = souperProZavod(s, rng, typ);
      const share = dvoucestnyShare(hrac, souper, s.macro);
      return `Průzkum (${typ}): odhadovaný podíl ${Math.round(share * 100)} % (soupeř: ${Math.round((1 - share) * 100)} %).`;
    },
  },
  {
    id: "compliance_audit",
    nazev: "Compliance audit",
    ap: 1,
    urovne: [],
    popis: "Interní revize financování za 50 000 $; snižuje riziko FEC auditu.",
    over: (s) => {
      if (!s.finance.vyborZalozen) return { chyby: ["Bez výboru není co auditovat."], varovani: [] };
      if (s.finance.pokladnaKampane < 50_000) return { chyby: ["Pokladna nemá 50 000 $."], varovani: [] };
      return { chyby: [], varovani: [] };
    },
    apply: (s) => {
      s.finance.pokladnaKampane -= 50_000;
      s.pravni.fecAuditRiziko = Math.max(0, s.pravni.fecAuditRiziko - 10);
      s.postava.atributy.etika = Math.min(10, r1(s.postava.atributy.etika + 0.2));
      return "Audit dokončen: riziko FEC auditu −10.";
    },
  },
  {
    id: "vyhlasit_kandidaturu",
    nazev: "Vyhlásit kandidaturu",
    ap: 1,
    urovne: [],
    popis: "Zaregistrovat závod dle aktuálního cíle (ústavní, právní i kariérní kontrola).",
    over: (s, p) => {
      const cil: OfficeLevel = (p.tema as OfficeLevel) ?? "radni";
      const volitelnost = overVolitelnost(s.postava, cil, cil === s.funkce.uroven ? s.funkce.obdobi : 0);
      if (!volitelnost.splneno) {
        return { chyby: [`Nesplněny podmínky volitelnosti: ${volitelnost.duvod}${citujZakony(volitelnost.zakonIds ?? [])}`], varovani: [] };
      }
      if (s.pravni.odsouzen) return { chyby: ["Odsouzený nemůže kandidovat na veřejnou funkci."], varovani: [] };
      // Kariérní brance (dračí doupě): bez prahů nelze kandidovat.
      const brana = BRANCE[cil === "outsider" ? "kandidat" : (cil as keyof typeof BRANCE)] ?? BRANCE.radni;
      const chybejici: string[] = [];
      if (s.finance.pokladnaKampane < brana.pokladnaKampan) chybejici.push(`pokladna kampaně ≥ ${(brana.pokladnaKampan / 1000).toFixed(0)}k $`);
      if (s.postava.atributy.znamostStat < brana.znamostStat) chybejici.push(`známost ve státě ≥ ${brana.znamostStat} %`);
      if (s.postava.atributy.socialniKapital < brana.socialniKapital) chybejici.push(`sociální kapitál ≥ ${brana.socialniKapital}`);
      if (s.postava.atributy.etika < brana.etika) chybejici.push(`etika ≥ ${brana.etika}`);
      if (chybejici.length > 0) {
        return { chyby: [`Kariérní brance nesplněna: ${chybejici.join(", ")}.`], varovani: [] };
      }
      return { chyby: [], varovani: [] };
    },
    apply: (s, _rng, p) => {
      const cil: OfficeLevel = (p.tema as OfficeLevel) ?? "radni";
      const typ: TypZavodu =
        cil === "radni" || cil === "starosta" ? "obecni"
        : cil === "kongresman" ? "kongresove"
        : cil === "guverner" ? "gubernatorske"
        : "prezidentske";
      s.beziKampan.typZavodu = typ;
      s.beziKampan.cisloKola = s.kolo;
      zapisDoDeniku(s, "akce", { kandidatura: cil, typ });
      return `Kandidatura na úroveň ${cil} vyhlášena (${typ} závody).`;
    },
  },
  {
    id: "splnit_slib",
    nazev: "Splnit slib",
    ap: 1,
    urovne: [],
    popis: "Naplňte závazek vůči osobě; posiluje vztah a integritu.",
    over: (s, p) => {
      if (!p.slibId) return { chyby: ["Zvolte slib (slibId)."], varovani: [] };
      if (!s.sliby.find((x) => x.id === p.slibId)) return { chyby: ["Slib nenalezen."], varovani: [] };
      return { chyby: [], varovani: [] };
    },
    apply: (s, _rng, p) => {
      const v = splnSlib(s, p.slibId!);
      return v.zprava;
    },
  },
];

/** Vyhledání akce dle id. */
export function najdiAkci(id: string): AkceDef | undefined {
  return AKCE.find((a) => a.id === id);
}

/** Seznam akcí dostupných na dané úrovni (pro UI/AI). */
export function dostupneAkce(uroven: OfficeLevel): AkceDef[] {
  return AKCE.filter((a) => a.urovne.length === 0 || a.urovne.includes(uroven));
}
