import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { leeren, setupTestDb, testDatabaseUrl } from "../../test-db.ts";

describe.skipIf(!testDatabaseUrl)("REST-API /api/v1/geschaeft (Postgres)", () => {
  let api: typeof import("./index.ts");
  let geschaeftApi: typeof import("./geschaeft.ts");
  let mcp: typeof import("../mcp/index.ts");
  let mcpServer: typeof import("../mcp/server.ts");
  let geschaeft: typeof import("../geschaeft/index.ts");
  let sql: postgres.Sql;
  const actor = "test-user";

  beforeAll(async () => {
    sql = await setupTestDb();
    await sql`insert into "user"(id,name,email,role) values (${actor}, 'Testinhaber', 'inhaber@example.de', 'inhaber') on conflict do nothing`;
    api = await import("./index.ts");
    geschaeftApi = await import("./geschaeft.ts");
    mcp = await import("../mcp/index.ts");
    mcpServer = await import("../mcp/server.ts");
    geschaeft = await import("../geschaeft/index.ts");
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
  });

  beforeEach(async () => {
    mcpServer.resetRateLimitForTests();
    await leeren(sql)`truncate mcp_calls, mcp_tokens, business_stock_items, business_area_assignments, business_area_rules, business_areas,
      lexoffice_vouchers, lexoffice_imports, company cascade`;
    await sql`insert into company (id, name, kontenrahmen, versteuerung) values (1, 'Testfirma', 'SKR03', 'ist')`;
    await sql`insert into lexoffice_imports (status, progress) values ('fertig', '{}'::jsonb)`;
  });

  type Scope = import("../mcp/index.ts").TokenScope;

  async function token(scopes: Scope[]) {
    await mcp.setMcpEnabled(actor, true);
    return (await mcp.createMcpToken({ name: "Cockpit", days: 30, scopes }, new Date(), actor)).token;
  }

  async function send(tokenValue: string, method: string, path: string) {
    const response = await api.handleApiRequest(
      new Request(`http://localhost:3000/api/v1${path}`, { method, headers: { Authorization: `Bearer ${tokenValue}` } }),
    );
    const text = await response.text();
    return { status: response.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : null };
  }

  async function beleg(direction: "einnahme" | "ausgabe", date: string, net: number, contact: string, number = "") {
    await sql`insert into lexoffice_vouchers (lexoffice_id, import_id, type, direction, number, date, status, contact_name, net, tax, gross, taxes, categories, raw)
      values (${crypto.randomUUID()}, (select id from lexoffice_imports limit 1), 'invoice', ${direction}, ${number}, ${date}, 'paid', ${contact},
        ${net}, 0, ${net}, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb)`;
  }

  it("liefert Bereiche, Zweige, Gewinn und Warenbestand nur mit haben:lesen und ändert nichts", async () => {
    await geschaeft.speichereBereichsliste(actor, {
      bereiche: [
        { name: "Auftragsarbeit", zweig: "fremdes", regeln: [{ feld: "kontakt", muster: "Theater", richtung: "einnahme" }] },
        { name: "Online-Shop", zweig: "eigenes", regeln: [{ feld: "nummer", muster: "SHOP", richtung: "einnahme" }] },
        { name: "Werbung", zweig: "gemeinsam", regeln: [{ feld: "kontakt", muster: "Meta Platforms", richtung: "ausgabe" }] },
      ],
    });
    await geschaeft.speichereWarenliste(actor, {
      waren: [{ name: "Poster", stueck: 10, einkaufCent: 200, preisCent: 900, ladenpreisCent: 2500, verkauft: 4 }],
    });
    await beleg("einnahme", "2025-03-01", 100_000, "Theater Musterstadt");
    await beleg("einnahme", "2026-04-01", 30_000, "Kundin", "SHOP-1");
    await beleg("ausgabe", "2026-05-01", 20_000, "Meta Platforms Ireland Limited");

    expect((await send(await token(["belege:lesen", "bank:lesen"]), "GET", "/geschaeft")).status).toBe(403);
    const t = await token(["haben:lesen"]);
    const antwort = await send(t, "GET", "/geschaeft");
    expect(antwort.status).toBe(200);
    const g = geschaeftApi.geschaeftSchema.parse(antwort.json);
    expect(g.jahre).toEqual([2025, 2026]);
    expect(g.zweige.fremdes.gesamt).toMatchObject({ einnahmen: 100_000, ergebnis: 100_000 });
    expect(g.zweige.eigenes.jeJahr["2026"]).toMatchObject({ einnahmen: 30_000 });
    expect(g.zweige.gemeinsam.gesamt).toMatchObject({ ausgaben: 20_000, ergebnis: -20_000 });
    expect(g.gesamt.gesamt.ergebnis).toBe(110_000);
    expect(g.kunden.fremdes).toEqual([{ kontakt: "Theater Musterstadt", einnahmen: 100_000, posten: 1 }]);
    expect(g.waren.summe).toEqual({ stueck: 10, verkauft: 4, einkauf: 2_000, wert: 9_000, wertDirekt: 25_000 });
    expect(g.waren.waren[0]).toMatchObject({ name: "Poster", stueck: 10 });

    // Ein Bereich: Kontakte unter Klartext-Namen, auf Wunsch nur eines Jahres
    const werbung = g.bereiche.find((b) => b.name === "Werbung")!;
    const bereich = geschaeftApi.geschaeftBereichSchema.parse((await send(t, "GET", `/geschaeft/bereiche/${werbung.id}`)).json);
    expect(bereich.kontakte).toEqual([{ name: "Facebook- und Instagram-Werbung", einnahmen: 0, ausgaben: 20_000, posten: 1 }]);
    expect(bereich.jeJahr).toEqual({ "2026": { einnahmen: 0, ausgaben: 20_000 } });
    const leer = geschaeftApi.geschaeftBereichSchema.parse((await send(t, "GET", `/geschaeft/bereiche/${werbung.id}?jahr=2025`)).json);
    expect(leer).toMatchObject({ jahr: 2025, kontakte: [], summe: { posten: 0 } });
    expect((await send(t, "GET", `/geschaeft/bereiche/${werbung.id}?jahr=x`)).status).toBe(400);
    expect((await send(t, "GET", "/geschaeft/bereiche/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    // Nur lesen: kein Schreibweg unter /geschaeft
    expect((await send(t, "POST", "/geschaeft")).status).toBe(405);
  });
});
