/**
 * law.ts — právní vrstva: ústavní volitelnost (Art. I §2/§3, Art. II §1,
 * 22. dodatek, U.S. Term Limits v. Thornton), FECA limity 2025–2026,
 * trestní rizika (18 U.S.C. §201, §666, 52 U.S.C. §30109), kontrola darů
 * a týdenní právní tick se sankční kaskádou FEC → skandál → DOJ → soud.
 * Všechny citace odkazují do databáze zákonů (zakony.ts).
 */
import type { GameState, Postava, OfficeLevel } from "./state.ts";

export const FEC_LIMITY = {
  jednotlivecNaVolbu: 3_500,
  jednotlivecNaCyklus: 7_000, // primárky + hlavní volba
  pacNaVolbu: 5_000,
  jednotlivecStraneRocne: 44_300,
  registracniPrag: 5_000,
  evidencePrag: 200,
  hotovostMax: 100,
  anonymMax: 50,
} as const;

export const KRIMINALNI_KONSTANTY = {
  // §201/§666: riziko roste s hodnotou úplatku (quid pro quo) a počtem svědků
  rizikoZaTisic: 0.02,
  rizikoZaSvedka: 3,
  // koordinace se Super PAC (illegal coordination)
  rizikoSuperpacKoordinace: 8,
  // cizí peníze
  rizikoForeignMoney: 20,
  // FECA trestní prahy (vědomá porušení)
  fecaZlocinPrah: 25_000,
  fecaPokutaPrah: 2_000,
} as const;

export interface Volitelnost {
  uroven: OfficeLevel;
  splneno: boolean;
  duvod: string | null;
  /** Odkazy do databáze zákonů (zakony.ts). */
  zakonIds?: string[];
}

/**
 * Ověří ústavní a zákonné podmínky pro danou funkci.
 * Naturalizovaný občan smí až do Kongresu a na guvernérský post (dle práva státu),
 * ale nikdy na prezidenta — natural-born podmínka.
 */
export function overVolitelnost(p: Postava, uroven: OfficeLevel, obdobiPrezidenta = 0): Volitelnost {
  switch (uroven) {
    case "prezident": {
      if (p.naturalizovany || !p.rodneMistoUS) {
        return { uroven, splneno: false, duvod: "Prezidentem může být jen natural-born občan USA (Art. II, §1, kl. 5).", zakonIds: ["us-const-art2-s1"] };
      }
      if (p.vek < 35) {
        return { uroven, splneno: false, duvod: `Prezidentem lze být od 35 let; Vám bude ${p.vek}.`, zakonIds: ["us-const-art2-s1"] };
      }
      if (obdobiPrezidenta >= 2) {
        return { uroven, splneno: false, duvod: "22. dodatek: nikdo nesmí být zvolen prezidentem více než dvakrát.", zakonIds: ["us-const-dodatek-22"] };
      }
      return { uroven, splneno: true, duvod: null, zakonIds: ["us-const-art2-s1"] };
    }
    case "kongresman": {
      // Sněmovna: 25 let, 7 let občan. (Senát 30/9 – hra řeší jednotně; přístup dle věku.)
      if (p.vek < 25) {
        return { uroven, splneno: false, duvod: "Do Sněmovny lze od 25 let (Art. I, §2).", zakonIds: ["us-const-art1-s2"] };
      }
      return { uroven, splneno: true, duvod: null, zakonIds: ["us-const-art1-s2"] };
    }
    case "guverner": {
      // Právo státu (zjednodušeno: 25 let a občanství); naturalizovaní jsou ve většině států vpuštěni.
      if (p.vek < 25) {
        return { uroven, splneno: false, duvod: "Guvernérem lze ve státě od 25 let.", zakonIds: ["statni-pravo-kvalifikace"] };
      }
      return { uroven, splneno: true, duvod: null, zakonIds: ["statni-pravo-kvalifikace"] };
    }
    case "radni":
    case "starosta": {
      if (p.vek < 18) {
        return { uroven, splneno: false, duvod: "Komunální funkce jsou dostupné od 18 let.", zakonIds: ["us-const-dodatek-26"] };
      }
      return { uroven, splneno: true, duvod: null, zakonIds: ["us-const-dodatek-26"] };
    }
    default:
      return { uroven, splneno: true, duvod: null };
  }
}

export type TypDarce = "individual" | "pac" | "superpac" | "foreign" | "corporate" | "self";

export interface NavrhDaru {
  npcId: string | null;
  typDarce: TypDarce;
  castkaUSD: number;
  volba: "primarky" | "hlavni";
  /** Explicitní slib úředního aktu — quid pro quo. */
  slibUrednihoAktu: string | null;
  /** Počet osob (potenciálních svědků), které o podmínkách vědí. */
  pocetSvedku: number;
  /** Koordinace daru/výdajů s kampaní (u super PAC ilegální). */
  koordinace: boolean;
}

