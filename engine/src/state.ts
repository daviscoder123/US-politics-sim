/**
 * state.ts — definice herního stavu, katalog archetypů a vytvoření nové hry.
 * Makroekonomické výchozí hodnoty jsou kalibrovány na skutečná data USA (podzim 2026):
 * HDP ~2,1 % meziročně, inflace CPI 3,7 %, nezaměstnanost 4,2 %, Fed ~3,88 %,
 * deficit 6,2 % HDP, dluh veřejný ~100 % HDP (CBO FY2026, BEA/BLS 2026).
 */
import { Rng } from "./rng.ts";

export type OfficeLevel =
  | "outsider"
  | "kandidat"
  | "radni"
  | "starosta"
  | "kongresman"
  | "guverner"
  | "prezident";

export interface Dovednosti {
  diplomacie: number; // 1–10
  retorika: number;
  finance: number;
  vyjednavani: number;
  medialnost: number;
}

export interface Atributy {
  majetekUSD: number;
  socialniKapital: number; // 0–100
  znamostLokal: number; // 0–100 (%)
  znamostStat: number; // 0–100
  znamostNarod: number; // 0–100
  etika: number; // 0–10
  prodejnost: number; // 0–10 (vnímání ovlivnitelnosti médii)
  integrita: number; // 0–100
}

export interface Postava {
  jmeno: string;
  vek: number;
  rodneMistoUS: boolean; // natural-born podmínka pro prezidenta
  naturalizovany: boolean;
  archetyp: string;
  zivotopisText: string;
  domovskyStat: string;
  ideologie: number; // −10 (levice) .. +10 (pravice)
  dovednosti: Dovednosti;
  atributy: Atributy;
  strana: string | null; // id strany, nebo null = nezávislý
}

export interface NPC {
  id: string;
  jmeno: string;
  role: string; // "sponzor" | "novinar" | "politik" | "aktivista" ...
  prestiz: number; // práh pro přijetí konverzace: prestiž − (sociální kapitál + vztah*5 + bonus) <= 0
  vztah: number; // −10..+10
  ochotaHistorie: boolean[]; // přijal/a konverzaci v minulosti
  pamet: string[]; // zapamatované sliby a prohřešky
  sponzorTyp: "individual" | "pac" | "superpac" | "foreign" | "corporate" | null;
}

export interface Slib {
  id: string;
  text: string;
  komu: string | null; // id NPC nebo "volici"
  koloSlibu: number;
  lhutaKolo: number;
  stav: "v_progressu" | "splnen" | "porusen";
}

export interface PravniStav {
  kriminalniRiziko: number; // 0–100
  fecAuditRiziko: number; // 0–100
  odsouzen: boolean;
  vysetrovani: { id: string; odKola: number; tema: string; intenzita: number }[];
}

export interface Macro {
  hdpRust: number; // % meziročně
  inflace: number; // % CPI
  nezamestnanost: number; // %
  fedSazba: number; // %
  deficitPctHDP: number; // %
  dluhPctHDP: number; // % (veřejný dluh)
  rating: string; // "AAA" | "AA+" | "AA" | "A" | "BBB"
}

export interface Local {
  mesto: string;
  stat: string;
  obyvatel: number;
  rozpocetMUSD: number; // roční
  deficitPct: number; // % rozpočtu
  kriminalita: number; // index na 100 tis. obyvatel
  spokojenost: number; // 0–100
  nezamestnanost: number; // %
}

export interface GameEvent {
  id: string;
  tema: "klima" | "migrace" | "geopolitika" | "dluh" | "technologie" | "energetika" | "pravni" | "volby" | "ekonomika";
  nazev: string;
  popis: string;
  kolo: number;
  dopady: Partial<Record<string, number>>; // klíče: pokladna, socialniKapital, etika, prodejnost, znamostLokal, spokojenost ...
}

export interface LogEntry {
  kolo: number;
  typ: "akce" | "udalost" | "pravni" | "ekonomika" | "volby" | "system";
  data: Record<string, unknown>;
}

