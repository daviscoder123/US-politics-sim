/*
 * engine-bundle.ts — sloučený engine (všechny moduly v jednom souboru).
 * Generováno mechanicky z engine/src/*.ts; úpravy provádějte v modulech.
 * Pořadí: rng, state, zakony, law, economy, indicators, social, elections, actions, events, audit, game, ai.
 */

/* ===== rng.ts ===== */
/**
 * rng.ts — deterministický generátor náhodných čísel (mulberry32).
 * Veškerá náhodnost hry prochází touto třídou; jiné zdroje náhodnosti jsou zakázané,
 * aby replay save souboru dával vždy identický výsledek.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  /** Další uniformní číslo v [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniformní celé číslo v [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Uniformní reálné číslo v [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Test pravděpodobnosti p v [0, 1]. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Náhodný prvek pole. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Normální rozdělení (Box-Muller). */
  normal(mu = 0, sigma = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Aktuální vnitřní seed (pro uložení a replay). */
  seed(): number {
    return this.s;
  }
}

/* ===== state.ts ===== */
/**
 * state.ts — definice herního stavu, katalog archetypů a vytvoření nové hry.
 * Makroekonomické výchozí hodnoty jsou kalibrovány na skutečná data USA (podzim 2026):
 * HDP ~2,1 % meziročně, inflace CPI 3,7 %, nezaměstnanost 4,2 %, Fed ~3,88 %,
 * deficit 6,2 % HDP, dluh veřejný ~100 % HDP (CBO FY2026, BEA/BLS 2026).
 */

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

