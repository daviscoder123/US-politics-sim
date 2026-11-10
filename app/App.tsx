import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ARCHETYPY,
  BRANCE,
  STATY_EV,
  TYDEN_PRIMAREK,
  TYDEN_VOLEB,
  vytvorNovouHru,
  applyPlayerAction,
  endTurn,
  dostupneAkce,
  vyhodnotBranci,
  hledejZakony,
  hledejRealneZakony,
  SCOTUS_SOUDCI,
  systemovyPrompt,
  stavProAi,
  parsujPlan,
  provedPlan,
  sestavPlanBezAi,
  type GameState,
} from "../engine/engine-bundle.ts";

/* ============================================================
 * Pomocné formátování a barevné pravidlo (zelená = dobře pro vás)
 * ============================================================ */

const FORMAT_USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const FORMAT_CISLO = new Intl.NumberFormat("cs-CZ");

function usd(n: number): string {
  return FORMAT_USD.format(n);
}

const NAZVY_UROVNI: Record<string, string> = {
  outsider: "outsider",
  kandidat: "kandidát",
  radni: "radní",
  starosta: "starosta",
  kongresman: "kongresman",
  guverner: "guvernér",
  prezident: "prezident",
};

const PORADI_UROVNI = ["outsider", "kandidat", "radni", "starosta", "kongresman", "guverner", "prezident"] as const;
const KLICE_BRANCE = ["kandidat", "radni", "starosta", "kongresman", "guverner", "prezident"] as const;

type Barva = "zelena" | "zluta" | "cervena";

function tridaBarvy(b: Barva): string {
  if (b === "zelena") return "bg-gradient-to-r from-amber-600 to-amber-400";
  if (b === "zluta") return "bg-gradient-to-r from-amber-600 to-amber-400";
  return "bg-gradient-to-r from-rose-700 to-rose-500";
}

function textBarvy(b: Barva): string {
  if (b === "zelena") return "text-amber-400";
  if (b === "zluta") return "text-amber-300";
  return "text-rose-400";
}

function skala(hodnota: number, zluta: number, zelena: number, smerNahoru: boolean): Barva {
  if (smerNahoru) {
    if (hodnota >= zelena) return "zelena";
    if (hodnota >= zluta) return "zluta";
    return "cervena";
  }
  if (hodnota <= zelena) return "zelena";
  if (hodnota <= zluta) return "zluta";
  return "cervena";
}

/* ============================================================
 * Mapa USA (volební noc)
 * ============================================================ */

const MAPA_RADKY: string[][] = [
  ["AK", "", "", "", "", "", "", "", "", "", "", ""],
  ["WA", "ID", "MT", "ND", "MN", "WI", "MI", "", "NY", "VT", "NH", "ME"],
  ["OR", "NV", "WY", "SD", "IA", "IL", "IN", "OH", "PA", "NJ", "CT", "MA"],
  ["CA", "UT", "CO", "NE", "MO", "KY", "WV", "MD", "DE", "DC", "RI", ""],
  ["AZ", "NM", "KS", "AR", "TN", "VA", "NC", "SC", "", "", "", ""],
  ["OK", "LA", "MS", "AL", "GA", "", "", "", "", "", "", ""],
  ["TX", "", "", "", "FL", "", "", "", "HI", "", "", ""],
];

const EV_TABULKA: Record<string, number> = Object.fromEntries(STATY_EV.map((s) => [s.stat, s.ev]));

/* ============================================================
 * Specifikace formulářů ručních akcí (sekundární ovládání)
 * ============================================================ */

interface PolozkaFormulare {
  klic: string;
  label: string;
  typ: "number" | "select" | "text";
  vychozi?: string | number;
  volby?: { hodnota: string; label: string }[];
  min?: number;
  max?: number;
}

const DOVEDNOSTI_VOLBY = [
  { hodnota: "diplomacie", label: "Diplomacie" },
  { hodnota: "retorika", label: "Rétorika" },
  { hodnota: "finance", label: "Finance" },
  { hodnota: "vyjednavani", label: "Vyjednávání" },
  { hodnota: "medialnost", label: "Medialita" },
];

const PARAM_SPEC: Record<string, PolozkaFormulare[]> = {
  skoleni: [{ klic: "dovednost", label: "Dovednost k tréninku", typ: "select", volby: DOVEDNOSTI_VOLBY }],
  dar: [
    { klic: "castkaUSD", label: "Částka (USD)", typ: "number", vychozi: 1000, min: 1 },
    {
      klic: "typDarce",
      label: "Typ dárce",
      typ: "select",
      vychozi: "individual",
      volby: [
        { hodnota: "individual", label: "Jednotlivec" },
        { hodnota: "pac", label: "PAC" },
        { hodnota: "superpac", label: "Super PAC" },
        { hodnota: "self", label: "Vlastní financování" },
        { hodnota: "corporate", label: "Korporace (ilegální přímo)" },
        { hodnota: "foreign", label: "Cizinec (zakázáno)" },
      ],
    },
    {
      klic: "volba",
      label: "Pro které volby",
      typ: "select",
      vychozi: "hlavni",
      volby: [
        { hodnota: "hlavni", label: "Hlavní volby" },
        { hodnota: "primarky", label: "Primárky" },
      ],
    },
    { klic: "slibUrednihoAktu", label: "Slib úředního aktu (quid pro quo)", typ: "text" },
    { klic: "pocetSvedku", label: "Počet svědků", typ: "number", vychozi: 0, min: 0, max: 10 },
  ],
  reklama: [{ klic: "castkaUSD", label: "Částka na reklamu (USD)", typ: "number", vychozi: 5000, min: 1 }],
  uplacek: [
    { klic: "castkaUSD", label: "Částka (USD)", typ: "number", vychozi: 10000, min: 1 },
    { klic: "pocetSvedku", label: "Počet svědků", typ: "number", vychozi: 0, min: 0, max: 10 },
  ],
  vyhlasit_kandidaturu: [
    {
      klic: "tema",
      label: "Cílová funkce",
      typ: "select",
      vychozi: "radni",
      volby: [
        { hodnota: "radni", label: "Radní" },
        { hodnota: "starosta", label: "Starosta" },
        { hodnota: "kongresman", label: "Kongresman" },
        { hodnota: "guverner", label: "Guvernér" },
        { hodnota: "prezident", label: "Prezident" },
      ],
    },
  ],
  zakon: [
    {
      klic: "tema",
      label: "Téma zákona",
      typ: "select",
      volby: [
        { hodnota: "ekonomika", label: "Ekonomika" },
        { hodnota: "socialni", label: "Sociální politika" },
        { hodnota: "beznacnost", label: "Bezpečnost" },
        { hodnota: "zdravotnictvi", label: "Zdravotnictví" },
        { hodnota: "infrastruktura", label: "Infrastruktura" },
      ],
    },
  ],
  federalni_rozpocet: [
    {
      klic: "vyrovnanost",
      label: "Nastavení rozpočtu",
      typ: "select",
      vychozi: "0",
      volby: [
        { hodnota: "-2", label: "Tvrdá konsolidace (−2)" },
        { hodnota: "-1", label: "Šetření (−1)" },
        { hodnota: "0", label: "Vyrovnaný (0)" },
        { hodnota: "1", label: "Stimul (+1)" },
        { hodnota: "2", label: "Expanze (+2)" },
      ],
    },
  ],
  rozpocet_mesta: [
    {
      klic: "vyrovnanost",
      label: "Nastavení rozpočtu města",
      typ: "select",
      vychozi: "0",
      volby: [
        { hodnota: "-2", label: "Tvrdé šetření (−2)" },
        { hodnota: "-1", label: "Šetření (−1)" },
        { hodnota: "0", label: "Vyrovnaný (0)" },
        { hodnota: "1", label: "Investice (+1)" },
        { hodnota: "2", label: "Velké investice (+2)" },
      ],
    },
  ],
  exekutivni_prikaz: [
    {
      klic: "tema",
      label: "Téma příkazu",
      typ: "select",
      volby: [
        { hodnota: "ekonomika", label: "Ekonomika" },
        { hodnota: "socialni", label: "Sociální politika" },
      ],
    },
  ],
  pruzkum: [
    {
      klic: "tema",
      label: "Typ závodu",
      typ: "select",
      vychozi: "obecni",
      volby: [
        { hodnota: "obecni", label: "Obecní" },
        { hodnota: "kongresove", label: "Kongresové" },
        { hodnota: "gubernatorske", label: "Gubernatoriální" },
        { hodnota: "prezidentske", label: "Prezidentské" },
      ],
    },
  ],
  konverzace: [
    {
      klic: "npcId",
      label: "Osoba",
      typ: "select",
      volby: [],
    },
    { klic: "slibText", label: "Volitelný slib (zavazuje)", typ: "text" },
  ],
  splnit_slib: [
    {
      klic: "slibId",
      label: "Slib k splnění",
      typ: "select",
      volby: [],
    },
  ],
};

