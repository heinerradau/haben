const GANZE_EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Betrag in ganzen Euro, für Schaubilder und Kennzahlen der Geschäftsbereiche; die Tabellen zeigen weiter Cent */
export function euro(cents: number): string {
  return GANZE_EURO.format(cents / 100);
}
