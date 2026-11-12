import { describe, expect, it } from "vitest";
import { belegfoto, fotoName, fotoZiel, istHeic, sollUmwandeln } from "./belegfoto.ts";

describe("Belegfoto vor dem Hochladen", () => {
  it("wandelt HEIC immer um, andere Bilder nur, wenn sie groß sind, und nie PDFs oder E-Rechnungen", () => {
    expect(istHeic({ type: "image/heic", name: "IMG_1.HEIC" })).toBe(true);
    expect(istHeic({ type: "", name: "IMG_1.heif" })).toBe(true);
    expect(sollUmwandeln({ type: "image/heic", name: "a.heic", size: 100 })).toBe(true);
    expect(sollUmwandeln({ type: "image/jpeg", name: "a.jpg", size: 900_000 })).toBe(false);
    expect(sollUmwandeln({ type: "image/jpeg", name: "a.jpg", size: 4_000_000 })).toBe(true);
    expect(sollUmwandeln({ type: "image/png", name: "a.png", size: 4_000_000 })).toBe(true);
    expect(sollUmwandeln({ type: "application/pdf", name: "a.pdf", size: 9_000_000 })).toBe(false);
    expect(sollUmwandeln({ type: "text/xml", name: "a.xml", size: 9_000_000 })).toBe(false);
  });

  it("verkleinert auf die längere Kante, hält das Seitenverhältnis und vergrößert nie", () => {
    expect(fotoZiel(4032, 3024)).toEqual({ breite: 2400, hoehe: 1800 });
    expect(fotoZiel(3024, 4032)).toEqual({ breite: 1800, hoehe: 2400 });
    expect(fotoZiel(1200, 800)).toEqual({ breite: 1200, hoehe: 800 });
    expect(fotoZiel(10_000, 10)).toEqual({ breite: 2400, hoehe: 2 });
    expect(fotoZiel(0, 0)).toEqual({ breite: 0, hoehe: 0 });
  });

  it("gibt dem umgewandelten Foto die Endung .jpg", () => {
    expect(fotoName("IMG_4711.HEIC")).toBe("IMG_4711.jpg");
    expect(fotoName("quittung.tanke.png")).toBe("quittung.tanke.jpg");
    expect(fotoName("beleg")).toBe("beleg.jpg");
    expect(fotoName(".heic")).toBe("beleg.jpg");
  });

  it("lässt die Datei, wie sie ist, wenn nichts zu tun ist oder der Browser keine Bilder umwandeln kann", async () => {
    const pdf = new File([new Uint8Array(10)], "rechnung.pdf", { type: "application/pdf" });
    expect(await belegfoto(pdf)).toBe(pdf);
    // In der Testumgebung gibt es kein createImageBitmap: das Original geht hoch
    const heic = new File([new Uint8Array(10)], "IMG_1.heic", { type: "image/heic" });
    expect(await belegfoto(heic)).toBe(heic);
  });
});
