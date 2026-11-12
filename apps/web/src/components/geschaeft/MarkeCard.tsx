import { aufgelaufen } from "@haben/core";
import type { GeschaeftUebersicht, Kunde } from "../../server/modules/geschaeft/index.ts";
import { euro } from "./euro.ts";

/*
 * Das eigene Geschäft über die Jahre: was hineingesteckt wurde, was zurückkam und was als Ware auf Lager liegt.
 * Dazu, wer am meisten bezahlt hat, getrennt nach eigenem Geschäft und Arbeit für andere.
 */

export function MarkeCard({ uebersicht }: { uebersicht: GeschaeftUebersicht }) {
  const jeJahr = uebersicht.zweige.eigenes;
  const jahre = uebersicht.jahre.map((jahr) => ({ jahr, rein: Math.max(jeJahr[jahr]?.einnahmen ?? 0, 0), raus: Math.max(jeJahr[jahr]?.ausgaben ?? 0, 0) }));
  const ende = aufgelaufen(jeJahr, uebersicht.jahre).at(-1);
  if (!ende || (ende.einnahmen === 0 && ende.ausgaben === 0)) return null;
  const stand = ende.einnahmen - ende.ausgaben;
  const gesamtMax = Math.max(ende.einnahmen, ende.ausgaben, 1);
  const max = Math.max(1, ...jahre.map((j) => Math.max(j.rein, j.raus)));
  return (
    <section className="card stack geschaeft-fluss" aria-labelledby="marke-heading">
      <div>
        <h2 id="marke-heading" className="bild-ueberschrift">
          Dein eigenes Geschäft: hineingesteckt und zurückbekommen
        </h2>
        <p className="fluss-satz">
          {stand >= 0 ? (
            <>
              Dein eigenes Geschäft hat bisher <b>{euro(stand)}</b> mehr gebracht, als du hineingesteckt hast.
            </>
          ) : (
            <>
              In dein eigenes Geschäft hast du bisher <b>{euro(-stand)}</b> mehr gesteckt, als zurückkam.
            </>
          )}
        </p>
      </div>
      <ol className="bild-balken bild-balken-gross">
        <li>
          <span className="bild-balken-name">Hineingesteckt</span>
          <span className="bild-balken-spur">
            <i className="marke-raus" style={{ width: `${(ende.ausgaben / gesamtMax) * 100}%` }} />
          </span>
          <span className="bild-balken-wert">{euro(ende.ausgaben)}</span>
        </li>
        <li>
          <span className="bild-balken-name">Zurückbekommen</span>
          <span className="bild-balken-spur">
            <i style={{ width: `${(ende.einnahmen / gesamtMax) * 100}%`, background: "var(--zweig-eigenes)" }} />
          </span>
          <span className="bild-balken-wert">{euro(ende.einnahmen)}</span>
        </li>
      </ol>
      <h3 className="bild-titel">So lief es in den einzelnen Jahren</h3>
      <div className="marke-jahre">
        {jahre.map((j) => (
          <div key={j.jahr} className="marke-jahr">
            <div className="marke-saeulen">
              <span title={`${j.jahr} hineingesteckt: ${euro(j.raus)}`}>
                <b>{j.raus > 0 ? euro(j.raus) : ""}</b>
                <i className="marke-raus" style={{ height: `${(j.raus / max) * 88}%` }} />
              </span>
              <span title={`${j.jahr} zurückbekommen: ${euro(j.rein)}`}>
                <b>{j.rein > 0 ? euro(j.rein) : ""}</b>
                <i style={{ height: `${(j.rein / max) * 88}%`, background: "var(--zweig-eigenes)" }} />
              </span>
            </div>
            <div className="jahre-name">{j.jahr}</div>
            <div className={j.rein - j.raus >= 0 ? "jahre-rest" : "jahre-rest jahre-rest-minus"}>
              {j.rein - j.raus >= 0 ? "+" : "−"}
              {euro(Math.abs(j.rein - j.raus))}
            </div>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Grau: was du im Jahr für Ware, Werkstatt, Werbung und Reisen ausgegeben hast. Blau: was Verkäufe und eigene Projekte eingebracht haben. Gemeinsame
        Kosten wie das Fahrzeug sind nicht eingerechnet.
      </p>
    </section>
  );
}

function Kundenliste({ titel, hinweis, kunden, farbe }: { titel: string; hinweis: string; kunden: Kunde[]; farbe: string }) {
  const max = Math.max(1, ...kunden.map((k) => k.einnahmen));
  return (
    <section className="card stack geschaeft-fluss">
      <div>
        <h2 className="bild-ueberschrift">{titel}</h2>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          {hinweis}
        </p>
      </div>
      {kunden.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Noch keine Einnahmen.
        </p>
      ) : (
        <ol className="bild-balken">
          {kunden.map((k) => (
            <li key={k.kontakt}>
              <span className="bild-balken-name">{k.kontakt}</span>
              <span className="bild-balken-spur">
                <i style={{ width: `${Math.max((k.einnahmen / max) * 100, 1.5)}%`, background: farbe }} />
              </span>
              <span className="bild-balken-wert">{euro(k.einnahmen)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Wer am meisten bezahlt hat, je Zweig in seiner Farbe */
export function KundenCards({ uebersicht }: { uebersicht: GeschaeftUebersicht }) {
  return (
    <div className="fluss-zwei">
      <Kundenliste
        titel="Wer für dein Eigenes bezahlt hat"
        hinweis="Einnahmen des eigenen Geschäfts über alle Jahre, nach Kontakt."
        kunden={uebersicht.kunden.eigenes}
        farbe="var(--zweig-eigenes)"
      />
      <Kundenliste
        titel="Wer dich beauftragt hat"
        hinweis="Einnahmen aus Arbeit für andere über alle Jahre, nach Kontakt."
        kunden={uebersicht.kunden.fremdes}
        farbe="var(--zweig-fremdes)"
      />
    </div>
  );
}
