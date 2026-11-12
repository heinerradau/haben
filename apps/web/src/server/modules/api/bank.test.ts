import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { leeren, setupTestDb, testDatabaseUrl } from "../../test-db.ts";

const N26 =
  '"Booking Date","Value Date","Partner Name","Partner Iban",Type,"Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"\n' +
  '2026-10-30,2026-10-30,"Telekom Deutschland GmbH",,Direct Debit,"MF-2026-10","Main Account",-45.90,,,\n' +
  '2026-10-31,2026-10-31,"Erika Muster",,Outgoing Transfer,"Privat","Main Account",-500.00,,,\n';

describe.skipIf(!testDatabaseUrl)("REST-API /api/v1/bank (Postgres)", () => {
  let api: typeof import("./index.ts");
  let bankApi: typeof import("./bank.ts");
  let mcp: typeof import("../mcp/index.ts");
  let mcpServer: typeof import("../mcp/server.ts");
  let bank: typeof import("../bank/index.ts");
  let belege: typeof import("../belege/index.ts");
  let sql: postgres.Sql;
  const actor = "test-user";

  beforeAll(async () => {
    sql = await setupTestDb();
    await sql`insert into "user"(id,name,email,role) values (${actor}, 'Testinhaber', 'inhaber@example.de', 'inhaber')`;
    api = await import("./index.ts");
    bankApi = await import("./bank.ts");
    mcp = await import("../mcp/index.ts");
    mcpServer = await import("../mcp/server.ts");
    bank = await import("../bank/index.ts");
    belege = await import("../belege/index.ts");
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
  });

  beforeEach(async () => {
    mcpServer.resetRateLimitForTests();
    await leeren(sql)`truncate mcp_calls, mcp_tokens, write_offs, allocations, bank_transactions, bank_imports, bank_accounts, journal_lines,
      journal_entries, document_amounts, documents, company cascade`;
    await sql`insert into company (id, name, kontenrahmen, versteuerung) values (1, 'Testfirma', 'SKR03', 'ist')`;
  });

  type Scope = import("../mcp/index.ts").TokenScope;
  type Json = Record<string, unknown> & { error?: { code: string; message: string } };

  async function token(scopes: Scope[]) {
    await mcp.setMcpEnabled(actor, true);
    return (await mcp.createMcpToken({ name: "Buchhalter", days: 30, scopes }, new Date(), actor)).token;
  }

  async function send(tokenValue: string, method: string, path: string, body?: unknown) {
    const response = await api.handleApiRequest(
      new Request(`http://localhost:3000/api/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${tokenValue}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const text = await response.text();
    return { status: response.status, json: text ? (JSON.parse(text) as Json) : null };
  }

  /** Konto mit zwei Ausgängen und ein gebuchter Beleg über 45,90 € */
  async function bestand() {
    const account = await bank.createAccount(actor, { name: "N26 Business", iban: "DE55100110012620000000" });
    await bank.importStatement(actor, { bytes: new TextEncoder().encode(N26), filename: "n26.csv" }, account.id);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 1, 2, 3, 99]);
    const { id } = await belege.uploadDocument(actor, { bytes: jpeg, filename: "telekom.jpg" }, { background: () => {} });
    await belege.updateDocument(actor, id, {
      supplierName: "Telekom Deutschland GmbH",
      supplierUstId: "",
      invoiceNumber: "MF-2026-10",
      documentDate: "2026-10-29",
      dueDate: null,
      category: "telefon",
      payment: "bank",
      note: "",
      amounts: [{ taxRate: 1900, net: 3857, tax: 733 }],
    });
    await belege.bookDocument(actor, id);
    return { account, belegId: id };
  }

  it("liest Konten und offene Umsätze nur mit bank:lesen", async () => {
    const { account } = await bestand();
    expect((await send(await token(["belege:lesen"]), "GET", "/bank/umsaetze")).status).toBe(403);
    const t = await token(["bank:lesen"]);
    const konten = await send(t, "GET", "/bank/konten");
    expect(bankApi.bankAccountListSchema.parse(konten.json).data).toEqual([{ id: account.id, name: "N26 Business", purpose: "geschaeft", ibanEnde: "0000" }]);
    const umsaetze = bankApi.bankTransactionListSchema.parse((await send(t, "GET", "/bank/umsaetze")).json);
    expect(umsaetze.total).toBe(2);
    expect(umsaetze.data.map((u) => [u.bookingDate, u.amount, u.open, u.counterpartyName])).toEqual([
      ["2026-10-31", -500_00, -500_00, "Erika Muster"],
      ["2026-10-30", -45_90, -45_90, "Telekom Deutschland GmbH"],
    ]);
    expect((await send(t, "GET", "/bank/umsaetze?suche=Telekom")).json!.total).toBe(1);
    expect((await send(t, "GET", "/bank/umsaetze?status=zugeordnet")).json!.total).toBe(0);
    expect((await send(t, "GET", "/bank/umsaetze?konto=nix")).status).toBe(400);
    // Lesen allein ordnet nichts zu
    const id = umsaetze.data[1]!.id;
    expect((await send(t, "POST", `/bank/umsaetze/${id}/zuordnung`, { kind: "privat" })).status).toBe(403);
  });

  it("ordnet einen Umsatz dem gebuchten Beleg zu und bucht die Zahlung mit dem Token als Akteur", async () => {
    const { belegId } = await bestand();
    const t = await token(["bank:zuordnen"]);
    const [privat, telekom] = bankApi.bankTransactionListSchema.parse((await send(t, "GET", "/bank/umsaetze")).json).data;
    const detail = bankApi.bankTransactionDetailSchema.parse((await send(t, "GET", `/bank/umsaetze/${telekom!.id}`)).json);
    expect(detail.allocations).toEqual([]);
    expect(JSON.stringify(detail.suggestions)).toContain(belegId);

    // Falsches Vorzeichen und ein zu großer Betrag: abgelehnt, nichts gebucht
    const vorher = (await sql`select count(*)::int as n from journal_entries`)[0]!.n as number;
    expect((await send(t, "POST", `/bank/umsaetze/${telekom!.id}/zuordnung`, { kind: "document", documentId: belegId, amount: 45_90 })).status).toBe(422);
    expect((await send(t, "POST", `/bank/umsaetze/${privat!.id}/zuordnung`, { kind: "document", documentId: belegId })).status).toBe(422);
    expect((await send(t, "POST", `/bank/umsaetze/${telekom!.id}/zuordnung`, { kind: "document", belegId })).status).toBe(400);
    expect((await sql`select count(*)::int as n from journal_entries`)[0]!.n).toBe(vorher);

    const zugeordnet = await send(t, "POST", `/bank/umsaetze/${telekom!.id}/zuordnung`, { kind: "document", documentId: belegId });
    expect(zugeordnet.status).toBe(200);
    expect(bankApi.bankTransactionDetailSchema.parse(zugeordnet.json)).toMatchObject({
      open: 0,
      allocations: [{ kind: "document", amount: -45_90, documentId: belegId }],
    });
    expect((await sql`select count(*)::int as n from journal_entries`)[0]!.n).toBe(vorher + 1);
    const [audit] = await sql`select actor from audit_log where table_name = 'allocations' order by seq desc limit 1`;
    expect(audit!.actor).toMatch(/^api:.*:Buchhalter$/);
    // Schon erledigt: kein zweites Mal
    expect((await send(t, "POST", `/bank/umsaetze/${telekom!.id}/zuordnung`, { kind: "document", documentId: belegId })).status).toBe(422);

    // Überweisung aufs Privatkonto als Entnahme
    const entnahme = await send(t, "POST", `/bank/umsaetze/${privat!.id}/zuordnung`, { kind: "privat" });
    expect(entnahme.json).toMatchObject({ open: 0, allocations: [{ kind: "privat", amount: -500_00 }] });
    expect((await send(t, "GET", "/bank/umsaetze")).json!.total).toBe(0);
    expect((await send(t, "GET", "/bank/umsaetze/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
