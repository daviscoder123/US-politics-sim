/**
 * elections.ts — volební model: preference voličů, Monte Carlo s seedovaným Rng,
 * primárky s delegáty (proporcionální + bonus pro vítěze), Electoral College
 * (50 států + DC, celkem 538 volitelů) a kalendář voleb.
 *
 * Kalibrace: EV dle sčítání 2020 (uplatněno od 2024); lean = přibližná výchozí
 * marže demokratů v neutrálním roce (Cook PVI orientovaně, upraveno dle 2024).
 */
import type { GameState, Macro } from "./state.ts";
import type { Rng } from "./rng.ts";

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
