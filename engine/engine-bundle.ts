/*
 * engine-bundle.ts — sloučený engine (všechny moduly v jednom souboru).
 * Generováno mechanicky z engine/src/*.ts; úpravy provádějte v modulech.
 * Pořadí: rng, state, zakony, realne-zakony, law, economy, indicators, social, elections, actions, events, audit, game, ai, poradce.
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

/* ===== realne-zakony.ts ===== */
/**
 * realne-zakony.ts — katalog historických federálních zákonů USA a složení
 * Nejvyššího soudu (SCOTUS). Na rozdíl od zakony.ts (právní normy, které hra
 * vykonává) jde zde o vzdělávací referenční obsah pro Archiv: co Kongres
 * ve skutečnosti schválil, jak hlasoval a jak to dopadlo.
 *
 * Zdroj dat: prototyp „Statecraft“ (repozitář US-POL, vygenerovaný v AI Studio).
 * Všechna hlasování a fakta ověřena z více zdrojů (Wikipedia, congress.gov);
 * proti původním datům byly opraveny dvě chyby:
 *  - TCJA: Senát hlasoval 51–49 (původní data uváděla 51–48);
 *  - ACA: pojištění získalo zhruba 20 milionů dříve nepojištěných
 *    (původní data uváděla 45 milionů).
 */

export type KategorieRealnehoZakona =
  | "ekonomika_a_energie"
  | "technologie_a_vyroba"
  | "zdravotnictvi"
  | "dane"
  | "infrastruktura"
  | "obrana_a_prava";

export type IdeologickyNaklon = "progresivni" | "bipartitni" | "konzervativni";

export interface RealnyZakon {
  id: string;
  titul: string; // zavedený název
  oficTitul: string; // veřejný zákon (Public Law)
  rok: number;
  prezident: string;
  kategorie: KategorieRealnehoZakona;
  ustavniKlauzule: string;
  shrnuti: string;
  nakladyMldUSD: number; // hrubý objem nových výdajů / daňového efektu v mld. USD
  klicovaUstanoveni: string[];
  ideologickyNaklon: IdeologickyNaklon;
  senatHlasy: string; // formát "yeas–nays"
  snemovnaHlasy: string; // formát "yeas–nays"
  dopad: string;
  zdroje: string[];
}

export const REALNE_ZAKONY: RealnyZakon[] = [
  {
    id: "ira-2022",
    titul: "Inflation Reduction Act (IRA)",
    oficTitul: "P.L. 117-169 · Zákon o snížení inflace a energetické transformaci",
    rok: 2022,
    prezident: "Joe Biden",
    kategorie: "ekonomika_a_energie",
    ustavniKlauzule: "Čl. I, Oddíl 8 (Taxing and Spending Clause)",
    shrnuti:
      "Balíček investic 369 mld. USD do zelené energetiky a výroby baterií v USA, 15% minimální daň pro korporace s příjmem nad 1 mld. USD a historicky první oprávnění Medicare vyjednávat ceny léků.",
    nakladyMldUSD: 369,
    klicovaUstanoveni: [
      "Daňový kredit 7 500 USD na nákup elektromobilu smontovaného v Severní Americe",
      "Oprávnění Medicare vyjednávat ceny nejnákladnějších léků (první desítka od roku 2026)",
      "15% korporátní alternativní minimální daň (CAMT) pro firmy s příjmem nad 1 mld. USD",
      "1% odvod ze zpětného odkupu vlastních akcií (stock buybacks)",
    ],
    ideologickyNaklon: "progresivni",
    senatHlasy: "51–50",
    snemovnaHlasy: "220–207",
    dopad:
      "Přilákal stovky miliard soukromých investic do továren na baterie (OH, GA, NC); ropné státy žalují emisní pravidla EPA.",
    zdroje: [
      "https://www.congress.gov/bill/117th-congress/house-bill/5376",
      "https://en.wikipedia.org/wiki/Inflation_Reduction_Act",
    ],
  },
  {
    id: "chips-2022",
    titul: "CHIPS and Science Act",
    oficTitul: "P.L. 117-167 · Zákon o výrobě polovodičů a vědecké suverenitě USA",
    rok: 2022,
    prezident: "Joe Biden",
    kategorie: "technologie_a_vyroba",
    ustavniKlauzule: "Čl. I, Oddíl 8, Klauzule 3 (Commerce Clause & National Defense)",
    shrnuti:
      "52,7 mld. USD v přímých federálních dotacích a 25% daňových úlevách na vybudování továren na mikročipy na území USA; cílem je snížit závislost na Asii.",
    nakladyMldUSD: 52.7,
    klicovaUstanoveni: [
      "39 mld. USD dotací na výstavbu nových továren (Intel v Ohiu, TSMC v Arizoně, Micron v New Yorku)",
      "Zákaz příjemcům dotací expandovat pokročilé výrobní kapacity v Číně po dobu 10 let",
      "13 mld. USD na výzkumná pracoviště a vzdělávání inženýrů v mikroelektronice",
    ],
    ideologickyNaklon: "bipartitni",
    senatHlasy: "64–33",
    snemovnaHlasy: "243–187",
    dopad:
      "Zajistil návrat výroby kritických čipů pro stíhačky F-35 i AI servery zpět na americkou půdu.",
    zdroje: [
      "https://www.congress.gov/bill/117th-congress/house-bill/4346",
      "https://en.wikipedia.org/wiki/CHIPS_and_Science_Act",
    ],
  },
  {
    id: "iija-2021",
    titul: "Bipartisan Infrastructure Law (IIJA)",
    oficTitul: "P.L. 117-58 · Zákon o investicích do infrastruktury a pracovních míst",
    rok: 2021,
    prezident: "Joe Biden",
    kategorie: "infrastruktura",
    ustavniKlauzule: "Čl. I, Oddíl 8 (Postal Roads & Interstate Commerce Clause)",
    shrnuti:
      "Federální investice 1 200 mld. USD (z toho ~550 mld. USD nových výdajů) do dálnic, 40 000 mostů, železnice Amtrak, výměny olověného potrubí a širokopásmového internetu na venkově.",
    nakladyMldUSD: 1200,
    klicovaUstanoveni: [
      "110 mld. USD na obnovu havarijních mostů a dálnic Interstate",
      "66 mld. USD na modernizaci tratí Amtrak v severovýchodním koridoru",
      "65 mld. USD na optický internet pro venkovské okresy",
      "55 mld. USD na výměnu olověných vodovodních trubek v milionech domácností",
    ],
    ideologickyNaklon: "bipartitni",
    senatHlasy: "69–30",
    snemovnaHlasy: "228–206",
    dopad:
      "Zvýšil poptávku po oceli a cementu v Rust Beltu; stovky tisíc stavebních pracovních míst podle federálních prevládek.",
    zdroje: [
      "https://www.congress.gov/bill/117th-congress/house-bill/3684",
      "https://en.wikipedia.org/wiki/Infrastructure_Investment_and_Jobs_Act",
    ],
  },
  {
    id: "tcja-2017",
    titul: "Tax Cuts and Jobs Act (TCJA)",
    oficTitul: "P.L. 115-97 · Zákon o daňových škrtech a pracovních místech",
    rok: 2017,
    prezident: "Donald Trump",
    kategorie: "dane",
    ustavniKlauzule: "16. dodatek Ústavy USA (Income Tax Clause)",
    shrnuti:
      "Největší daňová reforma za 30 let: trvale snížila federální daň z příjmů korporací z 35 % na 21 %, téměř zdvojnásobila základní slevu na poplatníka a zavedla strop 10 000 USD na odpočet státních a místních daní (SALT).",
    nakladyMldUSD: 1900, // nárůst federálního dluhu včetně úroků (CBO)
    klicovaUstanoveni: [
      "Trvalé snížení korporátní daně z 35 % na 21 %",
      "Dočasné snížení všech sedmi daňových pásem fyzických osob (nejvyšší pásmo kleslo z 39,6 % na 37 %)",
      "Zastropování odpočtu státních a místních daní (SALT Cap) na 10 000 USD",
      "Zvýšení limitu pro dědickou daň na ~22,4 mil. USD pro manželské páry (2018, indexováno)",
    ],
    ideologickyNaklon: "konzervativni",
    senatHlasy: "51–49",
    snemovnaHlasy: "227–203",
    dopad:
      "Podnítil rekordní repatriaci zisků nadnárodních firem do USA; CBO vyčíslil nárůst federálního dluhu cca o 1,9 bil. USD včetně úroků.",
    zdroje: [
      "https://www.congress.gov/bill/115th-congress/house-bill/1",
      "https://en.wikipedia.org/wiki/Tax_Cuts_and_Jobs_Act",
    ],
  },
  {
    id: "aca-2010",
    titul: "Affordable Care Act (Obamacare / ACA)",
    oficTitul: "P.L. 111-148 · Zákon o ochraně pacientů a dostupné zdravotní péči",
    rok: 2010,
    prezident: "Barack Obama",
    kategorie: "zdravotnictvi",
    ustavniKlauzule: "Čl. I, Oddíl 8 (Taxing Power · potvrzeno v NFIB v. Sebelius)",
    shrnuti:
      "Rozšířil zdravotní pojištění zhruba 20 milionům dříve nepojištěných Američanů. Zakázal pojišťovnám odmítnout pacienty s předchozím onemocněním, umožnil mladým zůstat na pojistce rodičů do 26 let a federálně rozšířil Medicaid.",
    nakladyMldUSD: 940,
    klicovaUstanoveni: [
      "Zákaz odmítnutí pojistky pro pacienty s rakovinou, cukrovkou či jiným předchozím onemocněním",
      "Možnost mladých zůstat na rodinné pojistce do věku 26 let",
      "Dotace na pojištění na státních zdravotních burzách (HealthCare.gov)",
      "Federální financování 90 % nákladů expanze Medicaid ve zapojených státech",
    ],
    ideologickyNaklon: "progresivni",
    senatHlasy: "60–39",
    snemovnaHlasy: "219–212",
    dopad:
      "Přežil tři soudní bitvy u Nejvyššího soudu (NFIB v. Sebelius 2012, King v. Burwell 2015, California v. Texas 2021) a stal se trvalým pilířem amerického sociálního státu.",
    zdroje: [
      "https://www.congress.gov/bill/111th-congress/house-bill/3590",
      "https://en.wikipedia.org/wiki/Affordable_Care_Act",
    ],
  },
  {
    id: "bsca-2022",
    titul: "Bipartisan Safer Communities Act",
    oficTitul: "P.L. 117-159 · Zpřísnění prověrek nákupu zbraní a péče o duševní zdraví",
    rok: 2022,
    prezident: "Joe Biden",
    kategorie: "obrana_a_prava",
    ustavniKlauzule: "2. dodatek Ústavy USA (test regulace držení zbraní)",
    shrnuti:
      "První významná zbraňová legislativa za 28 let: přísnější prověrky mladistvých kupců (18–21 let), postihy překupnictví a ~750 mil. USD grantů na státní zákony o červené vlajce (Red Flag Laws). Nové výdaje kolem 13,2 mld. USD byly kompenzovány úsporami z nevyčerpaných prostředků.",
    nakladyMldUSD: 13.2,
    klicovaUstanoveni: [
      "Prověřování trestních a psychiatrických záznamů z dětství u žadatelů mladších 21 let",
      "Granty státům na dočasné odebrání zbraně nebezpečným osobám (Red Flag)",
      "Federální postihy za nákup zbraní pro překupníky (Straw Purchasing)",
      "Investice do školních psychologů a programů duševního zdraví",
    ],
    ideologickyNaklon: "bipartitni",
    senatHlasy: "65–33",
    snemovnaHlasy: "234–193",
    dopad:
      "Testován konzervativním precedentem Nejvyššího soudu v kauze Bruen (2022); desítky států zřídily krizové intervenční soudy.",
    zdroje: [
      "https://www.congress.gov/bill/117th-congress/senate-bill/2938",
      "https://en.wikipedia.org/wiki/Bipartisan_Safer_Communities_Act",
    ],
  },
];

