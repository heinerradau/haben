import { z } from "zod";
import { allocate, listAccounts, listTransactions, transactionDetail } from "../bank/index.ts";
import { notFound, ok, validate, type ApiRequest, type ApiResult } from "./http.ts";
import type { ApiRoute } from "./routes.ts";
import { requestSchemas, responseSchemas } from "./schemas.ts";

/*
 * Bank über die REST-API: Werkzeuge und KI-Assistenten lesen Konten und Umsätze (bank:lesen) und ordnen einen Umsatz
 * einem gebuchten Beleg, einer Rechnung oder einer einfachen Direktbuchung zu (bank:zuordnen). Zugeordnet wird über
 * `allocate`, also mit denselben Prüfungen und derselben Buchung wie im Bankabgleich. Importieren, Aufteilen, Skonto,
 * Steuerzahlungen und das Aufheben einer Zuordnung bleiben in Haben.
 */

const CENT = "in Cent, Vorzeichen wie auf dem Konto (Ausgang negativ)";

const accountOut = z
  .object({
    id: z.uuid(),
    name: z.string(),
    purpose: z.string().describe("geschaeft, steuer, ruecklage, privat oder zahlungsdienstleister"),
    ibanEnde: z.string().describe("Die letzten vier Zeichen der IBAN"),
  })
  .register(responseSchemas, { id: "BankAccount" });

export const bankAccountListSchema = z.object({ data: z.array(accountOut) }).register(responseSchemas, { id: "BankAccountList" });

const transactionShape = {
  id: z.uuid(),
  accountId: z.uuid(),
  bookingDate: z.iso.date(),
  amount: z.number().int().describe(`Betrag ${CENT}`),
  open: z.number().int().describe(`Noch nicht zugeordneter Teil ${CENT}; 0 = erledigt`),
  counterpartyName: z.string().nullable(),
  purpose: z.string().nullable().describe("Verwendungszweck"),
};

const transactionOut = z.object(transactionShape).register(responseSchemas, { id: "BankTransaction" });

export const bankTransactionListSchema = z
  .object({ data: z.array(transactionOut), total: z.number().int().describe("Anzahl aller Treffer, unabhängig von limit und offset") })
  .register(responseSchemas, { id: "BankTransactionList" });

export const bankTransactionDetailSchema = z
  .object({
    ...transactionShape,
    allocations: z
      .array(z.object({ id: z.uuid(), kind: z.string(), amount: z.number().int(), documentId: z.uuid().nullable(), invoiceId: z.uuid().nullable() }))
      .describe("Bestehende Zuordnungen, ohne aufgehobene"),
    suggestions: z.array(z.record(z.string(), z.unknown())).describe("Vorschläge von Haben für den offenen Teil, die besten zuerst, mit Begründung"),
  })
  .register(responseSchemas, { id: "BankTransactionDetail" });

const transactionQuery = z
  .object({
    konto: z.uuid().optional().describe("Nur dieses Konto; ohne Angabe alle Konten"),
    status: z.enum(["offen", "zugeordnet", "alle"]).default("offen"),
    suche: z.string().trim().max(100).default("").describe("Sucht in Name, Verwendungszweck und Betrag"),
    limit: z.coerce.number().int().min(1).max(500).default(100).describe("Höchstens so viele Einträge, 1 bis 500"),
    offset: z.coerce.number().int().min(0).default(0).describe("So viele Einträge überspringen"),
  })
  .strict();

const amount = z.number().int().optional().describe(`Betrag ${CENT}; ohne Angabe der ganze offene Teil des Umsatzes`);

/** Einfache Direktbuchungen ohne weitere Angaben; alle anderen Arten bleiben dem Bankabgleich in Haben vorbehalten */
const DIREKT = ["privat", "geldtransit", "gebuehren"] as const;

const allocationIn = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("document"), documentId: z.uuid().describe("Gebuchter Beleg mit Zahlungsweg Bank"), amount }).strict(),
    z.object({ kind: z.literal("invoice"), invoiceId: z.uuid().describe("Festgeschriebene Rechnung"), amount }).strict(),
    z
      .object({
        kind: z.enum(DIREKT).describe("privat = Entnahme oder Einlage, geldtransit = Umbuchung zwischen eigenen Konten, gebuehren = Bankgebühr"),
        amount,
      })
      .strict(),
  ])
  .register(requestSchemas, { id: "BankAllocation" });

async function listAccountsHandler(): Promise<ApiResult> {
  const accounts = await listAccounts();
  return ok({ data: accounts.map((a) => ({ id: a.id, name: a.name, purpose: a.purpose, ibanEnde: (a.iban ?? "").slice(-4) })) });
}

