---
title: "Geschäftsbereiche: was jeder Bereich einbringt und kostet"
description: >-
  Belege den Bereichen des Betriebs zuordnen und je Jahr sehen, was Auftragsarbeit, Shop, Ware oder
  Fahrzeug eingebracht und gekostet haben.
---

# Geschäftsbereiche

Die Seite „Geschäftsbereiche“ (Menü Buchhaltung) zeigt je Jahr, was jeder Bereich deines Betriebs eingenommen und gekostet hat. Sie beantwortet Fragen, die die EÜR nicht beantwortet: Trägt sich der eigene Shop? Was bleibt von der Auftragsarbeit? Was kostet das Fahrzeug?

Sie ist eine Auswertung für dich, keine Gewinnermittlung. Sie ändert keinen Beleg und berührt weder EÜR noch Voranmeldung.

## Bereiche und Zweige

Ein **Bereich** ist ein Teil deines Betriebs, etwa „Auftragsarbeit“, „Online-Shop“, „Ware und Material“ oder „Fahrzeug“. Jeder Bereich gehört zu einem **Zweig**:

| Zweig | Bedeutung |
| --- | --- |
| `eigenes` | Das eigene Geschäft: eigene Produkte, ihr Verkauf und was sie kosten |
| `fremdes` | Arbeit für andere: Aufträge, Honorare, Kurse |
| `gemeinsam` | Kosten, die beide brauchen: Fahrzeug, Büro, Telefon |
| `neutral` | Steht in der Tabelle, zählt aber nicht ins Gesamtergebnis, etwa Zahlungen ans Finanzamt |


## Die Übersicht

Oben steht der **Geldfluss**: links die Bereiche, die Geld gebracht haben, rechts die, in die es geflossen ist, in der Mitte der Topf mit dem, was übrig blieb. Die Bänder sind so dick wie die Beträge, die Farbe steht für den Zweig. Über die Jahresknöpfe siehst du ein einzelnes Jahr; hast du mehr ausgegeben als eingenommen, steht links „Draufgezahlt“. Ein Klick auf einen Bereich zeigt die Belege dahinter.

Darunter folgen:

- **Was jeden Monat abgeht:** die laufenden Kosten im Monatsschnitt der letzten zwölf vollen Monate, je Bereich und Kontakt. Gezählt werden Bereiche, die in der Liste `"laufend": true` tragen, etwa Abos, Internet und Versicherungen.
- **Dein eigenes Geschäft:** was du über die Jahre hineingesteckt und zurückbekommen hast, als zwei aufsteigende Linien, dazu der Wert der Ware auf Lager.
- **Wer bezahlt hat:** die größten Kontakte nach Einnahmen, getrennt nach eigenem Geschäft und Arbeit für andere.
- **Alle Zahlen als Tabellen:** Zweige und Bereiche je Jahr zum Nachschlagen.

## Regeln

Regeln ordnen die Belege zu. Eine Regel passt, wenn ein Feld des Belegs das Muster enthält; Groß- und Kleinschreibung sind egal, reguläre Ausdrücke gibt es nicht.

| Feld | Verglichen wird |
| --- | --- |
| `kontakt` | Name des Kunden oder Lieferanten |
| `kategorie` | Kategorie des Belegs |
| `text` | Texte der Positionen und die Bemerkung |
| `nummer` | Belegnummer |
| `belegart` | Art des Belegs, etwa `invoice` oder `purchaseinvoice` |

`richtung` beschränkt eine Regel auf `einnahme` oder `ausgabe`. Passen mehrere Regeln, gewinnt die mit dem höheren `rang`, bei gleichem Rang die mit dem längeren Muster, danach die Reihenfolge der Liste.

Bereiche und Regeln bearbeitest du unter **Bereiche und Regeln bearbeiten** als eine Liste im JSON-Format:

```json
{
  "bereiche": [
    {
      "name": "Auftragsarbeit",
      "zweig": "fremdes",
      "regeln": [
        { "feld": "kontakt", "muster": "Theater", "richtung": "einnahme" },
        { "feld": "text", "muster": "Bühnenbild", "rang": 10 }
      ]
    },
    { "name": "Fahrzeug", "zweig": "gemeinsam", "regeln": [{ "feld": "kategorie", "muster": "Kraftstoff" }] }
  ]
}
```

Die Liste wird als Ganzes gespeichert. Ein Bereich mit gleichem Namen bleibt derselbe; ein Bereich, der aus der Liste verschwindet, verliert seine Regeln und seine Zuordnungen von Hand. Jede Änderung steht im Änderungsprotokoll.

## Von Hand zuordnen

Ein Klick auf eine Zahl zeigt die Belege dahinter, die größten zuerst. In der Spalte „Bereich“ legst du für einen Beleg einen anderen Bereich fest; das geht den Regeln vor. „Wieder nach Regeln“ hebt die Zuordnung auf. Belege, auf die keine Regel passt, stehen unter „Noch nicht zugeordnet“.

## Was in der Ware steckt

Unter den Tabellen steht der Warenbestand: was auf Lager liegt, was es gekostet hat und was es beim Verkauf einbringt. So siehst du neben den Ausgaben für Ware auch, wie viel davon noch als Ware da ist.

Die Liste pflegst du selbst unter **Warenbestand bearbeiten**, wie die Bereiche als JSON:

```json
{
  "waren": [
    { "name": "Stofftasche", "stueck": 400, "einkaufCent": 196, "preisCent": 850 },
    { "name": "Regenschirm", "stueck": 89, "einkaufCent": 441, "preisCent": 1360 }
  ]
}
```

Die Preise stehen netto in Cent je Stück. Als „preisCent“ trägst du den Preis ein, zu dem du die Ware realistisch verkaufst, etwa deinen Händlerpreis; der Ladenpreis zeigt nur, was im besten Fall möglich wäre. Haben rechnet Stückzahl mal Preis und zieht nichts ab. Die Liste wird als Ganzes gespeichert, jede Änderung steht im Änderungsprotokoll.

Das ist eine Schätzung für dich, keine Inventur: Haben zählt keinen Bestand mit und bucht nichts. In die EÜR geht der Wareneinkauf weiter mit der Zahlung ein.

## Was gezählt wird

- Die archivierten Belege aus dem Umzug ([Lexoffice](lexoffice.md), [sevDesk](sevdesk.md) und die anderen Quellen im Archiv). Belege, die in Haben selbst entstehen, zählt die Seite noch nicht.
- Nettobeträge nach Belegdatum. Stornierte Belege bleiben draußen, Gutschriften zählen negativ.
- Ein Beleg mit mehreren Kategorien zählt je Kategorie als eigener Posten; eine Zuordnung von Hand gilt für den ganzen Beleg.
- Abschreibungen, private Anteile und Umsatzsteuer rechnet die Seite nicht. Eine Anschaffung zählt im Jahr des Belegs in voller Höhe.

Für das Finanzamt gilt die EÜR unter [Auswertungen](auswertungen.md).

[Zurück zur Übersicht](ueberblick.md)
