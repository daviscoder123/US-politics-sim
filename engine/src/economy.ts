/**
 * economy.ts — ekonomický model: kvartální přepočet makra (Okun, Phillips,
 * fiskální stimul, akumulace dluhu, Taylorovo pravidlo pro Fed, rating),
 * detekce makro krizí a týdenní tick lokální ekonomiky.
 *
 * Kalibrace: NAIRU 4,3 %; výchozí stav USA podzim 2026 (CBO FY2026: deficit
 * 6,2 % HDP, dluh ~100 % HDP, Fed ~3,88 %, inflace CPI 3,7 %).
 */
import type { GameState, Macro, Local } from "./state.ts";

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
