import type { Cents } from "./money.ts";

/*
 * Geschäftsbereiche: ordnet Belege den Bereichen eines Betriebs zu (etwa „Auftragsarbeit“, „Online-Shop“, „Fahrzeug“) und
 * rechnet je Jahr aus, was ein Bereich eingenommen und gekostet hat. Eine Auswertung für den Inhaber, keine
 * Gewinnermittlung: Sie zählt Nettobeträge nach Belegdatum und ändert keinen Beleg. EÜR und Voranmeldung bleiben davon
 * unberührt.
 *
 * Die Zuordnung läuft über Regeln („Kontakt enthält …“, „Kategorie enthält …“); eine Zuordnung von Hand geht vor.
 * Regeln vergleichen Text ohne Rücksicht auf Groß- und Kleinschreibung als Teilzeichenkette, bewusst ohne reguläre
 * Ausdrücke: Ein Muster aus einer importierten Regelliste kann so keinen Ausdruck mit überlanger Laufzeit einschleusen.
 */

/** Zweig eines Bereichs: das eigene Geschäft, Arbeit für andere, gemeinsame Betriebskosten oder Posten ohne Aussage (Steuerzahlungen) */
export const BEREICH_ZWEIGE = ["eigenes", "fremdes", "gemeinsam", "neutral"] as const;
export type BereichZweig = (typeof BEREICH_ZWEIGE)[number];

export const BEREICH_ZWEIG_LABEL: Record<BereichZweig, string> = {
  eigenes: "Eigenes",
  fremdes: "Fremdes",
  gemeinsam: "Gemeinsame Kosten",
  neutral: "Nicht gewertet",
};

/** Worauf eine Regel schaut */
export const BEREICH_REGEL_FELDER = ["kontakt", "kategorie", "text", "nummer", "belegart"] as const;
export type BereichRegelFeld = (typeof BEREICH_REGEL_FELDER)[number];

export const BEREICH_REGEL_FELD_LABEL: Record<BereichRegelFeld, string> = {
  kontakt: "Kontakt",
  kategorie: "Kategorie",
  text: "Text der Positionen",
  nummer: "Belegnummer",
  belegart: "Belegart",
};

export type BereichRichtung = "einnahme" | "ausgabe";

export interface Geschaeftsbereich {
  id: string;
  name: string;
  zweig: BereichZweig;
  sortierung: number;
  /** Laufende Kosten (Abos, Internet, Versicherungen): Der Bereich erscheint mit seinem Monatsschnitt unter „Was jeden Monat abgeht“ */
  laufend?: boolean;
}

export interface BereichRegel {
  id: string;
  bereichId: string;
  /** null: gilt für Einnahmen und Ausgaben */
  richtung: BereichRichtung | null;
  feld: BereichRegelFeld;
  /** Teilzeichenkette, Groß- und Kleinschreibung egal */
  muster: string;
  /** Höhere Zahl gewinnt; bei Gleichstand das längere Muster, dann die Reihenfolge der Liste */
  rang: number;
}

/** Ein Posten der Auswertung: ein Beleg oder, bei Belegen mit mehreren Kategorien, eine Kategoriezeile davon */
export interface BereichPosten {
  /** Beleg, zu dem der Posten gehört; die Zuordnung von Hand hängt am Beleg */
  belegId: string;
  richtung: BereichRichtung;
  belegart: string;
  nummer: string;
  /** ISO-Datum des Belegs */
  datum: string;
  kontakt: string;
  kategorie: string;
  /** Positionstexte und Bemerkung des Belegs */
  text: string;
  /** Netto in Cent; Gutschriften negativ */
  netto: Cents;
}

function feldwert(posten: BereichPosten, feld: BereichRegelFeld): string {
  switch (feld) {
    case "kontakt":
      return posten.kontakt;
    case "kategorie":
      return posten.kategorie;
    case "text":
      return posten.text;
    case "nummer":
      return posten.nummer;
    case "belegart":
      return posten.belegart;
  }
}

/** Ob die Regel auf den Posten passt; ein leeres Muster passt nie */
export function regelPasst(regel: BereichRegel, posten: BereichPosten): boolean {
  const muster = regel.muster.trim().toLowerCase();
  if (!muster) return false;
  if (regel.richtung && regel.richtung !== posten.richtung) return false;
  return feldwert(posten, regel.feld).toLowerCase().includes(muster);
}

/** Regeln in der Reihenfolge, in der sie geprüft werden: Rang, dann Länge des Musters, dann Position in der Liste */
export function regelnSortiert(regeln: readonly BereichRegel[]): BereichRegel[] {
  return regeln
    .map((regel, index) => ({ regel, index }))
    .sort((a, b) => b.regel.rang - a.regel.rang || b.regel.muster.trim().length - a.regel.muster.trim().length || a.index - b.index)
    .map(({ regel }) => regel);
}

export interface BereichZuordnung {
  bereichId: string | null;
  /** Woher die Zuordnung kommt: von Hand, aus einer Regel oder gar nicht */
  quelle: "hand" | "regel" | "offen";
  regelId: string | null;
}

/**
 * Ordnet einen Posten zu. `sortierteRegeln` kommt aus `regelnSortiert`, `vonHand` bildet Beleg auf Bereich ab.
 * Eine Zuordnung von Hand auf einen Bereich, den es nicht mehr gibt, zählt nicht.
 */
