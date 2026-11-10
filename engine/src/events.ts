/**
 * events.ts — tematické šablony událostí (klima, migrace, geopolitika, dluh,
 * technologie, energetika) s vahou výskytu dle stavu světa a validátor
 * návrhů od AI (Mistral), které smí měnit pouze povolené klíče efektů.
 */
import type { GameState, GameEvent } from "./state.ts";
import type { Rng } from "./rng.ts";

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

function r1(x: number): number {
  return Math.round(x * 10) / 10;
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
