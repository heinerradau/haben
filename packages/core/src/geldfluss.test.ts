import { describe, expect, it } from "vitest";
import { aufgelaufen, geldfluss } from "./geldfluss.ts";
import type { BereichSumme, BereichZweig } from "./geschaeftsbereiche.ts";

const summe = (einnahmen: number, ausgaben: number): BereichSumme => ({ einnahmen, ausgaben, ergebnis: einnahmen - ausgaben, posten: 1 });
const zeile = (name: string, zweig: BereichZweig, jeJahr: Record<number, BereichSumme>) => ({ bereich: { id: name, name, zweig, sortierung: 0 }, jeJahr });

describe("Geldfluss", () => {
  const zeilen = [
    zeile("Shop", "eigenes", { 2024: summe(400_00, 0), 2025: summe(900_00, 0) }),
    zeile("Ware", "eigenes", { 2024: summe(0, 300_00), 2025: summe(0, 200_00) }),
    zeile("Aufträge", "fremdes", { 2024: summe(1_000_00, 0) }),
    zeile("Auto", "gemeinsam", { 2024: summe(0, 1_500_00) }),
    zeile("Originale", "eigenes", { 2025: summe(-50_00, 0) }),
    zeile("Steuern", "neutral", { 2025: summe(0, 999_00) }),
  ];

  it("summiert alle Jahre je Bereich, Fremdes vor Eigenem vor gemeinsamen Kosten, ohne den Zweig neutral", () => {
    const fluss = geldfluss(zeilen);
    expect(fluss.ein.map((p) => [p.name, p.cents])).toEqual([
      ["Aufträge", 1_000_00],
      ["Shop", 1_300_00],
    ]);
    expect(fluss.aus.map((p) => [p.name, p.cents])).toEqual([
      ["Ware", 500_00],
      ["Originale", 50_00],
      ["Auto", 1_500_00],
    ]);
    expect(fluss).toMatchObject({ einnahmen: 2_300_00, ausgaben: 2_050_00, rest: 250_00 });
  });

  it("zeigt ein einzelnes Jahr; ein Minus bleibt ein Minus", () => {
    expect(geldfluss(zeilen, 2024)).toMatchObject({ einnahmen: 1_400_00, ausgaben: 1_800_00, rest: -400_00 });
    expect(geldfluss(zeilen, 2019)).toEqual({ ein: [], aus: [], einnahmen: 0, ausgaben: 0, rest: 0 });
  });

  it("zählt über die Jahre auf", () => {
    expect(aufgelaufen({ 2024: summe(400_00, 300_00), 2026: summe(100_00, 0) }, [2024, 2025, 2026])).toEqual([
      { jahr: 2024, einnahmen: 400_00, ausgaben: 300_00 },
      { jahr: 2025, einnahmen: 400_00, ausgaben: 300_00 },
      { jahr: 2026, einnahmen: 500_00, ausgaben: 300_00 },
    ]);
  });
});
