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