export type IdeologieSoudce = "konzervativni" | "liberalni";

export interface SoudceScotus {
  jmeno: string;
  titul: string;
  ideologie: IdeologieSoudce;
  jmenovan: string; // jmenující prezident a rok
  filozofie: "textualismus_a_originalismus" | "ziva_ustava_a_pragmatismus";
  bio: string;
}

/** Složení Nejvyššího soudu USA (devět soudců: 6 konzervativních, 3 liberální). */
export const SCOTUS_SOUDCI: SoudceScotus[] = [
  {
    jmeno: "John G. Roberts Jr.",
    titul: "Předseda Nejvyššího soudu USA (Chief Justice)",
    ideologie: "konzervativni",
    jmenovan: "George W. Bush (2005)",
    filozofie: "textualismus_a_originalismus",
    bio: "Institucionální konzervativec. Dbá na legitimitu soudu, často hledá úzká procesní rozhodnutí.",
  },
  {
    jmeno: "Clarence Thomas",
    titul: "Nejdéle sloužící soudce Nejvyššího soudu",
    ideologie: "konzervativni",
    jmenovan: "George H. W. Bush (1991)",
    filozofie: "textualismus_a_originalismus",
    bio: "Ryzí originalista. Důsledně interpretuje Ústavu podle jejího původního významu z roku 1787.",
  },
  {
    jmeno: "Samuel A. Alito Jr.",
    titul: "Soudce Nejvyššího soudu USA",
    ideologie: "konzervativni",
    jmenovan: "George W. Bush (2006)",
    filozofie: "textualismus_a_originalismus",
    bio: "Konzervativní právní jestřáb. Autor přelomového rozsudku Dobbs v. Jackson Women's Health.",
  },
  {
    jmeno: "Sonia Sotomayor",
    titul: "Soudkyně Nejvyššího soudu USA",
    ideologie: "liberalni",
    jmenovan: "Barack Obama (2009)",
    filozofie: "ziva_ustava_a_pragmatismus",
    bio: "Vůdčí hlas liberálního křídla. Důraz na občanská práva, menšiny a sociální realitu zákona.",
  },
  {
    jmeno: "Elena Kagan",
    titul: "Soudkyně Nejvyššího soudu USA",
    ideologie: "liberalni",
    jmenovan: "Barack Obama (2010)",
    filozofie: "ziva_ustava_a_pragmatismus",
    bio: "Bývalá děkanka Harvard Law School. Mistryně břitkých disentů a pragmatického výkladu.",
  },
  {
    jmeno: "Neil M. Gorsuch",
    titul: "Soudce Nejvyššího soudu USA",
    ideologie: "konzervativni",
    jmenovan: "Donald Trump (2017)",
    filozofie: "textualismus_a_originalismus",
    bio: "Přísný textualista. Silný obhájce práv původních obyvatel a omezování federální byrokracie.",
  },
  {
    jmeno: "Brett M. Kavanaugh",
    titul: "Soudce Nejvyššího soudu USA",
    ideologie: "konzervativni",
    jmenovan: "Donald Trump (2018)",
    filozofie: "textualismus_a_originalismus",
    bio: "Středopravicový soudce, který často tvoří rozhodující většinu s předsedou Robertsem.",
  },
  {
    jmeno: "Amy Coney Barrett",
    titul: "Soudkyně Nejvyššího soudu USA",
    ideologie: "konzervativni",
    jmenovan: "Donald Trump (2020)",
    filozofie: "textualismus_a_originalismus",
    bio: "Bývalá profesorka ústavního práva na Notre Dame Law School, žákyně Antonina Scalii.",
  },
  {
    jmeno: "Ketanji Brown Jackson",
    titul: "Soudkyně Nejvyššího soudu USA",
    ideologie: "liberalni",
    jmenovan: "Joe Biden (2022)",
    filozofie: "ziva_ustava_a_pragmatismus",
    bio: "Bývalá federální veřejná obhájkyně. Specializuje se na trestní právo a rovnost před zákonem.",
  },
];

/** Vyhledání historického zákona dle id. */
export function najdiRealnyZakon(id: string): RealnyZakon | undefined {
  return REALNE_ZAKONY.find((z) => z.id === id);
}

