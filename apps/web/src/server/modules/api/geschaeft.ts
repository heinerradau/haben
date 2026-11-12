import { BEREICH_ZWEIGE, bereichSummeGesamt, wareSumme, warenSumme, type BereichSumme } from "@haben/core";
import { z } from "zod";
import { geschaeftPosten, geschaeftUebersicht, ladeWaren } from "../geschaeft/index.ts";
import { notFound, ok, validate, type ApiRequest, type ApiResult } from "./http.ts";
import type { ApiRoute } from "./routes.ts";
import { responseSchemas } from "./schemas.ts";

/*
 * „Mein Geschäft“ über die REST-API: dieselbe Auswertung wie die Seite /geschaeft, nur lesend, für ein eigenes Cockpit
 * oder einen Assistenten. Summen je Bereich, Zweig und Jahr, die größten Kunden, die laufenden Kosten und der
 * Warenbestand; je Bereich die Kontakte dahinter unter ihrem Klartext-Namen. Einzelne Belege gibt dieser Endpunkt
 * nicht heraus, dafür gibt es /belege. Ändern lässt sich hier nichts.
 */

const CENT = "netto in Cent";

const summeOut = z
  .object({
    einnahmen: z.number().int().describe(`Einnahmen ${CENT}`),
    ausgaben: z.number().int().describe(`Ausgaben ${CENT}`),
    ergebnis: z.number().int().describe("Einnahmen minus Ausgaben, in Cent"),
    posten: z.number().int().describe("Anzahl der Posten"),
  })
  .register(responseSchemas, { id: "GeschaeftSumme" });

const jeJahrOut = z.record(z.string(), summeOut).describe("Summen je Jahr, Schlüssel ist das Jahr");

const mitJahren = { jeJahr: jeJahrOut, gesamt: summeOut };

const zweig = z
  .enum(BEREICH_ZWEIGE)
  .describe("eigenes = das eigene Geschäft, fremdes = Arbeit für andere, gemeinsam = gemeinsame Kosten, neutral = nicht gewertet");

const kunde = z.object({ kontakt: z.string().describe("Klartext-Name"), einnahmen: z.number().int(), posten: z.number().int() });

const wareOut = z.object({
  name: z.string(),
  stueck: z.number().int().describe("Stück auf Lager"),
  verkauft: z.number().int().describe("Schon verkaufte Stück"),
  einkauf: z.number().int().describe("Was der Bestand gekostet hat, in Cent"),
  wert: z.number().int().describe("Was er zum Händlerpreis einbringt, in Cent"),
  wertDirekt: z.number().int().describe("Was er einbringt, wenn alles direkt an Kunden geht, in Cent"),
});

export const geschaeftSchema = z
  .object({
    jahre: z.array(z.number().int()).describe("Jahre mit Posten, aufsteigend"),
    bereiche: z.array(z.object({ id: z.uuid(), name: z.string(), zweig, laufend: z.boolean().describe("Laufende Kosten (Abos, Verträge)"), ...mitJahren })),
    zweige: z.object({ eigenes: z.object(mitJahren), fremdes: z.object(mitJahren), gemeinsam: z.object(mitJahren) }),
    gesamt: z.object(mitJahren).describe("Alles zusammen ohne den Zweig neutral; ergebnis ist der Gewinn vor Steuern"),
    offen: summeOut.describe("Posten, die noch keinem Bereich zugeordnet sind"),
    kunden: z.object({ eigenes: z.array(kunde), fremdes: z.array(kunde) }).describe("Wer am meisten bezahlt hat, je Zweig"),
    laufendeKosten: z
      .object({
        von: z.string().describe("Erster Monat des Zeitraums, JJJJ-MM"),
        bis: z.string().describe("Letzter Monat des Zeitraums, JJJJ-MM"),
        summe: z.number().int().describe("Gezahlt in den zwölf Monaten, brutto in Cent"),
        monatlich: z.number().int().describe("Was zurzeit im Monat abgeht, brutto in Cent"),
        posten: z.array(
          z.object({
            name: z.string().describe("Klartext-Name des Anbieters"),
            bereichId: z.uuid(),
            summe: z.number().int(),
            monate: z.number().int().describe("In so vielen der zwölf Monate wurde gezahlt"),
            monatlich: z.number().int().describe("Üblicher Monatsbetrag, brutto in Cent"),
          }),
        ),
      })
      .nullable()
      .describe("Abos und laufende Verträge der letzten zwölf vollen Monate; null ohne solche Bereiche"),
    waren: z.object({
      stand: z.string().nullable().describe("Wann die Warenliste zuletzt gespeichert wurde; null ohne Liste"),
      summe: wareOut.omit({ name: true }),
      waren: z.array(wareOut),
    }),
  })
  .register(responseSchemas, { id: "Geschaeft" });

