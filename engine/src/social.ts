/**
 * social.ts — sociální vrstva: gate konverzací podle prestiže, vliv konverzací
 * na vztahy, ukládání slibů do paměti NPC.
 *
 * Gate: NPC přijme konverzaci, když
 *   npc.prestiz − (socialniKapital + vztah*5 + funkceBonus) ≤ 0
 * FunkceBonus roste s úrovní úřadu (outsider 0 … prezident 20).
 */
import type { GameState, NPC, OfficeLevel, Slib } from "./state.ts";

export const FUNKCE_BONUS: Record<OfficeLevel, number> = {
  outsider: 0,
  kandidat: 1,
  radni: 2,
  starosta: 5,
  kongresman: 8,
  guverner: 12,
  prezident: 20,
};

export function funkceBonus(uroven: OfficeLevel): number {
  return FUNKCE_BONUS[uroven] ?? 0;
}

/** Vrátí hodnotu prestižní brány — kladná znamená „ještě vás odmítne“. */
export function branaPrestize(npc: NPC, s: GameState): number {
  return (
    npc.prestiz -
    (s.postava.atributy.socialniKapital + npc.vztah * 5 + funkceBonus(s.funkce.uroven))
  );
}

/** Přijme NPC konverzaci? */
export function ochota(npc: NPC, s: GameState): boolean {
  return branaPrestize(npc, s) <= 0;
}

export interface VysledekKonverzace {
  prijato: boolean;
  zmenaVztahu: number;
  zprava: string;
  slibId: string | null;
}

/**
 * Provedení konverzace (1 AP účtuje volající akce v actions.ts).
 * randRoll 0–1 dodá engine ze seedovaného Rng.
 */
export function provedKonverzaci(
  s: GameState,
  npcId: string,
  randRoll: number,
  slibText: string | null
): VysledekKonverzace {
  const npc = s.npc.find((n) => n.id === npcId);
  if (!npc) {
    return { prijato: false, zmenaVztahu: 0, zprava: "Osoba nebyla nalezena.", slibId: null };
  }
  const brana = branaPrestize(npc, s);
  if (brana > 0) {
    return {
      prijato: false,
      zmenaVztahu: 0,
      zprava: `${npc.jmeno} vás odmítl/a. Prestižní brána: ještě o ${Math.ceil(brana)} bodů sociálního kapitálu níže (nebo vyšší úřad, nebo lepší vztah).`,
      slibId: null,
    };
  }

  // Kvalita konverzace podle retoriky a diplomacie (0,5–2,0).
  const kvalita =
    0.5 +
    (s.postava.dovednosti.retorika + s.postava.dovednosti.diplomacie) / 14 +
    randRoll * 0.5;

  let zmena = Math.round((kvalita - 1.0) * 3 * 10) / 10;
  // Slib zatěžuje vztah: dlouhodobá cita, krátkodobé plus.
  if (slibText && slibText.trim().length > 0) {
    zmena += 1.0;
  }
  npc.vztah = Math.max(-10, Math.min(10, Math.round((npc.vztah + zmena) * 10) / 10));
  npc.ochotaHistorie.push(true);

  let slibId: string | null = null;
  if (slibText && slibText.trim().length > 0) {
    const novySlib: Slib = {
      id: `slib-${s.sliby.length + 1}`,
      text: slibText.trim(),
      komu: npc.id,
      koloSlibu: s.kolo,
      lhutaKolo: s.kolo + 52, // standardní lhůta jednoho herního roku
      stav: "v_progressu",
    };
    s.sliby.push(novySlib);
    npc.pamet.push(`Slib (kolo ${s.kolo}): ${slibText.trim()}`);
    slibId = novySlib.id;
  }

  // Sociální kapitál pomalu roste s každou úspěšnou konverzací.
  s.postava.atributy.socialniKapital = Math.min(
    100,
    Math.round((s.postava.atributy.socialniKapital + 0.4) * 10) / 10
  );

  return {
    prijato: true,
    zmenaVztahu: zmena,
    zprava: `Konverzace s ${npc.jmeno} proběhla (${zmena >= 0 ? "+" : ""}${zmena} vztah).`,
    slibId,
  };
}

/** Kontrola lhut slibů — nesplněné sliby po lhutě pálí vztahy a integritu. */
export function slibyTick(s: GameState): string[] {
  const zpravy: string[] = [];
  for (const slib of s.sliby) {
    if (slib.stav === "v_progressu" && s.kolo > slib.lhutaKolo) {
      slib.stav = "porusen";
      const npc = s.npc.find((n) => n.id === slib.komu);
      if (npc) {
        npc.vztah = Math.max(-10, npc.vztah - 3);
        npc.pamet.push(`PORUŠENÝ SLIB (kolo ${s.kolo}): ${slib.text}`);
      }
      s.postava.atributy.integrita = Math.max(0, s.postava.atributy.integrita - 4);
      s.postava.atributy.etika = Math.max(0, s.postava.atributy.etika - 1);
      zpravy.push(`Porušili jste slib: „${slib.text}“ — vztahy i integrita klesly.`);
    }
  }
  return zpravy;
}

/** Splnění slibu (akce splnit_slib) — posiluje vztah a integritu. */
export function splnSlib(s: GameState, slibId: string): { ok: boolean; zprava: string } {
  const slib = s.sliby.find((x) => x.id === slibId);
  if (!slib) return { ok: false, zprava: "Slib nebyl nalezen." };
  if (slib.stav !== "v_progressu")
    return { ok: false, zprava: `Slib již není v progressu (stav: ${slib.stav}).` };
  slib.stav = "splnen";
  const npc = s.npc.find((n) => n.id === slib.komu);
  if (npc) {
    npc.vztah = Math.min(10, npc.vztah + 2);
    npc.pamet.push(`SPLNĚNÝ SLIB (kolo ${s.kolo}): ${slib.text}`);
  }
  s.postava.atributy.integrita = Math.min(100, s.postava.atributy.integrita + 3);
  return { ok: true, zprava: `Slib „${slib.text}“ byl splněn.` };
}
