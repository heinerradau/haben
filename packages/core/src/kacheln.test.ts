import { describe, expect, it } from "vitest";
import { kacheln } from "./kacheln.ts";

describe("Kachelbild", () => {
  it("gibt jeder Kachel die Fläche ihres Anteils, ohne Überlappung und ohne Lücke", () => {
    const werte = [600, 300, 50, 200, 0, 100];
    const k = kacheln(werte, 100, 50);
    expect(k).toHaveLength(werte.length);
    const gesamt = werte.reduce((s, w) => s + w, 0);
    for (const [i, kachel] of k.entries()) expect(kachel.w * kachel.h).toBeCloseTo((werte[i]! / gesamt) * 5000, 6);
    expect(k[4]).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    for (const a of k) {
      expect(a.x).toBeGreaterThanOrEqual(-1e-9);
      expect(a.y).toBeGreaterThanOrEqual(-1e-9);
      expect(a.x + a.w).toBeLessThanOrEqual(100 + 1e-9);
      expect(a.y + a.h).toBeLessThanOrEqual(50 + 1e-9);
    }
    const ueberlappt = (a: (typeof k)[number], b: (typeof k)[number]) =>
      a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (k[i]!.w > 0 && k[j]!.w > 0) expect(ueberlappt(k[i]!, k[j]!)).toBe(false);
    // Die größte Kachel liegt links oben und ist nicht langgezogen
    expect(k[0]).toMatchObject({ x: 0, y: 0 });
    expect(Math.max(k[0]!.w / k[0]!.h, k[0]!.h / k[0]!.w)).toBeLessThan(2.5);
  });

  it("kommt mit leeren Eingaben zurecht", () => {
    expect(kacheln([], 100, 50)).toEqual([]);
    expect(kacheln([0, 0], 100, 50)).toEqual([
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 0, h: 0 },
    ]);
    expect(kacheln([5], 10, 4)).toEqual([{ x: 0, y: 0, w: 10, h: 4 }]);
  });
});