export const geschaeftBereichSchema = z
  .object({
    bereich: z.object({ id: z.uuid(), name: z.string(), zweig }),
    jahr: z.number().int().nullable().describe("Gewähltes Jahr; null = alle Jahre"),
    summe: summeOut,
    jeJahr: z
      .record(z.string(), z.object({ einnahmen: z.number().int(), ausgaben: z.number().int() }))
      .describe("Einnahmen und Ausgaben je Jahr, immer alle Jahre"),
    kontakte: z
      .array(z.object({ name: z.string().describe("Klartext-Name"), einnahmen: z.number().int(), ausgaben: z.number().int(), posten: z.number().int() }))
      .describe("Wer hinter der Summe steht, die größten zuerst"),
  })
  .register(responseSchemas, { id: "GeschaeftBereich" });

const bereichQuery = z.object({ jahr: z.coerce.number().int().min(1990).max(2200).optional().describe("Nur dieses Jahr; ohne Angabe alle Jahre") }).strict();

const mitGesamt = (jeJahr: Record<number, BereichSumme>) => ({ jeJahr, gesamt: bereichSummeGesamt(jeJahr) });

async function geschaeftHandler(): Promise<ApiResult> {
  const [u, lager] = await Promise.all([geschaeftUebersicht(), ladeWaren()]);
  const ware = (name: string, s: ReturnType<typeof wareSumme>) => ({
    name,
    stueck: s.stueck,
    verkauft: s.verkauft,
    einkauf: s.einkauf,
    wert: s.wert,
    wertDirekt: s.wertDirekt,
  });
  const { name: _ohne, ...summe } = ware("", warenSumme(lager.waren));
  return ok({
    jahre: u.jahre,
    bereiche: u.zeilen.map((z) => ({
      id: z.bereich.id,
      name: z.bereich.name,
      zweig: z.bereich.zweig,
      laufend: z.bereich.laufend === true,
      jeJahr: z.jeJahr,
      gesamt: z.gesamt,
    })),
    zweige: { eigenes: mitGesamt(u.zweige.eigenes), fremdes: mitGesamt(u.zweige.fremdes), gemeinsam: mitGesamt(u.zweige.gemeinsam) },
    gesamt: mitGesamt(u.gesamt),
    offen: u.offenGesamt,
    kunden: u.kunden,
    laufendeKosten: u.fixkosten && {
      von: u.fixkosten.von,
      bis: u.fixkosten.bis,
      summe: u.fixkosten.summe,
      monatlich: u.fixkosten.monatlich,
      posten: u.fixkosten.posten.map((p) => ({ name: p.kontakt, bereichId: p.bereichId, summe: p.summe, monate: p.monate, monatlich: p.monatlich })),
    },
    waren: { stand: lager.stand, summe, waren: lager.waren.map((w) => ware(w.name, wareSumme(w))) },
  });
}

async function bereichHandler(request: ApiRequest): Promise<ApiResult> {
  const query = validate(bereichQuery, request.query);
  if ("failure" in query) return query.failure;
  const id = request.params.id!;
  const zeile = (await geschaeftUebersicht()).zeilen.find((z) => z.bereich.id === id);
  if (!zeile) return notFound("Bereich nicht gefunden.");
  const liste = await geschaeftPosten({ bereichId: id, jahr: query.data.jahr });
  return ok({
    bereich: { id: zeile.bereich.id, name: zeile.bereich.name, zweig: zeile.bereich.zweig },
    jahr: query.data.jahr ?? null,
    summe: liste.summe,
    jeJahr: liste.jeJahr,
    kontakte: liste.kontakte,
  });
}

export const GESCHAEFT_ROUTES: ApiRoute[] = [
  {
    method: "GET",
    path: "/geschaeft",
    scope: "haben:lesen",
    tag: "Geschäft",
    summary: "Mein Geschäft: Übersicht lesen",
    description:
      "Die Auswertung der Seite „Mein Geschäft“: Einnahmen, Ausgaben und Ergebnis je Bereich, Zweig und Jahr, die größten Kunden, " +
      "die laufenden Kosten je Monat und der Warenbestand mit Wertspanne. Nur lesend, ohne einzelne Belege.",
    responses: { 200: { schema: "Geschaeft", description: "Die Übersicht" } },
    handler: geschaeftHandler,
  },
  {
    method: "GET",
    path: "/geschaeft/bereiche/{id}",
    scope: "haben:lesen",
    tag: "Geschäft",
    summary: "Mein Geschäft: einen Bereich lesen",
    description: "Wer hinter der Summe eines Bereichs steht: die Kontakte unter ihrem Klartext-Namen, die größten zuerst, auf Wunsch nur eines Jahres.",
    query: bereichQuery,
    responses: { 200: { schema: "GeschaeftBereich", description: "Der Bereich mit seinen Kontakten" } },
    handler: bereichHandler,
  },
];
