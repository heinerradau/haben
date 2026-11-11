import { describe, expect, it } from "vitest";
import { warenSumme, wareSumme } from "./warenbestand.ts";

describe("Warenbestand", () => {
  it("rechnet Stückzahl mal Einkaufspreis und mal Verkaufspreis", () => {
    expect(wareSumme({ name: "Tasche", stueck: 978, einkaufCent: 1_96, preisCent: 8_50 })).toEqual({
      stueck: 978,
      einkauf: 1_916_88,
      wert: 8_313_00,
      spanne: 6_396_12,
    });
  });

  it("summiert die Liste; eine leere Liste ergibt null", () => {
    expect(
      warenSumme([
        { name: "Tasche", stueck: 10, einkaufCent: 2_00, preisCent: 8_50 },
        { name: "Schirm", stueck: 3, einkaufCent: 4_41, preisCent: 13_60 },
        { name: "Ladenhüter", stueck: 5, einkaufCent: 10_00, preisCent: 0 },
      ]),
    ).toEqual({ stueck: 18, einkauf: 83_23, wert: 125_80, spanne: 42_57 });
    expect(warenSumme([])).toEqual({ stueck: 0, einkauf: 0, wert: 0, spanne: 0 });
  });
});
