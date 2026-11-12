import {
  bereichSummeGesamt,
  bereicheAuswerten,
  postenZuordnen,
  type BereichAuswertung,
  type BereichPosten,
  type BereichSumme,
  type Geschaeftsbereich,
  type ZugeordneterPosten,
} from "@haben/core";
import { asc, ne, sql } from "drizzle-orm";
import { db, schema } from "../../db/index.ts";
import { ladeBereiche, ladeZuordnungen } from "./bereiche.ts";

/*
 * Auswertung nach Geschäftsbereichen über den archivierten Altbestand (lexoffice_vouchers): Nettobeträge nach
 * Belegdatum, stornierte Belege bleiben draußen. Belege, die in Haben selbst entstehen, zählt die Auswertung noch nicht.
 */

/** Zeilen einer Belegansicht je Bereich höchstens; die Summe stimmt trotzdem, sie kommt aus allen Posten */
const LISTE_MAX = 500;

/** Positionstexte und Bemerkung eines Belegs aus der gespeicherten Antwort der Quelle, für Regeln auf „Text der Positionen“ */
const POSTEN_TEXT = sql<string>`concat_ws(' ',
  (select string_agg(coalesce(item ->> 'name', '') || ' ' || coalesce(item ->> 'description', ''), ' ')
     from jsonb_array_elements(case when jsonb_typeof(${schema.lexofficeVouchers.raw} -> 'lineItems') = 'array'
                                    then ${schema.lexofficeVouchers.raw} -> 'lineItems' else '[]'::jsonb end) item),
  ${schema.lexofficeVouchers.remark},
  ${schema.lexofficeVouchers.raw} #>> '{web,list,note}')`;

/** Alle Posten des Altbestands: je Beleg einer, bei mehreren Kategorien je Kategorie einer */
export async function ladePosten(): Promise<BereichPosten[]> {
  const belege = await db
    .select({
      id: schema.lexofficeVouchers.id,
      richtung: schema.lexofficeVouchers.direction,
      belegart: schema.lexofficeVouchers.type,
      nummer: schema.lexofficeVouchers.number,
      datum: schema.lexofficeVouchers.date,
      kontakt: schema.lexofficeVouchers.contactName,
      netto: schema.lexofficeVouchers.net,
      kategorien: schema.lexofficeVouchers.categories,
      text: POSTEN_TEXT,
    })
    .from(schema.lexofficeVouchers)
    .where(ne(schema.lexofficeVouchers.status, "voided"))
    .orderBy(asc(schema.lexofficeVouchers.date), asc(schema.lexofficeVouchers.number));

  return belege.flatMap((beleg) => {
    const basis = {
      belegId: beleg.id,
      richtung: beleg.richtung,
      belegart: beleg.belegart,
      nummer: beleg.nummer.trim(),
      datum: beleg.datum,
      kontakt: beleg.kontakt.trim(),
      text: (beleg.text ?? "").replace(/\s+/g, " ").trim(),
    };
    const kategorien = beleg.kategorien ?? [];
    if (kategorien.length <= 1) return [{ ...basis, kategorie: kategorien[0]?.name ?? "", netto: beleg.netto }];
    // Mehrere Kategorien: Beträge der Kategoriezeilen, mit dem Vorzeichen des Belegs (Gutschriften sind negativ)
    const summe = kategorien.reduce((s, k) => s + k.net, 0);
    const dreht = summe !== 0 && Math.sign(summe) !== Math.sign(beleg.netto) && beleg.netto !== 0;
    return kategorien.map((k) => ({ ...basis, kategorie: k.name, netto: dreht ? -k.net : k.net }));
  });
}

export interface BereichZeile {
  bereich: Geschaeftsbereich;
  jeJahr: Record<number, BereichSumme>;
  gesamt: BereichSumme;
  regeln: number;
}