/** Bezrozdílová normalizace textu (zohledňuje háčky a čárky). */
function normalizuj(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Slova délky alespoň 3 znaky z normalizovaného textu. */
function kmeny(text: string): string[] {
  return normalizuj(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

/**
 * Fulltextové vyhledávání v katalogu historických zákonů. Toleruje české
 * skloňování a diakritiku: dotaz „daně“ najde i „daňových“ (kmen „dan“).
 */
export function hledejRealneZakony(dotaz: string): RealnyZakon[] {
  const q = dotaz.trim();
  if (q.length === 0) return REALNE_ZAKONY;
  const qk = kmeny(q);
  if (qk.length === 0) return REALNE_ZAKONY;
  return REALNE_ZAKONY.filter((z) => {
    const text = kmeny([z.titul, z.shrnuti, z.dopad, z.id, String(z.rok)].join(" "));
    return qk.every((q) => {
      const kmen = q.slice(0, Math.max(3, q.length - 1));
      return text.some((t) => t.startsWith(kmen));
    });
  });
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
  const sirka: Record<string, number> = { obecni: 0.06, kongresove: 0.045, gubernatorske: 0.035 };
  const share = Math.max(0.01, Math.min(0.99, shareZaklad + rng.normal(0, sirka[typ] ?? 0.05)));
  return { vyhral: share > 0.5, share, typ, detail: null };
}

export interface VysledekPrimariek {
  postoupil: boolean; // prah 15 % + souboj o delegáty
  share: number;
  delegatiHrac: number;
  delegatiSouper: number;
}

/**
 * Primárky: proporcionální alokace delegátů s prahem 15 % a bonusem pro
 * vítěze (+10 % delegátů) — zjednodušení pravidel DNC/RNC.
 */
export function simulatePrimarky(
  hrac: KandidatProfil,
  souper: KandidatProfil, // uvnitř strany
  rng: Rng,
  celkemDelegatu = 4000
): VysledekPrimariek {
  const shareZaklad = 0.5 + 0.010 * (hrac.znamost - souper.znamost) + 0.005 * (hrac.integrita - souper.integrita) - 0.004 * (hrac.prodejnost - souper.prodejnost) * 5;
  const share = Math.max(0.02, Math.min(0.98, shareZaklad + rng.normal(0, 0.06)));

  const prah = 0.15;
  if (share < prah) {
    return { postoupil: false, share, delegatiHrac: 0, delegatiSouper: celkemDelegatu };
  }
  if (share > 1 - prah) {
    return { postoupil: true, share, delegatiHrac: celkemDelegatu, delegatiSouper: 0 };
  }
  // Bonus vítěze: 10 % delegátů navíc pro kandidáta s vyšším podílem.
  let dHrac = Math.round(celkemDelegatu * share * 0.9);
  let dSouper = Math.round(celkemDelegatu * (1 - share) * 0.9);
  const bonus = Math.round(celkemDelegatu * 0.1);
  if (share > 0.5) dHrac += bonus;
  else dSouper += bonus;
  const celkem = dHrac + dSouper;
  dHrac += celkemDelegatu - celkem; // dorovnání součtu
  return { postoupil: dHrac > dSouper, share, delegatiHrac: dHrac, delegatiSouper: dSouper };
}

/* ===== actions.ts ===== */
/**
 * actions.ts — katalog herních akcí. Každá akce má cenu v akčních bodech (AP),
 * povolené úrovně úřadu, validaci (včetně právních varování) a aplikaci efektů.
 * Volající orchestrace (game.ts) účtuje AP a zajišťuje deterministický Rng.
 */

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

/* ===== events.ts ===== */
/**
 * events.ts — tematické šablony událostí (klima, migrace, geopolitika, dluh,
 * technologie, energetika) s vahou výskytu dle stavu světa a validátor
 * návrhů od AI (Mistral), které smí měnit pouze povolené klíče efektů.
 */

export interface SablonaUdalosti {
  id: string;
  tema: GameEvent["tema"];
  nazev: string;
  popis: string;
  /** Relativní váha v katalogu; může se dynamicky měnit dle stavu (funkce vaha). */
  vaha: (s: GameState) => number;
  /** Aplikace efektů na stav; vrací zprávu pro log. */
  apply: (s: GameState, rng: Rng) => string;
}


export const SABLONY: SablonaUdalosti[] = [
  {
    id: "hurikan",
    tema: "klima",
    nazev: "Hurikán postihl pobřeží",
    popis: "Katastrofická bouře zasáhla jižní státy; nutná federální pomoc.",
    vaha: () => 6,
    apply: (s, rng) => {
      const skoda = rng.int(2, 9);
      s.macro.hdpRust = r1(s.macro.hdpRust - skoda / 20);
      s.macro.deficitPctHDP = r1(s.macro.deficitPctHDP + skoda / 8);
      s.local.spokojenost = Math.max(0, r1(s.local.spokojenost - skoda / 2));
      return `Hurikán: škody za ${skoda} mld. $; HDP −${r1(skoda / 20)} p.b., spokojenost −${r1(skoda / 2)}.`;
    },
  },
  {
    id: "pozar",
    tema: "klima",
    nazev: "Lesní požáry na západě",
    popis: "Rozsáhlé požáry; environmentální tlak roste.",
    vaha: (s) => (s.postava.ideologie < -3 ? 8 : 5),
    apply: (s) => {
      s.local.spokojenost = Math.max(0, r1(s.local.spokojenost - 1.5));
      return "Požáry zhoršily ovzduší; voliči volají po klimatické agendě (spokojenost −1,5).";
    },
  },
  {
    id: "migracni_vlna",
    tema: "migrace",
    nazev: "Nápor na jižní hranici",
    popis: "Rekordní počet průchodů; tlak na řešení.",
    vaha: () => 7,
    apply: (s, rng) => {
      const sila = rng.range(0.5, 1.5);
      if (s.funkce.uroven === "prezident" || s.funkce.uroven === "guverner") {
        s.postava.atributy.prodejnost = Math.min(10, r1(s.postava.atributy.prodejnost + 0.2 * sila));
        s.local.spokojenost = Math.max(0, r1(s.local.spokojenost - 2 * sila));
      } else {
        s.postava.atributy.znamostStat = Math.min(100, r1(s.postava.atributy.znamostStat + 0.3));
      }
      return "Migrační vlna dominuje zprávám; bezpečná rozhodnutí budou politicky měřena.";
    },
  },
  {
    id: "geopoliticka_krize",
    tema: "geopolitika",
    nazev: "Napětí v zámoří",
    popis: "Konflikt velmocí eskaluje; trhy nervózní.",
    vaha: () => 6,
    apply: (s, rng) => {
      const sila = rng.range(0.4, 1.4);
      s.macro.hdpRust = r1(s.macro.hdpRust - 0.2 * sila);
      s.macro.inflace = r1(s.macro.inflace + 0.2 * sila);
      if (s.funkce.uroven === "prezident") {
        s.postava.atributy.znamostNarod = Math.min(100, r1(s.postava.atributy.znamostNarod + 1));
      }
      return "Geopolitická krize: inflace +šok, HDP tlak. Zahraniční zkouška pro vládu.";
    },
  },
  {
    id: "dluzni_krize",
    tema: "dluh",
    nazev: "Vyjednávání o stropu dluhu",
    popis: "Kongres balancuje na kraji defaultu.",
    vaha: (s) => (s.macro.dluhPctHDP > 105 ? 9 : 4),
    apply: (s, rng) => {
      if (rng.chance(0.65)) {
        return "Dohoda o stropu dluhu padla v poslední chvíli; trhy se uklidnily.";
      }
      s.macro.deficitPctHDP = r1(s.macro.deficitPctHDP + 0.4);
      s.local.spokojenost = Math.max(0, r1(s.local.spokojenost - 2));
      return "Zablokování stropu dluhu: vládní šetření, spokojenost −2, deficit +0,4.";
    },
  },
  {
    id: "ai_revoluce",
    tema: "technologie",
    nazev: "Vlna investic do AI",
    popis: "Technologický sektor roste; otázky regulace.",
    vaha: () => 5,
    apply: (s, rng) => {
      const sila = rng.range(0.3, 1.2);
      s.macro.hdpRust = r1(s.macro.hdpRust + 0.2 * sila);
      s.macro.nezamestnanost = r1(s.macro.nezamestnanost + 0.05 * sila);
      return "AI boom přidává na HDP, ale vyvolává obavy ztráty pracovních míst.";
    },
  },
  {
    id: "energeticky_sok",
    tema: "energetika",
    nazev: "Šok cen ropy",
    popis: "Výpadky těžby vytlačují ceny vzhůru.",
    vaha: () => 5,
    apply: (s, rng) => {
      const sila = rng.range(0.5, 1.5);
      s.macro.inflace = r1(s.macro.inflace + 0.5 * sila);
      s.local.spokojenost = Math.max(0, r1(s.local.spokojenost - 1.5 * sila));
      return "Ceny paliv vystřelily: inflace +šok, spokojenost klesá.";
    },
  },
  {
    id: "kampan_skandaly",
    tema: "pravni",
    nazev: "Média vyšetřují dary",
    popis: "Investigativní reportéři prochází Vaše hlášení.",
    vaha: (s) => 2 + s.pravni.fecAuditRiziko / 20,
    apply: (s, rng) => {
      if (rng.next() < s.pravni.fecAuditRiziko / 150) {
        s.postava.atributy.integrita = Math.max(0, s.postava.atributy.integrita - 3);
        return "Série článků o Vašem financování: integrita −3.";
      }
      return "Reportéři nenašli nic — Vaše papírová stopa je čistá.";
    },
  },
];

/** Týdenní event tick — s pravděpodobností dle tempa vypukne tematická událost. */
export function eventTick(s: GameState, rng: Rng): GameEvent[] {
  const vypukne = rng.next() < 0.25; // cca jedna událost za čtyři kola
  if (!vypukne) return [];
  const vahy = SABLONY.map((t) => Math.max(0, t.vaha(s)));
  const celkem = vahy.reduce((a, b) => a + b, 0);
  let roll = rng.next() * celkem;
  let vybrana = SABLONY[0];
  for (let i = 0; i < SABLONY.length; i++) {
    roll -= vahy[i];
    if (roll <= 0) {
      vybrana = SABLONY[i];
      break;
    }
  }
  const zprava = vybrana.apply(s, rng);
  const udalost: GameEvent = {
    id: `${vybrana.id}-${s.kolo}`,
    tema: vybrana.tema,
    nazev: vybrana.nazev,
    popis: zprava,
    kolo: s.kolo,
    dopady: {},
  };
  s.udalosti.push(udalost);
  s.denik.push({ kolo: s.kolo, typ: "udalost", data: { id: udalost.id, nazev: vybrana.nazev, popis: zprava } });
  return [udalost];
}

/**
 * Validátor návrhů AI (Mistral). AI smí navrhnout událost, ale engine
 * akceptuje pouze schema-validní návrhy: povolené klíče efektů a rozsah magnitud.
 */
export const POVOLENE_KLICE_EFEKTU = [
  "pokladna",
  "socialniKapital",
  "etika",
  "prodejnost",
  "znamostLokal",
  "znamostStat",
  "znamostNarod",
  "spokojenost",
  "kriminalita",
  "inflaceDelta",
  "hdpDelta",
] as const;

export interface NavrhAiUdalosti {
  tema?: string;
  nazev?: string;
  popis?: string;
  dopady?: Record<string, number>;
}

export interface ValidaceNavrhu {
  platny: boolean;
  chyby: string[];
  ocisteneDopady: Record<string, number>;
}

export function validateAiEventProposal(n: NavrhAiUdalosti): ValidaceNavrhu {
  const chyby: string[] = [];
  const ocisteneDopady: Record<string, number> = {};
  if (!n.nazev || n.nazev.trim().length < 3) chyby.push("Chybí nebo příliš krátký název.");
  if (!n.popis || n.popis.trim().length < 10) chyby.push("Chybí nebo příliš krátký popis.");
  const povoleneTemata = ["klima", "migrace", "geopolitika", "dluh", "technologie", "energetika", "pravni", "volby", "ekonomika"];
  if (n.tema && !povoleneTemata.includes(n.tema)) chyby.push(`Neznámé téma: ${n.tema}.`);
  if (n.dopady) {
    for (const [k, v] of Object.entries(n.dopady)) {
      if (!(POVOLENE_KLICE_EFEKTU as readonly string[]).includes(k)) {
        chyby.push(`Nepovolený klíč efektu: ${k}.`);
        continue;
      }
      if (typeof v !== "number" || Number.isNaN(v)) {
        chyby.push(`Hodnota klíče ${k} není číslo.`);
        continue;
      }
      if (Math.abs(v) > 1) {
        chyby.push(`Magnituda klíče ${k} mimo rozsah (−1..1).`);
        continue;
      }
      ocisteneDopady[k] = v;
    }
  }
  return { platny: chyby.length === 0, chyby, ocisteneDopady };
}

/** Aplikace očištěného AI návrhu na stav (po validaci). */
export function applyAiEvent(s: GameState, v: ValidaceNavrhu, nazev: string, popis: string, tema: string): GameEvent | null {
  if (!v.platny) return null;
  const a = s.postava.atributy;
  const d = v.ocisteneDopady;
  if ("pokladna" in d) s.finance.pokladnaKampane = Math.max(0, s.finance.pokladnaKampane + d.pokladna * 100_000);
  if ("socialniKapital" in d) a.socialniKapital = Math.max(0, Math.min(100, r1(a.socialniKapital + d.socialniKapital * 10)));
  if ("etika" in d) a.etika = Math.max(0, Math.min(10, r1(a.etika + d.etika * 2)));
  if ("prodejnost" in d) a.prodejnost = Math.max(0, Math.min(10, r1(a.prodejnost + d.prodejnost * 2)));
  if ("znamostLokal" in d) a.znamostLokal = Math.max(0, Math.min(100, r1(a.znamostLokal + d.znamostLokal * 15)));
  if ("znamostStat" in d) a.znamostStat = Math.max(0, Math.min(100, r1(a.znamostStat + d.znamostStat * 15)));
  if ("znamostNarod" in d) a.znamostNarod = Math.max(0, Math.min(100, r1(a.znamostNarod + d.znamostNarod * 15)));
  if ("spokojenost" in d) s.local.spokojenost = Math.max(0, Math.min(100, r1(s.local.spokojenost + d.spokojenost * 20)));
  if ("kriminalita" in d) s.local.kriminalita = Math.max(10, Math.min(120, r1(s.local.kriminalita + d.kriminalita * 10)));
  if ("inflaceDelta" in d) s.macro.inflace = r1(s.macro.inflace + d.inflaceDelta * 2);
  if ("hdpDelta" in d) s.macro.hdpRust = r1(s.macro.hdpRust + d.hdpDelta * 2);
  const udalost: GameEvent = {
    id: `ai-${s.kolo}-${s.udalosti.length + 1}`,
    tema: (tema as GameEvent["tema"]) ?? "ekonomika",
    nazev,
    popis,
    kolo: s.kolo,
    dopady: d,
  };
  s.udalosti.push(udalost);
  s.denik.push({ kolo: s.kolo, typ: "udalost", data: { id: udalost.id, nazev, popis, zdroj: "ai" } });
  return udalost;
}

/* ===== audit.ts ===== */
/**
 * audit.ts — logovací a replay helper: dvě hry se stejným seedem a stejnou
 * posloupností akcí musí produkovat identický stav (JSON.stringify).
 */

/** Zkrácený serializovatelný otisk stavu pro replay testy. */
export function otiskStavu(s: unknown): string {
  return JSON.stringify(s);
}

/** Vytěží ze stavu zprávy deníku pro dané kolo. */
export function zpravyKola(s: { denik: { kolo: number; typ: string; data: Record<string, unknown> }[] }, kolo: number): string[] {
  return s.denik.filter((e) => e.kolo === kolo).map((e) => JSON.stringify(e.data));
}

/** Skriptované replaye: posloupnost instrukcí pro deterministické přehrání. */
export interface ReplayInstrukce {
  typ: "akce" | "endTurn";
  akceId?: string;
  parametry?: Record<string, unknown>;
}

/**
 * Porovná dva stavy po replayi: vrací true, pokud jsou bitově totožné
 * v serializované podobě (klíčový invariant determinismu).
 */
export function stavyStejne(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ===== game.ts ===== */
/**
 * game.ts — orchestrace: hráčské akce, týdenní endTurn (AP, ekonomika, právo,
 * události, kalendář voleb), kariérní brance a stínová kariéra po odsouzení.
 *
 * Determinismus: veškerá náhodnost prochází Rng odvozeným ze seedu, čísla kola
 * a zbývajících AP — dvě hry se stejným seedem a skriptem jsou identické.
 */

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

/* ===== ai.ts ===== */
/**
 * ai.ts — vrstva pro AI chat (Mistral API). Engine zůstává jediným vykonavatelem:
 * AI pouze navrhuje plán ve striktním JSON schématu, tento modul plán vyčistí,
 * zvaliduje vůči katalogu akcí a rozpočtu AP a teprve pak jej provede přes
 * applyPlayerAction / applyAiEvent. Veškerá rozhodnutí tedy zůstávají
 * deterministická a replaovatelná; AI nesahá na stav přímo.
 */


/* ============================================================
 * Schéma parametrů akcí — jediná whitelist tabulka pro AI i UI.
 * ============================================================ */

type TypParametru = "cislo" | "text" | "vyber";

interface SpecParametru {
  klic: keyof ParametryAkce & string;
  typ: TypParametru;
  volby?: readonly string[];
  min?: number;
  max?: number;
  /** Popis do systémového promptu pro AI. */
  napoveda: string;
}

const DOVEDNOSTI = ["diplomacie", "retorika", "finance", "vyjednavani", "medialnost"] as const;
const TYPY_DARCE = ["individual", "pac", "superpac", "foreign", "corporate", "self"] as const;
const TEMATA_ZAKONA = ["ekonomika", "socialni", "beznacnost", "zdravotnictvi", "infrastruktura"] as const;
const TYPY_ZAVODU = ["obecni", "kongresove", "gubernatorske", "prezidentske"] as const;
const CILE_KANDIDATURY = ["radni", "starosta", "kongresman", "guverner", "prezident"] as const;

export const SPEC_PARAMETRU: Record<string, SpecParametru[]> = {
  prace_na_podniku: [],
  networking: [],
  projev: [],
  filantropie: [],
  skoleni: [{ klic: "dovednost", typ: "vyber", volby: DOVEDNOSTI, napoveda: "dovednost k tréninku" }],
  zalozit_vybor: [],
  fundraiser: [],
  dar: [
    { klic: "castkaUSD", typ: "cislo", min: 1, max: 100_000_000, napoveda: "částka daru v USD" },
    { klic: "typDarce", typ: "vyber", volby: TYPY_DARCE, napoveda: "typ dárce" },
    { klic: "volba", typ: "vyber", volby: ["primarky", "hlavni"], napoveda: "pro které volby" },
    { klic: "npcId", typ: "text", napoveda: "id osoby dárce ze seznamu NPC (nepovinné)" },
    { klic: "slibUrednihoAktu", typ: "text", napoveda: "explicitní slib úředního aktu = quid pro quo (nepovinné, ilegální)" },
    { klic: "pocetSvedku", typ: "cislo", min: 0, max: 10, napoveda: "počet svědků podmínek daru" },
    { klic: "koordinace", typ: "cislo", min: 0, max: 1, napoveda: "1 = koordinace se Super PAC (ilegální), 0 = bez" },
  ],
  reklama: [{ klic: "castkaUSD", typ: "cislo", min: 1, max: 100_000_000, napoveda: "částka na reklamu v USD" }],
  otisky_dveri: [],
  debata: [],
  stab: [],
  tiskovka: [],
  superpac_koordinace: [],
  uplacek: [
    { klic: "castkaUSD", typ: "cislo", min: 1, max: 10_000_000, napoveda: "částka úplatku v USD" },
    { klic: "pocetSvedku", typ: "cislo", min: 0, max: 10, napoveda: "počet svědků" },
  ],
  zakon: [{ klic: "tema", typ: "vyber", volby: TEMATA_ZAKONA, napoveda: "téma zákona" }],
  federalni_rozpocet: [{ klic: "vyrovnanost", typ: "cislo", min: -2, max: 2, napoveda: "−2 konsolidace .. +2 expanze" }],
  exekutivni_prikaz: [{ klic: "tema", typ: "vyber", volby: ["ekonomika", "socialni"], napoveda: "téma příkazu" }],
  rozpocet_mesta: [{ klic: "vyrovnanost", typ: "cislo", min: -2, max: 2, napoveda: "−2 šetření .. +2 investice" }],
  zonace: [],
  konverzace: [
    { klic: "npcId", typ: "text", napoveda: "id osoby ze seznamu NPC" },
    { klic: "slibText", typ: "text", napoveda: "volitelný závazný slib (zavazuje na 52 kol)" },
  ],
  pruzkum: [{ klic: "tema", typ: "vyber", volby: TYPY_ZAVODU, napoveda: "typ závodu průzkumu" }],
  compliance_audit: [],
  vyhlasit_kandidaturu: [{ klic: "tema", typ: "vyber", volby: CILE_KANDIDATURY, napoveda: "cílová funkce kandidatury" }],
  splnit_slib: [{ klic: "slibId", typ: "text", napoveda: "id slibu ve stavu v_progressu" }],
};

/* ============================================================
 * Kompaktní shrnutí stavu pro kontext AI
 * ============================================================ */

export function stavProAi(s: GameState): string {
  const a = s.postava.atributy;
  const brance = vyhodnotBranci(s);
  return JSON.stringify({
    jmeno: s.postava.jmeno,
    funkce: s.funkce.uroven,
    kolo: s.kolo,
    rok: s.rok,
    tyden: s.tyden,
    ap: s.ap,
    ideologie: s.postava.ideologie,
    majetekUSD: Math.round(a.majetekUSD),
    pokladnaKampane: Math.round(s.finance.pokladnaKampane),
    vyborZalozen: s.finance.vyborZalozen,
    znamost: { lokal: Math.round(a.znamostLokal), stat: Math.round(a.znamostStat), narod: Math.round(a.znamostNarod) },
    socialniKapital: Math.round(a.socialniKapital),
    integrita: Math.round(a.integrita),
    etika: a.etika,
    prodejnost: a.prodejnost,
    dovednosti: s.postava.dovednosti,
    rizika: { kriminalni: Math.round(s.pravni.kriminalniRiziko), fecAudit: Math.round(s.pravni.fecAuditRiziko) },
    vysetrovani: s.pravni.vysetrovani.map((v) => ({ tema: v.tema, intenzita: Math.round(v.intenzita * 100) })),
    macro: s.macro,
    local: { mesto: s.local.mesto, spokojenost: Math.round(s.local.spokojenost), kriminalita: s.local.kriminalita, deficitPct: s.local.deficitPct },
    npc: s.npc.map((n) => ({ id: n.id, jmeno: n.jmeno, role: n.role, prestiz: n.prestiz, vztah: n.vztah })),
    sliby: s.sliby.map((x) => ({ id: x.id, text: x.text, stav: x.stav, lhutaKolo: x.lhutaKolo })),
    brance: brance.splneno ? "splněna" : brance.chybejici,
    beziKampan: s.beziKampan.typZavodu,
    nedavneUdalosti: [...s.denik].slice(-6).map((e) => String((e.data as { zprava?: string }).zprava ?? JSON.stringify(e.data)).slice(0, 140)),
  });
}

/* ============================================================
 * Systémový prompt
 * ============================================================ */

export function systemovyPrompt(s: GameState): string {
  const akce = dostupneAkce(s.funkce.uroven);
  const katalog = akce
    .map((a) => {
      const params = (SPEC_PARAMETRU[a.id] ?? [])
        .map((p) => {
          const volby = p.volby ? `, možné hodnoty: ${p.volby.join("|")}` : "";
          const rozsah = p.typ === "cislo" ? ` (číslo${p.min !== undefined ? ` ${p.min}..${p.max}` : ""})` : " (text)";
          return `${p.klic}${rozsah}${volby} — ${p.napoveda}`;
        })
        .join("; ");
      return `- ${a.id} (cena ${a.ap} AP): ${a.popis}${params ? ` Parametry: ${params}.` : " Bez parametrů."}`;
    })
    .join("\n");

  return [
    "Jste Herní mistr politického dobrodružství „Dračí doupě USA“: vypravěč ve stylu klasického Dračího doupěte, který vede hráče od neznámého outsidera až do Bílého domu.",
    "Hráč je dobrodruh, vy jste Herní mistr. Hráč vám píše volným textem — svůj záměr na tento týden (kolo), otázky na svět, rozmluvu s lidmi, nebo prostě povídání u stolu.",
    "Máte dva režimy odpovědi:",
    "A) ZÁMĚR (hráč chce něco provést ve hře): přeložíte jeho záměr do konkrétních herních akcí z katalogu níže.",
    "B) ROZHOVOR (hráč se ptá, plánuje, přemítá, dotazuje se na lidi či svět): odpovíte jen vyprávěním v poli „reci“ a pole „akce“ nechte prázdné [].",
    "V obou režimech odpovíte VÝHRADNĚ jedním JSON objektem, bez markdown ohraničení a bez jakéhokoli textu mimo JSON. Schéma:",
    "{\"reci\": \"odpověď hráči v češtině — v režimu ZÁMĚR krátké shrnutí (max 3 věty), v režimu ROZHOVOR vyprávění herního mistra (max 6 vět, přítomný čas, barvité, ale věcné)\", \"akce\": [{\"akce\": \"id_akce\", \"parametry\": {}, \"duvod\": \"proč tato akce\"}], \"udalost\": {\"tema\": \"...\", \"nazev\": \"...\", \"popis\": \"...\", \"dopady\": {...}}}",
    "Tón vyprávění: jako herní mistr u stolu — vtáhne hráče do děje, oslovuje formálně „vy“, nezamlčuje tvrdé realistiky americké politiky, nedrží kázání.",
    "Pravidla:",
    "1. Pole akce: 0 až 6 akcí. Používejte POUZE akce z katalogu níže a POUZE jejich whitelisted parametry; jiné klíče budou tištěny odstraněny.",
    `2. Celková cena akcí nesmí překročit rozpočet AP (${s.ap} AP). Pokud hráč chce víc, proveďte nejdůležitější a zbytek zmínte v „reci".`,
    "3. Pole udalost je VOLITELNÉ: maximálně jedna vyprávěcí událost na kolo (reakce světa na hráčovo jednání). Téma jedno z: klima|migrace|geopolitika|dluh|technologie|energetika|pravni|volby|ekonomika. Dopady jsou volitelné klíče z: pokladna, socialniKapital, etika, prodejnost, znamostLokal, znamostStat, znamostNarod, spokojenost, kriminalita, inflaceDelta, hdpDelta; každý v rozsahu −1..1 (desetinné číslo, např. 0.3). Nikdy nedávejte dopady větší než 0.5 v absolutní hodnotě.",
    "4. Buďte proaktivní: pokud hráčův záměr vyžaduje krok navíc (např. před velkým darem založit volební výbor), navrhněte ho.",
    "5. Nikdy nevymýšlejte akce mimo katalog. Nikdy nepřidávejte parametry mimo whitelist.",
    "6. Na otázky o pravidlech enginu odpovídejte stručně a pravdivě; nedoporučujte herní akce, které v katalogu neexistují.",
    "",
    "Katalog akcí pro aktuální úroveň:",
    katalog,
    "",
    "Aktuální stav hry (JSON):",
  ].join("\n");
}

/* ============================================================
 * Parsování a čištění plánu
 * ============================================================ */

export interface PlanAkce {
  akce: string;
  parametry: ParametryAkce;
  duvod: string | null;
}

export interface PlanUdalosti {
  tema: string;
  nazev: string;
  popis: string;
  dopady: Record<string, number>;
}

export interface Plan {
  reci: string;
  akce: PlanAkce[];
  udalost: PlanUdalosti | null;
}

export interface ParseResult {
  ok: boolean;
  plan: Plan | null;
  chyby: string[];
  /** Akce vyřazené během čištění (pro diagnostiku). */
  vyrazeno: string[];
}

export const MAX_AKCI_V_PLANU = 6;

/**
 * Opraví JSON useknutý limitem tokenů: postupně ořezává konec, dovírá
 * nedokončené řetězce a závorky. Vrací rozparsovaný objekt, nebo null.
 */
export function opravUseknutyJson(src: string): unknown | null {
  /** Dovře nedokončené řetězce a závorky (jednoduchý průchod bez rekurze). */
  const zavriStruktury = (vstup: string): string => {
    let out = "";
    let inStr = false;
    let esc = false;
    const stack: string[] = [];
    for (const ch of vstup) {
      if (esc) {
        esc = false;
        out += ch;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        out += ch;
        continue;
      }
      if (ch === "\u0022") {
        inStr = !inStr;
        out += ch;
        continue;
      }
      if (!inStr) {
        if (ch === "{") stack.push("}");
        else if (ch === "[") stack.push("]");
        else if ((ch === "}" || ch === "]") && stack.length) stack.pop();
      }
      out += ch;
    }
    if (esc) out = out.slice(0, -1);
    if (inStr) out += "\"";
    while (stack.length) out += stack.pop();
    return out;
  };

  let s = src.trim();
  for (let pokus = 0; pokus < 200 && s.length > 1; pokus++) {
    try {
      return JSON.parse(s);
    } catch {
      /* opravíme a zkusíme znovu */
    }
    const zavrena = zavriStruktury(s);
    try {
      return JSON.parse(zavrena);
    } catch {
      /* odřízneme poslední neúplný prvek */
    }
    const carka = zavrena.lastIndexOf(",");
    s = carka > 0 ? zavrena.slice(0, carka) : zavrena.slice(0, -1);
  }
  return null;
}

/** Odstraní markdown ohraničení a vrátí první JSON objekt v textu. */
export function extrahujJson(text: string): string | null {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const zac = t.indexOf("{");
  const kon = t.lastIndexOf("}");
  if (zac === -1 || kon === -1 || kon <= zac) return null;
  return t.slice(zac, kon + 1);
}

/** Vyčistí parametry jedné akce dle whitelistu; vrací null, pokud akce není k dispozici. */
function ocistiParametry(akceId: string, surove: unknown, chyby: string[], vyrazeno: string[]): ParametryAkce | null {
  const def = dostupneAkceSafe(akceId);
  if (!def) {
    vyrazeno.push(akceId);
    return null;
  }
  const spec = SPEC_PARAMETRU[akceId] ?? [];
  const out: ParametryAkce = {};
  if (typeof surove !== "object" || surove === null) return out;

  for (const pol of spec) {
    const v = (surove as Record<string, unknown>)[pol.klic];
    if (v === undefined || v === null) continue;
    if (pol.typ === "cislo") {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, "").replace(/\$/g, ""));
      if (!Number.isFinite(n)) {
        chyby.push(`Parametr ${pol.klic} akce ${akceId} není číslo; parametr ignorován.`);
        continue;
      }
      const min = pol.min ?? -Number.MAX_SAFE_INTEGER;
      const max = pol.max ?? Number.MAX_SAFE_INTEGER;
      (out as Record<string, unknown>)[pol.klic] = Math.max(min, Math.min(max, n));
    } else if (pol.typ === "vyber") {
      const str = String(v).trim().toLowerCase();
      if (!pol.volby?.includes(str)) {
        chyby.push(`Parametr ${pol.klic} akce ${akceId} má nepovolenou hodnotu „${str}"; akce může být odmítnuta enginem.`);
        continue;
      }
      (out as Record<string, unknown>)[pol.klic] = str;
    } else {
      const str = String(v).trim().slice(0, 300);
      (out as Record<string, unknown>)[pol.klic] = str;
    }
  }
  return out;
}

/* Dostupné akce pro aktuální úroveň — vyhledání bez závislosti na stavu. */
let _urovenCache: string | null = null;
let _dostupneIds: Set<string> = new Set();

function dostupneAkceSafe(akceId: string): boolean {
  return _dostupneIds.has(akceId);
}

/** Nastaví kontext dostupných akcí dle úrovně (volá parsujPlan interně). */
function nastavKontextUrovne(uroven: string): void {
  if (_urovenCache !== uroven) {
    _urovenCache = uroven;
    _dostupneIds = new Set(dostupneAkce(uroven as Parameters<typeof dostupneAkce>[0]).map((a) => a.id));
  }
}

/**
 * Parsuje odpověď AI do očištěného plánu. Whitelist: pouze dostupné akce,
 * pouze povolené parametry, clamp čísel, limit počtu akcí a rozpočtu AP.
 */
export function parsujPlan(text: string, s: GameState): ParseResult {
  const chyby: string[] = [];
  const vyrazeno: string[] = [];
  nastavKontextUrovne(s.funkce.uroven);

  const json = extrahujJson(text);
  if (!json) {
    /* Herní mistr občas odpoví v rozhovoru čistým vyprávěním bez JSON obálky.
     * Takovou odpověď přijmeme jako konverzační plán (jen reci, žádné akce);
     * prázdná odpověď zůstává chybou. */
    const volnyText = text.trim().slice(0, 1000);
    if (volnyText) {
      return { ok: true, plan: { reci: volnyText, akce: [], udalost: null }, chyby: [], vyrazeno: [] };
    }
    return { ok: false, plan: null, chyby: ["Odpověď AI neobsahuje JSON objekt."], vyrazeno: [] };
  }

  let surovina: unknown;
  try {
    surovina = JSON.parse(json);
  } catch {
    /* Odpověď mohla být useknuta limitem tokenů — pokusíme se JSON opravit
     * (dovyředit řetězce a závorky). Pokud ani to nevyjde, vytáhneme alespoň
     * vyprávění (reci) a zbytek odpovíme jako konverzační plán. */
    const opraveno = opravUseknutyJson(json);
    if (opraveno !== null) {
      surovina = opraveno;
    } else {
      const reciVyraz = /"reci"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(json);
      if (reciVyraz) {
        const text = reciVyraz[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim().slice(0, 1000);
        if (text) return { ok: true, plan: { reci: text, akce: [], udalost: null }, chyby: [], vyrazeno: [] };
      }
      return { ok: false, plan: null, chyby: ["JSON odpovědi AI je neplatný."], vyrazeno: [] };
    }
  }
  if (typeof surovina !== "object" || surovina === null) {
    return { ok: false, plan: null, chyby: ["Odpověď AI není objekt."], vyrazeno: [] };
  }

  const r = surovina as Record<string, unknown>;
  const reci = typeof r.reci === "string" ? r.reci.trim().slice(0, 1000) : "";

  const planAkci: PlanAkce[] = [];
  const surovAkce = Array.isArray(r.akce) ? r.akce : [];
  let rozpocet = s.ap;

  for (const item of surovAkce.slice(0, MAX_AKCI_V_PLANU)) {
    if (typeof item !== "object" || item === null) continue;
    const it = item as Record<string, unknown>;
    const akceId = typeof it.akce === "string" ? it.akce.trim() : "";
    const def = dostupneAkceSafe(akceId) ? najdiDefAkce(akceId) : null;
    if (!def) {
      vyrazeno.push(akceId || "(bez id)");
      continue;
    }
    if (def.ap > rozpocet) {
      vyrazeno.push(`${akceId} (nedostatek AP)`);
      continue;
    }
    const parametry = ocistiParametry(akceId, it.parametry, chyby, vyrazeno);
    if (parametry === null) continue;
    rozpocet -= def.ap;
    planAkci.push({
      akce: akceId,
      parametry,
      duvod: typeof it.duvod === "string" ? it.duvod.trim().slice(0, 300) : null,
    });
  }

  let udalost: PlanUdalosti | null = null;
  if (r.udalost !== undefined && r.udalost !== null && typeof r.udalost === "object") {
    const u = r.udalost as Record<string, unknown>;
    const validace = validateAiEventProposal({
      tema: typeof u.tema === "string" ? u.tema : undefined,
      nazev: typeof u.nazev === "string" ? u.nazev : undefined,
      popis: typeof u.popis === "string" ? u.popis : undefined,
      dopady:
        typeof u.dopady === "object" && u.dopady !== null
          ? Object.fromEntries(Object.entries(u.dopady).filter(([, v]) => typeof v === "number"))
          : undefined,
    });
    if (validace.platny) {
      udalost = {
        tema: String(u.tema ?? "ekonomika"),
        nazev: String(u.nazev ?? "").trim(),
        popis: String(u.popis ?? "").trim(),
        dopady: validace.ocisteneDopady,
      };
    } else {
      chyby.push(`Návrh události byl odmítnut validátorem: ${validace.chyby.join(" ")}`);
    }
  }

  return { ok: true, plan: { reci, akce: planAkci, udalost }, chyby, vyrazeno };
}

function najdiDefAkce(id: string): { id: string; ap: number } | null {
  const def = AKCE.find((a) => a.id === id);
  return def ? { id: def.id, ap: def.ap } : null;
}

/* ============================================================
 * Provedení plánu
 * ============================================================ */

export interface VysledekProvedeneAkce {
  akce: string;
  ok: boolean;
  zprava: string;
  varovani: string[];
}

export interface VysledekPlanu {
  provedeno: VysledekProvedeneAkce[];
  udalostZprava: string | null;
  chyby: string[];
}

/** Provede očištěný plán sekvenčně přes engine. Mutuje stav s. */
export function provedPlan(s: GameState, plan: Plan): VysledekPlanu {
  const provedeno: VysledekProvedeneAkce[] = [];
  for (const a of plan.akce) {
    const v = applyPlayerAction(s, a.akce, a.parametry);
    provedeno.push({ akce: a.akce, ok: v.ok, zprava: v.zprava, varovani: v.varovani });
  }
  let udalostZprava: string | null = null;
  if (plan.udalost) {
    const validace = validateAiEventProposal(plan.udalost);
    const ev = applyAiEvent(s, validace, plan.udalost.nazev, plan.udalost.popis, plan.udalost.tema);
    if (ev) {
      udalostZprava = `Událost „${ev.nazev}" propukla ve světě hry.`;
    }
  }
  return { provedeno, udalostZprava, chyby: [] };
}

/* ===== poradce.ts ===== */
/**
 * poradce.ts — místní poradce štábu: deterministický překladač záměrů do plánu
 * akcí bez volání AI. Hra je tak plně hratelná bez API klíče; Mistral AI slouží
 * jako volitelné vylepšení. Poradce používá stejnou cestu jako AI: sestaví plán
 * (Plan) a ten provede engine přes provedPlan — nic neobejde validaci.
 *
 * Determinismus: žádná náhodnost, stejné zadání dává v témže stavu stejný plán.
 */


/* ============================================================
 * Normalizace textu (bez diakritiky, malá písmena)
 * ============================================================ */

const MAPA_DIAKRITIKY: Record<string, string> = {
  á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n", ó: "o", ř: "r",
  š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z",
};

export function normalizujText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áčďéěíňóřšťúůýž]/g, (c) => MAPA_DIAKRITIKY[c] ?? c)
    .replace(/\s+/g, " ")
    .trim();
}

