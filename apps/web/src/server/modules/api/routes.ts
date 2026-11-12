import type { z } from "zod";
import { MAX_DOCUMENT_SIZE } from "../belege/index.ts";
import type { TokenScope } from "../mcp/index.ts";
import { createContactHandler, getContactHandler, listContactsHandler, updateContactHandler } from "./contacts.ts";
import type { Handler } from "./http.ts";
import { BANK_ROUTES } from "./bank.ts";
import { GESCHAEFT_ROUTES } from "./geschaeft.ts";
import {
  bookDocumentHandler,
  cancelDocumentHandler,
  createDocumentHandler,
  getDocumentFileHandler,
  getDocumentHandler,
  listDocumentsHandler,
  patchDocumentHandler,
  reenterDocumentHandler,
  supplyExtractionHandler,
} from "./documents.ts";
import { createInvoiceHandler, deleteInvoiceHandler, getInvoiceHandler, listInvoicesHandler, updateInvoiceHandler } from "./invoices.ts";
import { contactQuerySchema, documentQuerySchema, invoiceQuerySchema } from "./schemas.ts";

/*
 * Alle Endpunkte von /api/v1 an einer Stelle: Pfad, Recht, Handler und was die OpenAPI-Beschreibung über sie sagt.
 * router.ts verteilt danach, openapi.ts beschreibt danach; beides kann nicht auseinanderlaufen.
 */

export type Method = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiRoute {
  method: Method;
  /** Pfad unter /api/v1 in der Schreibweise von OpenAPI, Parameter als {id} (immer eine UUID) */
  path: string;
  scope: TokenScope;
  summary: string;
  description?: string;
  tag: "Kontakte" | "Rechnungen" | "Belege" | "Bank" | "Geschäft";
  query?: z.ZodObject;
  /** Name in requestSchemas */
  requestBody?: string;
  /** Body als multipart/form-data statt JSON, höchstens so viele Bytes */
  multipartLimit?: number;
  /** Status → Name in responseSchemas (null: ohne Inhalt) und Beschreibung */
  responses: Record<number, { schema: string | null; description: string }>;
  /** Fehler, die nur dieser Endpunkt kennt: Status → Beschreibung */
  errors?: Record<number, string>;
  handler: Handler;
}

