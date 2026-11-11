import { describe, expect, it } from "vitest";
import {
  bereichFuerPosten,
  bereichSummeGesamt,
  bereicheAuswerten,
  postenZuordnen,
  regelPasst,
  regelnSortiert,
  type BereichPosten,
  type BereichRegel,
  type Geschaeftsbereich,
} from "./geschaeftsbereiche.ts";

const bereiche: Geschaeftsbereich[] = [
  { id: "auftrag", name: "Auftragsarbeit", zweig: "fremdes", sortierung: 1 },
  { id: "shop", name: "Online-Shop", zweig: "eigenes", sortierung: 2 },
  { id: "ware", name: "Ware und Material", zweig: "eigenes", sortierung: 3 },
  { id: "kfz", name: "Fahrzeug", zweig: "gemeinsam", sortierung: 4 },
  { id: "steuer", name: "Steuerzahlungen", zweig: "neutral", sortierung: 5 },
];

function regel(teil: Partial<BereichRegel> & Pick<BereichRegel, "id" | "bereichId" | "feld" | "muster">): BereichRegel {
  return { richtung: null, rang: 0, ...teil };
}

const regeln: BereichRegel[] = [
  regel({ id: "r1", bereichId: "auftrag", feld: "kontakt", muster: "Theater", richtung: "einnahme" }),
  regel({ id: "r2", bereichId: "shop", feld: "nummer", muster: "SHOP", richtung: "einnahme" }),
  regel({ id: "r3", bereichId: "ware", feld: "kategorie", muster: "Material", richtung: "ausgabe" }),
  regel({ id: "r4", bereichId: "kfz", feld: "kategorie", muster: "Kraftstoff" }),
  regel({ id: "r5", bereichId: "steuer", feld: "kategorie", muster: "Umsatzsteuer-Vorauszahlungen" }),
];

function posten(teil: Partial<BereichPosten> & Pick<BereichPosten, "belegId" | "richtung" | "netto">): BereichPosten {
  return { belegart: "invoice", nummer: "", datum: "2025-03-01", kontakt: "", kategorie: "", text: "", ...teil };
}