export interface GeschaeftUebersicht {
  jahre: number[];
  zeilen: BereichZeile[];
  zweige: BereichAuswertung["zweige"];
  offen: Record<number, BereichSumme>;
  offenGesamt: BereichSumme;
  gesamt: Record<number, BereichSumme>;
  /** Wie die Posten zugeordnet wurden */
  quellen: { hand: number; regel: number; offen: number };
  /** Wer am meisten bezahlt hat, je Zweig mit Einnahmen: Kontakte nach Summe der Einnahmen über alle Jahre */
  kunden: Record<"eigenes" | "fremdes", Kunde[]>;
  fixkosten: Fixkosten | null;
}

/** Laufende Kosten der letzten zwölf vollen Monate, aus den Bereichen mit `laufend` */
export interface Fixkosten {
  /** Erster und letzter Monat des Zeitraums, JJJJ-MM */
  von: string;
  bis: string;
  /** Summe der zwölf Monate */
  summe: number;
  /** Je Kontakt und Bereich, die größten zuerst */
  posten: { kontakt: string; bereichId: string; summe: number; monate: number }[];
}

/** Monat `n` Monate vor `monat` (JJJJ-MM) */
function monatDavor(monat: string, n: number): string {
  const index = Number(monat.slice(0, 4)) * 12 + Number(monat.slice(5, 7)) - 1 - n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Was regelmäßig abgeht: Ausgaben der Bereiche mit `laufend` in den zwölf vollen Monaten vor dem Monat des jüngsten
 * Belegs, je Kontakt. null ohne solche Bereiche oder ohne Belege.
 */
function fixkosten(posten: readonly ZugeordneterPosten[], bereiche: readonly Geschaeftsbereich[]): Fixkosten | null {
  const laufend = new Set(bereiche.filter((b) => b.laufend).map((b) => b.id));
  const juengster =
    posten
      .map((p) => p.datum)
      .sort()
      .at(-1) ?? "";
  if (laufend.size === 0 || !juengster) return null;
  const bis = monatDavor(juengster.slice(0, 7), 1);
  const von = monatDavor(bis, 11);
  const jeKontakt = new Map<string, { kontakt: string; bereichId: string; summe: number; monate: Set<string> }>();
  for (const p of posten) {
    const monat = p.datum.slice(0, 7);
    if (p.richtung !== "ausgabe" || !p.bereichId || !laufend.has(p.bereichId) || monat < von || monat > bis) continue;
    const key = `${p.bereichId}\u0000${p.kontakt}`;
    const eintrag = jeKontakt.get(key) ?? { kontakt: p.kontakt, bereichId: p.bereichId, summe: 0, monate: new Set<string>() };
    eintrag.summe += p.netto;
    eintrag.monate.add(monat);
    jeKontakt.set(key, eintrag);
  }
  const liste = [...jeKontakt.values()]
    .map((e) => ({ kontakt: e.kontakt, bereichId: e.bereichId, summe: e.summe, monate: e.monate.size }))
    .sort((a, b) => b.summe - a.summe || a.kontakt.localeCompare(b.kontakt, "de"));
  return { von, bis, summe: liste.reduce((s, e) => s + e.summe, 0), posten: liste };
}

export interface Kunde {
  kontakt: string;
  einnahmen: number;
  posten: number;
}

/** So viele Kontakte je Zweig zeigt die Übersicht */
const KUNDEN_MAX = 8;

function groessteKunden(posten: readonly ZugeordneterPosten[], zweigVon: ReadonlyMap<string, string>, zweig: "eigenes" | "fremdes"): Kunde[] {
  const jeKontakt = new Map<string, Kunde>();
  for (const p of posten) {
    if (p.richtung !== "einnahme" || !p.bereichId || zweigVon.get(p.bereichId) !== zweig || !p.kontakt) continue;
    const kunde = jeKontakt.get(p.kontakt) ?? { kontakt: p.kontakt, einnahmen: 0, posten: 0 };
    jeKontakt.set(p.kontakt, { ...kunde, einnahmen: kunde.einnahmen + p.netto, posten: kunde.posten + 1 });
  }
  return [...jeKontakt.values()].sort((a, b) => b.einnahmen - a.einnahmen || a.kontakt.localeCompare(b.kontakt, "de")).slice(0, KUNDEN_MAX);
}

async function zugeordnetePosten(): Promise<{ posten: ZugeordneterPosten[]; bereiche: Geschaeftsbereich[]; regelnJeBereich: Map<string, number> }> {
  const [{ bereiche, regeln }, vonHand, posten] = await Promise.all([ladeBereiche(), ladeZuordnungen(), ladePosten()]);
  const regelnJeBereich = new Map<string, number>();
  for (const regel of regeln) regelnJeBereich.set(regel.bereichId, (regelnJeBereich.get(regel.bereichId) ?? 0) + 1);
  return { posten: postenZuordnen(posten, bereiche, regeln, vonHand), bereiche, regelnJeBereich };
}

/** Summen je Jahr für alle Bereiche und Zweige */
export async function geschaeftUebersicht(): Promise<GeschaeftUebersicht> {
  const { posten, bereiche, regelnJeBereich } = await zugeordnetePosten();
  const auswertung = bereicheAuswerten(posten, bereiche);
  const zweigVon = new Map(bereiche.map((b) => [b.id, b.zweig]));
  const quellen = { hand: 0, regel: 0, offen: 0 };
  for (const p of posten) quellen[p.quelle] += 1;
  return {
    jahre: auswertung.jahre,
    zeilen: bereiche.map((bereich) => {
      const jeJahr = auswertung.bereiche[bereich.id] ?? {};
      return { bereich, jeJahr, gesamt: bereichSummeGesamt(jeJahr), regeln: regelnJeBereich.get(bereich.id) ?? 0 };
    }),
    zweige: auswertung.zweige,
    offen: auswertung.offen,
    offenGesamt: bereichSummeGesamt(auswertung.offen),
    gesamt: auswertung.gesamt,
    quellen,
    kunden: { eigenes: groessteKunden(posten, zweigVon, "eigenes"), fremdes: groessteKunden(posten, zweigVon, "fremdes") },
    fixkosten: fixkosten(posten, bereiche),
  };
}

export interface PostenListe {
  posten: ZugeordneterPosten[];
  /** Mehr Posten als angezeigt */
  gekuerzt: boolean;
  summe: BereichSumme;
}

/**
 * Posten eines Bereichs (oder ohne Bereich: `bereichId` null), auf Wunsch nur eines Jahres, die größten Beträge zuerst.
 * Dient zum Nachsehen, was hinter einer Zahl steht, und zum Zuordnen von Hand.
 */
export async function geschaeftPosten(filter: { bereichId: string | null; jahr?: number }): Promise<PostenListe> {
  const { posten } = await zugeordnetePosten();
  const treffer = posten
    .filter((p) => p.bereichId === filter.bereichId && (filter.jahr === undefined || Number(p.datum.slice(0, 4)) === filter.jahr))
    .sort((a, b) => Math.abs(b.netto) - Math.abs(a.netto) || a.datum.localeCompare(b.datum));
  const summe = treffer.reduce<BereichSumme>(
    (s, p) => {
      const einnahmen = s.einnahmen + (p.richtung === "einnahme" ? p.netto : 0);
      const ausgaben = s.ausgaben + (p.richtung === "ausgabe" ? p.netto : 0);
      return { einnahmen, ausgaben, ergebnis: einnahmen - ausgaben, posten: s.posten + 1 };
    },
    { einnahmen: 0, ausgaben: 0, ergebnis: 0, posten: 0 },
  );
  return { posten: treffer.slice(0, LISTE_MAX), gekuerzt: treffer.length > LISTE_MAX, summe };
}