export const API_ROUTES: ApiRoute[] = [
  {
    method: "GET",
    path: "/kontakte",
    scope: "kontakte:lesen",
    tag: "Kontakte",
    summary: "Kontakte auflisten",
    description: "Ohne archivierte Kontakte, nach Name sortiert. Mit q z. B. nach der E-Mail-Adresse eines Käufers suchen.",
    query: contactQuerySchema,
    responses: { 200: { schema: "ContactList", description: "Eine Seite Kontakte" } },
    handler: listContactsHandler,
  },
  {
    method: "POST",
    path: "/kontakte",
    scope: "kontakte:schreiben",
    tag: "Kontakte",
    summary: "Kontakt anlegen",
    requestBody: "ContactCreate",
    responses: { 201: { schema: "Contact", description: "Angelegt; Location zeigt auf den Kontakt" } },
    handler: createContactHandler,
  },
  {
    method: "GET",
    path: "/kontakte/{id}",
    scope: "kontakte:lesen",
    tag: "Kontakte",
    summary: "Kontakt lesen",
    responses: { 200: { schema: "Contact", description: "Der Kontakt" } },
    handler: getContactHandler,
  },
  {
    method: "PATCH",
    path: "/kontakte/{id}",
    scope: "kontakte:schreiben",
    tag: "Kontakte",
    summary: "Kontakt ändern",
    description:
      "Nur die genannten Felder ändern sich. Jede Änderung legt eine neue Version an; Rechnungen behalten den Stand, mit dem sie geschrieben wurden.",
    requestBody: "ContactPatch",
    responses: { 200: { schema: "Contact", description: "Der geänderte Kontakt" } },
    handler: updateContactHandler,
  },
  {
    method: "GET",
    path: "/rechnungen",
    scope: "rechnungen:lesen",
    tag: "Rechnungen",
    summary: "Rechnungen auflisten",
    description: "Entwürfe zuerst, dann nach Nummer absteigend. Mit externalSource und externalId die Rechnung zu einer Bestellung finden.",
    query: invoiceQuerySchema,
    responses: { 200: { schema: "InvoiceList", description: "Eine Seite Rechnungen" } },
    handler: listInvoicesHandler,
  },
  {
    method: "POST",
    path: "/rechnungen",
    scope: "rechnungen:entwuerfe",
    tag: "Rechnungen",
    summary: "Rechnungsentwurf anlegen",
    description:
      "Legt einen Entwurf an; festgeschrieben wird in Haben. Nicht angegebene Felder nehmen die Vorgaben aus den Firmendaten, Format und Sprache die des Kontakts. " +
      "Mit externalSource und externalId idempotent: Gibt es die Referenz schon, kommt die vorhandene Rechnung unverändert mit 200 zurück.",
    requestBody: "InvoiceDraftCreate",
    responses: {
      201: { schema: "Invoice", description: "Entwurf angelegt; Location zeigt auf ihn" },
      200: { schema: "Invoice", description: "Zu dieser externen Referenz gibt es schon eine Rechnung, sie bleibt unverändert" },
    },
    handler: createInvoiceHandler,
  },
  {
    method: "GET",
    path: "/rechnungen/{id}",
    scope: "rechnungen:lesen",
    tag: "Rechnungen",
    summary: "Rechnung lesen",
    description: "Entwürfe und festgeschriebene Rechnungen, mit Positionen und offenem Betrag.",
    responses: { 200: { schema: "Invoice", description: "Die Rechnung" } },
    handler: getInvoiceHandler,
  },
  {
    method: "PATCH",
    path: "/rechnungen/{id}",
    scope: "rechnungen:entwuerfe",
    tag: "Rechnungen",
    summary: "Rechnungsentwurf ändern",
    description: "Nur solange Entwurf. Nur die genannten Felder ändern sich; lines ersetzt alle Positionen. Die externe Referenz bleibt.",
    requestBody: "InvoiceDraftPatch",
    responses: { 200: { schema: "Invoice", description: "Der geänderte Entwurf" } },
    errors: { 409: "Die Rechnung ist festgeschrieben" },
    handler: updateInvoiceHandler,
  },
  {
    method: "DELETE",
    path: "/rechnungen/{id}",
    scope: "rechnungen:entwuerfe",
    tag: "Rechnungen",
    summary: "Rechnungsentwurf löschen",
    description: "Nur solange Entwurf; danach ist die externe Referenz wieder frei.",
    responses: { 204: { schema: null, description: "Gelöscht" } },
    errors: { 409: "Die Rechnung ist festgeschrieben" },
    handler: deleteInvoiceHandler,
  },
  {
    method: "GET",
    path: "/belege",
    scope: "belege:lesen",
    tag: "Belege",
    summary: "Belege auflisten",
    description:
      "Zu prüfende Belege zuerst, dann nach Belegdatum absteigend. Mit externalSource und externalId sehen, ob ein Dokument schon da und gebucht ist.",
    query: documentQuerySchema,
    responses: { 200: { schema: "DocumentList", description: "Eine Seite Belege" } },
    handler: listDocumentsHandler,
  },
  {
    method: "POST",
    path: "/belege",
    scope: "belege:anlegen",
    tag: "Belege",
    summary: "Beleg hochladen",
    description:
      "Legt einen Eingangsbeleg als „Zu prüfen“ an, wie der Upload unter Belege: E-Rechnungen werden sofort gelesen, andere PDFs und Fotos von der " +
      "KI-Auslesung im Hintergrund, wenn sie eingerichtet ist. Gebucht wird in Haben. Mit externalSource und externalId idempotent: Gibt es die " +
      "Referenz schon, kommt der vorhandene Beleg unverändert mit 200 zurück. Dieselbe Datei ohne Referenz liefert ebenfalls den vorhandenen Beleg; " +
      "liegt sie mit einer anderen oder ohne Referenz schon vor, antwortet die API mit 409 und existingId.",
    requestBody: "DocumentUpload",
    // Platz für die Felder und Grenzen des Formulars neben der größten Datei
    multipartLimit: MAX_DOCUMENT_SIZE + 1024 * 1024,
    responses: {
      201: { schema: "Document", description: "Beleg angelegt; Location zeigt auf ihn" },
      200: { schema: "Document", description: "Diese Referenz oder ohne Referenz diese Datei gibt es schon; der Beleg bleibt unverändert" },
    },
    errors: { 409: "Dieselbe Datei liegt mit einer anderen oder ohne Referenz schon vor; existingId nennt den Beleg" },
    handler: createDocumentHandler,
  },
  {
    method: "GET",
    path: "/belege/{id}",
    scope: "belege:lesen",
    tag: "Belege",
    summary: "Beleg lesen",
    description: "Stand der Prüfung: Status, ob gebucht, was vor dem Buchen noch fehlt, und der Link zur Seite in Haben.",
    responses: { 200: { schema: "Document", description: "Der Beleg" } },
    handler: getDocumentHandler,
  },
  {
    method: "GET",
    path: "/belege/{id}/datei",
    scope: "belege:lesen",
    tag: "Belege",
    summary: "Belegdatei abrufen",
    description:
      "Liefert die abgelegte Datei unverändert (PDF, Bild oder E-Rechnungs-XML) mit ihrem Content-Type, nicht als JSON. Damit liest ein Werkzeug " +
      "oder KI-Assistent auch Belege, die über die Oberfläche, das Handy oder das Postfach hereinkamen, und liefert die Werte danach mit " +
      "POST /belege/{id}/auslesung.",
    responses: { 200: { schema: null, description: "Die Datei; Content-Type nennt das Format, Content-Disposition einen Dateinamen" } },
    handler: getDocumentFileHandler,
  },
  {
    method: "POST",
    path: "/belege/{id}/auslesung",
    scope: "belege:auslesen",
    tag: "Belege",
    summary: "Ausgelesene Werte liefern",
    description:
      "Für Werkzeuge und KI-Assistenten, die den Beleg selbst gelesen haben: Lieferant, Nummer, Datum, Beträge je Steuersatz und ein Vorschlag für " +
      "die Kategorie, im selben Format wie die Antwort der KI-Auslesung. Haben prüft Beträge, Daten und Summen wie dort und schreibt Abweichungen an " +
      "den Beleg (extractionError). Der Beleg bleibt „Zu prüfen“; gebucht wird in Haben. Erneut senden ersetzt die Werte, solange nicht gebucht ist. " +
      "422, wenn der Beleg gebucht, eine E-Rechnung oder gerade in der Auslesung ist.",
    requestBody: "DocumentExtraction",
    responses: { 200: { schema: "Document", description: "Der Beleg mit den übernommenen Werten" } },
    handler: supplyExtractionHandler,
  },
  {
    method: "POST",
    path: "/belege/{id}/buchung",
    scope: "belege:buchen",
    tag: "Belege",
    summary: "Beleg buchen",
    description:
      "Bucht einen fertig geprüften Beleg wie der Knopf „Bestätigen und buchen“ in Haben und schreibt ihn fest; danach lässt er sich nur noch " +
      "stornieren. Das Recht belege:buchen ist nie vorbelegt: Wer es einem Werkzeug gibt, überträgt ihm die Prüfung des Belegs. Vorher mit " +
      "GET /belege/{id} die `issues` lesen; sind welche offen, ist der Beleg schon gebucht oder das Jahr abgeschlossen, antwortet die API mit 422.",
    responses: { 200: { schema: "Document", description: "Der gebuchte Beleg" } },
    handler: bookDocumentHandler,
  },
  {
    method: "PATCH",
    path: "/belege/{id}",
    scope: "belege:aendern",
    tag: "Belege",
    summary: "Beleg ändern",
    description:
      "Ändert die genannten Felder eines Belegs, der noch „Zu prüfen“ ist, etwa Kategorie, Zahlungsweg, Beträge oder die Steuerbehandlung nach " +
      "§ 13b (reverseCharge); alles andere bleibt. Gespeichert wird wie in Haben: Bei Fremdwährung rechnet Haben mit dem Kurs in Euro um, bei " +
      "reverseCharge die Steuer aus dem Netto. 422, wenn der Beleg gebucht oder auf mehrere Kategorien aufgeteilt ist oder ein Anlagegut werden soll.",
    requestBody: "DocumentPatch",
    responses: { 200: { schema: "Document", description: "Der geänderte Beleg" } },
    handler: patchDocumentHandler,
  },
  {
    method: "POST",
    path: "/belege/{id}/storno",
    scope: "belege:buchen",
    tag: "Belege",
    summary: "Beleg stornieren",
    description:
      "Storniert einen gebuchten Beleg wie „Stornieren“ in Haben: eine Gegenbuchung, der Beleg selbst bleibt gesperrt stehen, nichts wird gelöscht. " +
      "Der Grund steht danach am Storno. 422, wenn der Beleg nicht gebucht, schon storniert, einer Zahlung zugeordnet, ein Anlagegut oder aus dem " +
      "Umzug übernommen ist. Zum Korrigieren danach POST /belege/{id}/neuerfassung.",
    requestBody: "DocumentCancel",
    responses: { 200: { schema: "Document", description: "Der stornierte Beleg; cancelledOn nennt den Tag der Gegenbuchung" } },
    handler: cancelDocumentHandler,
  },
  {
    method: "POST",
    path: "/belege/{id}/neuerfassung",
    scope: "belege:anlegen",
    tag: "Belege",
    summary: "Stornierten Beleg neu erfassen",
    description:
      "Legt zu einem stornierten Beleg einen neuen Entwurf mit derselben Datei und denselben Werten an („Zu prüfen“), zum Korrigieren und erneuten " +
      "Buchen. Gibt es den Entwurf schon, kommt er unverändert zurück. 422, wenn der Beleg nicht storniert ist.",
    responses: { 201: { schema: "Document", description: "Der neue Entwurf; Location zeigt auf ihn" } },
    handler: reenterDocumentHandler,
  },
  ...BANK_ROUTES,
  ...GESCHAEFT_ROUTES,
];