export interface VysledekPravniKontroly {
  legalni: boolean;
  duvod: string | null;
  fecAuditRiziko: number;
  kriminalniRiziko: number;
  varovani: string[];
  /** Odkazy do databáze zákonů (zakony.ts). */
  zakonIds: string[];
}

/**
 * Právní kontrola daru před přijetím. Vrací přírustky rizik a varování.
 * Dar bez explicitního slibu je legální (jen zvedá „prodejnost“); dar se slibem
 * úředního aktu je quid pro quo → kriminální riziko (§201 u federálních, §666 u městských).
 */
export function zkontrolujDar(s: GameState, d: NavrhDaru): VysledekPravniKontroly {
  const v: VysledekPravniKontroly = { legalni: false, duvod: null, fecAuditRiziko: 0, kriminalniRiziko: 0, varovani: [], zakonIds: [] };
  const doFarOblasti = s.funkce.uroven === "prezident" || s.funkce.uroven === "kongresman" || s.funkce.uroven === "guverner";

  // Vlastní financování: neomezené, ale hlášené (Buckley v. Valeo).
  if (d.typDarce === "self") {
    v.legalni = true;
    v.zakonIds.push("buckley-valeo");
    v.varovani.push("Vlastní financování je neomezené, ale povinně hlášené FEC.");
    return v;
  }

  // Cizí peníze: absolutní zákaz (s výjimkou zelené karty u jednotlivců; zde zjednodušeno na zákaz).
  if (d.typDarce === "foreign") {
    v.duvod = "Příspěvky od cizinců (mimo držitele zelené karty) jsou federálním právem zakázané.";
    v.kriminalniRiziko = KRIMINALNI_KONSTANTY.rizikoForeignMoney;
    v.zakonIds.push("52-usc-30121");
    return v;
  }

  // Korporace/odbory přímo kandidátovi: zakázáno, jen přes PAC.
  if (d.typDarce === "corporate") {
    v.duvod = "Všeobecné pokladny korporací a odborů nesmí přispívat kandidátům přímo (jen přes PAC).";
    v.fecAuditRiziko = 4;
    v.zakonIds.push("52-usc-30118");
    return v;
  }

  // Super PAC: neomezená částka, ale zákaz koordinace.
  if (d.typDarce === "superpac") {
    if (d.koordinace) {
      v.legalni = false;
      v.duvod = "Super PAC smí vynakládat neomezeně, ale nesmí koordinovat s kampaní; koordinace mění výdaje na nelegální příspěvek.";
      v.kriminalniRiziko = KRIMINALNI_KONSTANTY.rizikoSuperpacKoordinace;
      v.zakonIds.push("11-cfr-109");
      return v;
    }
    v.legalni = true;
    v.zakonIds.push("speechnow-v-fec");
    v.varovani.push("Super PAC: neomezené nezávislé výdaje, bez koordinace s kampaní.");
    return v;
  }

  // Limitní kontrola pro jednotlivce a PAC.
  const limit = d.typDarce === "pac" ? FEC_LIMITY.pacNaVolbu : FEC_LIMITY.jednotlivecNaVolbu;
  const klic = `${d.npcId ?? "anonym"}:${d.typDarce}:${d.volba}`;
  const jizDarovano = s.finance.daryTentoCyklus[klic] ?? 0;
  const celkemPoDaru = jizDarovano + d.castkaUSD;

  if (celkemPoDaru > limit) {
    v.duvod = `Limit FEC 2025–2026: ${d.typDarce === "pac" ? "multicandidate PAC" : "jednotlivec"} může darovat max. ${limit.toLocaleString("en-US")} $ na jednu volbu; překročení o ${Math.round(celkemPoDaru - limit).toLocaleString("en-US")} $.`;
    v.fecAuditRiziko = 2 + Math.min(6, Math.floor((celkemPoDaru - limit) / 2_000));
    v.zakonIds.push("52-usc-30116");
    return v;
  }

  // Legální dar; evidence nad 200 $.
  v.legalni = true;
  if (d.castkaUSD >= FEC_LIMITY.evidencePrag) {
    v.varovani.push(`Dar nad ${FEC_LIMITY.evidencePrag} $ musí být evidován (jméno, adresa, zaměstnavatel).`);
    v.zakonIds.push("feca-1971");
  }

  // Registrace výboru: při překročení 5 000 $ celkem musí být výbor založen.
  const celkemCyklus = Object.values(s.finance.daryTentoCyklus).reduce((a, b) => a + b, 0);
  if (!s.finance.vyborZalozen && celkemCyklus + d.castkaUSD > FEC_LIMITY.registracniPrag) {
    v.varovani.push(`Po překročení ${FEC_LIMITY.registracniPrag.toLocaleString("en-US")} $ přijatých/vynaložených prostředků je nutné zaregistrovat volební výbor u FEC.`);
    v.zakonIds.push("11-cfr-100-5");
  }

  // Quid pro quo: dar svázaný s explicitním slibem úředního aktu = §201 / §666.
  if (d.slibUrednihoAktu) {
    v.kriminalniRiziko =
      Math.min(100, d.castkaUSD / 1000 * KRIMINALNI_KONSTANTY.rizikoZaTisic * 10) +
      d.pocetSvedku * KRIMINALNI_KONSTANTY.rizikoZaSvedka;
    v.zakonIds.push(doFarOblasti ? "18-usc-201" : "18-usc-666");
    const threshold666 = doFarOblasti ? 0 : 5_000; // §666 u městské úrovně: úplatek ≥ 5 000 $
    if (!doFarOblasti && d.castkaUSD < threshold666 && d.castkaUSD >= 1_000) {
      v.varovani.push("Nízká částka pod práh §666 (5 000 $) snižuje federální trestní expozici, ale zůstává státní delikt.");
    }
    v.varovani.push(`Dar s explicitním slibem úředního aktu je quid pro quo — ${doFarOblasti ? "18 U.S.C. §201" : "18 U.S.C. §666"} trestné riziko.`);
  }

  return v;
}

