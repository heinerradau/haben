import { formatEuro, wareSumme, warenSumme } from "@haben/core";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { useAction } from "../../lib/use-action.ts";
import { saveWarenliste } from "../../server/functions/geschaeft.ts";
import type { GeladeneWaren, Warenliste } from "../../server/modules/geschaeft/index.ts";
import { Field } from "../Field.tsx";
import { NoticeBanner } from "../NoticeBanner.tsx";
import { ScrollTable } from "../ScrollTable.tsx";

/**
 * Warenbestand: wie viel Geld in der Ware auf Lager steckt und was sie beim Verkauf einbringt. Die Liste pflegt der
 * Inhaber selbst (oder ein Assistent aus Shop oder Warenwirtschaft), wie die Bereichsliste als JSON.
 */
export function WarenCard({ bestand }: { bestand: GeladeneWaren }) {
  const router = useRouter();
  const save = useServerFn(saveWarenliste);
  const gespeichert = JSON.stringify({ waren: bestand.waren }, null, 2);
  const [text, setText] = useState(gespeichert);
  const { busy, notice, setNotice, run } = useAction();
  const summe = warenSumme(bestand.waren);
  const leer = bestand.waren.length === 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    let daten: unknown;
    try {
      daten = JSON.parse(text);
    } catch {
      setNotice({ tone: "danger", text: "Die Liste ist kein gültiges JSON. Prüfe Kommas, Anführungszeichen und Klammern." });
      return;
    }
    await run(async () => {
      const ergebnis = await save({ data: daten as Warenliste });
      await router.invalidate();
      setNotice({ tone: "ok", text: `Gespeichert: ${ergebnis.waren} Waren.` });
    });
  }

  return (
    <section className="card stack" aria-labelledby="waren-heading">
      <div>
        <h2 id="waren-heading" style={{ margin: 0, fontSize: 16 }}>
          Was in der Ware steckt
        </h2>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          {leer
            ? "Trag ein, was auf Lager liegt: Stückzahl, Einkaufspreis und der Preis, zu dem du realistisch verkaufst, etwa dein Händlerpreis."
            : `Stückzahl mal Preis, netto. Eine Schätzung aus deiner Liste, keine Inventur${
                bestand.stand ? `; Stand ${new Date(bestand.stand).toLocaleDateString("de-DE")}` : ""
              }.`}
        </p>
      </div>

      {!leer && (
        <>
          <div className="grid-4">
            <div>
              <div className="kpi-label">Bringt beim Verkauf</div>
              <div className="kpi-value">{formatEuro(summe.wert)}</div>
            </div>
            <div>
              <div className="kpi-label">Hat gekostet</div>
              <div className="kpi-value">{formatEuro(summe.einkauf)}</div>
            </div>
            <div>
              <div className="kpi-label">Bleibt übrig</div>
              <div className="kpi-value">{formatEuro(summe.spanne)}</div>
            </div>
            <div>
              <div className="kpi-label">Stück auf Lager</div>
              <div className="kpi-value">{summe.stueck.toLocaleString("de-DE")}</div>
            </div>
          </div>
          <div className="table-scroll">
            <ScrollTable className="report-table">
              <caption className="visually-hidden">Warenbestand je Ware</caption>
              <thead>
                <tr>
                  <th scope="col">Ware</th>
                  <th scope="col" className="num">
                    Stück
                  </th>
                  <th scope="col" className="num">
                    Einkauf je Stück
                  </th>
                  <th scope="col" className="num">
                    Preis je Stück
                  </th>
                  <th scope="col" className="num">
                    Hat gekostet
                  </th>
                  <th scope="col" className="num">
                    Bringt beim Verkauf
                  </th>
                </tr>
              </thead>
              <tbody>
                {bestand.waren.map((ware) => {
                  const s = wareSumme(ware);
                  return (
                    <tr key={ware.name}>
                      <th scope="row" style={{ fontWeight: 400 }}>
                        {ware.name}
                      </th>
                      <td className="num mono">{ware.stueck.toLocaleString("de-DE")}</td>
                      <td className="num mono">{formatEuro(ware.einkaufCent)}</td>
                      <td className="num mono">{formatEuro(ware.preisCent)}</td>
                      <td className="num mono">{formatEuro(s.einkauf)}</td>
                      <td className="num mono">{formatEuro(s.wert)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </ScrollTable>
          </div>
        </>
      )}

      <details open={leer}>
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Warenbestand bearbeiten</summary>
        <form className="stack" onSubmit={onSubmit} style={{ marginTop: 12 }}>
          <p className="small muted" style={{ margin: 0 }}>
            Jede Ware hat „name“, „stueck“, „einkaufCent“ und „preisCent“. Die Preise stehen netto in Cent je Stück: 8,50 € sind 850. Die Liste ersetzt den
            bisherigen Bestand als Ganzes.
          </p>
          <Field label="Warenbestand (JSON)">
            {(control) => (
              <textarea
                {...control}
                className="autogrow mono"
                style={{ fontSize: 13 }}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
            )}
          </Field>
          <NoticeBanner notice={notice} />
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={busy || text === gespeichert}>
              {busy ? "Speichere …" : "Bestand speichern"}
            </button>
            <button type="button" className="btn" disabled={busy || text === gespeichert} onClick={() => setText(gespeichert)}>
              Zurücksetzen
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}