/* ============================================================
 * Sémantika klíčových slov
 * ============================================================ */

interface Pravidlo {
  /** Klíčová fráze (již normalizovaná, bez diakritiky). */
  slova: string[];
  akce: string;
  /** Ladění parametrů z textu a stavu; výchozí parametry lze dát přímo. */
  parametry?: (t: string, s: GameState) => ParametryAkce;
  /** Jednoznačný důvod do odpovědi hráči. */
  duvod: string;
}

/** Následující úroveň kandidatury dle současné úrovně. */
function dalsiUroven(s: GameState): string {
  const poradi: Record<string, string> = {
    outsider: "radni",
    kandidat: "radni",
    radni: "starosta",
    starosta: "kongresman",
    kongresman: "guverner",
    guverner: "prezident",
    prezident: "prezident",
  };
  return poradi[s.funkce.uroven] ?? "radni";
}

/** Vytěží první částku v USD z textu (podporuje „5 000“, „$5000“, „10k“, „3 tis.“). */
export function vytazejCastku(t: string): number | null {
  const m = t.match(/(\d[\d\s]{0,13})(\s*(?:k\b|tis(?:ic)?\b))?/);
  if (!m) return null;
  let cislo = Number(m[1].replace(/\s/g, ""));
  if (!Number.isFinite(cislo) || cislo <= 0) return null;
  if (m[2]) cislo *= 1000;
  return Math.min(100_000_000, Math.round(cislo));
}