export interface PravniUdalost {
  typ: "fec_audit" | "skandal" | "vysetrovani_zacatek" | "obzaloba" | "odsouzeni";
  zprava: string;
}

/**
 * Týdenní právní tick — modeluje sankční kaskádu:
 * FEC audit → novinářské odhalení → DOJ vyšetřování → obžaloba/odsouzení.
 * Deterministicky závislé na rizicích a RNG.
 */
export function pravniTick(s: GameState, pravdepodobnostniTah: number): PravniUdalost[] {
  const out: PravniUdalost[] = [];
  if (s.pravni.odsouzen) return out;

  // FEC audit: pokuty a vrácení darů, riziko klesá.
  if (s.pravni.fecAuditRiziko > 0 && pravdepodobnostniTah < 0.01 * s.pravni.fecAuditRiziko) {
    s.pravni.fecAuditRiziko = Math.max(0, s.pravni.fecAuditRiziko - 4);
    out.push({ typ: "fec_audit", zprava: "FEC audit zjistil nesrovnalosti v hlášení — pokuta a vrácení části darů." });
    s.finance.pokladnaKampane = Math.max(0, s.finance.pokladnaKampane - 15_000);
  }

  // Novinářské odhalení: skandál, pád popularity.
  if (s.pravni.kriminalniRiziko > 10 && pravdepodobnostniTah > 0.98 - 0.002 * s.pravni.kriminalniRiziko) {
    s.postava.atributy.prodejnost = Math.min(10, s.postava.atributy.prodejnost + 1);
    s.postava.atributy.integrita = Math.max(0, s.postava.atributy.integrita - 8);
    out.push({ typ: "skandal", zprava: "Novináře prozradil informátor — skandál o financování Vaší kampaně." });
  }

  // Začátek DOJ/FBI vyšetřování.
  if (s.pravni.kriminalniRiziko > 20 && s.pravni.vysetrovani.length === 0 && pravdepodobnostniTah < 0.005 * s.pravni.kriminalniRiziko) {
    s.pravni.vysetrovani.push({ id: `doj-${s.kolo}`, odKola: s.kolo, tema: "financování kampaně", intenzita: s.pravni.kriminalniRiziko / 100 });
    out.push({ typ: "vysetrovani_zacatek", zprava: "FBI otevřela předběžné vyšetřování financování Vaší kampaně." });
  }

  // Vyšetřování se vyvíjí: po 12+ kolech může dospět k závěru.
  for (const v of s.pravni.vysetrovani) {
    if (s.kolo - v.odKola > 12 && !(v as { uzavreno?: boolean }).uzavreno) {
      if (pravdepodobnostniTah < 0.004 * v.intenzita * 100) {
        // Obžaloba a proces; pravděpodobnost odsouzení roste s intenzitou.
        out.push({ typ: "obzaloba", zprava: "Ministerstvo spravedlnosti vzneslo obžalobu — následuje soudní proces." });
        if (pravdepodobnostniTah < 0.6 * v.intenzita + 0.1) {
          s.pravni.odsouzen = true;
          out.push({ typ: "odsouzeni", zprava: "Soud rozhodl o vině — veřejná kariéra je u konce; hra přechází do epilogu." });
        }
      }
      s.pravni.vysetrovani = s.pravni.vysetrovani.filter((x) => x.id !== v.id);
    }
  }

  return out;
}
