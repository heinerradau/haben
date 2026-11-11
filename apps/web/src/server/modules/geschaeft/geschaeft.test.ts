import type postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { leeren, setupTestDb, testDatabaseUrl } from "../../test-db.ts";

describe.skipIf(!testDatabaseUrl)("Geschäftsbereiche (Postgres)", () => {
  let geschaeft: typeof import("./index.ts");
  let sql: postgres.Sql;
  const actor = "test-user";

  beforeAll(async () => {
    sql = await setupTestDb();
    geschaeft = await import("./index.ts");
  }, 30_000);

  afterAll(async () => {
    await sql?.end();
  });

  beforeEach(async () => {
    await leeren(sql)`truncate business_area_assignments, business_area_rules, business_areas, lexoffice_vouchers, lexoffice_imports, audit_log cascade`;
    await sql`insert into lexoffice_imports (status, progress) values ('fertig', '{}'::jsonb)`;
  });

  async function beleg(values: {
    direction: "einnahme" | "ausgabe";
    type?: string;
    number?: string;
    date: string;
    net: number;
    contact?: string;
    categories?: { name: string; net: number }[];
    status?: string;
    items?: string[];
    note?: string;
  }): Promise<string> {
    const categories = (values.categories ?? []).map((c) => ({ categoryId: "x", name: c.name, rate: 1900, net: c.net, tax: 0 }));
    const raw = { lineItems: (values.items ?? []).map((name) => ({ name })), web: { list: { note: values.note ?? "" } } };
    const [row] = await sql`insert into lexoffice_vouchers (lexoffice_id, import_id, type, direction, number, date, status, contact_name,
        net, tax, gross, taxes, categories, raw)
      values (${crypto.randomUUID()}, (select id from lexoffice_imports limit 1), ${values.type ?? "invoice"}, ${values.direction},
        ${values.number ?? ""}, ${values.date}, ${values.status ?? "paid"}, ${values.contact ?? ""}, ${values.net}, 0, ${values.net},
        '[]'::jsonb, ${JSON.stringify(categories)}::jsonb, ${JSON.stringify(raw)}::jsonb)
      returning id`;
    return row!.id as string;
  }

  const liste = {
    bereiche: [
      {
        name: "Auftragsarbeit",
        zweig: "fremdes" as const,
        regeln: [
          { feld: "kontakt" as const, muster: "Theater", richtung: "einnahme" as const },
          { feld: "text" as const, muster: "Bühnenbild" },
        ],
      },
      { name: "Online-Shop", zweig: "eigenes" as const, regeln: [{ feld: "nummer" as const, muster: "SHOP", richtung: "einnahme" as const }] },
      { name: "Ware und Material", zweig: "eigenes" as const, regeln: [{ feld: "kategorie" as const, muster: "Material", richtung: "ausgabe" as const }] },
      { name: "Fahrzeug", zweig: "gemeinsam" as const, regeln: [{ feld: "kategorie" as const, muster: "Kraftstoff" }] },
    ],
  };

  it("speichert die Liste, behält Kennungen gleichnamiger Bereiche und protokolliert jede Änderung", async () => {
    expect(await geschaeft.speichereBereichsliste(actor, liste)).toEqual({ bereiche: 4, regeln: 5 });
    const erste = await geschaeft.ladeBereiche();
    expect(erste.bereiche.map((b) => [b.name, b.zweig])).toEqual([
      ["Auftragsarbeit", "fremdes"],
      ["Online-Shop", "eigenes"],
      ["Ware und Material", "eigenes"],
      ["Fahrzeug", "gemeinsam"],
    ]);
    expect(await geschaeft.exportiereBereichsliste()).toMatchObject({
      bereiche: [{ name: "Auftragsarbeit", regeln: [{ muster: "Theater" }, { muster: "Bühnenbild" }] }, {}, {}, {}],
    });

    // Zweite Fassung: ein Bereich fällt weg, einer kommt dazu, einer wechselt den Zweig und steht jetzt vorn
    await geschaeft.speichereBereichsliste(actor, {
      bereiche: [
        { name: "fahrzeug", zweig: "neutral", regeln: [] },
        liste.bereiche[0]!,
        { name: "Kurse", zweig: "fremdes", regeln: [{ feld: "text", muster: "Workshop" }] },
      ],
    });
    const zweite = await geschaeft.ladeBereiche();
    expect(zweite.bereiche.map((b) => [b.name, b.zweig])).toEqual([
      ["fahrzeug", "neutral"],
      ["Auftragsarbeit", "fremdes"],
      ["Kurse", "fremdes"],
    ]);
    const id = (name: string, von: typeof erste) => von.bereiche.find((b) => b.name.toLowerCase() === name.toLowerCase())?.id;
    expect(id("Fahrzeug", zweite)).toBe(id("Fahrzeug", erste));
    expect(id("Auftragsarbeit", zweite)).toBe(id("Auftragsarbeit", erste));
    expect(zweite.regeln).toHaveLength(3);

    const log = await sql<{ table_name: string; actor: string }[]>`select table_name, actor from audit_log where table_name like 'business_area%'`;
    expect(log.length).toBeGreaterThan(10);
    expect(log.every((row) => row.actor === actor)).toBe(true);
  });

  it("weist ungültige Listen mit deutscher Meldung ab und lässt den alten Stand stehen", async () => {
    await geschaeft.speichereBereichsliste(actor, liste);
    await expect(
      geschaeft.speichereBereichsliste(actor, {
        bereiche: [
          { name: "A", zweig: "eigenes" },
          { name: "a", zweig: "fremdes" },
        ],
      }),
    ).rejects.toThrow(/steht doppelt/);
    await expect(geschaeft.speichereBereichsliste(actor, { bereiche: [{ name: " ", zweig: "eigenes" }] })).rejects.toThrow();
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: absichtlich ungültige Eingabe
      geschaeft.speichereBereichsliste(actor, { bereiche: [{ name: "A", zweig: "sonstwas" as any }] }),
    ).rejects.toThrow();
    expect((await geschaeft.ladeBereiche()).bereiche).toHaveLength(4);
  });

  it("wertet den Altbestand je Jahr aus: Regeln, Zuordnung von Hand, mehrere Kategorien, Stornos bleiben draußen", async () => {
    await geschaeft.speichereBereichsliste(actor, liste);
    await beleg({ direction: "einnahme", number: "RE1", date: "2024-03-01", net: 1_000_00, contact: "Stadttheater Musterstadt" });
    await beleg({ direction: "einnahme", number: "RE2", date: "2024-04-01", net: 500_00, contact: "Verein", items: ["Bühnenbild malen"] });
    await beleg({
      direction: "einnahme",
      type: "salesinvoice",
      number: "SHOP1001",
      date: "2025-01-05",
      net: 40_00,
      categories: [{ name: "Einnahmen", net: 40_00 }],
    });
    await beleg({ direction: "einnahme", number: "RE3", date: "2025-02-01", net: 999_00, contact: "Theater", status: "voided" });
    const gemischt = await beleg({
      direction: "ausgabe",
      type: "purchaseinvoice",
      date: "2025-03-01",
      net: 150_00,
      contact: "Baumarkt",
      categories: [
        { name: "Material/Waren", net: 100_00 },
        { name: "Kraftstoff/Ladestrom", net: 50_00 },
      ],
    });
    const unklar = await beleg({
      direction: "ausgabe",
      type: "purchaseinvoice",
      date: "2025-06-01",
      net: 70_00,
      contact: "Unbekannt",
      categories: [{ name: "Sonstiges", net: 70_00 }],
    });

    const u = await geschaeft.geschaeftUebersicht();
    expect(u.jahre).toEqual([2024, 2025]);
    const zeile = (name: string) => u.zeilen.find((z) => z.bereich.name === name)!;
    expect(zeile("Auftragsarbeit").jeJahr[2024]).toEqual({ einnahmen: 1_500_00, ausgaben: 0, ergebnis: 1_500_00, posten: 2 });
    expect(zeile("Auftragsarbeit").jeJahr[2025]).toBeUndefined(); // der Storno zählt nicht
    expect(zeile("Online-Shop").gesamt.einnahmen).toBe(40_00);
    expect(zeile("Ware und Material").jeJahr[2025]!.ausgaben).toBe(100_00);
    expect(zeile("Fahrzeug").jeJahr[2025]!.ausgaben).toBe(50_00);
    expect(zeile("Auftragsarbeit").regeln).toBe(2);
    expect(u.offenGesamt).toEqual({ einnahmen: 0, ausgaben: 70_00, ergebnis: -70_00, posten: 1 });
    expect(u.zweige.eigenes[2025]).toEqual({ einnahmen: 40_00, ausgaben: 100_00, ergebnis: -60_00, posten: 2 });
    expect(u.gesamt[2025]!.ergebnis).toBe(40_00 - 100_00 - 50_00 - 70_00);
    expect(u.quellen).toEqual({ hand: 0, regel: 5, offen: 1 });

    // Von Hand: der unklare Beleg gehört zum Fahrzeug, der gemischte ganz zur Ware
    const fahrzeug = zeile("Fahrzeug").bereich.id;
    const ware = zeile("Ware und Material").bereich.id;
    await geschaeft.ordneBelegZu(actor, unklar, fahrzeug);
    await geschaeft.ordneBelegZu(actor, gemischt, fahrzeug);
    await geschaeft.ordneBelegZu(actor, gemischt, ware); // zweite Zuordnung ersetzt die erste
    const danach = await geschaeft.geschaeftUebersicht();
    expect(danach.offenGesamt.posten).toBe(0);
    expect(danach.zeilen.find((z) => z.bereich.id === ware)!.jeJahr[2025]!.ausgaben).toBe(150_00);
    expect(danach.zeilen.find((z) => z.bereich.id === fahrzeug)!.jeJahr[2025]!.ausgaben).toBe(70_00);
    expect(danach.quellen).toEqual({ hand: 3, regel: 3, offen: 0 });

    const liste2025 = await geschaeft.geschaeftPosten({ bereichId: ware, jahr: 2025 });
    expect(liste2025.posten.map((p) => [p.kategorie, p.netto, p.quelle])).toEqual([
      ["Material/Waren", 100_00, "hand"],
      ["Kraftstoff/Ladestrom", 50_00, "hand"],
    ]);
    expect(liste2025.summe.ausgaben).toBe(150_00);

    // Aufheben: die Regeln gelten wieder
    await geschaeft.ordneBelegZu(actor, unklar, null);
    expect((await geschaeft.geschaeftPosten({ bereichId: null })).posten.map((p) => p.belegId)).toEqual([unklar]);
    await expect(geschaeft.ordneBelegZu(actor, crypto.randomUUID(), fahrzeug)).rejects.toThrow(/Beleg nicht gefunden/);
    await expect(geschaeft.ordneBelegZu(actor, unklar, crypto.randomUUID())).rejects.toThrow(/Bereich nicht gefunden/);
  });

  it("lässt den archivierten Beleg unverändert", async () => {
    await geschaeft.speichereBereichsliste(actor, liste);
    const id = await beleg({ direction: "ausgabe", type: "purchaseinvoice", date: "2025-06-01", net: 70_00, categories: [{ name: "Sonstiges", net: 70_00 }] });
    const [vorher] = await sql`select md5(v::text) as stand from lexoffice_vouchers v where id = ${id}`;
    await geschaeft.ordneBelegZu(actor, id, (await geschaeft.ladeBereiche()).bereiche[0]!.id);
    const [nachher] = await sql`select md5(v::text) as stand from lexoffice_vouchers v where id = ${id}`;
    expect(nachher!.stand).toBe(vorher!.stand);
  });
});
