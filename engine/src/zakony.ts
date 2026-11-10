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