/** Téma zákona dle klíčových slov. */
function temaZakona(t: string): string {
  if (/infrastruktur|silnic|most|voda|kanaliz/.test(t)) return "infrastruktura";
  if (/zdravot|pojist|lek|nemocnic/.test(t)) return "zdravotnictvi";
  if (/social|davk|penze|rodin/.test(t)) return "socialni";
  if (/bezpec|polic|zbran|kriminal/.test(t)) return "beznacnost";
  return "ekonomika";
}

/** Vyrovanost rozpočtu dle klíčových slov. */
function vyrovnanost(t: string): number {
  if (/sver|utah|utlum|konsolid|deficit sniz|setrit|setr/.test(t)) return -2;
  if (/invest|stimul|expanz|nabidk|rozdat|trat/.test(t)) return 2;
  return 0;
}

/** Dovednost tréninku dle klíčových slov. */
function dovednostTréninku(t: string): string {
  if (/diplomat|vyjedn.*s cizin|vzdelavac/.test(t)) return "diplomacie";
  if (/finance|uct|rozpoc/.test(t)) return "finance";
  if (/medial|televiz|tisk|kamera/.test(t)) return "medialnost";
  if (/vyjedn|vyklarat|dohod/.test(t)) return "vyjednavani";
  return "retorika";
}

