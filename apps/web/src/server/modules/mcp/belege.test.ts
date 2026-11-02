import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, testDatabaseUrl } from "../../test-db.ts";

describe.skipIf(!testDatabaseUrl)("Belege anlegen über MCP und POST /api/v1/belege (Postgres)", () => {
  let mcp: typeof import("./index.ts");
  let server: typeof import("./server.ts");
  let sql: postgres.Sql;
  const actor = "test-user";
  // Kleinste Dateien, die die Typerkennung als JPEG bzw. PDF annimmt
  const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 1, 2, 3]);
  const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

  beforeAll(async () => {
    sql = await setupTestDb();
    mcp = await import("./index.ts");
    server = await import("./server.ts");
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
  });

  beforeEach(async () => {
    server.resetRateLimitForTests();
    await sql`truncate mcp_calls, mcp_tokens, document_amounts, documents, company cascade`;
    await sql`insert into company (id, name, strasse, plz, ort, steuernummer, bundesland) values (1, 'Testfirma', 'Musterstraße 1', '77815', 'Bühl', '35/123/45678', 'BW')`;
    await mcp.setMcpEnabled(actor, true);
  });

  const token = async (scopes: ("haben:lesen" | "belege:anlegen")[], name = "Agent") => (await mcp.createMcpToken({ name, days: 30, scopes })).token;

  let nextId = 1;
  async function rpc(bearer: string, method: string, params: Record<string, unknown> = {}) {
    const response = await server.handleMcpRequest(
      new Request("http://localhost:3000/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
      }),
    );
    return (await response.json()) as { result: Record<string, unknown> & { isError?: boolean; content?: { text: string }[] } };
  }

  function upload(bearer: string | null, file?: { bytes: Uint8Array<ArrayBuffer>; name: string }, notiz?: string) {
    const form = new FormData();
    if (file) form.set("datei", new File([file.bytes], file.name));
    if (notiz) form.set("notiz", notiz);
    return mcp.handleBelegeApiRequest(
      new Request("http://localhost:3000/api/v1/belege", { method: "POST", headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}, body: form }),
    );
  }

  it("legt Tokens standardmäßig nur lesend an und speichert gewählte Rechte", async () => {
    await mcp.createMcpToken({ name: "Alt", days: 30 });
    await token(["belege:anlegen", "haben:lesen"], "Beides");
    await token(["belege:anlegen"], "Nur Belege");
    const rows = await sql`select name, scopes from mcp_tokens order by name`;
    expect(rows.map((r) => [r.name, r.scopes])).toEqual([
      ["Alt", ["haben:lesen"]],
      ["Beides", ["haben:lesen", "belege:anlegen"]],
      ["Nur Belege", ["belege:anlegen"]],
    ]);
    await expect(mcp.createMcpToken({ name: "Leer", days: 30, scopes: [] })).rejects.toThrow(/mindestens ein Recht/);
  });

  it("bietet beleg_anlegen nur mit dem Recht an, als nicht nur lesend", async () => {
    const lesen = await rpc(await token(["haben:lesen"]), "tools/list");
    expect((lesen.result.tools as { name: string }[]).map((t) => t.name)).not.toContain("beleg_anlegen");

    const nurBelege = await rpc(await token(["belege:anlegen"]), "tools/list");
    const tools = nurBelege.result.tools as { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[];
    expect(tools.map((t) => t.name)).toEqual(["beleg_anlegen"]);
    expect(tools[0]!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });

    const init = await rpc(await token(["haben:lesen", "belege:anlegen"]), "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(init.result.instructions).toMatch(/Belege als „Zu prüfen“ anlegen/);
  });

  it("legt über MCP einen Beleg als „Zu prüfen“ an, mit Herkunft und Akteur, und erkennt Dubletten", async () => {
    const bearer = await token(["belege:anlegen"], "Claude im Faden");
    const call = (args: Record<string, unknown>) => rpc(bearer, "tools/call", { name: "beleg_anlegen", arguments: args });

    const first = await call({ dateiname: "quittung.jpg", inhaltBase64: base64(jpeg(1)), notiz: "aus dem Postfach" });
    expect(first.result.isError).toBeFalsy();
    const created = JSON.parse(first.result.content![0]!.text) as { id: string; doppelt: boolean; link: string };
    expect(created).toMatchObject({ doppelt: false, link: `http://localhost:3000/belege/${created.id}` });

    const [doc] = await sql`select filename, status, note from documents where id = ${created.id}`;
    expect(doc).toMatchObject({ filename: "quittung.jpg", status: "neu", note: "Über KI-Assistent „Claude im Faden“: aus dem Postfach" });
    const [audit] = await sql`select actor from audit_log where table_name = 'documents' and row_id = ${created.id} order by id limit 1`;
    expect(audit!.actor).toBe("agent:mcp");

    const again = JSON.parse((await call({ dateiname: "kopie.jpg", inhaltBase64: base64(jpeg(1)) })).result.content![0]!.text) as { id: string; doppelt: boolean };
    expect(again).toMatchObject({ id: created.id, doppelt: true });

    const kaputt = await call({ dateiname: "x.jpg", inhaltBase64: "kein base64!" });
    expect(kaputt.result.isError).toBe(true);
    expect(kaputt.result.content![0]!.text).toMatch(/kein gültiges Base64/);
    const falscherTyp = await call({ dateiname: "x.txt", inhaltBase64: base64(new TextEncoder().encode("Hallo")) });
    expect(falscherTyp.result.content![0]!.text).toMatch(/Erlaubt sind PDF/);
  });

  it("nimmt über POST /api/v1/belege nur mit dem Recht Belege an", async () => {
    expect((await upload(null, { bytes: jpeg(2), name: "a.jpg" })).status).toBe(401);
    expect((await upload(await token(["haben:lesen"]), { bytes: jpeg(2), name: "a.jpg" })).status).toBe(403);

    const bearer = await token(["belege:anlegen"], "Paperless");
    expect((await upload(bearer)).status).toBe(400);

    const created = await upload(bearer, { bytes: jpeg(2), name: "rechnung.jpg" }, "Tag: Bürobedarf");
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; doppelt: boolean; link: string };
    expect(body).toMatchObject({ doppelt: false, link: `http://localhost:3000/belege/${body.id}` });
    const [doc] = await sql`select status, note from documents where id = ${body.id}`;
    expect(doc).toMatchObject({ status: "neu", note: "Über API-Zugang „Paperless“: Tag: Bürobedarf" });
    const [audit] = await sql`select actor from audit_log where table_name = 'documents' and row_id = ${body.id} order by id limit 1`;
    expect(audit!.actor).toBe("agent:api");

    const duplicate = await upload(bearer, { bytes: jpeg(2), name: "nochmal.jpg" });
    expect(duplicate.status).toBe(200);
    expect(((await duplicate.json()) as { id: string; doppelt: boolean })).toMatchObject({ id: body.id, doppelt: true });

    const leer = await upload(bearer, { bytes: new Uint8Array(), name: "leer.pdf" });
    expect(leer.status).toBe(422);

    const calls = await sql`select tool, ok from mcp_calls order by at, id`;
    expect(calls.map((c) => [c.tool, c.ok])).toEqual([
      ["api:belege", false],
      ["api:belege", true],
      ["api:belege", true],
      ["api:belege", false],
    ]);
  });

  it("lehnt die Schnittstelle bei ausgeschaltetem Zugang ab", async () => {
    const bearer = await token(["belege:anlegen"]);
    await mcp.setMcpEnabled(actor, false);
    expect((await upload(bearer, { bytes: jpeg(3), name: "a.jpg" })).status).toBe(401);
  });
});
