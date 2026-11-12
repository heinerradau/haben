import { wareSumme, warenSumme } from "@haben/core";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { useAction } from "../../lib/use-action.ts";
import { saveWarenliste } from "../../server/functions/geschaeft.ts";
import type { GeladeneWaren, Warenliste } from "../../server/modules/geschaeft/index.ts";
import { Field } from "../Field.tsx";
import { NoticeBanner } from "../NoticeBanner.tsx";
import { euro } from "./euro.ts";

const anteil = (cents: number, ganzes: number) => `${Math.max((cents / Math.max(ganzes, 1)) * 100, 0)}%`;

/** Drei Stufen in einem Balken: bezahlt, dazu was der Händlerpreis bringt, dazu was der Direktverkauf bringt */
function Wertbalken({ einkauf, wert, direkt, ganzes }: { einkauf: number; wert: number; direkt: number; ganzes: number }) {
  return (
    <span className="ware-wert" style={{ width: anteil(direkt, ganzes) }}>
      <i className="ware-direkt" style={{ width: "100%" }} />
      <i className="ware-haendler" style={{ width: anteil(wert, direkt) }} />
      <i className="ware-einkauf" style={{ width: anteil(Math.min(einkauf, wert), direkt) }} />
    </span>
  );
}

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

  // Alle Balken teilen sich einen Maßstab: die Ware mit dem höchsten Wert beim Direktverkauf füllt die Breite
  const posten = bestand.waren.map((ware) => ({ ware, s: wareSumme(ware) }));
  const max = Math.max(1, ...posten.map((p) => p.s.wertDirekt));
  const spanne = summe.wertDirekt > summe.wert;
  return (
    <section className="card stack geschaeft-fluss" aria-labelledby="waren-heading">
      <div>
        <h2 id="waren-heading" className="bild-ueberschrift">
          Was in der Ware steckt
        </h2>
        {leer ? (
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            Trag unten ein, was auf Lager liegt: Stückzahl, Einkaufspreis, Händlerpreis und der Preis, wenn du selbst verkaufst.
          </p>
        ) : (
          <p className="fluss-satz">
            In deinem Lager liegen <b>{summe.stueck.toLocaleString("de-DE")} Stück</b>. Bezahlt hast du dafür <b>{euro(summe.einkauf)}</b>. Verkauft bringen sie{" "}
            {spanne ? (
              <>
                zwischen <b>{euro(summe.wert)}</b> (alles an Händler, zum günstigsten Preis) und <b>{euro(summe.wertDirekt)}</b> (alles selbst verkauft).
              </>
            ) : (
              <>
                <b>{euro(summe.wert)}</b>.
              </>
            )}
          </p>
        )}
      </div>

      {!leer && (
        <>
          <div className="ware-gesamt">
            <Wertbalken einkauf={summe.einkauf} wert={summe.wert} direkt={summe.wertDirekt} ganzes={summe.wertDirekt} />
          </div>
          <div className="fluss-legende small muted">
            <span>
              <i className="ware-einkauf" />
              schon bezahlt (Einkauf)
            </span>
            <span>
              <i className="ware-haendler" />
              bringt der Verkauf an Händler (günstigster Preis)
            </span>
            {spanne && (
              <span>
                <i className="ware-direkt" />
                bringt der Verkauf direkt an Kunden
              </span>
            )}
          </div>
          <div className="ware-liste">
            {posten.map(({ ware, s }) => {
              const auflage = ware.stueck + s.verkauft;
              return (
                <div key={ware.name} className="ware-posten">
                  <div className="ware-name">{ware.name}</div>
                  <div className="ware-zeile">
                    <span className="ware-fuell" title={`${s.verkauft} von ${auflage} Stück verkauft`}>
                      <i style={{ width: anteil(s.verkauft, auflage) }} />
                    </span>
                    <span className="ware-text">
                      {s.verkauft > 0 ? `${s.verkauft.toLocaleString("de-DE")} von ${auflage.toLocaleString("de-DE")} verkauft` : "noch nichts verkauft"} ·{" "}
                      <b>{ware.stueck.toLocaleString("de-DE")} noch da</b>
                    </span>
                  </div>
                  <div className="ware-zeile">
                    <span className="ware-spur">
                      <Wertbalken einkauf={s.einkauf} wert={s.wert} direkt={s.wertDirekt} ganzes={max} />
                    </span>
                    <span className="ware-text">
                      bringt noch <b>{s.wertDirekt > s.wert ? `${euro(s.wert)} bis ${euro(s.wertDirekt)}` : euro(s.wert)}</b>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Oberer Balken je Ware: wie viel der Auflage schon verkauft ist. Unterer Balken: was der Rest noch bringt. Eine Schätzung aus deiner Liste, netto,
            keine Inventur{bestand.stand ? `; Stand ${new Date(bestand.stand).toLocaleDateString("de-DE")}` : ""}.
          </p>
        </>
      )}

      <details open={leer}>
        <summary style={{ cursor: "pointer", fontWeight: 500 }}>Warenbestand bearbeiten</summary>
        <form className="stack" onSubmit={onSubmit} style={{ marginTop: 12 }}>
          <p className="small muted" style={{ margin: 0 }}>
            Jede Ware hat „name“, „stueck“, „einkaufCent“ und „preisCent“ (dein Händlerpreis). Dazu, wenn du magst, „ladenpreisCent“ (Preis beim Verkauf direkt
            an Kunden) und „verkauft“ (schon verkaufte Stück). Die Preise stehen netto in Cent je Stück: 8,50 € sind 850. Die Liste ersetzt den bisherigen
            Bestand als Ganzes.
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
