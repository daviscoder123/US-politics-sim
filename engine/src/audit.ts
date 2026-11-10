/**
 * audit.ts — logovací a replay helper: dvě hry se stejným seedem a stejnou
 * posloupností akcí musí produkovat identický stav (JSON.stringify).
 */

/** Zkrácený serializovatelný otisk stavu pro replay testy. */
export function otiskStavu(s: unknown): string {
  return JSON.stringify(s);
}

/** Vytěží ze stavu zprávy deníku pro dané kolo. */
export function zpravyKola(s: { denik: { kolo: number; typ: string; data: Record<string, unknown> }[] }, kolo: number): string[] {
  return s.denik.filter((e) => e.kolo === kolo).map((e) => JSON.stringify(e.data));
}

/** Skriptované replaye: posloupnost instrukcí pro deterministické přehrání. */
export interface ReplayInstrukce {
  typ: "akce" | "endTurn";
  akceId?: string;
  parametry?: Record<string, unknown>;
}

/**
 * Porovná dva stavy po replayi: vrací true, pokud jsou bitově totožné
 * v serializované podobě (klíčový invariant determinismu).
 */
export function stavyStejne(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
