import React, { useEffect, useMemo, useState } from "react";
import {
  ARCHETYPY,
  BRANCE,
  STATY_EV,
  START_NPC,
  vytvorNovouHru,
  applyPlayerAction,
  endTurn,
  dostupneAkce,
  vyhodnotBranci,
  hledejZakony,
  type GameState,
} from "../engine/engine-bundle.ts";

/* ============================================================
 * Pomocné formátování
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

const NAZVY_DOVEDNOSTI: Record<string, string> = {
  diplomacie: "diplomacie",
  retorika: "rétorika",
  finance: "finance",
  vyjednavani: "vyjednávání",
  medialnost: "mediálnost",
};

/* Barevné pravidlo inspirace: zelená vždy znamená „dobře pro vás",
   červená „zle", nezávisle na směru čísla. */
type Barva = "zelena" | "zluta" | "cervena";

function tridaBarvy(b: Barva): string {
  if (b === "zelena") return "bg-emerald-500";
  if (b === "zluta") return "bg-amber-400";
  return "bg-rose-500";
}

function textBarvy(b: Barva): string {
  if (b === "zelena") return "text-emerald-400";
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
 * Mapa USA — dlaždicové rozložení přibližující geografii (11 řádků × 12 sloupců)
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
 * Parametry akcí — jednoduchá deklarativní specifikace formulářů
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
      volby: START_NPC.map((n) => ({ hodnota: n.id, label: `${n.jmeno} (${n.role}, prestiž ${n.prestiz})` })),
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
 * Malé komponenty
 * ============================================================ */

function Monogram({ jmeno, uroven }: { jmeno: string; uroven: string }) {
  const iniciály = jmeno
    .split(" ")
    .filter(Boolean)
    .map((c) => c[0]?.toUpperCase())
    .join("")
    .slice(0, 2) || "US";
  const barvaUrovne: Record<string, string> = {
    outsider: "bg-slate-600",
    kandidat: "bg-teal-700",
    radni: "bg-sky-700",
    starosta: "bg-indigo-700",
    kongresman: "bg-violet-700",
    guverner: "bg-fuchsia-700",
    prezident: "bg-amber-600",
  };
  return (
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white ${barvaUrovne[uroven] ?? "bg-slate-600"}`}>
      {iniciály}
    </div>
  );
}

function ApDots({ ap, max }: { ap: number; max: number }) {
  return (
    <div className="flex items-center gap-1" title={`Akční body: ${ap}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < ap ? "bg-emerald-400" : "bg-slate-600"}`} />
      ))}
    </div>
  );
}

function Pruh({ label, hodnota, barva, zprava }: { label: string; hodnota: number; barva: Barva; zprava?: string }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className={`font-semibold ${textBarvy(barva)}`}>{zprava ?? FORMAT_CISLO.format(hodnota)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full rounded-full ${tridaBarvy(barva)}`} style={{ width: `${Math.max(2, Math.min(100, hodnota))}%` }} />
      </div>
    </div>
  );
}