export interface GameState {
  saveVersion: number;
  seed: number;
  kolo: number; // 1 kolo = 1 herní týden
  rok: number;
  tyden: number; // 1–52
  ap: number; // zbývající akční body v kole (max 10)
  postava: Postava;
  funkce: { uroven: OfficeLevel; odKola: number; obdobi: number };
  finance: { pokladnaKampane: number; vyborZalozen: boolean; daryTentoCyklus: Record<string, number> };
  pravni: PravniStav;
  macro: Macro;
  local: Local;
  npc: NPC[];
  sliby: Slib[];
  udalosti: GameEvent[];
  denik: LogEntry[];
  beziKampan: { typZavodu: "obecni" | "kongresove" | "gubernatorske" | "prezidentske" | null; cisloKola: number | null };
}

export interface Archetyp {
  id: string;
  nazev: string;
  popis: string;
  majetekUSD: number;
  socialniKapital: number;
  dovednosti: Partial<Dovednosti>;
  etika: number;
  prodejnost: number;
  ideologie: number;
}

/** Katalog archetypů pro prolog — každý definuje jiné východisko. */
export const ARCHETYPY: Archetyp[] = [
  { id: "software-podnikatel", nazev: "Softwarový podnikatel", popis: "Zakladatel technologické firmy; majetek a sítě v odvětví.", majetekUSD: 12_400_000, socialniKapital: 34, dovednosti: { finance: 8, medialnost: 5, diplomacie: 5 }, etika: 6, prodejnost: 3, ideologie: 0 },
  { id: "ropny-magnat", nazev: "Ropný magnát", popis: "Vlastník těžební a rafinérské společnosti; peníze, ale etická stína.", majetekUSD: 48_000_000, socialniKapital: 40, dovednosti: { finance: 9, vyjednavani: 7, diplomacie: 6 }, etika: 3, prodejnost: 7, ideologie: 7 },
  { id: "ochranar-krajiny", nazev: "Ochránce krajiny", popis: "Environmentální aktivista a lídr hnutí; čisté ruce, málo peněz.", majetekUSD: 180_000, socialniKapital: 30, dovednosti: { retorika: 8, diplomacie: 7, medialnost: 6 }, etika: 9, prodejnost: 1, ideologie: -6 },
  { id: "pravnik", nazev: "Právník", popis: "Partner v advokátní kanceláři; znalost zákona a sítě ve městě.", majetekUSD: 3_200_000, socialniKapital: 36, dovednosti: { vyjednavani: 7, retorika: 7, finance: 5 }, etika: 6, prodejnost: 3, ideologie: 0 },
  { id: "lekar", nazev: "Lékař", popis: "Ředitel městské nemocnice; respekt a odbornost.", majetekUSD: 2_100_000, socialniKapital: 35, dovednosti: { diplomacie: 7, retorika: 6 }, etika: 8, prodejnost: 2, ideologie: -2 },
  { id: "odborar", nazev: "Odborový předák", popis: "Vedoucí odborů; disciplinovaná členská základna.", majetekUSD: 420_000, socialniKapital: 38, dovednosti: { vyjednavani: 8, retorika: 7 }, etika: 7, prodejnost: 3, ideologie: -6 },
  { id: "vojak", nazev: "Veterán", popis: "Vysloužilý důstojník; autorita a pořádek.", majetekUSD: 900_000, socialniKapital: 33, dovednosti: { diplomacie: 5, retorika: 6, vyjednavani: 6 }, etika: 8, prodejnost: 2, ideologie: 4 },
  { id: "ucitel", nazev: "Učitel", popis: "Populární středoškolský pedagog; autentická blízkost voličům.", majetekUSD: 240_000, socialniKapital: 29, dovednosti: { retorika: 7, diplomacie: 6 }, etika: 8, prodejnost: 1, ideologie: -4 },
  { id: "novinar", nazev: "Novinář", popis: "Vyšetřovací reportér; média znají jménem.", majetekUSD: 700_000, socialniKapital: 41, dovednosti: { medialnost: 9, retorika: 8 }, etika: 6, prodejnost: 3, ideologie: -3 },
  { id: "celebrita", nazev: "Celebrita", popis: "Bývalá hvězda zábavy; známost zdarma, skeptická média.", majetekUSD: 6_500_000, socialniKapital: 45, dovednosti: { medialnost: 10, retorika: 7 }, etika: 4, prodejnost: 6, ideologie: 0 },
  { id: "farmar", nazev: "Farmář", popis: "Provozovatel rodinné farmy; venkovní důvěra.", majetekUSD: 1_800_000, socialniKapital: 31, dovednosti: { vyjednavani: 6, diplomacie: 7 }, etika: 7, prodejnost: 2, ideologie: 3 },
  { id: "inzenyr", nazev: "Inženýr", popis: "Stavební inženýr a podnikatel v infrastruktuře.", majetekUSD: 2_600_000, socialniKapital: 32, dovednosti: { finance: 7, vyjednavani: 6 }, etika: 7, prodejnost: 2, ideologie: 1 },
];

