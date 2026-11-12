/*
 * Kachelbild (Treemap): teilt ein Rechteck so auf, dass jede Kachel so viel Fläche bekommt, wie ihr Wert am Ganzen
 * ausmacht, und möglichst nah am Quadrat bleibt (Verfahren „squarified“ nach Bruls, Huizing und van Wijk).
 */

export interface Kachel {
  /** Position und Größe in denselben Einheiten wie `breite` und `hoehe` */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Schlechtestes Seitenverhältnis einer Reihe mit der Flächensumme `summe` entlang der Seite `seite` */
function schlechtestes(reihe: readonly number[], summe: number, seite: number): number {
  const dicke = summe / seite;
  return Math.max(...reihe.map((flaeche) => Math.max(dicke / (flaeche / dicke), flaeche / dicke / dicke)));
}

/**
 * Kacheln für `werte` in der gegebenen Reihenfolge der Größe nach: Die Antwort hat dieselbe Reihenfolge wie `werte`.
 * Werte von 0 oder darunter bekommen eine Kachel ohne Fläche.
 */
export function kacheln(werte: readonly number[], breite: number, hoehe: number): Kachel[] {
  const ergebnis: Kachel[] = werte.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  const gesamt = werte.reduce((s, w) => s + Math.max(w, 0), 0);
  if (gesamt <= 0 || breite <= 0 || hoehe <= 0) return ergebnis;
  const massstab = (breite * hoehe) / gesamt;
  const offen = werte
    .map((wert, index) => ({ index, flaeche: Math.max(wert, 0) * massstab }))
    .filter((e) => e.flaeche > 0)
    .sort((a, b) => b.flaeche - a.flaeche);
  let x = 0;
  let y = 0;
  let w = breite;
  let h = hoehe;
  while (offen.length > 0) {
    const seite = Math.min(w, h);
    const reihe = [offen.shift()!];
    let summe = reihe[0]!.flaeche;
    // Solange die Reihe dadurch nicht unförmiger wird, kommt die nächste Kachel dazu
    while (offen.length > 0) {
      const naechste = offen[0]!;
      const alt = schlechtestes(
        reihe.map((e) => e.flaeche),
        summe,
        seite,
      );
      const neu = schlechtestes([...reihe.map((e) => e.flaeche), naechste.flaeche], summe + naechste.flaeche, seite);
      if (neu > alt) break;
      reihe.push(offen.shift()!);
      summe += naechste.flaeche;
    }
    const dicke = summe / seite;
    let lauf = 0;
    for (const e of reihe) {
      const laenge = e.flaeche / dicke;
      // Die Reihe liegt an der kürzeren Seite an: im Querformat als Spalte links, im Hochformat als Zeile oben
      ergebnis[e.index] = w >= h ? { x, y: y + lauf, w: dicke, h: laenge } : { x: x + lauf, y, w: laenge, h: dicke };
      lauf += laenge;
    }
    if (w >= h) {
      x += dicke;
      w -= dicke;
    } else {
      y += dicke;
      h -= dicke;
    }
  }
  return ergebnis;
}
