/**
 * indicators.ts — kariérní brance (dračí doupě): práhy pro postup na další
 * úroveň, detekce lokálních krizí a data pro HUD.
 */
import type { GameState, OfficeLevel } from "./state.ts";

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
