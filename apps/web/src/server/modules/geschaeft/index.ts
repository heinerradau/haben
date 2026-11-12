/*
 * Geschäftsbereiche: Auswertung, die Belege den Bereichen eines Betriebs zuordnet (über Regeln oder von Hand) und je
 * Jahr zeigt, was ein Bereich eingenommen und gekostet hat. Liest den archivierten Altbestand, ändert keinen Beleg.
 *
 * Öffentliche Schnittstelle des Moduls: Andere Module, Server Functions und Routen importieren nur von hier
 * (Modulgrenzen, scripts/modulgrenzen/regel.ts).
 */
export {
  bereichslisteSchema,
  exportiereBereichsliste,
  GeschaeftsbereichError,
  ladeBereiche,
  ordneBelegZu,
  speichereBereichsliste,
  type Bereichsliste,
  type BereichslisteInput,
} from "./bereiche.ts";
export { ladeWaren, speichereWarenliste, warenlisteSchema, type GeladeneWaren, type Warenliste } from "./waren.ts";
export {
  geschaeftPosten,
  geschaeftUebersicht,
  ladePosten,
  type BereichZeile,
  type Fixkosten,
  type GeschaeftUebersicht,
  type Kunde,
  type PostenListe,
} from "./auswertung.ts";
