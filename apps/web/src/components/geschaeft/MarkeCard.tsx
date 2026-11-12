import { aufgelaufen, warenSumme } from "@haben/core";
import type { GeladeneWaren, GeschaeftUebersicht, Kunde } from "../../server/modules/geschaeft/index.ts";
import { euro } from "./euro.ts";

/*
 * Das eigene Geschäft über die Jahre: was hineingesteckt wurde, was zurückkam und was als Ware auf Lager liegt.
 * Dazu, wer am meisten bezahlt hat, getrennt nach eigenem Geschäft und Arbeit für andere.
 */

const W = 980;
const H = 380;
const LINKS = 64;
const RECHTS = 210;
const OBEN = 20;
const UNTEN = 40;

function Kennzahl({ titel, wert, hinweis }: { titel: string; wert: string; hinweis: string }) {
  return (
    <div>
      <div className="kpi-label">{titel}</div>
      <div className="kpi-value">{wert}</div>
      <div className="small muted">{hinweis}</div>
    </div>
  );
}

export function MarkeCard({ uebersicht, waren }: { uebersicht: GeschaeftUebersicht; waren: GeladeneWaren }) {
  const punkte = aufgelaufen(uebersicht.zweige.eigenes, uebersicht.jahre);
  const ende = punkte.at(-1);
  if (!ende || (ende.einnahmen === 0 && ende.ausgaben === 0)) return null;
  const lager = warenSumme(waren.waren);
  const stand = ende.einnahmen - ende.ausgaben;
  const max = Math.max(ende.einnahmen, ende.ausgaben, ...punkte.map((p) => Math.max(p.einnahmen, p.ausgaben))) * 1.08;
  const x = (i: number) => LINKS + ((W - LINKS - RECHTS) * i) / Math.max(punkte.length - 1, 1);
  const y = (cents: number) => H - UNTEN - (cents / max) * (H - OBEN - UNTEN);
  const linie = (wert: (p: (typeof punkte)[number]) => number) => punkte.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(wert(p))}`).join(" ");
  const flaeche = `${linie((p) => p.einnahmen)} ${[...punkte]
    .reverse()
    .map((p, i) => `L${x(punkte.length - 1 - i)},${y(p.ausgaben)}`)
    .join(" ")} Z`;
  // Rund vier Hilfslinien auf glatten Beträgen
  const schritt = [500_00, 1_000_00, 2_000_00, 5_000_00, 10_000_00, 20_000_00, 50_000_00, 100_000_00, 500_000_00].find((s) => max / s <= 5) ?? 1_000_000_00;
  const linien = Array.from({ length: Math.floor(max / schritt) + 1 }, (_, i) => i * schritt);
  const yEin = y(ende.einnahmen);
  const yAus = y(ende.ausgaben);
  const auseinander = Math.max(0, 44 - Math.abs(yAus - yEin)) / 2;
  const oben = yEin <= yAus ? -1 : 1;

  return (
    <section className="card stack geschaeft-fluss" aria-labelledby="marke-heading">
      <div>
        <h2 id="marke-heading" style={{ margin: 0, fontSize: 16 }}>
          Dein eigenes Geschäft: hineingesteckt und zurückbekommen
        </h2>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          Beide Linien zählen vom ersten Jahr an immer weiter hoch. Liegt die durchgezogene über der gestrichelten, hat das eigene Geschäft bis dahin mehr
          gebracht als gekostet. Gemeinsame Kosten wie das Fahrzeug sind nicht eingerechnet.
        </p>
      </div>
      <div className="grid-4">
        <Kennzahl titel="Hineingesteckt" wert={euro(ende.ausgaben)} hinweis="Ware, Werkstatt, Werbung, Reisen" />
        <Kennzahl titel="Zurückbekommen" wert={euro(ende.einnahmen)} hinweis="Verkäufe und eigene Projekte" />
        <Kennzahl titel={stand >= 0 ? "Im Plus mit" : "Noch im Minus mit"} wert={euro(Math.abs(stand))} hinweis={`Stand ${ende.jahr}`} />
        {lager.stueck > 0 && (
          <Kennzahl
            titel="Steckt noch in Ware"
            wert={euro(lager.wert)}
            hinweis={`${lager.stueck.toLocaleString("de-DE")} Stück, Einkauf ${euro(lager.einkauf)}`}
          />
        )}
      </div>
      <div className="table-scroll">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="fluss-bild"
          role="img"
          aria-label={`Aufgelaufene Einnahmen und Ausgaben des eigenen Geschäfts von ${punkte[0]!.jahr} bis ${ende.jahr}; die Zahlen stehen in der Tabelle „Zweige je Jahr“`}
        >
          {linien.map((cents) => (
            <g key={cents}>
              <line x1={LINKS} x2={W - RECHTS} y1={y(cents)} y2={y(cents)} className="fluss-gitter" />
              <text x={LINKS - 10} y={y(cents) + 4} style={{ textAnchor: "end" }} className="fluss-achse">
                {cents === 0 ? "0 €" : `${(cents / 100_000).toLocaleString("de-DE")} Tsd.`}
              </text>
            </g>
          ))}
          <path d={flaeche} className="fluss-zwischen" />
          <path d={linie((p) => p.ausgaben)} className="fluss-linie-aus" />
          <path d={linie((p) => p.einnahmen)} className="fluss-linie-ein" />
          {punkte.map((p, i) => (
            <g key={p.jahr}>
              <title>{`Bis Ende ${p.jahr}: zurückbekommen ${euro(p.einnahmen)}, hineingesteckt ${euro(p.ausgaben)}`}</title>
              <rect x={x(i) - 36} y={OBEN} width={72} height={H - OBEN - UNTEN} fill="transparent" />
              <circle cx={x(i)} cy={y(p.ausgaben)} r={5} className="fluss-punkt-aus" />
              <circle cx={x(i)} cy={y(p.einnahmen)} r={5.5} className="fluss-punkt-ein" />
              <text x={x(i)} y={H - 12} style={{ textAnchor: "middle" }} className="fluss-name">
                {p.jahr}
              </text>
            </g>
          ))}
          <text x={W - RECHTS + 16} y={yEin + oben * auseinander + 5} className="fluss-name">
            Zurückbekommen
            <tspan dx={8} className="fluss-wert">
              {euro(ende.einnahmen)}
            </tspan>
          </text>
          <text x={W - RECHTS + 16} y={yAus - oben * auseinander + 5} className="fluss-name">
            Hineingesteckt
            <tspan dx={8} className="fluss-wert">
              {euro(ende.ausgaben)}
            </tspan>
          </text>
        </svg>
      </div>
    </section>
  );
}

function Kundenliste({ titel, hinweis, kunden, farbe }: { titel: string; hinweis: string; kunden: Kunde[]; farbe: string }) {
  const max = Math.max(1, ...kunden.map((k) => k.einnahmen));
  return (
    <section className="card stack geschaeft-fluss">
      <div>
        <h2 style={{ margin: 0, fontSize: 16 }}>{titel}</h2>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          {hinweis}
        </p>
      </div>
      {kunden.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Noch keine Einnahmen.
        </p>
      ) : (
        <ol className="fluss-rang">
          {kunden.map((k) => (
            <li key={k.kontakt}>
              <span>{k.kontakt}</span>
              <span className="mono">{euro(k.einnahmen)}</span>
              <div className="fluss-rang-spur">
                <i style={{ width: `${Math.max((k.einnahmen / max) * 100, 1)}%`, background: farbe }} />
              </div>
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
