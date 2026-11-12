import type { BereichSumme, BereichZweig, Geschaeftsbereich } from "./geschaeftsbereiche.ts";
import type { Cents } from "./money.ts";

/*
 * Geldfluss der Geschäftsbereiche: woher das Geld kam, wohin es ging und was übrig blieb, für ein Jahr oder alle Jahre.
 * Grundlage des Flussbilds unter /geschaeft. Wie die ganze Auswertung netto nach Belegdatum und ohne den Zweig
 * „neutral“ (Steuerzahlungen, Privates).
 */

export interface FlussPosten {
  /** Kennung des Bereichs */
  id: string;
  name: string;
  zweig: BereichZweig;
  cents: Cents;
}

export interface Geldfluss {
  /** Bereiche mit Einnahmen, nach Zweig und Größe sortiert */
  ein: FlussPosten[];
  /** Bereiche mit Ausgaben, nach Zweig und Größe sortiert */
  aus: FlussPosten[];
  einnahmen: Cents;
  ausgaben: Cents;
  /** Einnahmen minus Ausgaben; negativ, wenn mehr ausgegeben als eingenommen wurde */
  rest: Cents;
}

const REIHENFOLGE: Record<BereichZweig, number> = { fremdes: 0, eigenes: 1, gemeinsam: 2, neutral: 3 };

function sortiert(posten: FlussPosten[]): FlussPosten[] {
  return posten.sort((a, b) => REIHENFOLGE[a.zweig] - REIHENFOLGE[b.zweig] || b.cents - a.cents || a.name.localeCompare(b.name, "de"));
}

/**
 * Einnahmen und Ausgaben je Bereich. Überwiegen in einem Bereich die Gutschriften (negative Einnahmen oder Ausgaben),
 * wechselt der Betrag die Seite, damit jede Seite nur positive Beträge zeigt und die Differenz stimmt.
 */
export function geldfluss(zeilen: readonly { bereich: Geschaeftsbereich; jeJahr: Record<number, BereichSumme> }[], jahr?: number): Geldfluss {
  const ein: FlussPosten[] = [];
  const aus: FlussPosten[] = [];
  for (const { bereich, jeJahr } of zeilen) {
    if (bereich.zweig === "neutral") continue;
    const summen = jahr === undefined ? Object.values(jeJahr) : jeJahr[jahr] ? [jeJahr[jahr]] : [];
    let einnahmen = summen.reduce((s, x) => s + x.einnahmen, 0);
    let ausgaben = summen.reduce((s, x) => s + x.ausgaben, 0);
    if (einnahmen < 0) [einnahmen, ausgaben] = [0, ausgaben - einnahmen];
    if (ausgaben < 0) [einnahmen, ausgaben] = [einnahmen - ausgaben, 0];
    const basis = { id: bereich.id, name: bereich.name, zweig: bereich.zweig };
    if (einnahmen > 0) ein.push({ ...basis, cents: einnahmen });
    if (ausgaben > 0) aus.push({ ...basis, cents: ausgaben });
  }
  const einnahmen = ein.reduce((s, p) => s + p.cents, 0);
  const ausgaben = aus.reduce((s, p) => s + p.cents, 0);
  return { ein: sortiert(ein), aus: sortiert(aus), einnahmen, ausgaben, rest: einnahmen - ausgaben };
}

export interface AufgelaufenesJahr {
  jahr: number;
  /** Einnahmen vom ersten Jahr bis zum Ende dieses Jahres */
  einnahmen: Cents;
  /** Ausgaben vom ersten Jahr bis zum Ende dieses Jahres */
  ausgaben: Cents;
}

/** Zählt Einnahmen und Ausgaben über die Jahre auf: was bis zum Ende jedes Jahres hineingesteckt wurde und zurückkam */
export function aufgelaufen(jeJahr: Record<number, BereichSumme>, jahre: readonly number[]): AufgelaufenesJahr[] {
  let einnahmen = 0;
  let ausgaben = 0;
  return jahre.map((jahr) => {
    einnahmen += jeJahr[jahr]?.einnahmen ?? 0;
    ausgaben += jeJahr[jahr]?.ausgaben ?? 0;
    return { jahr, einnahmen, ausgaben };
  });
}