/* ============================================================
 * Uživatelská vodítka: skupiny ručních akcí, návrhy záměrů
 * a týdenní briefink — vše odvozeno ze stavu (deterministicky),
 * aby hru vedla sama hra, nikoli pevný scénář.
 * ============================================================ */

const SKUPINA_AKCE: Record<string, string> = {
  zalozit_vybor: "Finance a kampaň",
  dar: "Finance a kampaň",
  fundraiser: "Finance a kampaň",
  reklama: "Finance a kampaň",
  uplacek: "Finance a kampaň",
  superpac_koordinace: "Finance a kampaň",
  pruzkum: "Finance a kampaň",
  networking: "Lidé a vztahy",
  konverzace: "Lidé a vztahy",
  stab: "Lidé a vztahy",
  splnit_slib: "Lidé a vztahy",
  projev: "Vystoupení a pověst",
  tiskovka: "Vystoupení a pověst",
  debata: "Vystoupení a pověst",
  otisky_dveri: "Vystoupení a pověst",
  filantropie: "Vystoupení a pověst",
  skoleni: "Rozvoj",
  prace_na_podniku: "Rozvoj",
  rozpocet_mesta: "Správa a úřad",
  zonace: "Správa a úřad",
  federalni_rozpocet: "Správa a úřad",
  zakon: "Správa a úřad",
  exekutivni_prikaz: "Správa a úřad",
  compliance_audit: "Správa a úřad",
};

const PORADI_SKUPIN = ["Finance a kampaň", "Lidé a vztahy", "Vystoupení a pověst", "Rozvoj", "Správa a úřad", "Ostatní"];

const NAZVY_ZAVODU: Record<string, string> = {
  obecni: "obecní",
  kongresove: "kongresové",
  gubernatorske: "gubernatorská",
  prezidentske: "prezidentská",
};

const NAZVY_NAKLONU: Record<string, string> = {
  progresivni: "progresivní",
  bipartitni: "bipartitní",
  konzervativni: "konzervativní",
};

function skupinaAkce(id: string): string {
  return SKUPINA_AKCE[id] ?? "Ostatní";
}

/** Návrhy záměrů odvozené ze stavu — vodítko pro první kroky. */
function navrhyZameru(s: GameState): string[] {
  const navrhy: string[] = [];
  if (!s.finance.vyborZalozen) {
    navrhy.push("Založ volební výbor a připrav legální financování kampaně.");
  } else if (s.finance.pokladnaKampane < 25_000) {
    navrhy.push("Pořádám fundraiser a zajisti první dary pod limity FEC.");
  }
  if (s.funkce.uroven === "outsider" && s.postava.atributy.znamostLokal < 25) {
    navrhy.push("Zvedni mi známost ve městě — projev a obcházení dveří.");
  }
  const slib = s.sliby.find((x) => x.stav === "v_progressu" && x.lhutaKolo - s.kolo <= 8);
  if (slib) {
    navrhy.push(`Blíží se lhůta slibu „${slib.text}“ — pomoz mi jej splnit.`);
  }
  navrhy.push("Co bys mi doporučil tento týden? Zhodnoť moje silné a slabé stránky.");
  return navrhy.slice(0, 3);
}

interface Briefink {
  titulek: string;
  text: string;
  zamer: string | null;
}

/** Týdenní briefink štábu odvozený ze stavu — hra sama vede hráče. */
function sestavBriefinky(s: GameState, brance: { splneno: boolean; chybejici: string[] } | null): Briefink[] {
  const out: Briefink[] = [];
  if (s.pravni.vysetrovani.length > 0) {
    const v = s.pravni.vysetrovani[0];
    out.push({
      titulek: "Právní riziko",
      text: `Probíhá vyšetřování (${v.tema}); každým kolem hrozí eskalace.`,
      zamer: "Jak minimalizovat právní riziko a co v této situaci nedělat?",
    });
  }
  if (!s.finance.vyborZalozen && s.finance.pokladnaKampane > 0) {
    out.push({
      titulek: "Volební výbor",
      text: "Přijímáte peníze bez registrovaného výboru — FEC hrozí auditem.",
      zamer: "Založ volební výbor a srovnej financování s legislativou FEC.",
    });
  }
  if (s.beziKampan.typZavodu) {
    out.push({
      titulek: "Kampaň",
      text: `Běží ${NAZVY_ZAVODU[s.beziKampan.typZavodu] ?? s.beziKampan.typZavodu} kampaň; primárky přicházejí v týdnu 24 a volby v týdnu 45.`,
      zamer: "Zvyš moje šance ve volbách: rozjeď reklamu a veřejná vystoupení.",
    });
  }
  const slib = s.sliby.find((x) => x.stav === "v_progressu" && x.lhutaKolo - s.kolo <= 8);
  if (slib) {
    out.push({
      titulek: "Slib v lhůtě",
      text: `„${slib.text}“ — lhůta vyprší v kole ${slib.lhutaKolo}.`,
      zamer: `Pomoz mi splnit slib „${slib.text}“ dřív, než vyprší lhůta.`,
    });
  }
  if (brance && !brance.splneno && out.length < 3) {
    out.push({
      titulek: "Kariérní brance",
      text: `Chybí: ${brance.chybejici.join("; ")}.`,
      zamer: "Jak nejlépe splnit kariérní branci v následujících týdnech?",
    });
  }
  return out.slice(0, 3);
}

/* ============================================================
 * Malé komponenty
 * ============================================================ */

function Monogram({ jmeno, uroven }: { jmeno: string; uroven: string }) {
  const iniciály =
    jmeno
      .split(" ")
      .filter(Boolean)
      .map((c) => c[0]?.toUpperCase())
      .join("")
      .slice(0, 2) || "US";
  const barvaUrovne: Record<string, string> = {
    outsider: "bg-[#4d3b1d]",
    kandidat: "bg-teal-700",
    radni: "bg-sky-700",
    starosta: "bg-indigo-700",
    kongresman: "bg-violet-700",
    guverner: "bg-fuchsia-700",
    prezident: "bg-amber-600",
  };
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-md ring-2 ring-slate-950/60 ${barvaUrovne[uroven] ?? "bg-[#4d3b1d]"}`}>
      {iniciály}
    </div>
  );
}

function ApDots({ ap, max }: { ap: number; max: number }) {
  return (
    <div className="flex items-center gap-1" title={`Akční body: ${ap}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < ap ? "bg-amber-400" : "bg-[#3a2c16]"}`} />
      ))}
    </div>
  );
}

function Pruh({ label, hodnota, barva, zprava }: { label: string; hodnota: number; barva: Barva; zprava?: string }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-[#d9cbab]">{label}</span>
        <span className={`font-bold ${textBarvy(barva)}`}>{zprava ?? FORMAT_CISLO.format(hodnota)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#3a2c16]/70">
        <div className={`h-full rounded-full ${tridaBarvy(barva)} transition-all`} style={{ width: `${Math.max(2, Math.min(100, hodnota))}%` }} />
      </div>
    </div>
  );
}

function Karta({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[#4d3b1d]/70 bg-[#2a2013]/70 p-4 shadow-lg ${className ?? ""}`}>{children}</div>;
}

function Udaj({ label, hodnota, barva }: { label: string; hodnota: string; barva: Barva }) {
  return (
    <div className="rounded-xl border border-[#4d3b1d]/60 bg-[#1e170d]/70 px-2.5 py-1.5 shadow-sm">
      <div className="text-[10px] uppercase tracking-wide text-[#918059]">{label}</div>
      <div className={`text-sm font-bold ${textBarvy(barva)}`}>{hodnota}</div>
    </div>
  );
}