/** Typ průzkumu dle běžící kampaně. */
function typPruzkumu(s: GameState): string {
  return s.beziKampan.typZavodu ?? "obecni";
}

/** Najde NPC zmíněného jménem v textu; jinak null. */
function npcZTextu(t: string, s: GameState): string | null {
  for (const n of s.npc) {
    const jmeno = normalizujText(n.jmeno);
    const prijmeni = jmeno.split(" ").pop() ?? jmeno;
    if (t.includes(prijmeni)) return n.id;
  }
  return null;
}

/** Typ dárce dle klíčových slov. */
function typDarce(t: string): string {
  if (/ciz|zahran|rusk|cinsky/.test(t)) return "foreign";
  if (/firm|podnik|korpor|firemn/.test(t)) return "corporate";
  if (/odbor|pac\b|vzajemn/.test(t)) return "pac";
  if (/superpac/.test(t)) return "superpac";
  return "self";
}

/**
 * Shoda klíčového slova s normalizovaným textem. Čeština skloňuje, proto
 * se jednolová fráze shoduje i po kmenech: „konverzace“ najde „konverzaci“,
 * „projev“ najde „projetu“ (kmen = slovo bez posledního písmene, min. 5 znaků).
 * Víceslovná fráze („volební výbor“) platí, když se najdou všechna slova.
 */
