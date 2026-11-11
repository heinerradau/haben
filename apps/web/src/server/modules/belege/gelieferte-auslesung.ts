import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.ts";
import { loadFile, sniff } from "../../storage.ts";
import { applyFields, DocumentError } from "./documents.ts";
import { extractionSchema, toFields, type Extraction } from "./extraction-schema.ts";
import { detectOwnInvoiceFor, partiesOfExtraction } from "./own-invoice.ts";
import { pdfTextLines } from "./pdf-text.ts";
import { totalsOf } from "./belegbuchung.ts";

/*
 * Gelieferte Auslesung: Ein Werkzeug oder KI-Assistent hat den Beleg selbst gelesen und liefert die Werte über die
 * REST-API (Recht belege:auslesen), statt dass Haben einen KI-Dienst aufruft. Die Antwort hat dasselbe Schema wie die
 * eines KI-Dienstes und geht denselben Weg: dieselben Prüfungen von Beträgen, Daten und Summen, dieselbe Erkennung
 * eigener Rechnungen, dieselben Vorschläge aus früheren Belegen des Lieferanten. Der Beleg bleibt „Zu prüfen“; gebucht
 * wird nur auf Bestätigung in Haben.
 */

/** Das Schema der Auslesung, unter dem Namen für Werte von außen */
export const suppliedExtractionSchema = extractionSchema;
export type SuppliedExtraction = Extraction;

/**
 * Übernimmt gelieferte Werte in einen Beleg, der noch zu prüfen ist. false: den Beleg gibt es nicht. Abgelehnt wird,
 * was Haben selbst besser weiß oder nicht mehr ändern darf: gebuchte Belege, E-Rechnungen und laufende Auslesungen.
 */
export async function applySuppliedExtraction(actor: string, id: string, input: SuppliedExtraction): Promise<boolean> {
  const extraction = suppliedExtractionSchema.parse(input);
  const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (!doc) return false;
  if (doc.lockedAt) throw new DocumentError("Der Beleg ist gebucht und lässt sich nicht mehr auslesen.");
  if (doc.extractedBy === "zugferd" || doc.extractedBy === "xrechnung") {
    throw new DocumentError("Der Beleg ist eine E-Rechnung; ihre Werte liest Haben selbst aus der Datei.");
  }
  if (doc.extractionStatus === "laeuft") throw new DocumentError("Der Beleg wird gerade ausgelesen. Bitte danach erneut versuchen.");

  const fields = toFields(extraction);
  const bytes = await loadFile(doc.sha256);
  const lines = sniff(bytes)?.kind === "pdf" ? await pdfTextLines(bytes) : null;
  const ownInvoice = await detectOwnInvoiceFor({
    parties: partiesOfExtraction(extraction),
    lines,
    invoiceNumber: fields.invoiceNumber,
    gross: totalsOf(fields.amounts).gross,
    currency: fields.currency,
  });
  await applyFields(actor, id, fields, "ki", extraction, true, ownInvoice);
  return true;
}
