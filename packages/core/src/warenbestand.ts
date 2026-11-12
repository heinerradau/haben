import type { Cents } from "./money.ts";

/*
 * Warenbestand: was an Ware auf Lager liegt, was sie gekostet hat und was sie beim Verkauf einbringt. Eine Schätzung
 * für den Inhaber („wie viel Geld steckt in der Ware?“), keine Inventur und keine Bewertung für die Steuer: Die Liste
 * pflegst du selbst, Haben rechnet nur Stückzahl mal Preis.
 */

export interface Ware {
  name: string;
  /** Stück auf Lager */
  stueck: number;
  /** Einkaufspreis je Stück, netto in Cent */
  einkaufCent: Cents;
  /** Preis je Stück, zu dem du die Ware realistisch verkaufst (etwa der Händlerpreis), netto in Cent */
  preisCent: Cents;
  /** Preis je Stück beim Verkauf direkt an Kunden (eigener Shop, Markt), netto in Cent; 0 oder ohne Angabe: wie preisCent */
  ladenpreisCent?: Cents;
  /** Schon verkaufte Stück, damit sichtbar wird, wie viel der Auflage weg ist */
  verkauft?: number;
}

export interface WarenSumme {
  stueck: number;
  /** Was die Ware gekostet hat */
  einkauf: Cents;
  /** Was sie zum hinterlegten Preis einbringt */
  wert: Cents;
  /** Wert minus Einkauf */
  spanne: Cents;
  /** Was sie einbringt, wenn alles direkt an Kunden geht; ohne Ladenpreis wie `wert` */
  wertDirekt: Cents;
  /** Schon verkaufte Stück */
  verkauft: number;
}

export function wareSumme(ware: Ware): WarenSumme {
  const einkauf = ware.stueck * ware.einkaufCent;
  const wert = ware.stueck * ware.preisCent;
  const wertDirekt = ware.stueck * Math.max(ware.ladenpreisCent ?? 0, ware.preisCent);
  return { stueck: ware.stueck, einkauf, wert, spanne: wert - einkauf, wertDirekt, verkauft: ware.verkauft ?? 0 };
}

export function warenSumme(waren: readonly Ware[]): WarenSumme {
  return waren.map(wareSumme).reduce<WarenSumme>(
    (summe, w) => ({
      stueck: summe.stueck + w.stueck,
      einkauf: summe.einkauf + w.einkauf,
      wert: summe.wert + w.wert,
      spanne: summe.spanne + w.spanne,
      wertDirekt: summe.wertDirekt + w.wertDirekt,
      verkauft: summe.verkauft + w.verkauft,
    }),
    { stueck: 0, einkauf: 0, wert: 0, spanne: 0, wertDirekt: 0, verkauft: 0 },
  );
}
