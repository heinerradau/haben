import { formatEuro } from "@haben/core";
import { Link } from "@tanstack/react-router";
import type { GeschaeftUebersicht } from "../../server/modules/geschaeft/index.ts";

/*
 * Laufende Kosten: was aus den Bereichen mit „laufend“ (Abos, Internet, Versicherungen) im Schnitt jeden Monat abgeht,
 * gerechnet über die letzten zwölf vollen Monate, je Bereich und Kontakt.
 */

const monatName = (monat: string) => new Date(`${monat}-01T00:00:00Z`).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

export function FixkostenCard({ uebersicht }: { uebersicht: GeschaeftUebersicht }) {
  const { fixkosten, zeilen } = uebersicht;
  if (!fixkosten) return null;
  const bereiche = zeilen
    .filter((z) => z.bereich.laufend)
    .map((z) => {
      const posten = fixkosten.posten.filter((p) => p.bereichId === z.bereich.id);
      return { bereich: z.bereich, posten, summe: posten.reduce((s, p) => s + p.summe, 0) };
    });
  const max = Math.max(1, ...fixkosten.posten.map((p) => p.summe));
  return (
    <section className="card stack geschaeft-fluss" aria-labelledby="fix-heading">
      <div>
        <h2 id="fix-heading" style={{ margin: 0, fontSize: 16 }}>
          Was jeden Monat abgeht
        </h2>
        <p className="fluss-satz" style={{ marginTop: 8 }}>
          Deine laufenden Kosten liegen im Schnitt bei <b>{formatEuro(Math.round(fixkosten.summe / 12))}</b> im Monat, das sind{" "}
          <b>{formatEuro(fixkosten.summe)}</b> im Jahr.
        </p>
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          Gerechnet über {monatName(fixkosten.von)} bis {monatName(fixkosten.bis)}, netto. Gezählt werden die Bereiche, die in der Liste unten als „laufend“
          markiert sind.
        </p>
      </div>
      <div className="fluss-zwei">
        {bereiche.map(({ bereich, posten, summe }) => (
          <div key={bereich.id} className="stack">
            <div className="fix-kopf">
              <Link to="/geschaeft" search={{ bereich: bereich.id }} hash="posten-heading">
                {bereich.name}
              </Link>
              <span className="mono">{formatEuro(Math.round(summe / 12))} im Monat</span>
            </div>
            {posten.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                In diesem Zeitraum nichts.
              </p>
            ) : (
              <ol className="fluss-rang">
                {posten.map((p) => (
                  <li key={p.kontakt}>
                    <span>
                      {p.kontakt || "Ohne Kontakt"} <span className="small muted">· in {p.monate} von 12 Monaten</span>
                    </span>
                    <span className="mono">{formatEuro(Math.round(p.summe / 12))}</span>
                    <div className="fluss-rang-spur">
                      <i
                        style={{
                          width: `${Math.max((p.summe / max) * 100, 1)}%`,
                          background: `var(--zweig-${bereich.zweig === "neutral" ? "gemeinsam" : bereich.zweig})`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
