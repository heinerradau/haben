import { Link } from "@tanstack/react-router";
import type { GeschaeftUebersicht } from "../../server/modules/geschaeft/index.ts";
import { euro } from "./euro.ts";

/*
 * Laufende Kosten als farbige Flächen: je Anbieter eine Kachel, so breit wie sein Anteil. Gerechnet wird der Monatsschnitt
 * der letzten zwölf vollen Monate aus den Bereichen mit „laufend“ (Abos, Internet, Versicherungen).
 */

const monatName = (monat: string) => new Date(`${monat}-01T00:00:00Z`).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

/** Acht feste Farben, der Reihe nach; weitere Kacheln beginnen wieder vorn */
const FARBEN = 8;

export function FixkostenCard({ uebersicht }: { uebersicht: GeschaeftUebersicht }) {
  const { fixkosten, zeilen } = uebersicht;
  if (!fixkosten) return null;
  const bereiche = zeilen
    .filter((z) => z.bereich.laufend)
    .map((z) => {
      const posten = fixkosten.posten.filter((p) => p.bereichId === z.bereich.id);
      return { bereich: z.bereich, posten, summe: posten.reduce((s, p) => s + p.summe, 0) };
    })
    .filter((b) => b.posten.length > 0);
  let farbe = 0;
  return (
    <section className="card stack geschaeft-fluss" aria-labelledby="fix-heading">
      <div>
        <h2 id="fix-heading" className="bild-ueberschrift">
          Was jeden Monat abgeht
        </h2>
        <p className="fluss-satz">
          Für Abos und laufende Verträge zahlst du im Schnitt <b>{euro(Math.round(fixkosten.summe / 12))}</b> im Monat, das sind <b>{euro(fixkosten.summe)}</b>{" "}
          im Jahr.
        </p>
      </div>
      {bereiche.map(({ bereich, posten, summe }) => (
        <div key={bereich.id} className="stack">
          <h3 className="bild-titel">
            <Link to="/geschaeft" search={{ bereich: bereich.id }} hash="bereich-heading">
              {bereich.name}
            </Link>{" "}
            <span className="muted">· {euro(Math.round(summe / 12))} im Monat</span>
          </h3>
          <div className="fix-kacheln">
            {posten.map((p) => {
              farbe += 1;
              return (
                <div key={p.kontakt} className={`fix-kachel bunt-${((farbe - 1) % FARBEN) + 1}`} style={{ flexGrow: Math.max(p.summe, 1) }}>
                  <span className="fix-kachel-name">{p.kontakt || "Ohne Namen"}</span>
                  <span className="fix-kachel-wert">{euro(Math.round(p.summe / 12))}</span>
                  <span className="fix-kachel-hinweis">
                    {p.monate >= 9
                      ? "jeden Monat"
                      : p.monate <= 2
                        ? `im Monat, gezahlt ${p.monate === 1 ? "einmal" : "zweimal"} im Jahr`
                        : `im Monat, gezahlt in ${p.monate} Monaten`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="small muted" style={{ margin: 0 }}>
        Schnitt aus {monatName(fixkosten.von)} bis {monatName(fixkosten.bis)}, ohne Umsatzsteuer. Je breiter die Kachel, desto mehr kostet der Anbieter.
      </p>
    </section>
  );
}