/* ============================================================
 * Prolog
 * ============================================================ */

function Prolog({ onStart }: { onStart: (p: { jmeno: string; vek: number; archetyp: string; stat: string; seed: number }) => void }) {
  const [jmeno, setJmeno] = useState("Alexander Grant");
  const [vek, setVek] = useState(42);
  const [stat, setStat] = useState("OH");
  const [archetyp, setArchetyp] = useState("software-podnikatel");
  const [seed, setSeed] = useState(2027);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-1.5 w-40 overflow-hidden rounded-full">
          <div className="flex-1 bg-sky-500" />
          <div className="flex-1 bg-slate-200" />
          <div className="flex-1 bg-rose-500" />
        </div>
        <h1 className="bg-gradient-to-r from-amber-200 via-[#f2e8cf] to-amber-500 bg-clip-text text-5xl font-black tracking-tight text-transparent">
          Dračí doupě USA
        </h1>
        <p className="mt-3 text-[#b6a780]">Politické dobrodružství ve stylu Dračího doupěte: od zakladatele firmy až do Bílého domu. Herní mistr vypráví, vy rozhodujete — s klíčem Mistral AI i bez něj.</p>
      </header>

      <Karta className="mb-6">
        <h2 className="mb-4 text-lg font-bold text-white">Vytvořte svého hrdinu</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-[#d9cbab]">
            Jméno
            <input
              className="mt-1 w-full rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
              value={jmeno}
              onChange={(e) => setJmeno(e.target.value)}
            />
          </label>
          <label className="text-sm text-[#d9cbab]">
            Věk
            <input
              type="number"
              min={18}
              max={80}
              className="mt-1 w-full rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
              value={vek}
              onChange={(e) => setVek(Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-[#d9cbab]">
            Domovský stát
            <select
              className="mt-1 w-full rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
              value={stat}
              onChange={(e) => setStat(e.target.value)}
            >
              {STATY_EV.map((s) => (
                <option key={s.stat} value={s.stat}>
                  {s.stat} ({s.ev} volitelů)
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-[#d9cbab]">
            Seed (deterministická hra)
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
            />
          </label>
        </div>
      </Karta>

      <h2 className="mb-3 text-lg font-bold text-white">Vyberte archetyp — vaše výchozí pozice</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ARCHETYPY.map((a) => {
          const vybrany = a.id === archetyp;
          return (
            <button
              key={a.id}
              onClick={() => setArchetyp(a.id)}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                vybrany
                  ? "border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-500/10"
                  : "border-[#4d3b1d] bg-[#2a2013]/70 hover:-translate-y-1 hover:border-[#6b4f26] hover:shadow-xl"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-bold text-white">{a.nazev}</span>
                <span className={`text-xs font-semibold ${a.ideologie < -2 ? "text-sky-400" : a.ideologie > 2 ? "text-rose-400" : "text-[#b6a780]"}`}>
                  {a.ideologie < -1 ? `levice ${a.ideologie}` : a.ideologie > 1 ? `pravice +${a.ideologie}` : "střed"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#b6a780]">{a.popis}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded bg-[#3a2c16] px-1.5 py-0.5 text-[#eadfc2]">{usd(a.majetekUSD)}</span>
                <span className="rounded bg-[#3a2c16] px-1.5 py-0.5 text-[#eadfc2]">kapitál {a.socialniKapital}</span>
                <span className="rounded bg-[#3a2c16] px-1.5 py-0.5 text-[#eadfc2]">etika {a.etika}</span>
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onStart({ jmeno, vek, archetyp, stat, seed })}
        className="mt-8 w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 py-4 text-lg font-bold text-[#241a05] shadow-xl transition-all hover:from-amber-400 hover:to-yellow-500"
      >
        Vstoupit do doupěte
      </button>

      <Karta className="mt-4 p-4">
        <h3 className="mb-2 text-sm font-bold text-white">Jak se hraje</h3>
        <ol className="list-decimal space-y-1.5 pl-5 text-xs text-[#d9cbab]">
          <li>Formulujte záměr přirozeným jazykem („obejdu okres, navrhnu daňovou úlevu“) — herní mistr jej přeloží do herních akcí: s API klíčem Mistral AI, bez klíče místní vypravěč. Obojí vykonává engine.</li>
          <li>Každá akce stojí body politické kapitálu (AP). „Vyprávění u stolu“ vždy doporučí, co je aktuálně nejnaléhavější. Na otázky odpovídá herní mistr vyprávěním.</li>
          <li>Čas plyne tlačítkem v hlavičce — týden dospěje, engine vyhodnotí důsledky a vrátí strukturovaný souhrn.</li>
        </ol>
      </Karta>
    </div>
  );
}

/* ============================================================
 * Volební noc
 * ============================================================ */

interface StatMapy {
  stat: string;
  marze: number;
  hracVyhrava: boolean;
}

interface VolebniData {
  typ: string;
  cil: string;
  vyhral: boolean;
  share: number;
  detail: { evHrac: number; evSouper: number; staty: StatMapy[] } | null;
}

function VolebniNoc({ data, zavreni }: { data: VolebniData; zavreni: () => void }) {
  const vysledky: Record<string, boolean> = {};
  if (data.detail) {
    for (const s of data.detail.staty) vysledky[s.stat] = s.hracVyhrava;
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#16110a]/95 p-4">
      <div className="max-h-full w-full max-w-4xl overflow-y-auto rounded-2xl border border-[#4d3b1d] bg-[#1e170d] shadow-2xl">
        <div className="flex h-1.5 overflow-hidden rounded-t-2xl">
          <div className="flex-1 bg-sky-700" />
          <div className="flex-1 bg-slate-200" />
          <div className="flex-1 bg-rose-700" />
        </div>
        <div className="p-6">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <span className="rounded bg-[#2a2013] px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-300 shadow-sm">Volby · sčítání výsledků</span>
          <h2 className={`text-3xl font-black tracking-tight ${data.vyhral ? "text-amber-400" : "text-rose-400"}`}>
            {data.vyhral ? "VOLBY VYHRÁNY" : "VOLBY PROHRÁNY"}
          </h2>
          <span className="ml-auto text-sm text-[#b6a780]">
            {Math.round(data.share * 100)} % hlasů · cíl: {NAZVY_UROVNI[data.cil] ?? data.cil}
          </span>
        </div>

        {data.detail ? (
          <>
            {/* Televizní scoreboard elektorských hlasů */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-sky-700/60 bg-gradient-to-br from-sky-950/80 to-[#1e170d] p-4 shadow-lg">
                <div className="text-[10px] font-bold uppercase tracking-widest text-sky-300">Vy</div>
                <div className="text-4xl font-black text-sky-300">{data.detail.evHrac}</div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#2a2013]">
                  <div className="h-full rounded-full bg-gradient-to-r from-sky-600 to-sky-400" style={{ width: `${Math.min(100, (data.detail.evHrac / 270) * 100)}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-[#918059]">{data.detail.evHrac >= 270 ? "Vítězný práh překročen" : `chybí ${270 - data.detail.evHrac} k vítězství (270)`}</div>
              </div>
              <div className="rounded-2xl border border-rose-700/60 bg-gradient-to-br from-rose-950/80 to-[#1e170d] p-4 shadow-lg">
                <div className="text-[10px] font-bold uppercase tracking-widest text-rose-300">Soupeř</div>
                <div className="text-4xl font-black text-rose-300">{data.detail.evSouper}</div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#2a2013]">
                  <div className="h-full rounded-full bg-gradient-to-r from-rose-600 to-rose-400" style={{ width: `${Math.min(100, (data.detail.evSouper / 270) * 100)}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-[#918059]">{data.detail.evSouper >= 270 ? "práh překročen" : `chybí ${270 - data.detail.evSouper} k vítězství (270)`}</div>
              </div>
            </div>

            <p className="mt-3 text-xs text-[#918059]">Elektorské hlasy — k vítězství je nutných 270 z 538.</p>

            <div className="mt-4 space-y-1">
              {MAPA_RADKY.map((rada, i) => (
                <div key={i} className="grid grid-cols-12 gap-1">
                  {rada.map((kod, j) => {
                    if (!kod) return <div key={j} className="h-10" />;
                    const vyhral = vysledky[kod];
                    return (
                      <div
                        key={j}
                        title={`${kod}: ${EV_TABULKA[kod]} volitelů`}
                        className={`flex h-10 flex-col items-center justify-center rounded-md text-[10px] font-bold leading-tight shadow-md transition-colors ${
                          vyhral === undefined
                            ? "bg-[#3a2c16] text-[#d9cbab]"
                            : vyhral
                              ? "bg-gradient-to-br from-sky-600 to-sky-800 text-white"
                              : "bg-gradient-to-br from-rose-600 to-rose-800 text-white"
                        }`}
                      >
                        <span>{kod}</span>
                        <span className="text-[#eadfc2]">{EV_TABULKA[kod]}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-[#b6a780]">Výsledky byly sčítány ve vašem obvodu; mapa států se zobrazuje u prezidentských voleb.</p>
        )}
        <button
          onClick={zavreni}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-amber-500 to-teal-500 py-3 text-base font-bold text-[#241a05] shadow-lg transition-all hover:from-amber-400 hover:to-teal-400"
        >
          Pokračovat
        </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Chat se štábem (hlavní ovládání)
 * ============================================================ */

interface ProvedenaAkceVChatu {
  nazev: string;
  ok: boolean;
  zprava: string;
}

interface ChatZprava {
  role: "hrac" | "ai" | "system";
  text: string;
  akce?: ProvedenaAkceVChatu[];
  varovani?: string[];
  poznamka?: string | null;
  seznam?: string[];
}

interface AiNastaveni {
  klic: string;
  model: string;
}

const KLIC_STORAGE_HRA = "politicky-sim-save";
const KLIC_STORAGE_AI = "politicky-sim-ai";
const KLIC_STORAGE_CHAT = "politicky-sim-chat";
const MODELY = ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"];

/* ============================================================
 * Hlavní aplikace
 * ============================================================ */

export default function App() {
  const [hra, setHra] = useState<GameState | null>(null);
  const [chat, setChat] = useState<ChatZprava[]>([]);
  const [vstup, setVstup] = useState("");
  const [ceka, setCeka] = useState(false);
  const [ai, setAi] = useState<AiNastaveni>({ klic: "", model: "mistral-small-latest" });
  const [nastaveniOtevreno, setNastaveniOtevreno] = useState(false);
  const [modalAkce, setModalAkce] = useState<string | null>(null);
  const [formular, setFormular] = useState<Record<string, string>>({});
  const [volebniData, setVolebniData] = useState<VolebniData | null>(null);
  const [hledani, setHledani] = useState("");
  const [hledaniHistorie, setHledaniHistorie] = useState("");
  const [stavKlice, setStavKlice] = useState<{ stav: "idne" | "kontrola" | "ok" | "chyba"; zprava: string }>({ stav: "idne", zprava: "" });
  const konecChatu = useRef<HTMLDivElement | null>(null);

  /* Načtení uložené hry a nastavení AI */
  useEffect(() => {
    try {
      const ulozene = window.localStorage.getItem(KLIC_STORAGE_HRA);
      if (ulozene) {
        const s = JSON.parse(ulozene) as GameState;
        if (s && s.saveVersion === 1) {
          setHra(s);
          /* Načtená hra bez uloženého chatu by nezobrazila nic —
           * proto vždy existuje úvodní zpráva štábu. */
          let ulozenyChat: ChatZprava[] | null = null;
          try {
            const c = window.localStorage.getItem(KLIC_STORAGE_CHAT);
            if (c) {
              const parsed = JSON.parse(c) as ChatZprava[];
              if (Array.isArray(parsed) && parsed.length > 0) ulozenyChat = parsed;
            }
          } catch {
            /* poškozené uložení chatu ignorujeme */
          }
          setChat(ulozenyChat ?? [{ role: "system", text: `Vítejte zpět, ${s.postava.jmeno}. Kronika se otevírá tam, kde jste přestali — vaše kampaň byla obnovena z uložení. Napište záměr, otázku, nebo se herního mistra prostě zeptejte na svět.` }]);
        }
      }
      const n = window.localStorage.getItem(KLIC_STORAGE_AI);
      if (n) setAi(JSON.parse(n) as AiNastaveni);
    } catch {
      /* localStorage nedostupný — hra poběží bez uložení */
    }
  }, []);

  /* Autosave chatu (posledních 60 zpráv) */
  useEffect(() => {
    if (chat.length === 0) return;
    try {
      window.localStorage.setItem(KLIC_STORAGE_CHAT, JSON.stringify(chat.slice(-60)));
    } catch {
      /* ignorujeme */
    }
  }, [chat]);

  /* Autosave */
  useEffect(() => {
    if (!hra) return;
    try {
      window.localStorage.setItem(KLIC_STORAGE_HRA, JSON.stringify(hra));
    } catch {
      /* ignorujeme */
    }
  }, [hra]);

  useEffect(() => {
    konecChatu.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, ceka]);

  function ulozAi(n: AiNastaveni) {
    setAi(n);
    setStavKlice({ stav: "idne", zprava: "" });
    try {
      window.localStorage.setItem(KLIC_STORAGE_AI, JSON.stringify(n));
    } catch {
      /* ignorujeme */
    }
  }

  function start(p: { jmeno: string; vek: number; archetyp: string; stat: string; seed: number }) {
    const s = vytvorNovouHru({
      seed: p.seed,
      jmeno: p.jmeno,
      vek: p.vek,
      archetyp: p.archetyp,
      rodneMistoUS: true,
      naturalizovany: false,
      zivotopisText: "Prolog.",
      domovskyStat: p.stat,
    });
    setHra(s);
    setChat([
      {
        role: "system",
        text: "Herní mistr usedá ke stolu a otevírá Dračí doupě americké politiky. Jste na začátku dobrodružství: outsider se jménem, snem a prázdnou pokladnou. Napište, čeho chcete tento týden dosáhnout — herní mistr převede váš záměr do konkrétních akcí enginu. Příklady: „Zvedni mi známost ve městě a něco vydělej“, „Založ volební výbor a zajisti první dary“, „Kdo mi ve městě škodí a proč?“",
      },
    ]);
  }

  function novaHra() {
    try {
      window.localStorage.removeItem(KLIC_STORAGE_HRA);
      window.localStorage.removeItem(KLIC_STORAGE_CHAT);
    } catch {
      /* ignorujeme */
    }
    setHra(null);
    setChat([]);
  }

  function cloneStav(s: GameState): GameState {
    return JSON.parse(JSON.stringify(s)) as GameState;
  }

  /* --- Ověření API klíče Mistral (integrace pro GitHub Pages) --- */
  async function overKlic() {
    if (!ai.klic) {
      setStavKlice({ stav: "chyba", zprava: "Nejprve vložte klíč z console.mistral.ai." });
      return;
    }
    setStavKlice({ stav: "kontrola", zprava: "Ověřuji klíč…" });
    try {
      const res = await fetch("https://api.mistral.ai/v1/models", { headers: { Authorization: `Bearer ${ai.klic}` } });
      if (res.ok) {
        const data = (await res.json()) as { data?: { id?: string }[] };
        const pocet = data.data?.length ?? 0;
        setStavKlice({ stav: "ok", zprava: `Klíč je platný — štáb odpovídá přes Mistral AI (${pocet} modelů k dispozici).` });
        setChat((c) => [...c, { role: "system", text: "Herní mistr (Mistral AI) usedá ke stolu. Napište záměr, položte otázku, nebo si jen popovídejte — odpoví vyprávěním a záměry převede do herních akcí." }]);
      } else if (res.status === 401) {
        setStavKlice({ stav: "chyba", zprava: "Klíč není platný (401) — zkontrolujte správnost." });
      } else if (res.status === 429) {
        setStavKlice({ stav: "chyba", zprava: "Překročen limit požadavků (429) — zkuste to za chvíli." });
      } else {
        setStavKlice({ stav: "chyba", zprava: `Služba odpověděla HTTP ${res.status}.` });
      }
    } catch {
      setStavKlice({ stav: "chyba", zprava: "Spojení se nezdařilo — zkontrolujte připojení k internetu." });
    }
  }

  /* --- AI chat: odeslání zprávy --- */
  async function odesli() {
    const text = vstup.trim();
    if (!text || ceka || !hra) return;
    setVstup("");

    if (!ai.klic) {
      /* Místní poradce štábu — hra je plně hratelná bez API klíče. */
      setChat((c) => [...c, { role: "hrac", text }]);
      const ns = cloneStav(hra);
      const poradce = sestavPlanBezAi(text, ns);
      const vysledek = provedPlan(ns, poradce.plan);
      setHra(ns);
      const akceVChatu: ProvedenaAkceVChatu[] = vysledek.provedeno.map((p) => ({
        nazev: p.akce,
        ok: p.ok,
        zprava: p.zprava,
      }));
      const varovani = vysledek.provedeno.flatMap((p) => p.varovani);
      setChat((c) => [
        ...c,
        {
          role: "ai",
          text: poradce.plan.reci,
          akce: akceVChatu,
          varovani: varovani.length > 0 ? varovani : undefined,
          poznamka: poradce.rozbor.join(" ") || null,
        },
      ]);
      return;
    }

    setChat((c) => [...c, { role: "hrac", text }]);
    setCeka(true);

    const ns = cloneStav(hra);
    const historie = chat
      .filter((m) => m.role === "hrac" || m.role === "ai")
      .slice(-8)
      .map((m) => ({ role: m.role === "hrac" ? ("user" as const) : ("assistant" as const), content: m.text }));

    const zpravy = [
      { role: "system", content: systemovyPrompt(ns) + "\n" + stavProAi(ns) },
      ...historie,
      { role: "user", content: text },
    ];

    try {
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ai.klic}` },
        body: JSON.stringify({ model: ai.model, messages: zpravy, temperature: 0.6, max_tokens: 1400 }),
      });
      if (!res.ok) {
        const detail = res.status === 401 ? "Neplatný API klíč." : res.status === 429 ? "Překročen limit požadavků." : `HTTP ${res.status}.`;
        throw new Error(detail);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const obsah = data.choices?.[0]?.message?.content ?? "";

      const parse = parsujPlan(obsah, ns);
      if (!parse.ok || !parse.plan) {
        setChat((c) => [...c, { role: "system", text: `Odpověď AI nešla převést do herního plánu: ${parse.chyby.join(" ")} Zkuste záměr napsat konkrétněji.` }]);
        setCeka(false);
        return;
      }

      const vysledek = provedPlan(ns, parse.plan);
      setHra(ns);

      const akceVChatu: ProvedenaAkceVChatu[] = vysledek.provedeno.map((p) => ({
        nazev: p.akce,
        ok: p.ok,
        zprava: p.zprava,
      }));
      const varovani = vysledek.provedeno.flatMap((p) => p.varovani);
      const poznamka = [
        parse.vyrazeno.length > 0 ? `Vyřazeno (nedostupné akce nebo nedostatek AP): ${parse.vyrazeno.join(", ")}` : null,
        vysledek.udalostZprava,
        parse.chyby.length > 0 ? `Upozornění validátoru: ${parse.chyby.join(" ")}` : null,
      ]
        .filter(Boolean)
        .join(" ");

      setChat((c) => [
        ...c,
        {
          role: "ai",
          text: parse.plan.reci || "Plán byl proveden.",
          akce: akceVChatu,
          varovani: varovani.length > 0 ? varovani : undefined,
          poznamka: poznamka || null,
        },
      ]);
    } catch (e) {
      setChat((c) => [
        ...c,
        { role: "system", text: `Herní mistr mlčí: ${(e as Error).message} Zkontrolujte API klíč v nastavení AI. Bez klíče přebírá vyprávění místní vypravěč — stačí klíč vymazat.` },
      ]);
    }
    setCeka(false);
  }

  /* --- Ruční akce --- */
  function provedAkci(id: string, parametry: Record<string, unknown> = {}) {
    if (!hra) return;
    const ns = cloneStav(hra);
    const vysledek = applyPlayerAction(ns, id, parametry);
    setHra(ns);
    setChat((c) => [
      ...c,
      { role: "system", text: `${vysledek.ok ? "Provedeno" : "Odmítnuto"} (ruční akce ${id}): ${vysledek.zprava}${vysledek.varovani.length > 0 ? " — " + vysledek.varovani.join(" ") : ""}` },
    ]);
    setModalAkce(null);
  }

  function otevriAkci(id: string) {
    const spec = PARAM_SPEC[id];
    if (!spec || spec.length === 0) {
      provedAkci(id);
      return;
    }
    const vychozi: Record<string, string> = {};
    for (const pol of spec) {
      vychozi[pol.klic] = String(pol.vychozi ?? pol.volby?.[0]?.hodnota ?? "");
    }
    if (id === "splnit_slib" && hra) {
      PARAM_SPEC.splnit_slib[0].volby = hra.sliby.filter((x) => x.stav === "v_progressu").map((x) => ({ hodnota: x.id, label: `${x.text} (lhůta kolo ${x.lhutaKolo})` }));
    }
    if (id === "konverzace" && hra) {
      PARAM_SPEC.konverzace[0].volby = hra.npc.map((n) => ({ hodnota: n.id, label: `${n.jmeno} (${n.role}, vztah ${n.vztah})` }));
    }
    setFormular(vychozi);
    setModalAkce(id);
  }

  function odesliModal(id: string) {
    const spec = PARAM_SPEC[id] ?? [];
    const parametry: Record<string, unknown> = {};
    for (const pol of spec) {
      const hodnota = formular[pol.klic] ?? "";
      if (hodnota === "") continue;
      if (pol.typ === "number") {
        const n = Number(hodnota);
        if (Number.isFinite(n)) parametry[pol.klic] = n;
      } else {
        parametry[pol.klic] = hodnota;
      }
    }
    provedAkci(id, parametry);
  }

  function ukonciKolo() {
    if (!hra) return;
    const ns = cloneStav(hra);
    const souhrn = endTurn(ns);
    setHra(ns);
    setChat((c) => [
      ...c,
      {
        role: "system",
        text: `Týden ${souhrn.tyden} roku ${souhrn.rok} skončil — přehled událostí:`,
        seznam: souhrn.zpravy.length > 0 ? souhrn.zpravy : ["Klidný týden bez zásadních událostí."],
      },
    ]);
    if (souhrn.volbyProbehly) {
      const volbyDenik = [...ns.denik].reverse().find((e) => e.typ === "volby");
      const d = volbyDenik?.data as Partial<VolebniData> | undefined;
      if (d && d.typ !== undefined) {
        setVolebniData({
          typ: d.typ,
          cil: d.cil ?? "radni",
          vyhral: d.vyhral ?? false,
          share: d.share ?? 0,
          detail: d.detail ?? null,
        });
      }
    }
  }

  const akce = useMemo(() => (hra ? dostupneAkce(hra.funkce.uroven) : []), [hra]);
  const brance = useMemo(() => (hra ? vyhodnotBranci(hra) : null), [hra]);
  const zakony = useMemo(() => hledejZakony(hledani).slice(0, 40), [hledani]);
  const historickeZakony = useMemo(() => hledejRealneZakony(hledaniHistorie), [hledaniHistorie]);
  const navrhy = useMemo(() => (hra ? navrhyZameru(hra) : []), [hra]);
  const briefinkyStavu = useMemo(() => (hra ? sestavBriefinky(hra, brance) : []), [hra, brance]);

  if (!hra) {
    return (
      <div className="min-h-screen bg-[#16110a]">
        <div className="flex h-1.5">
          <div className="flex-1 bg-sky-700" />
          <div className="flex-1 bg-slate-200" />
          <div className="flex-1 bg-rose-700" />
        </div>
        <Prolog onStart={start} />
      </div>
    );
  }

  const a = hra.postava.atributy;
  const indexUrovne = PORADI_UROVNI.indexOf(hra.funkce.uroven);
  const cilBrance = BRANCE[KLICE_BRANCE[Math.min(indexUrovne + 1, KLICE_BRANCE.length - 1)]];

  return (
    <div className="min-h-screen bg-[#16110a] pb-10">
      {/* Trikolóra — vizuální motiv volebního vysílání */}
      <div className="flex h-1.5">
        <div className="flex-1 bg-sky-700" />
        <div className="flex-1 bg-slate-200" />
        <div className="flex-1 bg-rose-700" />
      </div>
      {/* Kompaktní hlavička */}
      <header className="sticky top-0 z-40 border-b border-[#33270f] bg-[#16110a]/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2.5">
            <Monogram jmeno={hra.postava.jmeno} uroven={hra.funkce.uroven} />
            <div>
              <div className="text-sm font-bold leading-tight text-white">{hra.postava.jmeno}</div>
              <div className="text-[11px] text-[#b6a780]">
                {NAZVY_UROVNI[hra.funkce.uroven]} · kolo {hra.kolo} · týden {hra.tyden}/{hra.rok}
              </div>
            </div>
          </div>
          <div className="text-xs text-[#d9cbab]">
            Kampaň <span className="font-bold text-amber-400">{usd(hra.finance.pokladnaKampane)}</span>
            <span className="mx-1 text-[#6f604a]">|</span>
            Majetek <span className="font-bold text-white">{usd(a.majetekUSD)}</span>
            {hra.beziKampan.typZavodu && (
              <span className="ml-3 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                {hra.tyden < TYDEN_PRIMAREK
                  ? `Do primárek ${TYDEN_PRIMAREK - hra.tyden} týdnů`
                  : hra.tyden < TYDEN_VOLEB
                    ? `Do voleb ${TYDEN_VOLEB - hra.tyden} týdnů`
                    : "Volební týden"}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span
              className={`hidden rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide sm:inline-block ${
                ai.klic ? "bg-amber-900/70 text-amber-200" : "bg-sky-900/70 text-sky-200"
              }`}
              title={ai.klic ? "Vyprávění a záměry vede Mistral AI" : "Bez klíče: vypráví a překládá záměry deterministický místní vypravěč"}
            >
              {ai.klic ? "Herní mistr: Mistral AI" : "Herní mistr: místní vypravěč"}
            </span>
            <span className="text-[11px] uppercase tracking-wide text-[#b6a780]">AP</span>
            <ApDots ap={hra.ap} max={10} />
            <button
              onClick={ukonciKolo}
              className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold text-[#241a05] shadow-md transition-all hover:from-amber-400 hover:to-orange-400"
            >
              Ukončit kolo
            </button>
            <button onClick={() => setNastaveniOtevreno((o) => !o)} className="rounded-lg bg-[#2a2013] px-3 py-2 text-sm font-semibold text-[#eadfc2] transition-colors hover:bg-[#3a2c16]" title="Nastavení AI">
              AI
            </button>
            <button onClick={novaHra} className="rounded-lg bg-[#2a2013] px-3 py-2 text-sm font-semibold text-[#b6a780] transition-colors hover:bg-[#3a2c16]" title="Začít novou hru (smaže uložení)">
              Nová hra
            </button>
          </div>
        </div>
        {nastaveniOtevreno && (
          <div className="mx-auto mt-2 max-w-6xl rounded-xl border border-[#4d3b1d] bg-[#2a2013]/80 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm text-[#d9cbab]">
                API klíč Mistral (console.mistral.ai)
                <input
                  type="password"
                  className="mt-1 w-full rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
                  placeholder="vložte klíč"
                  value={ai.klic}
                  onChange={(e) => ulozAi({ ...ai, klic: e.target.value })}
                />
              </label>
              <label className="text-sm text-[#d9cbab]">
                Model
                <select
                  className="mt-1 w-full rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
                  value={ai.model}
                  onChange={(e) => ulozAi({ ...ai, model: e.target.value })}
                >
                  {MODELY.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-xs text-[#b6a780] sm:col-span-1 self-end">
                Klíč se ukládá pouze do vašeho prohlížeče (localStorage). Bez klíče překládá záměry místní poradce štábu; AI navrhuje plán, engine jej vždy validuje a vykonává.
                <button
                  onClick={overKlic}
                  className="mt-2 w-full rounded-lg border border-amber-500/60 px-3 py-1.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/10"
                >
                  {stavKlice.stav === "kontrola" ? "Ověřuji…" : "Ověřit klíč Mistral"}
                </button>
                {stavKlice.zprava && (
                  <p className={`mt-1 rounded px-2 py-1 text-[11px] ${stavKlice.stav === "ok" ? "bg-amber-900/50 text-amber-200" : stavKlice.stav === "chyba" ? "bg-rose-900/50 text-rose-200" : "bg-[#1e170d]/60 text-[#d9cbab]"}`}>
                    {stavKlice.zprava}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto mt-4 grid max-w-6xl grid-cols-1 gap-4 px-4 lg:grid-cols-3">
        {/* Hlavní panel: chat se štábem */}
        <section className="lg:col-span-2">
          {hra.udalosti.length > 0 && (() => {
            const u = hra.udalosti[hra.udalosti.length - 1];
            return (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#6b4f26]/60 bg-gradient-to-r from-[#2a2013]/90 to-[#1e170d]/80 px-3 py-2 shadow-md">
                <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#241a05]">Zpravodajství</span>
                <span className="truncate text-xs text-[#d9cbab]">
                  <b className="text-white">{u.nazev}.</b> {u.popis}
                </span>
              </div>
            );
          })()}
          {briefinkyStavu.length > 0 && (
            <Karta className="mb-3 border-l-4 border-l-amber-400">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
                <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#241a05]">Týden</span>
                Vyprávění u stolu — co řešit tento týden
              </h3>
              <div className="space-y-2">
                {briefinkyStavu.map((b) => (
                  <div key={b.titulek} className="flex flex-col gap-1.5 rounded-lg bg-[#1e170d]/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="mr-2 rounded bg-[#3a2c16] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#eadfc2]">{b.titulek}</span>
                      <span className="text-xs text-[#d9cbab]">{b.text}</span>
                    </div>
                    {b.zamer && (
                      <button
                        onClick={() => setVstup(b.zamer as string)}
                        className="shrink-0 rounded-lg border border-amber-500/60 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/10"
                      >
                        Zapsat do chatu
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Karta>
          )}
          <Karta className="flex h-[32rem] flex-col p-0">
            <div className="flex items-center justify-between border-b border-[#4d3b1d] px-4 py-2.5">
              <span className="text-sm font-bold text-[#f2e8cf]">Rozhovor s herním mistrem</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#b6a780]">Vyprávění · záměry · otázky</span>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {chat.length === 0 && !ceka && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm font-semibold text-[#d9cbab]">Herní mistr čeká na vaše slovo.</p>
                  <p className="max-w-sm text-xs text-[#918059]">Napište do pole níže záměr, otázku či rozmluvu — například „Zajisti mi sponzory a zvedni známost“ nebo „Kdo mi škodí ve městě?“. Herní mistr odpoví vyprávěním a záměr převede do herních akcí.</p>
                </div>
              )}
              {chat.map((m, i) => (
                <div key={i} className={m.role === "hrac" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 text-sm shadow-md ${
                      m.role === "hrac"
                        ? "rounded-2xl rounded-br-sm bg-gradient-to-br from-amber-500 to-yellow-700 text-[#2a1c05]"
                        : m.role === "ai"
                          ? "rounded-2xl rounded-tl-sm border border-[#6b4f26]/60 bg-[#3a2c16]/90 text-[#f2e8cf]"
                          : "rounded-xl border-l-4 border-l-amber-500 bg-amber-900/30 text-amber-100"
                    }`}
                  >
                    {m.role === "ai" && (
                      <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-amber-400">Herní mistr</p>
                    )}
                    {m.role === "hrac" && (
                      <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-[#4d3b1d]">Hrdina</p>
                    )}
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.akce && m.akce.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {m.akce.map((p, j) => (
                          <li key={j} className={`rounded-lg px-2 py-1 text-xs ${p.ok ? "bg-amber-900/50 text-amber-200" : "bg-rose-900/50 text-rose-200"}`}>
                            {p.ok ? "✓" : "✕"} {p.nazev}: {p.zprava}
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.varovani && m.varovani.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {m.varovani.map((w, j) => (
                          <li key={j} className="text-[11px] text-amber-300">
                            ⚠ {w}
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.poznamka && <p className="mt-1 text-[11px] text-[#b6a780]">{m.poznamka}</p>}
                    {m.seznam && m.seznam.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {m.seznam.map((z, j) => (
                          <li key={j} className="rounded-lg bg-[#1e170d]/60 px-2 py-1 text-xs text-[#d9cbab]">
                            • {z}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
              {ceka && (
                <div className="flex justify-start">
                  <div className="rounded-xl bg-[#3a2c16] px-3.5 py-2.5 text-sm text-[#d9cbab]">Herní mistr naslouchá a přemítá…</div>
                </div>
              )}
              <div ref={konecChatu} />
            </div>
            <div className="border-t border-[#4d3b1d] p-3">
              {chat.filter((m) => m.role === "hrac").length === 0 && navrhy.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {navrhy.map((n) => (
                    <button
                      key={n}
                      onClick={() => setVstup(n)}
                      className="rounded-full border border-[#6b4f26] bg-[#1e170d] px-3 py-1 text-[11px] text-[#d9cbab] transition-colors hover:border-amber-400 hover:text-white"
                      title="Kliknutím vyplníte záměr do pole níže"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                  placeholder="Záměr, otázka, nebo rozmluva s herním mistrem… (např. „zajisti mi sponzory a zvedni známost“)"
                  value={vstup}
                  onChange={(e) => setVstup(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      odesli();
                    }
                  }}
                />
                <button
                  onClick={odesli}
                  disabled={ceka || vstup.trim().length === 0}
                  className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-[#241a05] transition-colors hover:bg-amber-400 disabled:opacity-40"
                >
                  {ceka ? "…" : "Odeslat"}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-[#918059]">
                Herní mistr převede záměr do akcí enginu (rozpočet {hra.ap} AP) a na dotazy odpovídá vyprávěním; vše zůstává deterministické a replaovatelné.
              </p>
            </div>
          </Karta>

          {/* Ruční akce — sekundární ovládání, seskupené dle oblastí */}
          <details className="mt-4 rounded-2xl border border-[#4d3b1d]/70 bg-[#2a2013]/70 p-4 shadow-lg">
            <summary className="cursor-pointer text-sm font-bold text-white">Ruční akce (bez AI)</summary>
            <div className="mt-3 space-y-4">
              {PORADI_SKUPIN.map((skupina) => {
                const defsSkupiny = akce.filter((def) => skupinaAkce(def.id) === skupina);
                if (defsSkupiny.length === 0) return null;
                return (
                  <div key={skupina}>
                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#b6a780]">{skupina}</h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {defsSkupiny.map((def) => {
                        const zaostava = hra.ap < def.ap;
                        const tridaAp = def.ap >= 5 ? "bg-rose-900/70 text-rose-200" : def.ap >= 3 ? "bg-amber-900/70 text-amber-200" : "bg-sky-900/70 text-sky-200";
                        return (
                          <button
                            key={def.id}
                            disabled={zaostava}
                            onClick={() => otevriAkci(def.id)}
                            className={`rounded-xl border p-3 text-left transition-all ${
                              zaostava
                                ? "border-[#33270f] bg-[#1e170d]/50 opacity-50"
                                : "border-[#4d3b1d] bg-[#1e170d]/60 hover:-translate-y-0.5 hover:border-amber-500 hover:shadow-lg hover:shadow-amber-500/10"
                            }`}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-bold text-white">{def.nazev}</span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tridaAp}`}>{def.ap} AP</span>
                            </div>
                            <p className="mt-0.5 text-[11px] text-[#b6a780]">{def.popis}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>

          {/* Archiv: kodex, sliby, lidé, deník */}
          <details className="mt-4 rounded-2xl border border-[#4d3b1d]/70 bg-[#2a2013]/70 p-4 shadow-lg">
            <summary className="cursor-pointer text-sm font-bold text-white">Kronika — kodex, sliby, lidé, deník</summary>
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="mb-2 text-sm font-bold text-white">Kodex zákonů</h3>
                <input
                  className="mb-2 w-full rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                  placeholder="Fulltextové hledání (např. „30116“, „buckley“, „dodatek“)…"
                  value={hledani}
                  onChange={(e) => setHledani(e.target.value)}
                />
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {zakony.map((z) => (
                    <details key={z.id} className="rounded-lg bg-[#1e170d]/60 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-white">
                        {z.citace} — {z.nazev}
                      </summary>
                      <p className="mt-2 text-[11px] text-[#d9cbab]">{z.shrnuti}</p>
                      <p className="mt-1 text-[11px] text-amber-200">Ve hře: {z.efektyVeHre.join("; ")}</p>
                    </details>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-1 text-sm font-bold text-white">Historické zákony USA</h3>
                <p className="mb-2 text-[11px] text-[#b6a780]">Skutečné zákony se skutečnými výsledky hlasování — jako inspirace pro vaši legislativu. Údaje ověřeny vůči Kongresu a veřejným zdrojům.</p>
                <input
                  className="mb-2 w-full rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                  placeholder="Hledat v historii (např. „čipy“, „daně“, „2017“)…"
                  value={hledaniHistorie}
                  onChange={(e) => setHledaniHistorie(e.target.value)}
                />
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {historickeZakony.length === 0 && <p className="text-[11px] text-[#b6a780]">Nic nenalezeno — zkuste jiné slovo, diakritika nevadí.</p>}
                  {historickeZakony.map((z) => (
                    <details key={z.id} className="rounded-lg bg-[#1e170d]/60 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-white">
                        {z.rokSchvaleni} — {z.titul}{" "}
                        <span className="ml-1 rounded bg-[#3a2c16] px-1.5 py-0.5 text-[10px] font-bold text-[#eadfc2]">{NAZVY_NAKLONU[z.ideologickySklon] ?? z.ideologickySklon}</span>
                      </summary>
                      <p className="mt-2 text-[11px] text-[#d9cbab]">{z.shrnuti}</p>
                      <p className="mt-1 text-[11px] text-[#b6a780]">
                        {z.oficTitul} · náklady {z.nakladyMldUSD.toLocaleString("cs-CZ")} mld. $ · Senát {z.senatHlasy} · Sněmovna {z.snemovnaHlasy}
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-[#b6a780]">
                        {z.klicovaUstanoveni.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                      <p className="mt-1 text-[11px] text-amber-200/80">{z.dopad}</p>
                      <p className="mt-1 text-[10px] text-[#918059]">Zdroje: {z.zdroje.join(" · ")}</p>
                    </details>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold text-white">Nejvyšší soud USA (SCOTUS)</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {SCOTUS_SOUDCI.map((s) => (
                    <div key={s.jmeno} className="rounded-lg bg-[#1e170d]/60 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-white">{s.jmeno}</span>
                        <span className="shrink-0 rounded bg-[#3a2c16] px-1.5 py-0.5 text-[10px] font-bold text-[#eadfc2]">
                          {s.ideologie === "konzervativni" ? "konzervativní" : "liberální"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-[#b6a780]">
                        {s.filozofie === "textualismus_a_originalismus" ? "textualismus/originalismus" : "živá ústava/pragmatismus"} · {s.jmenovan}
                      </p>
                      <p className="mt-1 text-[10px] text-[#918059]">{s.bio}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-bold text-white">Smlouvy s voliči — sliby</h3>
                  {hra.sliby.length === 0 && <p className="text-[11px] text-[#b6a780]">Žádné sliby. Sliby zavazují na 52 kol.</p>}
                  {hra.sliby.map((s) => (
                    <div key={s.id} className="mb-1.5 rounded-lg bg-[#1e170d]/60 px-3 py-1.5 text-[11px] text-[#d9cbab]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span>{s.text}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            s.stav === "splnen" ? "bg-amber-900/60 text-amber-200" : s.stav === "porusen" ? "bg-rose-900/60 text-rose-200" : "bg-amber-900/60 text-amber-200"
                          }`}
                        >
                          {s.stav === "splnen" ? "splněn" : s.stav === "porusen" ? "porušen" : `lhůta ${s.lhutaKolo}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-bold text-white">Lidé kolem vás</h3>
                  {hra.npc.map((n) => (
                    <div key={n.id} className="mb-1.5 rounded-lg bg-[#1e170d]/60 px-3 py-1.5">
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="font-semibold text-white">{n.jmeno}</span>
                        <span className="text-[#b6a780]">{n.role} · vztah {n.vztah}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold text-white">Deník</h3>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {[...hra.denik].reverse().slice(0, 25).map((e, i) => (
                    <div key={i} className="rounded-lg bg-[#1e170d]/60 px-3 py-1.5 text-[11px] text-[#d9cbab]">
                      <span className={`mr-2 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${e.typ === "pravni" ? "bg-rose-900/60 text-rose-200" : e.typ === "volby" ? "bg-sky-900/60 text-sky-200" : e.typ === "udalost" ? "bg-amber-900/60 text-amber-200" : "bg-[#3a2c16] text-[#eadfc2]"}`}>
                        {e.typ}
                      </span>
                      {(() => {
                        const d = e.data as { zprava?: string; akce?: string; popis?: string; nazev?: string };
                        return String(d.zprava ?? d.popis ?? `${d.nazev ? d.nazev + ": " : ""}${d.akce ?? ""}`).slice(0, 200);
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </section>

        {/* Postranní panel: brance a ukazatele */}
        <section className="space-y-4">
          <Karta>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
              <span className="inline-block h-3.5 w-1 rounded bg-amber-400" />
              Kariérní brance — cíl: {NAZVY_UROVNI[cilBrance.cilovaUroven]}
            </h3>
            <Pruh
              label="Pokladna kampaně"
              hodnota={(hra.finance.pokladnaKampane / cilBrance.pokladnaKampan) * 100}
              barva={hra.finance.pokladnaKampane >= cilBrance.pokladnaKampan ? "zelena" : "zluta"}
              zprava={`${usd(hra.finance.pokladnaKampane)} / ${usd(cilBrance.pokladnaKampan)}`}
            />
            <Pruh label={`Známost ve státě (≥ ${cilBrance.znamostStat} %)`} hodnota={a.znamostStat} barva={skala(a.znamostStat, cilBrance.znamostStat * 0.5, cilBrance.znamostStat, true)} />
            <Pruh label={`Sociální kapitál (≥ ${cilBrance.socialniKapital})`} hodnota={a.socialniKapital} barva={skala(a.socialniKapital, cilBrance.socialniKapital * 0.5, cilBrance.socialniKapital, true)} />
            <Pruh label={`Etika (≥ ${cilBrance.etika})`} hodnota={a.etika * 10} barva={skala(a.etika * 10, cilBrance.etika * 5, cilBrance.etika * 10, true)} zprava={`${a.etika} / 10`} />
            {brance?.splneno ? (
              <p className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">Brance splněna — můžete vyhlásit kandidaturu.</p>
            ) : (
              brance && (
                <ul className="mt-1 space-y-0.5">
                  {brance.chybejici.map((c, i) => (
                    <li key={i} className="text-[10px] text-amber-300">
                      Chybí: {c}
                    </li>
                  ))}
                </ul>
              )
            )}
          </Karta>

          <Karta>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
              <span className="inline-block h-3.5 w-1 rounded bg-sky-400" />
              Osobní ukazatele
            </h3>
            <Pruh label="Známost lokální / ve státě / národní" hodnota={Math.max(a.znamostLokal, a.znamostStat, a.znamostNarod)} barva={skala(Math.max(a.znamostLokal, a.znamostStat), 20, 45, true)} zprava={`${Math.round(a.znamostLokal)} / ${Math.round(a.znamostStat)} / ${Math.round(a.znamostNarod)}`} />
            <Pruh label="Integrita" hodnota={a.integrita} barva={skala(a.integrita, 40, 65, true)} />
            <Pruh label="Prodejnost (vnímání ovlivnitelnosti)" hodnota={a.prodejnost * 10} barva={skala(a.prodejnost * 10, 60, 30, false)} zprava={`${a.prodejnost} / 10`} />
            <Pruh label="Kriminální riziko" hodnota={hra.pravni.kriminalniRiziko} barva={skala(hra.pravni.kriminalniRiziko, 40, 20, false)} />
            <Pruh label="Riziko FEC auditu" hodnota={hra.pravni.fecAuditRiziko} barva={skala(hra.pravni.fecAuditRiziko, 40, 20, false)} />
            {hra.pravni.vysetrovani.length > 0 && (
              <p className="mt-1 rounded bg-rose-900/40 px-2 py-1 text-[11px] text-rose-200">
                Vyšetřování: {hra.pravni.vysetrovani[0].tema} (intenzita {Math.round(hra.pravni.vysetrovani[0].intenzita * 100)} %)
              </p>
            )}
          </Karta>

          <Karta>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
              <span className="inline-block h-3.5 w-1 rounded bg-rose-400" />
              Makro USA a město
            </h3>
            <div className="grid grid-cols-2 gap-1.5 text-sm">
              <Udaj label="HDP růst" hodnota={`${hra.macro.hdpRust} %`} barva={skala(hra.macro.hdpRust, 1, 2, true)} />
              <Udaj label="Inflace" hodnota={`${hra.macro.inflace} %`} barva={skala(hra.macro.inflace, 5, 3, false)} />
              <Udaj label="Nezaměstnanost" hodnota={`${hra.macro.nezamestnanost} %`} barva={skala(hra.macro.nezamestnanost, 5.5, 4.8, false)} />
              <Udaj label="Fed sazba" hodnota={`${hra.macro.fedSazba} %`} barva={skala(hra.macro.fedSazba, 8, 5, false)} />
              <Udaj label="Deficit" hodnota={`${hra.macro.deficitPctHDP} % HDP`} barva={skala(hra.macro.deficitPctHDP, 7, 5, false)} />
              <Udaj label="Dluh" hodnota={`${hra.macro.dluhPctHDP} % HDP`} barva={skala(hra.macro.dluhPctHDP, 120, 100, false)} />
              <Udaj label="Rating" hodnota={hra.macro.rating} barva="zelena" />
              <Udaj label="Spokojenost města" hodnota={`${Math.round(hra.local.spokojenost)} %`} barva={skala(hra.local.spokojenost, 35, 50, true)} />
            </div>
          </Karta>
        </section>
      </main>

      {/* Modální formulář ruční akce */}
      {modalAkce && hra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#16110a]/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#4d3b1d] bg-[#1e170d] p-6">
            <h3 className="mb-4 text-lg font-bold text-white">{akce.find((x) => x.id === modalAkce)?.nazev ?? modalAkce}</h3>
            <div className="space-y-3">
              {(PARAM_SPEC[modalAkce] ?? []).map((pol) => (
                <label key={pol.klic} className="block text-sm text-[#d9cbab]">
                  {pol.label}
                  {pol.typ === "select" ? (
                    <select
                      className="mt-1 w-full rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
                      value={formular[pol.klic] ?? ""}
                      onChange={(e) => setFormular((f) => ({ ...f, [pol.klic]: e.target.value }))}
                    >
                      {(pol.volby ?? []).map((v) => (
                        <option key={v.hodnota} value={v.hodnota}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={pol.typ === "number" ? "number" : "text"}
                      min={pol.min}
                      max={pol.max}
                      className="mt-1 w-full rounded-lg border border-[#6b4f26] bg-[#1e170d] px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
                      value={formular[pol.klic] ?? ""}
                      onChange={(e) => setFormular((f) => ({ ...f, [pol.klic]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => odesliModal(modalAkce)} className="flex-1 rounded-xl bg-amber-500 py-3 font-bold text-[#241a05] transition-colors hover:bg-amber-400">
                Provést
              </button>
              <button onClick={() => setModalAkce(null)} className="flex-1 rounded-xl bg-[#3a2c16] py-3 font-bold text-[#eadfc2] transition-colors hover:bg-[#4d3b1d]">
                Zrušit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Volební noc */}
      {volebniData && <VolebniNoc data={volebniData} zavreni={() => setVolebniData(null)} />}
    </div>
  );
}
