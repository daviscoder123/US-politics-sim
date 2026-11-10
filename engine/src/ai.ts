/**
 * ai.ts — vrstva pro AI chat (Mistral API). Engine zůstává jediným vykonavatelem:
 * AI pouze navrhuje plán ve striktním JSON schématu, tento modul plán vyčistí,
 * zvaliduje vůči katalogu akcí a rozpočtu AP a teprve pak jej provede přes
 * applyPlayerAction / applyAiEvent. Veškerá rozhodnutí tedy zůstávají
 * deterministická a replaovatelná; AI nesahá na stav přímo.
 */

import type { GameState } from "./state.ts";
import { dostupneAkce, AKCE, type ParametryAkce } from "./actions.ts";
import { applyPlayerAction } from "./game.ts";
import { validateAiEventProposal, applyAiEvent } from "./events.ts";
import { vyhodnotBranci } from "./indicators.ts";

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
    "Jste náčelník štábu a hlavní poradce hráče v politickém simulátoru USA.",
    "Hráč vám píše volným textem, co chce tento týden (kolo) dosáhnout. Vy přeložíte jeho záměr do konkrétních herních akcí.",
    "Odpovíte VÝHRADNĚ jedním JSON objektem, bez markdown ohraničení a bez jakéhokoli textu mimo JSON. Schéma:",
    '{"reci": "krátká odpověď hráči v češtině (max 3 věty, věcný tón novinového zpravodajství)", "akce": [{"akce": "id_akce", "parametry": {}, "duvod": "proč tato akce"}], "udalost": {"tema": "...", "nazev": "...", "popis": "...", "dopady": {...}}}',
    "Pravidla:",
    "1. Pole akce: 0 až 6 akcí. Používejte POUZE akce z katalogu níže a POUZE jejich whitelisted parametry; jiné klíče budou tištěny odstraněny.",
    `2. Celková cena akcí nesmí překročit rozpočet AP (${s.ap} AP). Pokud hráč chce víc, proveďte nejdůležitější a zbytek zmínte v „reci".`,
    "3. Pole udalost je VOLITELNÉ: maximálně jedna vyprávěcí událost na kolo (reakce světa na hráčovo jednání). Téma jedno z: klima|migrace|geopolitika|dluh|technologie|energetika|pravni|volby|ekonomika. Dopady jsou volitelné klíče z: pokladna, socialniKapital, etika, prodejnost, znamostLokal, znamostStat, znamostNarod, spokojenost, kriminalita, inflaceDelta, hdpDelta; každý v rozsahu −1..1 (desetinné číslo, např. 0.3). Nikdy nedávejte dopady větší než 0.5 v absolutní hodnotě.",
    "4. Buďte proaktivní: pokud hráčův záměr vyžaduje krok navíc (např. před velkým darem založit volební výbor), navrhněte ho.",
    "5. Nikdy nevymýšlejte akce mimo katalog. Nikdy nepřidávejte parametry mimo whitelist.",
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
    return { ok: false, plan: null, chyby: ["Odpověď AI neobsahuje JSON objekt."], vyrazeno: [] };
  }

  let surovina: unknown;
  try {
    surovina = JSON.parse(json);
  } catch (e) {
    return { ok: false, plan: null, chyby: [`JSON odpovědi AI je neplatný: ${(e as Error).message}`], vyrazeno: [] };
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