function shoda(t: string, slovo: string): boolean {
  if (slovo.includes(" ")) {
    const casti = slovo.split(" ");
    if (casti.some((c) => c.length <= 2)) return t.includes(slovo);
    return casti.every((c) => shoda(t, c));
  }
  const slovaTextu = t.split(" ");
  if (slovaTextu.includes(slovo)) return true;
  if (slovo.length >= 5) {
    const kmen = slovo.slice(0, slovo.length - 1);
    return slovaTextu.some((w) => w.startsWith(kmen));
  }
  return false;
}
/**
 * Pravidla překladače. Pořadí určuje prioritu: konkrétnější fráze před obecnými.
 * Každá položka: klíčová slova → herní akce (+ parametry odvozené z textu).
 */
const PRAVIDLA: Pravidlo[] = [
  { slova: ["volebni vybor", "zaloz vybor", "zalozit vybor", "zrid vybor"], akce: "zalozit_vybor", duvod: "založen volební výbor — předpoklad sběru příspěvků" },
  { slova: ["fundraiser", "vyberak", "vecer na podpor", "sbirka"], akce: "fundraiser", duvod: "uspořádán fundraiser pro dárce" },
  {
    slova: ["dar", "darek", "prispevek", "sponzorsk", "sponzor", "penize od", "venovat penize", "poslat penize"],
    akce: "dar",
    duvod: "přijat dar do kampaně",
    parametry: (t, s) => {
      const p: ParametryAkce = { typDarce: typDarce(t) };
      const castka = vytazejCastku(t);
      if (castka !== null) p.castkaUSD = castka;
      if (/primark/.test(t)) p.volba = "primarky";
      const npc = npcZTextu(t, s);
      if (npc) p.npcId = npc;
      return p;
    },
  },
  {
    slova: ["reklam", "spot", "billboard", "kampan v medi", "televizni spot", "rozhlas", "online spot"],
    akce: "reklama",
    duvod: "natočena a nasazena reklama",
    parametry: (t) => {
      const castka = vytazejCastku(t);
      return castka !== null ? { castkaUSD: castka } : {};
    },
  },
  { slova: ["pruzkum", "sonda", "jak jsme na tom", "podpora volic"], akce: "pruzkum", duvod: "objednán průzkum veřejného mínění", parametry: (_t, s) => ({ tema: typPruzkumu(s) }) },
  { slova: ["projev", "vystoup", "prohodit rec", "prednest", "znamost", "videt"], akce: "projev", duvod: "přednesen projev — růst známosti" },
  { slova: ["tiskovka", "tiskov", "novinar", "pro tisk"], akce: "tiskovka", duvod: "svolána tisková konference" },
  { slova: ["debata", "souboj s", "duel"], akce: "debata", duvod: "odehrána debata se soupeřem" },
  { slova: ["otisky dver", "otisky dveri", "obchazet dom", "obchaz", "obej", "sousedy", "zaklepat", "dvere"], akce: "otisky_dveri", duvod: "obcházeno sousedství — otisky dveří" },
  { slova: ["networking", "kontakty", "navazat znamos", "sblizit se s", "spolecnost"], akce: "networking", duvod: "budována síť kontaktů" },
  {
    slova: ["konverzace", "konverz", "promluvit", "mluvit s", "povidat", "jednat", "lobby", "domluvit"],
    akce: "konverzace",
    duvod: "domluvena konverzace s vlivnou osobou",
    parametry: (t, s) => {
      const npc = npcZTextu(t, s);
      return npc ? { npcId: npc } : {};
    },
  },
  { slova: ["najmout stab", "sestavit stab", "stab", "kampanovy tym", "najmi lidi", "tym"], akce: "stab", duvod: "budován volební štáb" },
  {
    slova: ["skoleni", "trenink", "zlepsit se", "cvicit", "naucit se", "doucov", "vyskol", "skol"],
    akce: "skoleni",
    duvod: "trénink dovedností",
    parametry: (t) => ({ dovednost: dovednostTréninku(t) }),
  },
  { slova: ["prace na podniku", "zavlat do prace", "v podniku", "zviditelni firm"], akce: "prace_na_podniku", duvod: "odpracován týden na podniku" },
  { slova: ["filantrop", "dobre skutky", "charit", "pomoc obci", "sponzorovat komunit"], akce: "filantropie", duvod: "podpořena veřejně prospěšná činnost" },
  {
    slova: ["zakon", "navrh zakona", "legislativ", "prijmout pravn"],
    akce: "zakon",
    duvod: "předložen návrh zákona",
    parametry: (t) => ({ tema: temaZakona(t) }),
  },
  {
    slova: ["federalni rozpocet", "statni rozpocet", "rozpocet usa", "kongresovy rozpocet"],
    akce: "federalni_rozpocet",
    duvod: "upraven federální rozpočet",
    parametry: (t) => ({ vyrovnanost: vyrovnanost(t) }),
  },
  {
    slova: ["exekutivni prikaz", "dekret", "exekutivni"],
    akce: "exekutivni_prikaz",
    duvod: "vydán exekutivní příkaz",
    parametry: (t) => ({ tema: /social|rodin|zdrav|vzdel/.test(t) ? "socialni" : "ekonomika" }),
  },
  {
    slova: ["rozpocet mesta", "mestske financ", "obecni rozpocet", "mestskeho rozpoc"],
    akce: "rozpocet_mesta",
    duvod: "upraven městský rozpočet",
    parametry: (t) => ({ vyrovnanost: vyrovnanost(t) }),
  },
  { slova: ["zonace", "zoning", "stavebni odbor", "stavebni par"], akce: "zonace", duvod: "změněna zonace města" },
  { slova: ["compliance", "audit", "kontrola financ", "uctnictvi"], akce: "compliance_audit", duvod: "provedena interní kontrola financí" },
  { slova: ["uplacek", "uplat", "konev", "obal"], akce: "uplacek", duvod: "zvažován úplatek (vysoké právní riziko)" },
  {
    slova: ["vyhlasit kandidatur", "uchazet o", "kandidovat", "kandidatur"],
    akce: "vyhlasit_kandidaturu",
    duvod: "vyhlášena kandidatura",
    parametry: (t, s) => {
      if (/radn/.test(t)) return { tema: "radni" };
      if (/starost/.test(t)) return { tema: "starosta" };
      if (/kongres|snemovn/.test(t)) return { tema: "kongresman" };
      if (/guvern/.test(t)) return { tema: "guverner" };
      if (/prezident|bile dum/.test(t)) return { tema: "prezident" };
      return { tema: dalsiUroven(s) };
    },
  },
  {
    slova: ["splnit slib", "dodrzet slib", "naplnit slib", "splnit prislib", "splnim slib"],
    akce: "splnit_slib",
    duvod: "slib naplněn",
    parametry: (_t, s) => {
      const slib = s.sliby.find((x) => x.stav === "v_progressu");
      return slib ? { slibId: slib.id } : {};
    },
  },
];

