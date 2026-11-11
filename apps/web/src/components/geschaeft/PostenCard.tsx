import { formatEuro, type Geschaeftsbereich } from "@haben/core";
import { Link } from "@tanstack/react-router";
import { formatDate } from "../../lib/format.ts";
import type { PostenListe } from "../../server/modules/geschaeft/index.ts";
import { ScrollTable } from "../ScrollTable.tsx";

const QUELLE_LABEL = { hand: "von Hand", regel: "Regel", offen: "offen" } as const;

/** Belege hinter einer Zahl der Auswertung, die größten zuerst; je Beleg lässt sich der Bereich von Hand festlegen */
export function PostenCard({
  titel,
  liste,
  bereiche,
  busy,
  onAssign,
}: {
  titel: string;
  liste: PostenListe;
  bereiche: Geschaeftsbereich[];
  busy: boolean;
  onAssign: (belegId: string, bereichId: string | null) => void;
}) {
  return (
    <section className="card" aria-labelledby="posten-heading">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h2 id="posten-heading" style={{ margin: 0, fontSize: 16 }}>
          Belege: {titel} <span className="small muted">({liste.summe.posten})</span>
        </h2>
        <Link to="/geschaeft" className="small">
          Liste schließen
        </Link>
      </div>
      <p className="small muted" style={{ margin: "4px 0 12px" }}>
        Einnahmen {formatEuro(liste.summe.einnahmen)}, Ausgaben {formatEuro(liste.summe.ausgaben)}.
        {liste.gekuerzt && ` Gezeigt werden die ${liste.posten.length} größten Posten.`}
      </p>
      {liste.posten.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Keine Belege.
        </p>
      ) : (
        <div className="table-scroll">
          <ScrollTable className="report-table">
            <caption className="visually-hidden">Belege zu {titel}, nach Betrag sortiert</caption>
            <thead>
              <tr>
                <th scope="col">Datum</th>
                <th scope="col">Kontakt und Inhalt</th>
                <th scope="col" className="num">
                  Netto
                </th>
                <th scope="col">Bereich</th>
              </tr>
            </thead>
            <tbody>
              {liste.posten.map((p, index) => (
                // Ein Beleg mit mehreren Kategorien steht mit mehreren Posten in der Liste
                <tr key={`${p.belegId}-${index}`}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(p.datum)}</td>
                  <td>
                    <Link to="/archiv/beleg/$id" params={{ id: p.belegId }}>
                      {p.kontakt || p.nummer || "Beleg"}
                    </Link>
                    <div className="small muted" style={{ overflowWrap: "anywhere" }}>
                      {[p.nummer, p.kategorie, p.text.slice(0, 140)].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="num mono">{formatEuro(p.richtung === "ausgabe" ? -p.netto : p.netto)}</td>
                  <td>
                    {/* biome-ignore lint/plugin: Zeile einer Tabelle: Spaltenkopf und aria-label benennen die Zelle, ein Feldname je Zelle gäbe jeder Zeile eine Hülle `.field` */}
                    <select
                      aria-label={`Bereich für ${p.kontakt || p.nummer || "Beleg"} vom ${formatDate(p.datum)}`}
                      value={p.quelle === "hand" ? (p.bereichId ?? "") : ""}
                      disabled={busy}
                      onChange={(e) => onAssign(p.belegId, e.target.value || null)}
                    >
                      <option value="">{p.quelle === "hand" ? "Wieder nach Regeln" : `Nach Regeln (${QUELLE_LABEL[p.quelle]})`}</option>
                      {bereiche.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </div>
      )}
    </section>
  );
}
