import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "../middleware.ts";
import {
  bereichslisteSchema,
  exportiereBereichsliste,
  geschaeftPosten,
  geschaeftUebersicht,
  ladeWaren,
  ordneBelegZu,
  speichereBereichsliste,
  speichereWarenliste,
  warenlisteSchema,
} from "../modules/geschaeft/index.ts";

const filterSchema = z.object({
  /** Kennung eines Bereichs oder „offen“ für Posten ohne Bereich; ohne Angabe keine Belegliste */
  bereich: z.union([z.uuid(), z.literal("offen")]).optional(),
  jahr: z.number().int().min(1990).max(2200).optional(),
});

/** Auswertung nach Geschäftsbereichen, die Liste der Bereiche zum Bearbeiten und auf Wunsch die Posten hinter einer Zahl */
export const getGeschaeft = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(filterSchema)
  .handler(async ({ data }) => {
    const [uebersicht, liste, waren, posten] = await Promise.all([
      geschaeftUebersicht(),
      exportiereBereichsliste(),
      ladeWaren(),
      data.bereich ? geschaeftPosten({ bereichId: data.bereich === "offen" ? null : data.bereich, jahr: data.jahr }) : null,
    ]);
    return { uebersicht, liste, waren, posten };
  });

export const saveBereichsliste = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(bereichslisteSchema)
  .handler(({ data, context }) => speichereBereichsliste(context.user.id, data));

export const saveWarenliste = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(warenlisteSchema)
  .handler(({ data, context }) => speichereWarenliste(context.user.id, data));

export const assignBeleg = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ belegId: z.uuid(), bereichId: z.uuid().nullable() }))
  .handler(async ({ data, context }) => {
    await ordneBelegZu(context.user.id, data.belegId, data.bereichId);
    return { ok: true };
  });