function Karta({ deti, className }: { deti: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-700 bg-slate-800/70 p-4 ${className ?? ""}`}>{deti}</div>;
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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-black tracking-tight text-white">Politický simulátor USA</h1>
        <p className="mt-2 text-slate-400">Od zakladatele firmy k Bílému domu. Každé kolo je jeden týden.</p>
      </header>

      <Karta className="mb-6">
        <h2 className="mb-4 text-lg font-bold text-white">Kdo vstupuje do politiky?</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-slate-300">
            Jméno
            <input
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
              value={jmeno}
              onChange={(e) => setJmeno(e.target.value)}
            />
          </label>
          <label className="text-sm text-slate-300">
            Věk
            <input
              type="number"
              min={18}
              max={80}
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
              value={vek}
              onChange={(e) => setVek(Number(e.target.value))}
            />
          </label>
          <label className="text-sm text-slate-300">
            Domovský stát
            <select
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
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
          <label className="text-sm text-slate-300">
            Seed (deterministická hra)
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
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
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                vybrany ? "border-emerald-400 bg-emerald-400/10" : "border-slate-700 bg-slate-800/70 hover:border-slate-500"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-bold text-white">{a.nazev}</span>
                <span className={`text-xs font-semibold ${a.ideologie < -2 ? "text-sky-400" : a.ideologie > 2 ? "text-rose-400" : "text-slate-400"}`}>
                  {a.ideologie < -1 ? `levice ${a.ideologie}` : a.ideologie > 1 ? `pravice +${a.ideologie}` : "střed"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{a.popis}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded bg-slate-700 px-1.5 py-0.5 text-slate-200">{usd(a.majetekUSD)}</span>
                <span className="rounded bg-slate-700 px-1.5 py-0.5 text-slate-200">kapitál {a.socialniKapital}</span>
                <span className="rounded bg-slate-700 px-1.5 py-0.5 text-slate-200">etika {a.etika}</span>
                {Object.entries(a.dovednosti).map(([d, h]) => (
                  <span key={d} className="rounded bg-sky-900/60 px-1.5 py-0.5 text-sky-200">
                    {NAZVY_DOVEDNOSTI[d] ?? d} {h}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onStart({ jmeno, vek, archetyp, stat, seed })}
        className="mt-8 w-full rounded-xl bg-emerald-500 py-4 text-lg font-bold text-slate-950 transition-colors hover:bg-emerald-400"
      >
        Začít kariéru
      </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4">
      <div className="max-h-full w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div className="mb-1 flex items-center gap-3">
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-300">Volby</span>
          <h2 className={`text-2xl font-black ${data.vyhral ? "text-emerald-400" : "text-rose-400"}`}>
            {data.vyhral ? "VOLBY VYHRÁNY" : "VOLBY PROHRÁNY"}
          </h2>
        </div>
        <p className="text-slate-400">
          {Math.round(data.share * 100)} % hlasů · cílová funkce: {NAZVY_UROVNI[data.cil] ?? data.cil}
        </p>
        {data.detail ? (
          <>
            <p className="mt-3 text-slate-400">
              Elektorské hlasy: <span className="font-bold text-sky-400">{data.detail.evHrac}</span> :{" "}
              <span className="font-bold text-rose-400">{data.detail.evSouper}</span> (k vítězství je nutných 270)
            </p>
            <div className="mt-4 space-y-1">
              {MAPA_RADKY.map((rada, i) => (
                <div key={i} className="grid grid-cols-12 gap-1">
                  {rada.map((kod, j) => {
                    if (!kod) return <div key={j} className="h-9" />;
                    const vyhral = vysledky[kod];
                    return (
                      <div
                        key={j}
                        title={`${kod}: ${EV_TABULKA[kod]} volitelů`}
                        className={`flex h-9 flex-col items-center justify-center rounded text-[10px] font-bold leading-tight ${
                          vyhral === undefined ? "bg-slate-700 text-slate-300" : vyhral ? "bg-sky-600 text-white" : "bg-rose-600 text-white"
                        }`}
                      >
                        <span>{kod}</span>
                        <span className="text-slate-200">{EV_TABULKA[kod]}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-slate-400">Výsledky byly sčítány ve vašem obvodu; mapa států se zobrazuje u prezidentských voleb.</p>
        )}
        <button
          onClick={zavreni}
          className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-base font-bold text-slate-950 transition-colors hover:bg-emerald-400"
        >
          Pokračovat
        </button>
      </div>
    </div>
  );
}

/* ============================================================
 * Hlavní aplikace
 * ============================================================ */

type Zalozka = "akce" | "inbox" | "kodex" | "sliby";

interface PosledniZprava {
  ok: boolean;
  text: string;
  varovani: string[];
}

export default function App() {
  const [hra, setHra] = useState<GameState | null>(null);
  const [zalozka, setZalozka] = useState<Zalozka>("akce");
  const [posledniZprava, setPosledniZprava] = useState<PosledniZprava | null>(null);
  const [modalAkce, setModalAkce] = useState<string | null>(null);
  const [formular, setFormular] = useState<Record<string, string>>({});
  const [volebniData, setVolebniData] = useState<VolebniData | null>(null);
  const [hledani, setHledani] = useState("");

  /* Načtení uložené hry */
  useEffect(() => {
    try {
      const ulozene = window.localStorage.getItem("politicky-sim-save");
      if (ulozene) {
        const s = JSON.parse(ulozene) as GameState;
        if (s && s.saveVersion === 1) setHra(s);
      }
    } catch {
      /* localStorage nedostupný — hra poběží bez uložení */
    }
  }, []);

  /* Autosave */
  useEffect(() => {
    if (!hra) return;
    try {
      window.localStorage.setItem("politicky-sim-save", JSON.stringify(hra));
    } catch {
      /* ignorujeme */
    }
  }, [hra]);

  function start(p: { jmeno: string; vek: number; archetyp: string; stat: string; seed: number }) {
    const s = vytvorNovouHru({
      seed: p.seed,
      jmeno: p.jmeno,
      vek: p.vek,
      archetyp: p.archetyp,
      rodneMistoUS: true,
      naturalizovany: false,
      zivotopisText: "Prolog — Milník 2.",
      domovskyStat: p.stat,
    });
    setHra(s);
    setPosledniZprava(null);
  }

  function cloneStav(s: GameState): GameState {
    return JSON.parse(JSON.stringify(s)) as GameState;
  }

  function provedAkci(id: string, parametry: Record<string, unknown> = {}) {
    if (!hra) return;
    const ns = cloneStav(hra);
    const vysledek = applyPlayerAction(ns, id, parametry);
    setHra(ns);
    setPosledniZprava({ ok: vysledek.ok, text: vysledek.zprava, varovani: vysledek.varovani });
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
      const volby = hra.sliby.filter((x) => x.stav === "v_progressu").map((x) => ({ hodnota: x.id, label: `${x.text} (lhůta kolo ${x.lhutaKolo})` }));
      PARAM_SPEC.splnit_slib[0].volby = volby;
    }
    if (id === "konverzace" && hra) {
      PARAM_SPEC.konverzace[0].volby = hra.npc.map((n) => ({ hodnota: n.id, label: `${n.jmeno} (${n.role}, prestiž ${n.prestiz}, vztah ${n.vztah})` }));
    }
    setFormular(vychozi);
    setModalAkce(id);
  }

  function odesliModal(id: string) {
    const spec = PARAM_SPEC[id] ?? [];
    const parametry: Record<string, unknown> = {};
    for (const pol of spec) {
      const hodnota = formular[pol.klic] ?? "";
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
    setPosledniZprava(null);
    setZalozka("inbox");
  }

  const akce = useMemo(() => (hra ? dostupneAkce(hra.funkce.uroven) : []), [hra]);
  const brance = useMemo(() => (hra ? vyhodnotBranci(hra) : null), [hra]);
  const zakony = useMemo(() => hledejZakony(hledani).slice(0, 40), [hledani]);

  if (!hra) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Prolog onStart={start} />
      </div>
    );
  }

  const a = hra.postava.atributy;
  const indexUrovne = PORADI_UROVNI.indexOf(hra.funkce.uroven);
  const cilBrance = BRANCE[KLICE_BRANCE[Math.min(indexUrovne + 1, KLICE_BRANCE.length - 1)]];

  return (
    <div className="min-h-screen bg-slate-900 pb-24">
      {/* Hlavička — tři kotvy ReLife: kdo jste, kolik peněz, kolik času */}
      <header className="sticky top-0 z-40 border-b border-slate-700 bg-slate-900/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-3">
            <Monogram jmeno={hra.postava.jmeno} uroven={hra.funkce.uroven} />
            <div>
              <div className="font-bold leading-tight text-white">{hra.postava.jmeno}</div>
              <div className="text-xs text-slate-400">
                {NAZVY_UROVNI[hra.funkce.uroven]} · {hra.postava.domovskyStat} · věk {hra.postava.vek}
              </div>
            </div>
          </div>
          <div className="text-sm text-slate-300">
            <span className="font-bold text-white">Kolo {hra.kolo}</span> · týden {hra.tyden} / {hra.rok}
          </div>
          <div className="text-sm text-slate-300">
            Pokladna <span className="font-bold text-emerald-400">{usd(hra.finance.pokladnaKampane)}</span>
            {hra.finance.vyborZalozen ? "" : <span className="ml-1 rounded bg-amber-500/20 px-1 text-[11px] text-amber-300">bez výboru</span>}
          </div>
          <div className="text-sm text-slate-300">
            Majetek <span className="font-bold text-white">{usd(a.majetekUSD)}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-slate-400">AP</span>
            <ApDots ap={hra.ap} max={10} />
          </div>
        </div>
      </header>

      {/* Novinový pás — zpětná vazba dle inspirace */}
      {posledniZprava && (
        <div className={`mx-auto mt-4 max-w-6xl px-4`}>
          <div className={`rounded-xl border p-4 ${posledniZprava.ok ? "border-emerald-600/50 bg-emerald-500/10" : "border-rose-600/50 bg-rose-500/10"}`}>
            <div className="flex items-start gap-3">
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-300">Lakeside Chronicle</span>
              <p className={`text-sm ${posledniZprava.ok ? "text-emerald-100" : "text-rose-100"}`}>{posledniZprava.text}</p>
            </div>
            {posledniZprava.varovani.length > 0 && (
              <ul className="mt-2 space-y-1">
                {posledniZprava.varovani.map((w, i) => (
                  <li key={i} className="text-xs text-amber-300">
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto mt-4 grid max-w-6xl grid-cols-1 gap-4 px-4 lg:grid-cols-3">
        {/* Levý sloupec: kariéra a brance */}
        <section className="space-y-4">
          <Karta>
            <h3 className="mb-3 font-bold text-white">Kariérní brance</h3>
            <p className="mb-3 text-xs text-slate-400">
              Cíl: <span className="font-semibold text-amber-300">{NAZVY_UROVNI[cilBrance.cilovaUroven]}</span> — dračí doupě, bez prahů nelze kandidovat.
            </p>
            <Pruh
              label="Pokladna kampaně"
              hodnota={(hra.finance.pokladnaKampane / cilBrance.pokladnaKampan) * 100}
              barva={hra.finance.pokladnaKampane >= cilBrance.pokladnaKampan ? "zelena" : "zluta"}
              zprava={`${usd(hra.finance.pokladnaKampane)} / ${usd(cilBrance.pokladnaKampan)}`}
            />
            <Pruh label={`Známost ve státě (≥ ${cilBrance.znamostStat} %)`} hodnota={a.znamostStat} barva={skala(a.znamostStat, cilBrance.znamostStat * 0.5, cilBrance.znamostStat, true)} />
            <Pruh label={`Sociální kapitál (≥ ${cilBrance.socialniKapital})`} hodnota={a.socialniKapital} barva={skala(a.socialniKapital, cilBrance.socialniKapital * 0.5, cilBrance.socialniKapital, true)} />
            <Pruh label={`Etika (≥ ${cilBrance.etika})`} hodnota={a.etika * 10} barva={skala(a.etika * 10, cilBrance.etika * 5, cilBrance.etika * 10, true)} zprava={`${a.etika} / 10`} />
            {brance?.splneno && <p className="mt-2 rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">Brance splněna — můžete vyhlásit kandidaturu.</p>}
            {!brance?.splneno && brance && (
              <ul className="mt-2 space-y-1">
                {brance.chybejici.map((c, i) => (
                  <li key={i} className="text-[11px] text-amber-300">
                    Chybí: {c}
                  </li>
                ))}
              </ul>
            )}
          </Karta>

          <Karta>
            <h3 className="mb-3 font-bold text-white">Makro USA</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
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

        {/* Střed: záložky */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex gap-2">
            {(["akce", "inbox", "kodex", "sliby"] as Zalozka[]).map((z) => (
              <button
                key={z}
                onClick={() => setZalozka(z)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  zalozka === z ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {z === "akce" ? "Akce" : z === "inbox" ? "Inbox kola" : z === "kodex" ? "Kodex zákonů" : "Sliby a lidé"}
              </button>
            ))}
          </div>

          {zalozka === "akce" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {akce.map((def) => {
                const zaostava = hra.ap < def.ap;
                return (
                  <button
                    key={def.id}
                    disabled={zaostava}
                    onClick={() => otevriAkci(def.id)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      zaostava
                        ? "border-slate-800 bg-slate-900/50 opacity-50"
                        : "border-slate-700 bg-slate-800/70 hover:border-emerald-500"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-white">{def.nazev}</span>
                      <span className="shrink-0 rounded-full bg-sky-900/70 px-2 py-0.5 text-xs font-bold text-sky-200">{def.ap} AP</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{def.popis}</p>
                  </button>
                );
              })}
            </div>
          )}

          {zalozka === "inbox" && (
            <div>
              <Karta className="mb-3">
                <h3 className="mb-2 font-bold text-white">Deník — poslední události</h3>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {[...hra.denik].reverse().slice(0, 30).map((e, i) => (
                    <div key={i} className="rounded-lg bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                      <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${e.typ === "pravni" ? "bg-rose-900/60 text-rose-200" : e.typ === "volby" ? "bg-sky-900/60 text-sky-200" : e.typ === "udalost" ? "bg-amber-900/60 text-amber-200" : "bg-slate-700 text-slate-200"}`}>
                        {e.typ}
                      </span>
                      {(() => {
                        const d = e.data as { zprava?: string; akce?: string; popis?: string; nazev?: string };
                        return String(d.zprava ?? d.popis ?? `${d.nazev ? d.nazev + ": " : ""}${d.akce ?? ""}` ?? JSON.stringify(e.data)).slice(0, 220);
                      })()}
                    </div>
                  ))}
                </div>
              </Karta>
              <button
                onClick={ukonciKolo}
                className="w-full rounded-xl bg-amber-500 py-4 text-lg font-bold text-slate-950 transition-colors hover:bg-amber-400"
              >
                Ukončit kolo a postoupit o týden
              </button>
            </div>
          )}

          {zalozka === "kodex" && (
            <Karta>
              <h3 className="mb-3 font-bold text-white">Kodex zákonů</h3>
              <input
                className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none"
                placeholder="Fulltextové hledání (např. „30116“, „buckley“, „dodatek“)…"
                value={hledani}
                onChange={(e) => setHledani(e.target.value)}
              />
              <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                {zakony.map((z) => (
                  <details key={z.id} className="rounded-lg bg-slate-900/60 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-semibold text-white">
                      {z.citace} — {z.nazev}
                    </summary>
                    <p className="mt-2 text-xs text-slate-300">{z.shrnuti}</p>
                    <p className="mt-1 text-xs text-amber-200">Ve hře: {z.efektyVeHre}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Zdroje: {z.zdroje}</p>
                  </details>
                ))}
              </div>
            </Karta>
          )}

          {zalozka === "sliby" && (
            <div className="space-y-3">
              <Karta>
                <h3 className="mb-3 font-bold text-white">Smlouvy s voliči — sliby</h3>
                {hra.sliby.length === 0 && <p className="text-xs text-slate-400">Žádné sliby. Každý slib je závazek s lhůtou jednoho herního roku.</p>}
                {hra.sliby.map((s) => (
                  <div key={s.id} className="mb-2 rounded-lg bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-slate-200">{s.text}</span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          s.stav === "splnen" ? "bg-emerald-900/60 text-emerald-200" : s.stav === "porusen" ? "bg-rose-900/60 text-rose-200" : "bg-amber-900/60 text-amber-200"
                        }`}
                      >
                        {s.stav === "splnen" ? "splněn" : s.stav === "porusen" ? "porušen" : `lhůta kolo ${s.lhutaKolo}`}
                      </span>
                    </div>
                  </div>
                ))}
              </Karta>
              <Karta>
                <h3 className="mb-3 font-bold text-white">Lidé kolem vás</h3>
                {hra.npc.map((n) => {
                  const barvaVztahu = n.vztah >= 2 ? "zelena" : n.vztah <= -2 ? "cervena" : "zluta";
                  return (
                    <div key={n.id} className="mb-3 rounded-lg bg-slate-900/60 px-3 py-2">
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-semibold text-white">{n.jmeno}</span>
                        <span className="text-xs text-slate-400">{n.role} · prestiž {n.prestiz}</span>
                      </div>
                      <Pruh label="Vztah" hodnota={(n.vztah + 10) * 5} barva={barvaVztahu} zprava={`${n.vztah} / 10`} />
                      {n.pamet.length > 0 && <p className="text-[11px] text-slate-500">Paměť: {n.pamet[n.pamet.length - 1]}</p>}
                    </div>
                  );
                })}
              </Karta>
            </div>
          )}
        </section>
      </main>

      {/* Stavové pruhy pod hlavním gridem */}
      <main className="mx-auto mt-4 max-w-6xl px-4">
        <Karta>
          <h3 className="mb-3 font-bold text-white">Osobní ukazatele</h3>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            <Pruh label="Známost lokální" hodnota={a.znamostLokal} barva={skala(a.znamostLokal, 20, 45, true)} />
            <Pruh label="Známost ve státě" hodnota={a.znamostStat} barva={skala(a.znamostStat, 15, 40, true)} />
            <Pruh label="Známost národní" hodnota={a.znamostNarod} barva={skala(a.znamostNarod, 15, 40, true)} />
            <Pruh label="Sociální kapitál" hodnota={a.socialniKapital} barva={skala(a.socialniKapital, 25, 50, true)} />
            <Pruh label="Integrita" hodnota={a.integrita} barva={skala(a.integrita, 40, 65, true)} />
            <Pruh label="Etika" hodnota={a.etika * 10} barva={skala(a.etika * 10, 30, 60, true)} zprava={`${a.etika} / 10`} />
            <Pruh label="Prodejnost (vnímání ovlivnitelnosti)" hodnota={a.prodejnost * 10} barva={skala(a.prodejnost * 10, 60, 30, false)} zprava={`${a.prodejnost} / 10`} />
            <Pruh label="Kriminální riziko" hodnota={hra.pravni.kriminalniRiziko} barva={skala(hra.pravni.kriminalniRiziko, 40, 20, false)} />
            <Pruh label="Riziko FEC auditu" hodnota={hra.pravni.fecAuditRiziko} barva={skala(hra.pravni.fecAuditRiziko, 40, 20, false)} />
          </div>
          {hra.pravni.vysetrovani.length > 0 && (
            <p className="mt-2 rounded bg-rose-900/40 px-3 py-2 text-xs text-rose-200">
              Probíhá vyšetřování: {hra.pravni.vysetrovani[0].tema} (intenzita {Math.round(hra.pravni.vysetrovani[0].intenzita * 100)} %)
            </p>
          )}
        </Karta>
      </main>

      {/* Modální formulář akce */}
      {modalAkce && hra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="mb-4 text-lg font-bold text-white">{akce.find((x) => x.id === modalAkce)?.nazev ?? modalAkce}</h3>
            <div className="space-y-3">
              {(PARAM_SPEC[modalAkce] ?? []).map((pol) => (
                <label key={pol.klic} className="block text-sm text-slate-300">
                  {pol.label}
                  {pol.typ === "select" ? (
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
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
                      className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
                      value={formular[pol.klic] ?? ""}
                      onChange={(e) => setFormular((f) => ({ ...f, [pol.klic]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => odesliModal(modalAkce)} className="flex-1 rounded-xl bg-emerald-500 py-3 font-bold text-slate-950 transition-colors hover:bg-emerald-400">
                Provést
              </button>
              <button onClick={() => setModalAkce(null)} className="flex-1 rounded-xl bg-slate-700 py-3 font-bold text-slate-200 transition-colors hover:bg-slate-600">
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

function Udaj({ label, hodnota, barva }: { label: string; hodnota: string; barva: Barva }) {
  return (
    <div className="rounded-lg bg-slate-900/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-bold ${textBarvy(barva)}`}>{hodnota}</div>
    </div>
  );
}