describe("Geschäftsbereiche", () => {
  it("vergleicht Muster als Teilzeichenkette ohne Groß- und Kleinschreibung und beachtet die Richtung", () => {
    const p = posten({ belegId: "b1", richtung: "einnahme", netto: 100_00, kontakt: "Stadt-THEATER Musterstadt" });
    expect(regelPasst(regeln[0]!, p)).toBe(true);
    expect(regelPasst(regeln[0]!, { ...p, richtung: "ausgabe" })).toBe(false);
    expect(regelPasst(regel({ id: "x", bereichId: "auftrag", feld: "kontakt", muster: "   " }), p)).toBe(false);
    // Kein regulärer Ausdruck: Sonderzeichen stehen für sich
    expect(regelPasst(regel({ id: "y", bereichId: "auftrag", feld: "kontakt", muster: ".*" }), p)).toBe(false);
  });

  it("prüft Regeln nach Rang, dann nach Länge des Musters, dann nach Reihenfolge", () => {
    const sortiert = regelnSortiert([
      regel({ id: "kurz", bereichId: "shop", feld: "text", muster: "Shirt" }),
      regel({ id: "lang", bereichId: "auftrag", feld: "text", muster: "Shirt bedruckt" }),
      regel({ id: "rang", bereichId: "kfz", feld: "text", muster: "S", rang: 5 }),
      regel({ id: "kurz2", bereichId: "ware", feld: "text", muster: "shirt" }),
    ]);
    expect(sortiert.map((r) => r.id)).toEqual(["rang", "lang", "kurz", "kurz2"]);
  });

  it("zieht die Zuordnung von Hand der Regel vor und übergeht gelöschte Bereiche", () => {
    const p = posten({ belegId: "b1", richtung: "einnahme", netto: 100_00, kontakt: "Theater" });
    const ids = new Set(bereiche.map((b) => b.id));
    const sortiert = regelnSortiert(regeln);
    expect(bereichFuerPosten(p, sortiert, new Map(), ids)).toEqual({ bereichId: "auftrag", quelle: "regel", regelId: "r1" });
    expect(bereichFuerPosten(p, sortiert, new Map([["b1", "shop"]]), ids)).toEqual({ bereichId: "shop", quelle: "hand", regelId: null });
    expect(bereichFuerPosten(p, sortiert, new Map([["b1", "gibt-es-nicht"]]), ids).quelle).toBe("regel");
    expect(bereichFuerPosten({ ...p, kontakt: "Unbekannt" }, sortiert, new Map(), ids)).toEqual({ bereichId: null, quelle: "offen", regelId: null });
  });

  it("summiert je Jahr nach Bereich und Zweig; Neutrales zählt nicht ins Gesamtergebnis, Offenes schon", () => {
    const zugeordnet = postenZuordnen(
      [
        posten({ belegId: "e1", richtung: "einnahme", netto: 1_000_00, kontakt: "Theater", datum: "2024-05-01" }),
        posten({ belegId: "e2", richtung: "einnahme", netto: 200_00, nummer: "SHOP-1", datum: "2024-06-01" }),
        posten({ belegId: "e3", richtung: "einnahme", netto: -50_00, nummer: "SHOP-GS-1", datum: "2025-01-10" }), // Gutschrift
        posten({ belegId: "a1", richtung: "ausgabe", netto: 300_00, kategorie: "Material/Waren", datum: "2024-02-01" }),
        posten({ belegId: "a2", richtung: "ausgabe", netto: 80_00, kategorie: "Kraftstoff/Ladestrom", datum: "2025-02-01" }),
        posten({ belegId: "a3", richtung: "ausgabe", netto: 500_00, kategorie: "Umsatzsteuer-Vorauszahlungen", datum: "2025-08-01" }),
        posten({ belegId: "a4", richtung: "ausgabe", netto: 40_00, kategorie: "Sonstiges", datum: "2025-09-01" }),
      ],
      bereiche,
      regeln,
      new Map(),
    );
    const a = bereicheAuswerten(zugeordnet, bereiche);
    expect(a.jahre).toEqual([2024, 2025]);
    expect(a.bereiche.auftrag![2024]).toEqual({ einnahmen: 1_000_00, ausgaben: 0, ergebnis: 1_000_00, posten: 1 });
    expect(a.bereiche.shop![2025]).toEqual({ einnahmen: -50_00, ausgaben: 0, ergebnis: -50_00, posten: 1 });
    expect(a.zweige.eigenes[2024]).toEqual({ einnahmen: 200_00, ausgaben: 300_00, ergebnis: -100_00, posten: 2 });
    expect(a.zweige.fremdes[2024]!.ergebnis).toBe(1_000_00);
    expect(a.zweige.gemeinsam[2025]!.ausgaben).toBe(80_00);
    expect(a.zweige.neutral[2025]!.ausgaben).toBe(500_00);
    expect(a.offen[2025]).toEqual({ einnahmen: 0, ausgaben: 40_00, ergebnis: -40_00, posten: 1 });
    // 2025: Gutschrift −50, Kraftstoff −80, Offenes −40; die Steuerzahlung bleibt draußen
    expect(a.gesamt[2025]).toEqual({ einnahmen: -50_00, ausgaben: 120_00, ergebnis: -170_00, posten: 3 });
    expect(bereichSummeGesamt(a.zweige.eigenes)).toEqual({ einnahmen: 150_00, ausgaben: 300_00, ergebnis: -150_00, posten: 3 });
    expect(bereichSummeGesamt({})).toEqual({ einnahmen: 0, ausgaben: 0, ergebnis: 0, posten: 0 });
  });
});
