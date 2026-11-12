import { CURRENCY_CODE, EXPENSE_CATEGORY_KEYS, formatExchangeRate, SELF_ASSESSED_TAX_KEYS } from "@haben/core";
import { z } from "zod";
import { DocumentError, getDocument, updateDocument, type DocumentInput } from "./documents.ts";

/*
 * Änderung eines noch nicht gebuchten Belegs von außen (REST-API, Recht belege:aendern): Nur die genannten Felder
 * ändern sich, alles andere bleibt, wie es am Beleg steht. Gespeichert wird über updateDocument, also mit denselben
 * Prüfungen und derselben Rechnung wie beim Speichern in Haben (Kurs bei Fremdwährung, Steuer nach § 13b).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum als JJJJ-MM-TT");
const cents = z.number().int().min(-100_000_000_00).max(100_000_000_00);

export const documentPatchSchema = z
  .object({
    supplierName: z.string().trim().max(200),
    supplierUstId: z.string().trim().max(20),
    invoiceNumber: z.string().trim().max(100),
    documentDate: isoDate.nullable(),
    dueDate: isoDate.nullable(),
    category: z.enum(EXPENSE_CATEGORY_KEYS).nullable().describe("Schlüssel einer Ausgabenkategorie; „anlage“ nur in Haben"),
    payment: z.enum(["bank", "privat", "kasse"]),
    note: z.string().max(2000),
    privateShare: z.number().int().min(0).max(100).describe("Privatanteil in Prozent"),
    reverseCharge: z
      .enum(SELF_ASSESSED_TAX_KEYS)
      .nullable()
      .describe("Steuer schuldest du selbst: eu oder drittland (§ 13b), ig_erwerb (Ware aus dem EU-Ausland); null = normale Rechnung"),
    currency: z.string().trim().toUpperCase().regex(CURRENCY_CODE, "Währung als dreistelliger Code, z. B. USD"),
    exchangeRate: z.string().nullable().describe("1 EUR = Kurs Fremdwährung, z. B. 1,0812; null = Haben nimmt den veröffentlichten Kurs"),
    exchangeRateDate: isoDate.nullable(),
    amounts: z
      .array(z.object({ taxRate: z.union([z.literal(1900), z.literal(700), z.literal(0)]), net: cents, tax: cents }))
      .max(3)
      .describe("Beträge je Steuersatz in der Währung des Belegs, in Cent; ersetzt alle Zeilen. Bei reverseCharge rechnet Haben die Steuer aus dem Netto."),
  })
  .partial()
  .strict();

export type DocumentPatch = z.input<typeof documentPatchSchema>;

/** Ändert die genannten Felder; false: den Beleg gibt es nicht. Gebuchte Belege lehnt updateDocument ab. */
export async function patchDocument(actor: string, id: string, input: DocumentPatch): Promise<boolean> {
  const patch = documentPatchSchema.parse(input);
  const loaded = await getDocument(id);
  if (!loaded) return false;
  const { document: doc, amounts, splits } = loaded;
  if (splits.length > 0) throw new DocumentError("Der Beleg ist auf mehrere Kategorien aufgeteilt. Solche Belege änderst du in Haben.");
  const category = (patch.category === undefined ? doc.category : patch.category) as DocumentInput["category"];
  if (category === "anlage" && !doc.asset) throw new DocumentError("Anlagegüter brauchen Angaben zur Abschreibung. Erfasse sie in Haben.");

  const currency = patch.currency ?? doc.currency;
  const fremd = currency !== "EUR";
  // Zeilen in der Währung des Belegs: aus der Änderung oder so, wie sie am Beleg stehen
  const zeilen =
    patch.amounts ??
    amounts.map((a) => ({
      taxRate: a.taxRate as 1900 | 700 | 0,
      net: doc.currency === "EUR" ? a.net : (a.originalNet ?? 0),
      tax: doc.currency === "EUR" ? a.tax : (a.originalTax ?? 0),
    }));
  const document: DocumentInput = {
    supplierName: patch.supplierName ?? doc.supplierName,
    supplierUstId: patch.supplierUstId ?? doc.supplierUstId,
    // Ein anderer Name meint einen anderen Lieferanten: die Verknüpfung zum Kontakt fällt weg, wie im Formular
    supplierContactId: patch.supplierName !== undefined && patch.supplierName !== doc.supplierName ? null : doc.supplierContactId,
    invoiceNumber: patch.invoiceNumber ?? doc.invoiceNumber,
    documentDate: patch.documentDate === undefined ? doc.documentDate : patch.documentDate,
    dueDate: patch.dueDate === undefined ? doc.dueDate : patch.dueDate,
    category,
    payment: patch.payment ?? doc.payment,
    note: patch.note ?? doc.note,
    privateShare: patch.privateShare ?? doc.privateShare,
    reverseCharge: patch.reverseCharge === undefined ? doc.reverseCharge : patch.reverseCharge,
    asset: category === "anlage" ? doc.asset : null,
    currency,
    exchangeRate: !fremd ? null : patch.exchangeRate === undefined ? (doc.exchangeRate ? formatExchangeRate(doc.exchangeRate) : null) : patch.exchangeRate,
    exchangeRateDate: !fremd ? null : patch.exchangeRateDate === undefined ? doc.exchangeRateDate : patch.exchangeRateDate,
    splits: [],
    amounts: zeilen.map((z) =>
      fremd ? { taxRate: z.taxRate, net: 0, tax: 0, originalNet: z.net, originalTax: z.tax } : { taxRate: z.taxRate, net: z.net, tax: z.tax },
    ),
  };
  await updateDocument(actor, id, document);
  return true;
}