export function bereichFuerPosten(
  posten: BereichPosten,
  sortierteRegeln: readonly BereichRegel[],
  vonHand: ReadonlyMap<string, string>,
  bereichIds: ReadonlySet<string>,
): BereichZuordnung {
  const hand = vonHand.get(posten.belegId);
  if (hand && bereichIds.has(hand)) return { bereichId: hand, quelle: "hand", regelId: null };
  for (const regel of sortierteRegeln) {
    if (bereichIds.has(regel.bereichId) && regelPasst(regel, posten)) return { bereichId: regel.bereichId, quelle: "regel", regelId: regel.id };
  }
  return { bereichId: null, quelle: "offen", regelId: null };
}

export interface BereichSumme {
  einnahmen: Cents;
  ausgaben: Cents;
  /** Einnahmen minus Ausgaben */
  ergebnis: Cents;
  posten: number;
}

const LEER: BereichSumme = { einnahmen: 0, ausgaben: 0, ergebnis: 0, posten: 0 };

function addiere(summe: BereichSumme | undefined, posten: BereichPosten): BereichSumme {
  const alt = summe ?? LEER;
  const einnahmen = alt.einnahmen + (posten.richtung === "einnahme" ? posten.netto : 0);
  const ausgaben = alt.ausgaben + (posten.richtung === "ausgabe" ? posten.netto : 0);
  return { einnahmen, ausgaben, ergebnis: einnahmen - ausgaben, posten: alt.posten + 1 };
}

export interface BereichAuswertung {
  /** Jahre mit Posten, aufsteigend */
  jahre: number[];
  /** Je Bereich (Schlüssel: Bereichs-ID) die Summen je Jahr */
  bereiche: Record<string, Record<number, BereichSumme>>;
  /** Je Zweig die Summen je Jahr */
  zweige: Record<BereichZweig, Record<number, BereichSumme>>;
  /** Posten ohne Bereich je Jahr */
  offen: Record<number, BereichSumme>;
  /** Alles zusammen je Jahr, ohne den Zweig „neutral“ */
  gesamt: Record<number, BereichSumme>;
}

/** Zugeordneter Posten, für Listen und Summen */
export interface ZugeordneterPosten extends BereichPosten {
  bereichId: string | null;
  quelle: BereichZuordnung["quelle"];
}

export function postenZuordnen(
  posten: readonly BereichPosten[],
  bereiche: readonly Geschaeftsbereich[],
  regeln: readonly BereichRegel[],
  vonHand: ReadonlyMap<string, string>,
): ZugeordneterPosten[] {
  const ids = new Set(bereiche.map((b) => b.id));
  const sortiert = regelnSortiert(regeln);
  return posten.map((p) => {
    const z = bereichFuerPosten(p, sortiert, vonHand, ids);
    return { ...p, bereichId: z.bereichId, quelle: z.quelle };
  });
}

/**
 * Summen je Jahr für Bereiche, Zweige und das Ganze. Der Zweig „neutral“ (etwa Steuerzahlungen ans Finanzamt) steht in
 * seinen eigenen Zeilen, zählt aber nicht ins Gesamtergebnis; Posten ohne Bereich zählen mit, damit die Summe stimmt.
 */
export function bereicheAuswerten(posten: readonly ZugeordneterPosten[], bereiche: readonly Geschaeftsbereich[]): BereichAuswertung {
  const zweigVon = new Map(bereiche.map((b) => [b.id, b.zweig]));
  const auswertung: BereichAuswertung = {
    jahre: [],
    bereiche: Object.fromEntries(bereiche.map((b) => [b.id, {}])),
    zweige: { eigenes: {}, fremdes: {}, gemeinsam: {}, neutral: {} },
    offen: {},
    gesamt: {},
  };
  const jahre = new Set<number>();
  for (const p of posten) {
    const jahr = Number(p.datum.slice(0, 4));
    jahre.add(jahr);
    const zweig = p.bereichId ? zweigVon.get(p.bereichId) : undefined;
    if (p.bereichId && zweig) {
      const jeJahr = auswertung.bereiche[p.bereichId]!;
      jeJahr[jahr] = addiere(jeJahr[jahr], p);
      auswertung.zweige[zweig][jahr] = addiere(auswertung.zweige[zweig][jahr], p);
    } else {
      auswertung.offen[jahr] = addiere(auswertung.offen[jahr], p);
    }
    if (zweig !== "neutral") auswertung.gesamt[jahr] = addiere(auswertung.gesamt[jahr], p);
  }
  auswertung.jahre = [...jahre].sort((a, b) => a - b);
  return auswertung;
}

/** Summe über alle Jahre einer Zeile */
export function bereichSummeGesamt(jeJahr: Record<number, BereichSumme>): BereichSumme {
  return Object.values(jeJahr).reduce<BereichSumme>(
    (summe, s) => ({
      einnahmen: summe.einnahmen + s.einnahmen,
      ausgaben: summe.ausgaben + s.ausgaben,
      ergebnis: summe.ergebnis + s.ergebnis,
      posten: summe.posten + s.posten,
    }),
    LEER,
  );
}
