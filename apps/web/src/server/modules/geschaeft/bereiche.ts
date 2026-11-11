import { BEREICH_REGEL_FELDER, BEREICH_ZWEIGE, type BereichRegel, type Geschaeftsbereich } from "@haben/core";
import { asc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "../../db/actor.ts";
import { db, schema } from "../../db/index.ts";
import { UserError } from "../../errors.ts";

/*
 * Geschäftsbereiche und ihre Regeln: die Einstellungen der Auswertung unter /geschaeft. Die Liste wird als Ganzes
 * gelesen und geschrieben (auch als JSON zum Sichern und Übertragen); ein Bereich behält dabei über seinen Namen seine
 * Kennung, damit Zuordnungen von Hand erhalten bleiben.
 */

export class GeschaeftsbereichError extends UserError {}

const regelSchema = z.object({
  feld: z.enum(BEREICH_REGEL_FELDER, { error: "Unbekanntes Feld einer Regel." }),
  muster: z.string().trim().min(1, "Eine Regel braucht ein Muster.").max(200, "Ein Muster darf höchstens 200 Zeichen lang sein."),
  richtung: z.enum(["einnahme", "ausgabe"], { error: "Richtung ist „einnahme“ oder „ausgabe“." }).nullish(),
  rang: z.number().int().min(-1000).max(1000).optional(),
});

const bereichSchema = z.object({
  name: z.string().trim().min(1, "Ein Bereich braucht einen Namen.").max(60, "Der Name eines Bereichs darf höchstens 60 Zeichen lang sein."),
  zweig: z.enum(BEREICH_ZWEIGE, { error: "Zweig ist „eigenes“, „fremdes“, „gemeinsam“ oder „neutral“." }),
  regeln: z.array(regelSchema).max(500, "Höchstens 500 Regeln je Bereich.").default([]),
});

/** Die ganze Liste, so wie sie gespeichert, gesichert und übertragen wird */
export const bereichslisteSchema = z.object({
  bereiche: z.array(bereichSchema).max(100, "Höchstens 100 Bereiche."),
});

export type Bereichsliste = z.output<typeof bereichslisteSchema>;
export type BereichslisteInput = z.input<typeof bereichslisteSchema>;

export interface GeladeneBereiche {
  bereiche: Geschaeftsbereich[];
  regeln: BereichRegel[];
}

/** Bereiche in der Reihenfolge der Auswertung, Regeln in der Reihenfolge der Liste */
export async function ladeBereiche(): Promise<GeladeneBereiche> {
  const [bereiche, regeln] = await Promise.all([
    db.select().from(schema.businessAreas).orderBy(asc(schema.businessAreas.sortierung), asc(schema.businessAreas.name)),
    db.select().from(schema.businessAreaRules).orderBy(asc(schema.businessAreaRules.position), asc(schema.businessAreaRules.createdAt)),
  ]);
  return {
    bereiche: bereiche.map((b) => ({ id: b.id, name: b.name, zweig: b.zweig, sortierung: b.sortierung })),
    regeln: regeln.map((r) => ({ id: r.id, bereichId: r.areaId, richtung: r.richtung, feld: r.feld, muster: r.muster, rang: r.rang })),
  };
}

/** Die gespeicherte Liste in der Form von `bereichslisteSchema`, zum Sichern und Bearbeiten */
export async function exportiereBereichsliste(): Promise<Bereichsliste> {
  const { bereiche, regeln } = await ladeBereiche();
  return {
    bereiche: bereiche.map((b) => ({
      name: b.name,
      zweig: b.zweig,
      regeln: regeln.filter((r) => r.bereichId === b.id).map((r) => ({ feld: r.feld, muster: r.muster, richtung: r.richtung, rang: r.rang })),
    })),
  };
}

/**
 * Ersetzt Bereiche und Regeln durch die Liste. Bereiche mit gleichem Namen behalten ihre Kennung (und damit ihre
 * Zuordnungen von Hand); Bereiche, die in der Liste fehlen, werden mit ihren Regeln und Zuordnungen gelöscht.
 */
export async function speichereBereichsliste(actor: string, input: BereichslisteInput): Promise<{ bereiche: number; regeln: number }> {
  const liste = bereichslisteSchema.parse(input);
  const namen = liste.bereiche.map((b) => b.name.toLowerCase());
  const doppelt = namen.find((name, index) => namen.indexOf(name) !== index);
  if (doppelt) throw new GeschaeftsbereichError(`Der Bereich „${liste.bereiche[namen.indexOf(doppelt)]!.name}“ steht doppelt in der Liste.`);

  return withActor(actor, async (tx) => {
    const vorhandene = await tx.select().from(schema.businessAreas);
    const idNachName = new Map(vorhandene.map((b) => [b.name.toLowerCase(), b.id]));
    const behalten: string[] = [];
    let regeln = 0;
    await tx.delete(schema.businessAreaRules);
    for (const [index, bereich] of liste.bereiche.entries()) {
      const werte = { name: bereich.name, zweig: bereich.zweig, sortierung: index };
      const vorhandeneId = idNachName.get(bereich.name.toLowerCase());
      const [zeile] = vorhandeneId
        ? await tx
            .update(schema.businessAreas)
            .set({ ...werte, updatedAt: new Date() })
            .where(eq(schema.businessAreas.id, vorhandeneId))
            .returning({ id: schema.businessAreas.id })
        : await tx.insert(schema.businessAreas).values(werte).returning({ id: schema.businessAreas.id });
      behalten.push(zeile!.id);
      if (bereich.regeln.length > 0) {
        await tx.insert(schema.businessAreaRules).values(
          bereich.regeln.map((regel, position) => ({
            areaId: zeile!.id,
            richtung: regel.richtung ?? null,
            feld: regel.feld,
            muster: regel.muster,
            rang: regel.rang ?? 0,
            position: regeln + position,
          })),
        );
        regeln += bereich.regeln.length;
      }
    }
    if (behalten.length > 0) await tx.delete(schema.businessAreas).where(notInArray(schema.businessAreas.id, behalten));
    else await tx.delete(schema.businessAreas);
    return { bereiche: behalten.length, regeln };
  });
}

/** Ordnet einen archivierten Beleg von Hand einem Bereich zu; `bereichId` null hebt die Zuordnung auf (die Regeln gelten wieder) */
export async function ordneBelegZu(actor: string, belegId: string, bereichId: string | null): Promise<void> {
  await withActor(actor, async (tx) => {
    const [beleg] = await tx.select({ id: schema.lexofficeVouchers.id }).from(schema.lexofficeVouchers).where(eq(schema.lexofficeVouchers.id, belegId));
    if (!beleg) throw new GeschaeftsbereichError("Beleg nicht gefunden.");
    if (bereichId === null) {
      await tx.delete(schema.businessAreaAssignments).where(eq(schema.businessAreaAssignments.voucherId, belegId));
      return;
    }
    const [bereich] = await tx.select({ id: schema.businessAreas.id }).from(schema.businessAreas).where(eq(schema.businessAreas.id, bereichId));
    if (!bereich) throw new GeschaeftsbereichError("Bereich nicht gefunden.");
    await tx
      .insert(schema.businessAreaAssignments)
      .values({ voucherId: belegId, areaId: bereichId })
      .onConflictDoUpdate({ target: schema.businessAreaAssignments.voucherId, set: { areaId: bereichId } });
  });
}

/** Zuordnungen von Hand: Beleg → Bereich */
export async function ladeZuordnungen(): Promise<Map<string, string>> {
  const zeilen = await db
    .select({ belegId: schema.businessAreaAssignments.voucherId, bereichId: schema.businessAreaAssignments.areaId })
    .from(schema.businessAreaAssignments);
  return new Map(zeilen.map((z) => [z.belegId, z.bereichId]));
}