async function listTransactionsHandler(request: ApiRequest): Promise<ApiResult> {
  const query = validate(transactionQuery, request.query);
  if ("failure" in query) return query.failure;
  const { konto, status, suche, limit, offset } = query.data;
  const accounts = (await listAccounts()).filter((a) => !konto || a.id === konto);
  const rows = (await Promise.all(accounts.map(async (a) => (await listTransactions(a.id, status, suche)).map((t) => ({ ...t, accountId: a.id })))))
    .flat()
    .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate));
  return ok({
    data: rows.slice(offset, offset + limit).map((t) => ({
      id: t.id,
      accountId: t.accountId,
      bookingDate: t.bookingDate,
      amount: t.amount,
      open: t.open,
      counterpartyName: t.counterpartyName,
      purpose: t.purpose,
    })),
    total: rows.length,
  });
}

async function detailOut(id: string): Promise<z.output<typeof bankTransactionDetailSchema> | null> {
  const detail = await transactionDetail(id);
  if (!detail) return null;
  const t = detail.transaction;
  return {
    id: t.id,
    accountId: t.bankAccountId,
    bookingDate: t.bookingDate,
    amount: t.amount,
    open: t.open,
    counterpartyName: t.counterpartyName,
    purpose: t.purpose,
    allocations: detail.allocations
      .filter((a) => !a.reversed)
      .map((a) => ({ id: a.id, kind: a.kind, amount: a.amount, documentId: a.documentId, invoiceId: a.invoiceId })),
    suggestions: detail.suggestions as unknown as Record<string, unknown>[],
  };
}

const TRANSACTION_NOT_FOUND = "Umsatz nicht gefunden.";

async function getTransactionHandler(request: ApiRequest): Promise<ApiResult> {
  const out = await detailOut(request.params.id!);
  return out ? ok(out) : notFound(TRANSACTION_NOT_FOUND);
}

/** Ordnet den Umsatz zu wie der Bankabgleich in Haben; die Zuordnung bucht sofort und fest */
async function allocateHandler(request: ApiRequest): Promise<ApiResult> {
  const input = validate(allocationIn, request.body);
  if ("failure" in input) return input.failure;
  const transactionId = request.params.id!;
  const vorher = await detailOut(transactionId);
  if (!vorher) return notFound(TRANSACTION_NOT_FOUND);
  const { amount: betrag, ...ziel } = input.data;
  await allocate(request.actor, { ...ziel, transactionId, amount: betrag ?? vorher.open });
  return ok(await detailOut(transactionId));
}

export const BANK_ROUTES: ApiRoute[] = [
  {
    method: "GET",
    path: "/bank/konten",
    scope: "bank:lesen",
    tag: "Bank",
    summary: "Konten auflisten",
    responses: { 200: { schema: "BankAccountList", description: "Bankkonten und Konten von Zahlungsdienstleistern" } },
    handler: listAccountsHandler,
  },
  {
    method: "GET",
    path: "/bank/umsaetze",
    scope: "bank:lesen",
    tag: "Bank",
    summary: "Umsätze auflisten",
    description: "Die jüngsten zuerst, ohne Angabe nur die noch offenen. Je Konto höchstens die 500 jüngsten Treffer; mit suche eingrenzen.",
    query: transactionQuery,
    responses: { 200: { schema: "BankTransactionList", description: "Eine Seite Umsätze" } },
    handler: listTransactionsHandler,
  },
  {
    method: "GET",
    path: "/bank/umsaetze/{id}",
    scope: "bank:lesen",
    tag: "Bank",
    summary: "Umsatz lesen",
    description: "Der Umsatz mit seinen Zuordnungen und den Vorschlägen von Haben für den offenen Teil.",
    responses: { 200: { schema: "BankTransactionDetail", description: "Der Umsatz" } },
    handler: getTransactionHandler,
  },
  {
    method: "POST",
    path: "/bank/umsaetze/{id}/zuordnung",
    scope: "bank:zuordnen",
    tag: "Bank",
    summary: "Umsatz zuordnen",
    description:
      "Ordnet den Umsatz einem gebuchten Beleg, einer Rechnung oder einer einfachen Direktbuchung zu, wie der Bankabgleich in Haben; die Zuordnung " +
      "bucht sofort und fest. Das Recht bank:zuordnen ist nie vorbelegt. 422, wenn Betrag oder Vorzeichen nicht zum offenen Teil passen, der Beleg " +
      "nicht gebucht oder schon bezahlt ist. Aufheben, Aufteilen, Skonto und Steuerzahlungen bleiben in Haben.",
    requestBody: "BankAllocation",
    responses: { 200: { schema: "BankTransactionDetail", description: "Der Umsatz nach der Zuordnung" } },
    handler: allocateHandler,
  },
];
