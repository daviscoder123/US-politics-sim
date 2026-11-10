/**
 * rng.ts — deterministický generátor náhodných čísel (mulberry32).
 * Veškerá náhodnost hry prochází touto třídou; jiné zdroje náhodnosti jsou zakázané,
 * aby replay save souboru dával vždy identický výsledek.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  /** Další uniformní číslo v [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniformní celé číslo v [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Uniformní reálné číslo v [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Test pravděpodobnosti p v [0, 1]. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Náhodný prvek pole. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Normální rozdělení (Box-Muller). */
  normal(mu = 0, sigma = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Aktuální vnitřní seed (pro uložení a replay). */
  seed(): number {
    return this.s;
  }
}
