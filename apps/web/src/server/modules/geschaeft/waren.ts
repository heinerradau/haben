import type { Ware } from "@haben/core";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "../../db/actor.ts";
import { db, schema } from "../../db/index.ts";
import { GeschaeftsbereichError } from "./bereiche.ts";

/*
 * Warenbestand der Auswertung unter /geschaeft: eine selbst gepflegte Liste (Name, Stück, Einkaufspreis, Verkaufspreis).
 * Wie die Bereichsliste wird sie als Ganzes gelesen und geschrieben, auch als JSON, damit ein Assistent oder ein Skript
 * sie aus einer Warenwirtschaft oder einem Shop übernehmen kann.
 */

const preis = (was: string) => z.number().int(`${was} steht in ganzen Cent.`).min(0, `${was} darf nicht negativ sein.`).max(100_000_000);

const wareSchema = z.object({
  name: z.string().trim().min(1, "Eine Ware braucht einen Namen.").max(120, "Der Name einer Ware darf höchstens 120 Zeichen lang sein."),
  stueck: z.number().int("Die Stückzahl ist eine ganze Zahl.").min(0, "Die Stückzahl darf nicht negativ sein.").max(10_000_000),
  einkaufCent: preis("Der Einkaufspreis"),
  preisCent: preis("Der Verkaufspreis"),
});

/** Die ganze Liste, so wie sie gespeichert, gesichert und übertragen wird */
export const warenlisteSchema = z.object({
  waren: z.array(wareSchema).max(1000, "Höchstens 1000 Waren."),
});

export type Warenliste = z.output<typeof warenlisteSchema>;

export interface GeladeneWaren {
  waren: Ware[];
  /** Wann die Liste zuletzt gespeichert wurde; null ohne Liste */
  stand: string | null;
}

export async function ladeWaren(): Promise<GeladeneWaren> {
  const zeilen = await db.select().from(schema.businessStockItems).orderBy(asc(schema.businessStockItems.sortierung), asc(schema.businessStockItems.name));
  return {
    waren: zeilen.map((z) => ({ name: z.name, stueck: z.stueck, einkaufCent: z.einkaufCent, preisCent: z.preisCent })),
    stand: zeilen.length > 0 ? new Date(Math.max(...zeilen.map((z) => z.createdAt.getTime()))).toISOString() : null,
  };
}

/** Ersetzt den Warenbestand durch die Liste */
export async function speichereWarenliste(actor: string, input: Warenliste): Promise<{ waren: number }> {
  const liste = warenlisteSchema.parse(input);
  const namen = liste.waren.map((w) => w.name.toLowerCase());
  const doppelt = namen.find((name, index) => namen.indexOf(name) !== index);
  if (doppelt) throw new GeschaeftsbereichError(`Die Ware „${liste.waren[namen.indexOf(doppelt)]!.name}“ steht doppelt in der Liste.`);

  return withActor(actor, async (tx) => {
    await tx.delete(schema.businessStockItems);
    if (liste.waren.length > 0) {
      await tx.insert(schema.businessStockItems).values(liste.waren.map((ware, sortierung) => ({ ...ware, sortierung })));
    }
    return { waren: liste.waren.length };
  });
}