/* ============================================================
 * Sestavení plánu
 * ============================================================ */

export interface VysledekPoradce {
  /** Plán ve stejném formátu jako od AI — provede jej engine (provedPlan). */
  plan: Plan;
  /** Poznámky pro hráče: co poradce rozpoznal, co vynechal a proč. */
  rozbor: string[];
}

/**
 * Přeloží volný text záměru do plánu akcí bez AI. Deterministické:
 * stejný text ve stejném stavu dává vždy identický plán.
 */
export function sestavPlanBezAi(text: string, s: GameState): VysledekPoradce {
  const t = normalizujText(text);
  const dostupne = new Set(dostupneAkce(s.funkce.uroven as OfficeLevel).map((a) => a.id));
  const katalog = dostupneAkce(s.funkce.uroven as OfficeLevel);
  const nazevAkce = (id: string): string => katalog.find((a) => a.id === id)?.nazev ?? id;
  const apAkce = (id: string): number => katalog.find((a) => a.id === id)?.ap ?? 0;

  const rozbor: string[] = [];
  const akce: PlanAkce[] = [];
  const pouzite = new Set<string>();
  let rozpocet = s.ap;

  for (const pravidlo of PRAVIDLA) {
    if (!pravidlo.slova.some((slovo) => shoda(t, slovo))) continue;
    if (pouzite.has(pravidlo.akce)) continue;
    if (!dostupne.has(pravidlo.akce)) {
      rozbor.push(`Akce „${pravidlo.akce}“ není na této úrovni úřadu dostupná — vynecháno.`);
      continue;
    }
    const ap = apAkce(pravidlo.akce);
    if (ap > rozpocet) {
      rozbor.push(`Akce „${nazevAkce(pravidlo.akce)}“ nedosahuje zbytkového rozpočtu AP — vynecháno.`);
      continue;
    }
    if (akce.length >= MAX_AKCI_V_PLANU) {
      rozbor.push("Dosažen limit šesti akcí na kolo — zbytek záměru vyřazen.");
      break;
    }
    rozpocet -= ap;
    pouzite.add(pravidlo.akce);
    const parametry = pravidlo.parametry ? pravidlo.parametry(t, s) : {};
    akce.push({ akce: pravidlo.akce, parametry, duvod: pravidlo.duvod });
  }

  let reci: string;
  if (akce.length === 0) {
    /* Poradenská otázka („co bych měl dělat?“) — odpověď ze stavu, bez akcí. */
    const poradenske = ["doporuc", "co delat", "jak postupovat", "silne strank", "sila strank", "hodnot", "jak jsme na tom", "pomoz", "rada"];
    if (poradenske.some((slovo) => shoda(t, slovo))) {
      const brance = vyhodnotBranci(s);
      const rady: string[] = [];
      if (!s.finance.vyborZalozen) rady.push("založte volební výbor — bez něj nelze sbírat příspěvky");
      else if (s.finance.pokladnaKampane < 25_000) rady.push("pošlete fundraiser a první dary pod limity FEC");
      if (s.funkce.uroven === "outsider" && s.postava.atributy.znamostLokal < 25) rady.push("zvyšujte známost: projev a obcházení dveří");
      if (!brance.splneno) rady.push(`k branci do další úrovně chybí: ${brance.chybejici.join("; ")}`);
      reci =
        rady.length > 0
          ? `Rada místního poradce: ${rady.join("; ")}. Rozpočet tohoto kola je ${s.ap} AP.`
          : "Brance máte splněné — zvažte vyhlášení kandidatury.";
      rozbor.push("Odpověď sestavena ze stavu hry, žádné akce nebyly provedeny.");
      return { plan: { reci, akce: [], udalost: null }, rozbor };
    }
    reci =
      t.length === 0
        ? "Poradce potřebuje text záměru. Napište, čeho chcete tento týden dosáhnout."
        : "Poradce v záměru nerozpoznal žádnou známou akci. Zkuste klíčová slova (dar, reklama, projev, průzkum, networking, zákon) nebo zvolte ruční akci dole.";
    rozbor.push("Rozsah záměru se nepodařilo převést na konkrétní kroky.");
  } else {
    reci =
      `Místní poradce přeložil záměr do ${akce.length} ${akce.length === 1 ? "kroku" : "kroků"}: ` +
      akce.map((a) => `${nazevAkce(a.akce)} (${a.duvod ?? nazevAkce(a.akce)})`).join("; ") +
      ".";
  }

  return { plan: { reci, akce, udalost: null }, rozbor };
}

/** Provede plán místního poradce přes standardní cestu enginu. */
export function provedPlanPoradce(s: GameState, vysledek: VysledekPoradce) {
  return provedPlan(s, vysledek.plan);
}
