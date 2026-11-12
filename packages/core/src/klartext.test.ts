import { describe, expect, it } from "vitest";
import { klartextName } from "./klartext.ts";

describe("Klartext-Namen", () => {
  it("nennt bekannte Anbieter beim Zweck und fasst Schreibweisen zusammen", () => {
    expect(klartextName("Meta Platforms Ireland Limited")).toBe("Facebook- und Instagram-Werbung");
    expect(klartextName("APPLE.COM")).toBe("Apple (Apps und iCloud)");
    expect(klartextName("© 2024 Apple Distribution International Ltd.")).toBe("Apple (Apps und iCloud)");
    expect(klartextName("Haufe Service Center GmbH")).toBe("Lexware Office");
  });

  it("zieht eigene Namen vor und lässt sonst nur die Rechtsform weg", () => {
    expect(klartextName("Telekom DE GmbH", [{ muster: "telekom", name: "Handy und Festnetz" }])).toBe("Handy und Festnetz");
    expect(klartextName("Auto Schoknecht Gmbh")).toBe("Auto Schoknecht");
    expect(klartextName("Fahrzeug Gmbh &amp; Co. KG")).toBe("Fahrzeug");
    expect(klartextName("Online Minds Aps")).toBe("Online Minds");
    expect(klartextName("Theater Nord")).toBe("Theater Nord");
    expect(klartextName("  ")).toBe("Ohne Namen");
    expect(klartextName("AG")).toBe("AG");
  });
});