export interface NewGameParams {
  seed: number;
  jmeno: string;
  vek: number;
  archetyp: string;
  rodneMistoUS: boolean;
  naturalizovany: boolean;
  zivotopisText: string;
  domovskyStat: string;
  mesto?: string;
}

const MAKRO_START: Macro = {
  hdpRust: 2.1,
  inflace: 3.7,
  nezamestnanost: 4.2,
  fedSazba: 3.88,
  deficitPctHDP: 6.2,
  dluhPctHDP: 100.0,
  rating: "AA+",
};

export function vytvorNovouHru(p: NewGameParams): GameState {
  const archetyp = ARCHETYPY.find((a) => a.id === p.archetyp);
  if (!archetyp) {
    throw new Error(`Neznámý archetyp: ${p.archetyp}`);
  }
  const dovednosti: Dovednosti = {
    diplomacie: archetyp.dovednosti.diplomacie ?? 5,
    retorika: archetyp.dovednosti.retorika ?? 5,
    finance: archetyp.dovednosti.finance ?? 5,
    vyjednavani: archetyp.dovednosti.vyjednavani ?? 5,
    medialnost: archetyp.dovednosti.medialnost ?? 5,
  };
  return {
    saveVersion: 1,
    seed: p.seed,
    kolo: 1,
    rok: 2027,
    tyden: 1,
    ap: 10,
    postava: {
      jmeno: p.jmeno,
      vek: p.vek,
      rodneMistoUS: p.rodneMistoUS,
      naturalizovany: p.naturalizovany,
      archetyp: p.archetyp,
      zivotopisText: p.zivotopisText,
      domovskyStat: p.domovskyStat,
      ideologie: archetyp.ideologie,
      dovednosti,
      atributy: {
        majetekUSD: archetyp.majetekUSD,
        socialniKapital: archetyp.socialniKapital,
        znamostLokal: 8,
        znamostStat: 3,
        znamostNarod: 1,
        etika: archetyp.etika,
        prodejnost: archetyp.prodejnost,
        integrita: 50 + archetyp.etika * 5,
      },
      strana: null,
    },
    funkce: { uroven: "outsider", odKola: 1, obdobi: 0 },
    finance: { pokladnaKampane: 0, vyborZalozen: false, daryTentoCyklus: {} },
    pravni: { kriminalniRiziko: 0, fecAuditRiziko: 0, odsouzen: false, vysetrovani: [] },
    macro: { ...MAKRO_START },
    local: {
      mesto: p.mesto ?? "Lakeside",
      stat: p.domovskyStat,
      obyvatel: 60_000,
      rozpocetMUSD: 184.2,
      deficitPct: -3.2,
      kriminalita: 47.2,
      spokojenost: 58,
      nezamestnanost: 5.1,
    },
    npc: [],
    sliby: [],
    udalosti: [],
    denik: [{ kolo: 1, typ: "system", data: { zprava: "Nová hra", archetyp: p.archetyp, seed: p.seed } }],
    beziKampan: { typZavodu: null, cisloKola: null },
  };
}

/** Deterministický RNG pro daný stav — derivovaný ze seedu a počtu kol. */
export function rngProStav(s: GameState): Rng {
  return new Rng(s.seed + s.kolo * 7919);
}
