import { kacheln } from "@haben/core";
import type { GeschaeftUebersicht } from "../../server/modules/geschaeft/index.ts";
import { euro } from "./euro.ts";

/*
 * Laufende Kosten als Kachelbild: Jeder Anbieter bekommt so viel Fläche, wie er im Monat kostet. Gezählt werden die
 * Bereiche mit „laufend“ (Abos, Internet, Versicherungen), mit dem üblichen Monatsbetrag der letzten zwölf Monate.
 */

const monatName = (monat: string) => new Date(`${monat}-01T00:00:00Z`).toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

/** Acht feste Farben, der Reihe nach; weitere Kacheln beginnen wieder vorn */
const FARBEN = 8;
/** Seitenverhältnis des Bilds; die Höhe folgt der Breite */
const BREITE = 100;
const HOEHE = 46;
/** Kleinere Anteile stehen zusammen in einer Kachel, sonst passt kein Text hinein */
const KLEIN = 0.03;

export function FixkostenCard({ uebersicht }: { uebersicht: GeschaeftUebersicht }) {
  const { fixkosten } = uebersicht;
  if (!fixkosten || fixkosten.monatlich <= 0) return null;
  const gross = fixkosten.posten.filter((p) => p.monatlich >= fixkosten.monatlich * KLEIN);
  const klein = fixkosten.posten.filter((p) => p.monatlich > 0 && p.monatlich < fixkosten.monatlich * KLEIN);
  const teile = [
    ...gross.map((p) => ({
      name: p.kontakt || "Ohne Namen",
      cents: p.monatlich,
      hinweis: p.monate >= 9 ? "jeden Monat" : p.monate >= 3 ? `seit ${p.monate} Monaten` : "aufs Jahr verteilt",
      titel: `${p.kontakt}: ${euro(p.monatlich)} im Monat, ${euro(p.summe)} in zwölf Monaten`,
    })),
    ...(klein.length > 0
      ? [
          {
            name: `${klein.length} kleinere`,
            cents: klein.reduce((s, p) => s + p.monatlich, 0),
            hinweis: klein.map((p) => p.kontakt).join(", "),
            titel: klein.map((p) => `${p.kontakt} ${euro(p.monatlich)}`).join(", "),
          },
        ]
      : []),
  ];
  const flaechen = kacheln(
    teile.map((t) => t.cents),
    BREITE,
    HOEHE,
  );
  return (
    <section className="card stack geschaeft-fluss" aria-labelledby="fix-heading">
      <div>
        <h2 id="fix-heading" className="bild-ueberschrift">
          Was jeden Monat abgeht
        </h2>
        <p className="fluss-satz">
          Für Abos und laufende Verträge zahlst du zurzeit rund <b>{euro(fixkosten.monatlich)}</b> im Monat. In den letzten zwölf Monaten waren es zusammen{" "}
          <b>{euro(fixkosten.summe)}</b>.
        </p>
      </div>
      <div className="fix-bild" style={{ aspectRatio: `${BREITE} / ${HOEHE}` }}>
        {teile.map((t, i) => {
          const f = flaechen[i]!;
          // Wie viel Text passt: nach der kürzeren Seite der Kachel
          const stufe = f.w < 9 || f.h < 9 ? "winzig" : f.w < 16 || f.h < 14 ? "klein" : "gross";
          return (
            <div
              key={t.name}
              className={`fix-kachel fix-${stufe} bunt-${(i % FARBEN) + 1}`}
              style={{ left: `${(f.x / BREITE) * 100}%`, top: `${(f.y / HOEHE) * 100}%`, width: `${(f.w / BREITE) * 100}%`, height: `${(f.h / HOEHE) * 100}%` }}
              title={t.titel}
            >
              <span className="fix-kachel-name">{t.name}</span>
              <span className="fix-kachel-wert">{euro(t.cents)}</span>
              <span className="fix-kachel-hinweis">{t.hinweis}</span>
            </div>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Je größer die Fläche, desto mehr kostet der Anbieter im Monat. Beträge mit Umsatzsteuer, so wie sie abgebucht werden, aus den Belegen von{" "}
        {monatName(fixkosten.von)} bis {monatName(fixkosten.bis)}. Was jährlich abgerechnet wird, ist auf zwölf Monate verteilt.
      </p>
    </section>
  );
}