/** Startovní osoby prologu — fiktivní, prestižní brány laděné k výchozímu kapitálu archetypů. */
export const START_NPC: NPC[] = [
  {
    id: "npc-sponzor",
    jmeno: "Charles Whitmore",
    role: "sponzor",
    prestiz: 45,
    vztah: 0,
    ochotaHistorie: [],
    pamet: [],
    sponzorTyp: "individual",
  },
  {
    id: "npc-novinar",
    jmeno: "Dana Reeves",
    role: "novinar",
    prestiz: 40,
    vztah: 0,
    ochotaHistorie: [],
    pamet: [],
    sponzorTyp: null,
  },
  {
    id: "npc-politik",
    jmeno: "Frank Kowalski",
    role: "politik",
    prestiz: 55,
    vztah: 0,
    ochotaHistorie: [],
    pamet: [],
    sponzorTyp: null,
  },
  {
    id: "npc-aktivista",
    jmeno: "Maya Thompson",
    role: "aktivista",
    prestiz: 30,
    vztah: 0,
    ochotaHistorie: [],
    pamet: [],
    sponzorTyp: null,
  },
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
    npc: START_NPC.map((n) => ({
      ...n,
      ochotaHistorie: [],
      pamet: [],
      vztah: 0,
    })),
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

/* ===== zakony.ts ===== */
/**
 * zakony.ts — databáze právních norem, na kterých hra stojí a které engine
 * vykonává. Každý záznam obsahuje citaci, shrnutí, herní dopady a ověřené
 * zdroje. Slouží jako kodex pro hráče (vyhledávání) i jako jediný zdroj
 * citací pro právní vrstvu (law.ts).
 *
 * Citace ověřeny: uscode.house.gov / uscode.ecfr.io, fec.gov (11 C.F.R.),
 * constitution.congress.gov, congress.gov (CRS), supreme.justia.com.
 */

export type ZakonKategorie =
  | "ustava"
  | "volebni_pravo"
  | "trestni_pravo"
  | "exekutiva"
  | "fiskalni_pravo"
  | "soudni_precedens"
  | "statni_pravo";

export type ZakonOblast = "federalni" | "statni" | "municipalni";

export interface Zakon {
  id: string; // stabilní identifikátor, na který odkazuje law.ts
  citace: string; // právní citace
  nazev: string;
  kategorie: ZakonKategorie;
  oblast: ZakonOblast;
  shrnuti: string;
  efektyVeHre: string[]; // co pravidlo dělá v simulátoru
  zdroje: string[]; // URL ověřených zdrojů
}

export const ZAKONY: Zakon[] = [
  {
    id: "us-const-art1-s2",
    citace: "U.S. Const. Art. I, § 2, kl. 2",
    nazev: "Kvalifikace poslance",
    kategorie: "ustava",
    oblast: "federalni",
    shrnuti: "Do Sněmovny reprezentantů lze zvolit osobu starší 25 let, která je občanem USA nejméně 7 let a je obyvatelem státu, za který kandiduje.",
    efektyVeHre: ["Kandidatura do Kongresu vyžaduje věk ≥ 25 let."],
    zdroje: ["https://constitution.congress.gov/browse/article-1/"],
  },
  {
    id: "us-const-art1-s3",
    citace: "U.S. Const. Art. I, § 3, kl. 3",
    nazev: "Kvalifikace senátora",
    kategorie: "ustava",
    oblast: "federalni",
    shrnuti: "Do Senátu lze zvolit osobu starší 30 let, občana USA nejméně 9 let a obyvatele daného státu.",
    efektyVeHre: ["Hra modeluje Kongres jednotně; engine používá test věku dle úrovně."],
    zdroje: ["https://constitution.congress.gov/browse/article-1/"],
  },
  {
    id: "us-const-art2-s1",
    citace: "U.S. Const. Art. II, § 1, kl. 5",
    nazev: "Kvalifikace prezidenta (natural-born)",
    kategorie: "ustava",
    oblast: "federalni",
    shrnuti: "Prezidentem může být jen natural-born občan USA (nebo občan v době přijetí ústavy), starší 35 let a nejméně 14 let rezident USA.",
    efektyVeHre: ["Naturalizovaný hráč nemůže nikdy kandidovat na prezidenta — tvrdý gate v overVolitelnost."],
    zdroje: ["https://constitution.congress.gov/browse/article-2/"],
  },
  {
    id: "us-const-dodatek-22",
    citace: "U.S. Const. dodatek XXII",
    nazev: "Limit dvou voleb prezidenta",
    kategorie: "ustava",
    oblast: "federalni",
    shrnuti: "Nikdo nesmí být zvolen prezidentem více než dvakrát; kdo zdědil období delší než 2 roky, může být zvolen jen jednou.",
    efektyVeHre: ["Po dvou obdobích nelze znovu kandidovat na prezidenta."],
    zdroje: ["https://constitution.congress.gov/constitution/amendment-22/"],
  },
  {
    id: "us-const-dodatek-25",
    citace: "U.S. Const. dodatek XXV",
    nazev: "Nástupnictví a neschopnost prezidenta",
    kategorie: "ustava",
    oblast: "federalni",
    shrnuti: "Řeší obsazení úřadu viceprezidenta a přechod pravomocí při neschopnosti prezidenta vykonávat funkci.",
    efektyVeHre: ["Připraveno pro scénáře akutních krizí v exekutivě."],
    zdroje: ["https://constitution.congress.gov/constitution/amendment-25/"],
  },
  {
    id: "us-const-art1-s9-emoluments",
    citace: "U.S. Const. Art. I, § 9, kl. 8",
    nazev: "Klauzule zahraničních emolumentů",
    kategorie: "ustava",
    oblast: "federalni",
    shrnuti: "Bez souhlasu Kongresu nesmí osoba ve federálním úřadu přijímat dar, emolument či titul od cizího státu.",
    efektyVeHre: ["Zahraniční „dary“ pro federální úředníky zvyšují kriminální riziko (respektováno v zkontrolujDar)."],
    zdroje: ["https://constitution.congress.gov/browse/article-1/"],
  },
  {
    id: "us-const-dodatek-14-s4",
    citace: "U.S. Const. dodatek XIV, § 4",
    nazev: "Platnost veřejného dluhu",
    kategorie: "ustava",
    oblast: "federalni",
    shrnuti: "Zákonnost veřejného dluhu USA nesmí být zpochybněna; relevantní při vyjednávání o stropu dluhu.",
    efektyVeHre: ["Scénáře krize stropu dluhu; default je v modelu extrémní událost."],
    zdroje: ["https://constitution.congress.gov/constitution/amendment-14/"],
  },
  {
    id: "us-const-dodatek-15",
    citace: "U.S. Const. dodatek XV",
    nazev: "Volební právo bez ohledu na rasu",
    kategorie: "ustava",
    oblast: "federalni",
    shrnuti: "Volební právo občanů USA nesmí být odepřeno ani omezeno pro rasu, barvu či předchozí nevolnost.",
    efektyVeHre: ["V modelu voličského sboru nejsou demografické bariéry."],
    zdroje: ["https://constitution.congress.gov/constitution/amendment-15/"],
  },
  {
    id: "us-const-dodatek-19",
    citace: "U.S. Const. dodatek XIX",
    nazev: "Volební právo žen",
    kategorie: "ustava",
    oblast: "federalni",
    shrnuti: "Volební právo USA nesmí být odepřeno pro pohlaví.",
    efektyVeHre: ["Voličstvo v modelu je univerzální."],
    zdroje: ["https://constitution.congress.gov/constitution/amendment-19/"],
  },
  {
    id: "us-const-dodatek-26",
    citace: "U.S. Const. dodatek XXVI",
    nazev: "Volební právo od 18 let",
    kategorie: "ustava",
    oblast: "federalni",
    shrnuti: "Volební právo nesmí být odepřeno občanům starším 18 let.",
    efektyVeHre: ["Komunální kandidatura je v enginu dostupná od 18 let."],
    zdroje: ["https://constitution.congress.gov/constitution/amendment-26/"],
  },
  {
    id: "feca-1971",
    citace: "Federal Election Campaign Act, 52 U.S.C. § 30101 a násl.",
    nazev: "FECA — rámec financování kampaní",
    kategorie: "volebni_pravo",
    oblast: "federalni",
    shrnuti: "Základní zákon o zveřejňování a regulaci federálních volebních kampaní; novelizován 1974 (vznik FEC) a 2002 (BCRA).",
    efektyVeHre: ["Celá právní vrstva financování kampaně (law.ts) je implementací FECA."],
    zdroje: [
      "https://www.fec.gov/regulations/",
      "http://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title52-chapter301&edition=prelim",
    ],
  },
  {
    id: "52-usc-30116",
    citace: "52 U.S.C. § 30116",
    nazev: "Limity příspěvků (2025–2026: 3 500 $ / volbu)",
    kategorie: "volebni_pravo",
    oblast: "federalni",
    shrnuti: "Stanoví limity příspěvků: jednotlivec 3 500 $ na jednu volbu (7 000 $ za cyklus), multicandidate PAC 5 000 $ na volbu; FEC limity indexuje inflací.",
    efektyVeHre: ["zkontrolujDar odmítne dar nad limit a zvýší fecAuditRiziko."],
    zdroje: [
      "https://www.fec.gov/help-candidates-and-committees/candidate-taking-receipts/contribution-limits/",
      "https://uscode.ecfr.io/title/52/section-30116",
    ],
  },
  {
    id: "52-usc-30118",
    citace: "52 U.S.C. § 30118",
    nazev: "Zákaz příspěvků z pokladny korporací a odborů",
    kategorie: "volebni_pravo",
    oblast: "federalni",
    shrnuti: "Korporace, národní banky a odbory nesmí přispívat ze všeobecné pokladny kandidátům; smějí financovat jen separate segregated fund (PAC).",
    efektyVeHre: ["Dar typu „corporate“ je odmítnut s odkazem na PAC cestu."],
    zdroje: [
      "https://uscode.house.gov/view.xhtml?req=(title:52+section:30118+edition:prelim)",
      "https://www.congress.gov/crs-product/R46521",
    ],
  },
  {
    id: "52-usc-30121",
    citace: "52 U.S.C. § 30121; 11 C.F.R. § 110.20",
    nazev: "Zákaz příspěvků cizinců",
    kategorie: "volebni_pravo",
    oblast: "federalni",
    shrnuti: "Cizinci (mimo držitele zelené karty) nesmí přispívat ani vynakládat peníze v jakékoli americké volbě; vědomé přijetí je protiprávní.",
    efektyVeHre: ["Foreign dar je v enginu absolutně zakázaný; zvyšuje kriminalniRiziko."],
    zdroje: [
      "https://uscode.ecfr.io/title/52/section-30121",
      "https://www.fec.gov/help-candidates-and-committees/foreign-nationals/",
    ],
  },
  {
    id: "11-cfr-100-5",
    citace: "11 C.F.R. § 100.5, § 101.1",
    nazev: "Registrace volebního výboru (práh 5 000 $)",
    kategorie: "volebni_pravo",
    oblast: "federalni",
    shrnuti: "Kandidát, který přijme či vynaloží přes 5 000 $, se stává „political committee“ a musí se registrovat u FEC.",
    efektyVeHre: ["Akce zalozit_vybor odemkne legální fundraisering; bez něj hrozí audit."],
    zdroje: ["https://www.ecfr.gov/current/title-11/chapter-I/subchapter-A/part-100"],
  },
  {
    id: "11-cfr-110-4",
    citace: "11 C.F.R. § 110.4",
    nazev: "Hotovostní a anonymní příspěvky",
    kategorie: "volebni_pravo",
    oblast: "federalni",
    shrnuti: "Hotovostní příspěvky nad 100 $ jsou zakázané; anonymní příspěvky nad 50 $ musí být zlikvidovány.",
    efektyVeHre: ["Konstanty hotovostMax a anonymMax ve FEC_LIMITY."],
    zdroje: ["https://www.ecfr.gov/current/title-11/chapter-I/subchapter-A/part-110"],
  },
  {
    id: "11-cfr-109",
    citace: "11 C.F.R. part 109",
    nazev: "Koordinace kandidáta a nezávislých výdajů",
    kategorie: "volebni_pravo",
    oblast: "federalni",
    shrnuti: "Výdaje koordinované s kandidátem nebo jeho agentem se považují za příspěvek kandidátovi — podléhají limitům a zákazům.",
    efektyVeHre: ["Tajná koordinace se Super PAC je ilegální akce s vysokým kriminálním rizikem."],
    zdroje: ["https://www.ecfr.gov/current/title-11/chapter-I/subchapter-A/part-109"],
  },
  {
    id: "bcra-2002",
    citace: "Bipartisan Campaign Reform Act 2002 (Pub. L. 107–155)",
    nazev: "McCain-Feingold",
    kategorie: "volebni_pravo",
    oblast: "federalni",
    shrnuti: "Zakázal neomezené „soft money“ pro stranické výbory a omezil electioneering communications; část přezkoušena v Citizens United.",
    efektyVeHre: ["Stranické finance jsou v modelu omezené; koordinace je sankcionována."],
    zdroje: ["https://www.congress.gov/bill/107th-congress/house-bill/2356"],
  },
  {
    id: "hatch-act",
    citace: "Hatch Act, 5 U.S.C. § 7321–7326",
    nazev: "Politická aktivita federálních zaměstnanců",
    kategorie: "volebni_pravo",
    oblast: "federalni",
    shrnuti: "Federálním zaměstnancům je omezena politická aktivita v pracovní době; zákaz nátlaku na podřízené.",
    efektyVeHre: ["Připraveno pro budoucí štáb s federálními zaměstnanci."],
    zdroje: ["https://www.ecfr.gov/current/title-5/part-732"],
  },
  {
    id: "buckley-valeo",
    citace: "Buckley v. Valeo, 424 U.S. 1 (1976)",
    nazev: "Výdaje versus příspěvky",
    kategorie: "soudni_precedens",
    oblast: "federalni",
    shrnuti: "Limity výdajů z vlastních prostředků jsou neústavní; limity příspěvků a zveřejňování jsou přípustné.",
    efektyVeHre: ["Self-funding je neomezené, ale hlášené; dary podléhají limitům."],
    zdroje: ["https://supreme.justia.com/cases/federal/us/424/1/"],
  },
  {
    id: "citizens-united",
    citace: "Citizens United v. FEC, 558 U.S. 310 (2010)",
    nazev: "Nezávislé výdaje korporací",
    kategorie: "soudni_precedens",
    oblast: "federalni",
    shrnuti: "Vláda nesmí zakázat nezávislé volební výdaje korporací a odborů; přímé příspěvky kandidátům zůstávají zakázané.",
    efektyVeHre: ["Super PAC existuje jako legální (bez koordinace) i ilegální (s koordinací) cesta financování."],
    zdroje: ["https://supreme.justia.com/cases/federal/us/558/310/"],
  },
  {
    id: "speechnow-v-fec",
    citace: "SpeechNow.org v. FEC, 599 F.3d 686 (D.C. Cir. 2010)",
    nazev: "Vznik Super PAC",
    kategorie: "soudni_precedens",
    oblast: "federalni",
    shrnuti: "Kombinace s Citizens United vedla k neomezeným příspěvkům do výborů činících pouze nezávislé výdaje.",
    efektyVeHre: ["Super PAC dary v enginu: neomezené, ale bez koordinace."],
    zdroje: ["https://www.fec.gov/legal-resources/court-cases/speechnow/"],
  },
  {
    id: "term-limits-thornton",
    citace: "U.S. Term Limits, Inc. v. Thornton, 514 U.S. 779 (1995)",
    nazev: "Státy nemohou přidávat limity pro Kongres",
    kategorie: "soudni_precedens",
    oblast: "federalni",
    shrnuti: "Státy nesmí ukládat kandidátům do Kongresu dodatečné kvalifikace (term limits) nad rámec ústavy.",
    efektyVeHre: ["Kongresman v enginu nemá povinný limit období; ztráta hrozí jen volebně."],
    zdroje: ["https://supreme.justia.com/cases/federal/us/514/779/"],
  },
  {
    id: "18-usc-201",
    citace: "18 U.S.C. § 201",
    nazev: "Federální úplatkářství (bribery)",
    kategorie: "trestni_pravo",
    oblast: "federalni",
    shrnuti: "Trestá dávání a přijímání úplatků veřejným činitelem za oficiální akt; quid pro quo je jádrem deliktu.",
    efektyVeHre: ["Dar svázaný se slibem úředního aktu u federálních úrovní zvyšuje kriminalniRiziko."],
    zdroje: ["https://uscode.house.gov/view.xhtml?req=(title:18+section:201+edition:prelim)"],
  },
  {
    id: "18-usc-666",
    citace: "18 U.S.C. § 666",
    nazev: "Úplatkářství v programech s federálními prostředky",
    kategorie: "trestni_pravo",
    oblast: "municipalni",
    shrnuti: "Kryje úplatky úředníkům organizací přijímajících ≥ 10 000 $ federálních prostředků ročně; hodnota úplatku ≥ 5 000 $.",
    efektyVeHre: ["Městské úrovně (radní, starosta) mají práh 5 000 $ pro federální expozici."],
    zdroje: ["https://uscode.house.gov/view.xhtml?req=(title:18+section:666+edition:prelim)"],
  },
  {
    id: "feca-trestni",
    citace: "52 U.S.C. § 30109; 18 U.S.C. § 607",
    nazev: "Trestní sazby FECA",
    kategorie: "trestni_pravo",
    oblast: "federalni",
    shrnuti: "Vědomá a úmyslná porušení FECA nad 25 000 $ jsou zločin; nad 2 000 $ přestupek se pokutou; § 607 zakazuje výběr darů ve federálních budovách.",
    efektyVeHre: ["Konstanty fecaZlocinPrah a fecaPokutaPrah v KRIMINALNI_KONSTANTY."],
    zdroje: ["https://uscode.ecfr.io/title/52/section-30109"],
  },
  {
    id: "impoundment-1974",
    citace: "Congressional Budget and Impoundment Control Act 1974, 2 U.S.C. § 6801 a násl.",
    nazev: "Kontrola zadržování přidělených prostředků",
    kategorie: "exekutiva",
    oblast: "federalni",
    shrnuti: "Prezident nesmí jednostranně zadržet prostředky schválené Kongresem; vyžaduje návrh rescission.",
    efektyVeHre: ["Exekutivní příkazy nemohou v modelu „zrušit“ výdaje; jen přesměrovat prioritu."],
    zdroje: ["https://uscode.house.gov/view.xhtml?req=(title:2+section:6801+edition:prelim)"],
  },
  {
    id: "anti-deficiency",
    citace: "31 U.S.C. § 1341 (Anti-Deficiency Act)",
    nazev: "Zákaz výdajů bez povolení",
    kategorie: "fiskalni_pravo",
    oblast: "federalni",
    shrnuti: "Federální úřady nesmí vynakládat prostředky nad rámec (nebo před) schválené přidělení.",
    efektyVeHre: ["Rozpočtové akce prezidenta jsou ohraničené rozpočtovým procesem, ne libovůlí."],
    zdroje: ["https://uscode.house.gov/view.xhtml?req=(title:31+section:1341+edition:prelim)"],
  },
  {
    id: "statni-pravo-kvalifikace",
    citace: "Ústavy států (zjednodušení)",
    nazev: "Kvalifikace guvernéra dle práva státu",
    kategorie: "statni_pravo",
    oblast: "statni",
    shrnuti: "Typicky 25–30 let věku, občanství USA a rezidence ve státě; naturalizovaní jsou ve většině států vpuštěni.",
    efektyVeHre: ["Guvernérská brance: 25 let; naturalizovaný hráč smí kandidovat."],
    zdroje: ["https://www.ncsl.org/"],
  },
  {
    id: "home-rule",
    citace: "Home rule charters (municipální právo, zjednodušení)",
    nazev: "Samospráva města",
    kategorie: "statni_pravo",
    oblast: "municipalni",
    shrnuti: "Města s home rule chartou řídí vlastní rozpočet a zónování v mezích státu; bez ní rozhoduje legislativa státu.",
    efektyVeHre: ["Starosta může nastavovat rozpočet a zónování; zásahy kraje jsou scénáře."],
    zdroje: ["https://www.ncsl.org/"],
  },
];

/** Vyhledání zákona dle stabilního id (používá law.ts a UI). */
export function najdiZakon(id: string): Zakon | undefined {
  return ZAKONY.find((z) => z.id === id);
}

/** Full-text vyhledávání v kodexu (název, citace, shrnutí). */
export function hledejZakony(dotaz: string): Zakon[] {
  const q = dotaz.trim().toLowerCase();
  if (q.length === 0) return ZAKONY;
  return ZAKONY.filter(
    (z) =>
      z.nazev.toLowerCase().includes(q) ||
      z.citace.toLowerCase().includes(q) ||
      z.shrnuti.toLowerCase().includes(q) ||
      z.id.toLowerCase().includes(q)
  );
}

/** Zákony dle kategorie (pro kodex v UI). */
export function zakonyDleKategorie(k: ZakonKategorie): Zakon[] {
  return ZAKONY.filter((z) => z.kategorie === k);
}

/** Zkrácený citační řetězec pro herní zprávy: „[52 U.S.C. § 30116]“. */
export function citujZakony(ids: string[]): string {
  const citace = ids
    .map((id) => najdiZakon(id)?.citace)
    .filter((c): c is string => Boolean(c));
  if (citace.length === 0) return "";
  return " [" + citace.join("; ") + "]";
}

/* ===== law.ts ===== */
/**
 * law.ts — právní vrstva: ústavní volitelnost (Art. I §2/§3, Art. II §1,
 * 22. dodatek, U.S. Term Limits v. Thornton), FECA limity 2025–2026,
 * trestní rizika (18 U.S.C. §201, §666, 52 U.S.C. §30109), kontrola darů
 * a týdenní právní tick se sankční kaskádou FEC → skandál → DOJ → soud.
 * Všechny citace odkazují do databáze zákonů (zakony.ts).
 */

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

/* ===== economy.ts ===== */
/**
 * economy.ts — ekonomický model: kvartální přepočet makra (Okun, Phillips,
 * fiskální stimul, akumulace dluhu, Taylorovo pravidlo pro Fed, rating),
 * detekce makro krizí a týdenní tick lokální ekonomiky.
 *
 * Kalibrace: NAIRU 4,3 %; výchozí stav USA podzim 2026 (CBO FY2026: deficit
 * 6,2 % HDP, dluh ~100 % HDP, Fed ~3,88 %, inflace CPI 3,7 %).
 */

export const NAIRU = 4.3;

export interface FiskalniParametry {
  /** Fiskální stimul v p.b. HDP (kladný = expanze). */
  fiscalDelta: number;
  /** Exogenní šok (energie, geopolitika) na inflaci v p.b. */
  sok: number;
}

/** Rating dle fiskální pozice (zjednodušení S&P/Fitch/Moody's). */
export function ratingPro(m: Macro): string {
  if (m.dluhPctHDP > 120 || m.deficitPctHDP > 10) return "BBB";
  if (m.dluhPctHDP > 110 || m.deficitPctHDP > 8) return "A";
  if (m.dluhPctHDP > 100 || m.deficitPctHDP > 6.5) return "AA";
  if (m.dluhPctHDP > 90 || m.deficitPctHDP > 5) return "AA+";
  return "AAA";
}

/** Taylorovo pravidlo (zjednodušené): cíl inflace 2 %, neutrální sazba 2 %. */
export function fedSazba(inflace: number, hdpRust: number): number {
  const sazka = 2 + 1.5 * (inflace - 2) + 0.5 * (hdpRust - 1.8);
  return Math.max(0, Math.round(sazka * 100) / 100);
}

/**
 * Kvartální přepočet makra. Volá se každé 4. kolo.
 * Okun: nezaměstnanost reaguje na Output gap; Phillips: inflace na
 * nezaměstnanost vs. NAIRU + fiskální stimul + šok; dluh akumuluje deficit.
 */
export function prepoctiMakro(m: Macro, p: FiskalniParametry): Macro {
  const novy: Macro = { ...m };

  // Fiskální stimul tlačí HDP nahoru, ale i inflaci.
  novy.hdpRust = Math.round((m.hdpRust + 0.35 * p.fiscalDelta - 0.02 * (m.fedSazba - 3.88)) * 10) / 10;
  novy.hdpRust = Math.max(-8, Math.min(12, novy.hdpRust));

  // Okunův zákon: růst nad/bod pod potenciálem (~2 %) snižuje/zvyšuje nezaměstnanost.
  const okun = 0.35 * (novy.hdpRust - 2.0);
  novy.nezamestnanost = Math.round((m.nezamestnanost - okun) * 10) / 10;
  novy.nezamestnanost = Math.max(2.5, Math.min(25, novy.nezamestnanost));

  // Phillipsova křivka: gap vůči NAIRU + fiskální stimul + šok.
  const gap = novy.nezamestnanost - NAIRU;
  const inflacniTlak = -0.4 * gap + 0.25 * p.fiscalDelta + p.sok + 0.03 * (m.inflace - 2.5);
  novy.inflace = Math.round((m.inflace + inflacniTlak) * 10) / 10;
  novy.inflace = Math.max(-2, Math.min(20, novy.inflace));

  // Fed: Taylorovo pravidlo se setrvačností.
  const cilSazky = fedSazba(novy.inflace, novy.hdpRust);
  novy.fedSazba = Math.round((m.fedSazba + 0.25 * (cilSazky - m.fedSazba)) * 100) / 100;
  novy.fedSazba = Math.max(0, Math.min(20, novy.fedSazba));

  // Dluh: akumuluje deficit (1 kvartál = 1/4 roku).
  novy.dluhPctHDP = Math.round((m.dluhPctHDP + m.deficitPctHDP / 4 - 0.05 * novy.hdpRust) * 10) / 10;
  novy.dluhPctHDP = Math.max(20, Math.min(250, novy.dluhPctHDP));

  // Rating.
  novy.rating = ratingPro(novy);

  return novy;
}

/** Detekce makro krizí — vrací zprávy pro deník. */
export function makroKrize(m: Macro): string[] {
  const zpravy: string[] = [];
  if (m.deficitPctHDP > 8) zpravy.push("Deficit překročil 8 % HDP — trhy ztrácejí důvěru, rating je pod tlakem.");
  if (m.inflace > 5 && m.inflace <= 9) zpravy.push(`Inflace ${m.inflace.toFixed(1)} %: voliči pociťují zdražování, ústřední banka tlačí na sazby.`);
  if (m.inflace > 9) zpravy.push(`Hyperinflační tlak: inflace ${m.inflace.toFixed(1)} % — ekonomika je v krizi.`);
  if (m.nezamestnanost > 7) zpravy.push(`Nezaměstnanost ${m.nezamestnanost.toFixed(1)} %: rekordní počet domácností je v potížích.`);
  if (m.fedSazba >= 14.5) zpravy.push("Fed na extrémních sazbách: kreditní zplozenie, hrozí recese.");
  return zpravy;
}

export interface LokalkaDeltak {
  kriminalitaDelta: number;
  spokojenostDelta: number;
  /** Změna rozpočtu v % (rozpočtová politika starosty). */
  rozpocetDeltaPct: number;
}

/** Týdenní lokální tick — drift obce, tlumení k výchozím hodnotám. */
export function lokalkaTick(s: GameState, d: LokalkaDeltak): Local {
  const l = s.local;
  l.kriminalita = Math.max(10, Math.min(120, Math.round((l.kriminalita + d.kriminalitaDelta + (l.nezamestnanost - 5) * 0.05) * 10) / 10));
  l.spokojenost = Math.max(0, Math.min(100, Math.round((l.spokojenost + d.spokojenostDelta) * 10) / 10));
  l.deficitPct = Math.max(-15, Math.min(20, Math.round((l.deficitPct + d.rozpocetDeltaPct) * 10) / 10));
  // Lokální nezaměstnanost sleduje národní s notedlouhou setrvačností.
  l.nezamestnanost = Math.round((l.nezamestnanost + 0.15 * (s.macro.nezamestnanost - l.nezamestnanost)) * 10) / 10;
  return l;
}

/* ===== indicators.ts ===== */
/**
 * indicators.ts — kariérní brance (dračí doupě): práhy pro postup na další
 * úroveň, detekce lokálních krizí a data pro HUD.
 */

export interface BranaData {
  cilovaUroven: OfficeLevel;
  pokladnaKampan: number; // USD
  znamostStat: number; // % ve státě
  socialniKapital: number;
  etika: number;
}

export const BRANCE: Record<"kandidat" | "radni" | "starosta" | "kongresman" | "guverner" | "prezident", BranaData> = {
  kandidat: { cilovaUroven: "kandidat", pokladnaKampan: 25_000, znamostStat: 5, socialniKapital: 25, etika: 3 },
  radni: { cilovaUroven: "radni", pokladnaKampan: 50_000, znamostStat: 8, socialniKapital: 30, etika: 3 },
  starosta: { cilovaUroven: "starosta", pokladnaKampan: 250_000, znamostStat: 15, socialniKapital: 40, etika: 4 },
  kongresman: { cilovaUroven: "kongresman", pokladnaKampan: 2_000_000, znamostStat: 40, socialniKapital: 55, etika: 5 },
  guverner: { cilovaUroven: "guverner", pokladnaKampan: 8_000_000, znamostStat: 60, socialniKapital: 65, etika: 5 },
  prezident: { cilovaUroven: "prezident", pokladnaKampan: 60_000_000, znamostStat: 80, socialniKapital: 75, etika: 6 },
};

export interface VysledekBrance {
  splneno: boolean;
  chybejici: string[];
}

/** Vyhodnotí branci pro zvolenou cílovou úroveň. */
export function vyhodnotBranci(s: GameState): VysledekBrance {
  const klice: (keyof typeof BRANCE)[] = ["kandidat", "radni", "starosta", "kongresman", "guverner", "prezident"];
  // Cílová úroveň = nejbližší vyšší nad aktuální funkcí.
  const poradi: OfficeLevel[] = ["outsider", "kandidat", "radni", "starosta", "kongresman", "guverner", "prezident"];
  const idx = poradi.indexOf(s.funkce.uroven);
  const cilKlic = klice[Math.min(idx + 1, klice.length - 1)];
  const b = BRANCE[cilKlic];
  const chybejici: string[] = [];
  if (s.finance.pokladnaKampane < b.pokladnaKampan) {
    chybejici.push(`pokladna kampaně: ${(b.pokladnaKampan / 1_000_000).toFixed(1)} mil. $ (máte ${Math.round(s.finance.pokladnaKampane).toLocaleString("en-US")} $)`);
  }
  if (s.postava.atributy.znamostStat < b.znamostStat) {
    chybejici.push(`známost ve státě: ${b.znamostStat} % (máte ${Math.round(s.postava.atributy.znamostStat)} %)`);
  }
  if (s.postava.atributy.socialniKapital < b.socialniKapital) {
    chybejici.push(`sociální kapitál: ${b.socialniKapital} (máte ${Math.round(s.postava.atributy.socialniKapital)})`);
  }
  if (s.postava.atributy.etika < b.etika) {
    chybejici.push(`etika: ${b.etika} (máte ${Math.round(s.postava.atributy.etika * 10) / 10})`);
  }
  return { splneno: chybejici.length === 0, chybejici };
}

/** Lokální krize — vrací zprávy pro deník/HUD. */
export function lokalniKrize(s: GameState): string[] {
  const z: string[] = [];
  const l = s.local;
  if (l.deficitPct > 8) z.push(`Městský deficit ${l.deficitPct.toFixed(1)} % — hrozí předlužení a audit.`);
  if (l.kriminalita > 65) z.push(`Kriminalita ${l.kriminalita.toFixed(0)} na 100 tis. — voliči volají po pořádku.`);
  if (l.spokojenost < 35) z.push(`Spokojenost ${Math.round(l.spokojenost)} % — město je na pokraji vzpoury.`);
  return z;
}

/** Data pro HUD — shrnutí klíčových ukazatelů. */
export function hudData(s: GameState): Record<string, string | number> {
  return {
    "Kolo / týden": `${s.kolo} / ${s.tyden} (${s.rok})`,
    "Funkce": s.funkce.uroven,
    "AP": s.ap,
    "Pokladna kampaně": `$${Math.round(s.finance.pokladnaKampane).toLocaleString("en-US")}`,
    "Majetek": `$${Math.round(s.postava.atributy.majetekUSD).toLocaleString("en-US")}`,
    "Známost (L/S/N)": `${Math.round(s.postava.atributy.znamostLokal)}/${Math.round(s.postava.atributy.znamostStat)}/${Math.round(s.postava.atributy.znamostNarod)}`,
    "Sociální kapitál": Math.round(s.postava.atributy.socialniKapital),
    "Integrita": Math.round(s.postava.atributy.integrita),
    "Etika": s.postava.atributy.etika,
    "Prodejnost": s.postava.atributy.prodejnost,
    "Kriminální riziko": Math.round(s.pravni.kriminalniRiziko),
    "FEC audit riziko": Math.round(s.pravni.fecAuditRiziko),
    "HDP růst %": s.macro.hdpRust,
    "Inflace %": s.macro.inflace,
    "Nezaměstnanost %": s.macro.nezamestnanost,
    "Fed sazba %": s.macro.fedSazba,
    "Deficit % HDP": s.macro.deficitPctHDP,
    "Dluh % HDP": s.macro.dluhPctHDP,
    "Rating": s.macro.rating,
    "Spokojenost města %": Math.round(s.local.spokojenost),
    "Kriminalita": s.local.kriminalita,
  };
}

/* ===== social.ts ===== */
/**
 * social.ts — sociální vrstva: gate konverzací podle prestiže, vliv konverzací
 * na vztahy, ukládání slibů do paměti NPC.
 *
 * Gate: NPC přijme konverzaci, když
 *   npc.prestiz − (socialniKapital + vztah*5 + funkceBonus) ≤ 0
 * FunkceBonus roste s úrovní úřadu (outsider 0 … prezident 20).
 */

export const FUNKCE_BONUS: Record<OfficeLevel, number> = {
  outsider: 0,
  kandidat: 1,
  radni: 2,
  starosta: 5,
  kongresman: 8,
  guverner: 12,
  prezident: 20,
};

export function funkceBonus(uroven: OfficeLevel): number {
  return FUNKCE_BONUS[uroven] ?? 0;
}

/** Vrátí hodnotu prestižní brány — kladná znamená „ještě vás odmítne“. */
export function branaPrestize(npc: NPC, s: GameState): number {
  return (
    npc.prestiz -
    (s.postava.atributy.socialniKapital + npc.vztah * 5 + funkceBonus(s.funkce.uroven))
  );
}

/** Přijme NPC konverzaci? */
export function ochota(npc: NPC, s: GameState): boolean {
  return branaPrestize(npc, s) <= 0;
}

export interface VysledekKonverzace {
  prijato: boolean;
  zmenaVztahu: number;
  zprava: string;
  slibId: string | null;
}

/**
 * Provedení konverzace (1 AP účtuje volající akce v actions.ts).
 * randRoll 0–1 dodá engine ze seedovaného Rng.
 */
export function provedKonverzaci(
  s: GameState,
  npcId: string,
  randRoll: number,
  slibText: string | null
): VysledekKonverzace {
  const npc = s.npc.find((n) => n.id === npcId);
  if (!npc) {
    return { prijato: false, zmenaVztahu: 0, zprava: "Osoba nebyla nalezena.", slibId: null };
  }
  const brana = branaPrestize(npc, s);
  if (brana > 0) {
    return {
      prijato: false,
      zmenaVztahu: 0,
      zprava: `${npc.jmeno} vás odmítl/a. Prestižní brána: ještě o ${Math.ceil(brana)} bodů sociálního kapitálu níže (nebo vyšší úřad, nebo lepší vztah).`,
      slibId: null,
    };
  }

  // Kvalita konverzace podle retoriky a diplomacie (0,5–2,0).
  const kvalita =
    0.5 +
    (s.postava.dovednosti.retorika + s.postava.dovednosti.diplomacie) / 14 +
    randRoll * 0.5;

  let zmena = Math.round((kvalita - 1.0) * 3 * 10) / 10;
  // Slib zatěžuje vztah: dlouhodobá cita, krátkodobé plus.
  if (slibText && slibText.trim().length > 0) {
    zmena += 1.0;
  }
  npc.vztah = Math.max(-10, Math.min(10, Math.round((npc.vztah + zmena) * 10) / 10));
  npc.ochotaHistorie.push(true);

  let slibId: string | null = null;
  if (slibText && slibText.trim().length > 0) {
    const novySlib: Slib = {
      id: `slib-${s.sliby.length + 1}`,
      text: slibText.trim(),
      komu: npc.id,
      koloSlibu: s.kolo,
      lhutaKolo: s.kolo + 52, // standardní lhůta jednoho herního roku
      stav: "v_progressu",
    };
    s.sliby.push(novySlib);
    npc.pamet.push(`Slib (kolo ${s.kolo}): ${slibText.trim()}`);
    slibId = novySlib.id;
  }

  // Sociální kapitál pomalu roste s každou úspěšnou konverzací.
  s.postava.atributy.socialniKapital = Math.min(
    100,
    Math.round((s.postava.atributy.socialniKapital + 0.4) * 10) / 10
  );

  return {
    prijato: true,
    zmenaVztahu: zmena,
    zprava: `Konverzace s ${npc.jmeno} proběhla (${zmena >= 0 ? "+" : ""}${zmena} vztah).`,
    slibId,
  };
}

/** Kontrola lhut slibů — nesplněné sliby po lhutě pálí vztahy a integritu. */
export function slibyTick(s: GameState): string[] {
  const zpravy: string[] = [];
  for (const slib of s.sliby) {
    if (slib.stav === "v_progressu" && s.kolo > slib.lhutaKolo) {
      slib.stav = "porusen";
      const npc = s.npc.find((n) => n.id === slib.komu);
      if (npc) {
        npc.vztah = Math.max(-10, npc.vztah - 3);
        npc.pamet.push(`PORUŠENÝ SLIB (kolo ${s.kolo}): ${slib.text}`);
      }
      s.postava.atributy.integrita = Math.max(0, s.postava.atributy.integrita - 4);
      s.postava.atributy.etika = Math.max(0, s.postava.atributy.etika - 1);
      zpravy.push(`Porušili jste slib: „${slib.text}“ — vztahy i integrita klesly.`);
    }
  }
  return zpravy;
}

/** Splnění slibu (akce splnit_slib) — posiluje vztah a integritu. */
export function splnSlib(s: GameState, slibId: string): { ok: boolean; zprava: string } {
  const slib = s.sliby.find((x) => x.id === slibId);
  if (!slib) return { ok: false, zprava: "Slib nebyl nalezen." };
  if (slib.stav !== "v_progressu")
    return { ok: false, zprava: `Slib již není v progressu (stav: ${slib.stav}).` };
  slib.stav = "splnen";
  const npc = s.npc.find((n) => n.id === slib.komu);
  if (npc) {
    npc.vztah = Math.min(10, npc.vztah + 2);
    npc.pamet.push(`SPLNĚNÝ SLIB (kolo ${s.kolo}): ${slib.text}`);
  }
  s.postava.atributy.integrita = Math.min(100, s.postava.atributy.integrita + 3);
  return { ok: true, zprava: `Slib „${slib.text}“ byl splněn.` };
}

/* ===== elections.ts ===== */
/**
 * elections.ts — volební model: preference voličů, Monte Carlo s seedovaným Rng,
 * primárky s delegáty (proporcionální + bonus pro vítěze), Electoral College
 * (50 států + DC, celkem 538 volitelů) a kalendář voleb.
 *
 * Kalibrace: EV dle sčítání 2020 (uplatněno od 2024); lean = přibližná výchozí
 * marže demokratů v neutrálním roce (Cook PVI orientovaně, upraveno dle 2024).
 */

export interface StavTabulka {
  stat: string; // USPS kód
  ev: number; // počet volitelů
  lean: number; // očekávaná marže demokratů (p.b.) v neutrálním roce
}

/** 50 států + DC; součet EV musí být 538 (testováno). */
export const STATY_EV: StavTabulka[] = [
  { stat: "AL", ev: 9, lean: -29 },
  { stat: "AK", ev: 3, lean: -14 },
  { stat: "AZ", ev: 11, lean: -1 },
  { stat: "AR", ev: 6, lean: -30 },
  { stat: "CA", ev: 54, lean: 24 },
  { stat: "CO", ev: 10, lean: 8 },
  { stat: "CT", ev: 7, lean: 14 },
  { stat: "DE", ev: 3, lean: 12 },
  { stat: "DC", ev: 3, lean: 80 },
  { stat: "FL", ev: 30, lean: -7 },
  { stat: "GA", ev: 16, lean: 0 },
  { stat: "HI", ev: 4, lean: 24 },
  { stat: "ID", ev: 4, lean: -33 },
  { stat: "IL", ev: 19, lean: 14 },
  { stat: "IN", ev: 11, lean: -17 },
  { stat: "IA", ev: 6, lean: -10 },
  { stat: "KS", ev: 6, lean: -15 },
  { stat: "KY", ev: 8, lean: -28 },
  { stat: "LA", ev: 8, lean: -25 },
  { stat: "ME", ev: 4, lean: 6 },
  { stat: "MD", ev: 10, lean: 28 },
  { stat: "MA", ev: 11, lean: 24 },
  { stat: "MI", ev: 15, lean: 2 },
  { stat: "MN", ev: 10, lean: 4 },
  { stat: "MS", ev: 6, lean: -28 },
  { stat: "MO", ev: 10, lean: -17 },
  { stat: "MT", ev: 4, lean: -17 },
  { stat: "NE", ev: 5, lean: -20 },
  { stat: "NV", ev: 6, lean: 0 },
  { stat: "NH", ev: 4, lean: 1 },
  { stat: "NJ", ev: 14, lean: 10 },
  { stat: "NM", ev: 5, lean: 7 },
  { stat: "NY", ev: 28, lean: 16 },
  { stat: "NC", ev: 16, lean: -1 },
  { stat: "ND", ev: 3, lean: -33 },
  { stat: "OH", ev: 17, lean: -7 },
  { stat: "OK", ev: 7, lean: -33 },
  { stat: "OR", ev: 8, lean: 12 },
  { stat: "PA", ev: 19, lean: 0 },
  { stat: "RI", ev: 4, lean: 14 },
  { stat: "SC", ev: 9, lean: -16 },
  { stat: "SD", ev: 3, lean: -29 },
  { stat: "TN", ev: 11, lean: -29 },
  { stat: "TX", ev: 40, lean: -12 },
  { stat: "UT", ev: 6, lean: -20 },
  { stat: "VT", ev: 3, lean: 30 },
  { stat: "VA", ev: 13, lean: 6 },
  { stat: "WA", ev: 12, lean: 16 },
  { stat: "WV", ev: 4, lean: -38 },
  { stat: "WI", ev: 10, lean: 0 },
  { stat: "WY", ev: 3, lean: -42 },
];

/** Kontrolní součet volitelů (invariant). */
export const SUM_EV = STATY_EV.reduce((a, s) => a + s.ev, 0);

export type TypZavodu = "obecni" | "kongresove" | "gubernatorske" | "prezidentske";

/** Kalendář voleb: volební dny jsou v týdnu 45 (první listopadový úterý). */
export const TYDEN_VOLEB = 45;
export const TYDEN_PRIMAREK = 24;

/**
 * Prezidentské: roky dělitelné 4 (2028, 2032...). Kongresové (House): sudé roky.
 * Gubernatoriální: midtermové roky (rok % 4 === 2). Obecní: liché roky.
 */
export function zavodyVRoce(rok: number): TypZavodu[] {
  const z: TypZavodu[] = [];
  if (rok % 4 === 0) z.push("prezidentske");
  if (rok % 2 === 0) z.push("kongresove");
  if (rok % 4 === 2) z.push("gubernatorske");
  if (rok % 2 === 1) z.push("obecni");
  return z;
}

/** Profil kandidáta pro volební matematiku. */
export interface KandidatProfil {
  ideologie: number; // −10..+10
  znamost: number; // 0–100
  integrita: number; // 0–100
  prodejnost: number; // 0–10
  vydajeUSD: number; // vynaložené na kampaň
  kandidujeZnovu: boolean; // incumbency bonus
}

/** Soupeř generovaný dle úrovně závodu (seedovaně). */
export function souperProZavod(s: GameState, rng: Rng, typ: TypZavodu): KandidatProfil {
  const bazovaSila: Record<TypZavodu, { znamost: number; integrita: number; vydajeUSD: number }> = {
    obecni: { znamost: rng.range(25, 45), integrita: rng.range(40, 65), vydajeUSD: rng.range(15_000, 120_000) },
    kongresove: { znamost: rng.range(40, 65), integrita: rng.range(40, 70), vydajeUSD: rng.range(800_000, 2_500_000) },
    gubernatorske: { znamost: rng.range(55, 80), integrita: rng.range(45, 72), vydajeUSD: rng.range(15_000_000, 40_000_000) },
    prezidentske: { znamost: rng.range(70, 95), integrita: rng.range(45, 75), vydajeUSD: rng.range(300_000_000, 900_000_000) },
  };
  const b = bazovaSila[typ];
  return {
    ideologie: rng.range(-7, 7),
    znamost: b.znamost,
    integrita: b.integrita,
    prodejnost: rng.range(2, 7),
    vydajeUSD: b.vydajeUSD,
    kandidujeZnovu: rng.chance(0.4),
  };
}

export function hracProfil(s: GameState): KandidatProfil {
  const a = s.postava.atributy;
  const znamost = Math.max(a.znamostLokal, Math.max(a.znamostStat, a.znamostNarod));
  return {
    ideologie: s.postava.ideologie,
    znamost,
    integrita: a.integrita,
    prodejnost: a.prodejnost,
    vydajeUSD: s.finance.pokladnaKampane,
    kandidujeZnovu: s.funkce.obdobi > 0,
  };
}

/**
 * Dvoucestný podíl hráče (0..1) dle utility voličů:
 * ideologie + známost + integrita − prodejnost + ekonomika + kampaň s klesajícím výnosem.
 */
export function dvoucestnyShare(hrac: KandidatProfil, souper: KandidatProfil, m: Macro): number {
  const ideologieVliv = 0.9 * (souper.ideologie - hrac.ideologie) * 0.02;
  const znamostVliv = 0.010 * (hrac.znamost - souper.znamost);
  const integritaVliv = 0.006 * (hrac.integrita - souper.integrita);
  const prodejnostVliv = -0.010 * ((hrac.prodejnost - souper.prodejnost) * 5);
  const ekonomikaVliv =
    0.008 * (m.hdpRust - 2.0) - 0.012 * (m.inflace - 3.0) - 0.010 * (m.nezamestnanost - 4.3);
  const kamp = (v: number) => Math.log2(1 + v / 100_000);
  const kampaVliv = 0.035 * (kamp(hrac.vydajeUSD) - kamp(souper.vydajeUSD));
  const incVliv = (hrac.kandidujeZnovu ? 0.02 : 0) - (souper.kandidujeZnovu ? 0.02 : 0);

  const share = 0.5 + ideologieVliv + znamostVliv + integritaVliv + prodejnostVliv + ekonomikaVliv + kampaVliv + incVliv;
  return Math.max(0.01, Math.min(0.99, share));
}

export interface StatVysledek {
  stat: string;
  ev: number;
  marze: number; // p.b. marže hráče
  hracVyhrava: boolean;
}

export interface VysledekPrezidentske {
  vyhral: boolean;
  shareNarodni: number;
  marzeNarodni: number; // p.b.
  evHrac: number;
  evSouper: number;
  staty: StatVysledek[];
}

/**
 * Prezidentské volby: národní marže z utility modelu, státy = marže + lean
 * (tlumený pro nezávislé) + gaussovský šum, winner-take-all.
 */
export function simulatePrezidentske(
  hrac: KandidatProfil,
  souper: KandidatProfil,
  m: Macro,
  maStranu: boolean,
  rng: Rng
): VysledekPrezidentske {
  const share = dvoucestnyShare(hrac, souper, m);
  const narodniMarze = (share - 0.5) * 100; // p.b.
  const leanFaktor = maStranu ? 0.85 : 0.45; // stranický aparát

  const staty: StatVysledek[] = [];
  let evHrac = 0;
  let evSouper = 0;
  for (const st of STATY_EV) {
    const marze = narodniMarze + st.lean * leanFaktor + rng.normal(0, 5.5);
    const vyhrava = marze > 0;
    if (vyhrava) evHrac += st.ev;
    else evSouper += st.ev;
    staty.push({ stat: st.stat, ev: st.ev, marze: Math.round(marze * 10) / 10, hracVyhrava: vyhrava });
  }
  return {
    vyhral: evHrac > 270,
    shareNarodni: share,
    marzeNarodni: Math.round(narodniMarze * 10) / 10,
    evHrac,
    evSouper,
    staty,
  };
}

/** Odhad pravděpodobnosti vítězství (průzkum) — N Monte Carlo simulací. */
export function pravdepodobnostVitezstvi(
  hrac: KandidatProfil,
  souper: KandidatProfil,
  m: Macro,
  maStranu: boolean,
  rng: Rng,
  n = 200
): number {
  let vyhry = 0;
  for (let i = 0; i < n; i++) {
    if (simulatePrezidentske(hrac, souper, m, maStranu, rng).vyhral) vyhry++;
  }
  return vyhry / n;
}

export interface VysledekZavodu {
  vyhral: boolean;
  share: number; // podíl hráče
  typ: TypZavodu;
  detail: VysledekPrezidentske | null; // vyplněno u prezidentských
}

/** Všeobecné volby pro nižší úrovně: dvoucestný share + šum podle velikosti obvodu. */
export function simulateVseobecne(
  hrac: KandidatProfil,
  souper: KandidatProfil,
  m: Macro,
  typ: TypZavodu,
  rng: Rng
): VysledekZavodu {
  if (typ === "prezidentske") {
    const detail = simulatePrezidentske(hrac, souper, m, true, rng);
    return { vyhral: detail.vyhral, share: detail.shareNarodni, typ, detail };
  }
  const shareZaklad = dvoucestnyShare(hrac, souper, m);
