/**
 * poradce.ts — místní poradce štábu: deterministický překladač záměrů do plánu
 * akcí bez volání AI. Hra je tak plně hratelná bez API klíče; Mistral AI slouží
 * jako volitelné vylepšení. Poradce používá stejnou cestu jako AI: sestaví plán
 * (Plan) a ten provede engine přes provedPlan — nic neobejde validaci.
 *
 * Determinismus: žádná náhodnost, stejné zadání dává v témže stavu stejný plán.
 */

import type { GameState, OfficeLevel } from "./state.ts";
import { dostupneAkce, type ParametryAkce } from "./actions.ts";
import { provedPlan, MAX_AKCI_V_PLANU, type Plan, type PlanAkce } from "./ai.ts";
import { vyhodnotBranci } from "./indicators.ts";

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
