import type { Geschaeftsbereich } from "@haben/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { BereichKontakt, PostenListe } from "../../server/modules/geschaeft/index.ts";
import { euro } from "./euro.ts";

/*
 * Ein Bereich aus der Nähe, als Bild statt als Liste: wie er sich über die Jahre entwickelt hat und an wen das Geld ging
 * oder von wem es kam, unter Klartext-Namen. Die einzelnen Belege stehen zugeklappt darunter.
 */

/** So viele Kontakte bekommen einen eigenen Balken; der Rest steht zusammen */
const BALKEN_MAX = 12;

function Balkenliste({ titel, kontakte, wert, farbe }: { titel: string; kontakte: BereichKontakt[]; wert: (k: BereichKontakt) => number; farbe: string }) {
  const mitWert = kontakte.filter((k) => wert(k) > 0).sort((a, b) => wert(b) - wert(a));
  if (mitWert.length === 0) return null;
  const gezeigt = mitWert.slice(0, BALKEN_MAX);
  const rest = mitWert.slice(BALKEN_MAX);
  const zeilen = [
    ...gezeigt.map((k) => ({ name: k.name, cents: wert(k) })),
    ...(rest.length > 0 ? [{ name: `${rest.length} kleinere zusammen`, cents: rest.reduce((s, k) => s + wert(k), 0) }] : []),
  ];
  const max = Math.max(...zeilen.map((z) => z.cents));
  return (
    <div className="stack">
      <h3 className="bild-titel">{titel}</h3>
      <ol className="bild-balken">
        {zeilen.map((z) => (
          <li key={z.name}>
            <span className="bild-balken-name">{z.name}</span>
            <span className="bild-balken-spur">
              <i style={{ width: `${Math.max((z.cents / max) * 100, 1.5)}%`, background: farbe }} />
            </span>
            <span className="bild-balken-wert">{euro(z.cents)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function BereichCard({
  bereich,
  titel,
  jahre,
  jahr,
  fluss,
  liste,
  children,
}: {
  /** null: Posten ohne Bereich */
  bereich: Geschaeftsbereich | null;
  titel: string;
  jahre: number[];
  jahr?: number;
  fluss?: number;
  liste: PostenListe;
  /** Die einzelnen Belege */
  children: ReactNode;
}) {
  const farbe = `var(--zweig-${!bereich || bereich.zweig === "neutral" ? "gemeinsam" : bereich.zweig})`;
  const suche = bereich ? bereich.id : ("offen" as const);
  const groesse = (j: number) => (liste.jeJahr[j]?.einnahmen ?? 0) + (liste.jeJahr[j]?.ausgaben ?? 0);
  const max = Math.max(1, ...jahre.map(groesse));
  const { einnahmen, ausgaben } = liste.summe;
  return (
    <section className="card stack geschaeft-fluss" aria-labelledby="bereich-heading">
      <div className="bild-kopf">
        <div>
          <h2 id="bereich-heading" className="bild-ueberschrift">
            {titel}
          </h2>
          <p className="fluss-satz">
            {einnahmen > 0 && (
              <>
                <b>{euro(einnahmen)}</b> eingenommen
              </>
            )}
            {einnahmen > 0 && ausgaben > 0 && ", "}
            {ausgaben > 0 && (
              <>
                <b>{euro(ausgaben)}</b> ausgegeben
              </>
            )}
            {einnahmen === 0 && ausgaben === 0 && "Hier ist in diesem Zeitraum nichts passiert"}
            {jahr ? ` im Jahr ${jahr}.` : " in allen Jahren."}
          </p>
        </div>
        <Link to="/geschaeft" search={{ fluss }} className="fluss-chip">
          Schließen
        </Link>
      </div>

      <div className="bild-jahre" role="group" aria-label="Jahr wählen">
        {jahre.map((j) => (
          <Link
            key={j}
            to="/geschaeft"
            search={{ bereich: suche, jahr: jahr === j ? undefined : j, fluss }}
            hash="bereich-heading"
            className={jahr === j ? "bild-jahr bild-jahr-aktiv" : "bild-jahr"}
            aria-label={`${j}: ${euro(groesse(j))}${jahr === j ? ", gewählt; noch einmal klicken für alle Jahre" : ""}`}
          >
            <span className="bild-jahr-wert">{groesse(j) > 0 ? euro(groesse(j)) : ""}</span>
            <span className="bild-jahr-saeule">
              <i style={{ height: `${groesse(j) > 0 ? Math.max((groesse(j) / max) * 100, 3) : 0}%`, background: farbe }} />
            </span>
            <span className="bild-jahr-name">{j}</span>
          </Link>
        ))}
      </div>

      <div className="fluss-zwei">
        <Balkenliste titel="Woher das Geld kam" kontakte={liste.kontakte} wert={(k) => k.einnahmen} farbe={farbe} />
        <Balkenliste titel="Wohin das Geld ging" kontakte={liste.kontakte} wert={(k) => k.ausgaben} farbe={farbe} />
      </div>

      <details className="bild-belege">
        <summary>Einzelne Belege ansehen ({liste.summe.posten})</summary>
        {children}
      </details>
    </section>
  );
}
