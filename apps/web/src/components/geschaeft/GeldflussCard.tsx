import { BEREICH_ZWEIG_LABEL, geldfluss, type BereichZweig, type FlussPosten } from "@haben/core";
import { Link } from "@tanstack/react-router";
import type { GeschaeftUebersicht } from "../../server/modules/geschaeft/index.ts";
import { euro } from "./euro.ts";

/*
 * Geldfluss: links die Bereiche, die Geld gebracht haben, rechts die, in die es geflossen ist, in der Mitte der Topf
 * mit dem, was übrig blieb. Die Bänder sind so dick wie die Beträge. Ein Klick auf einen Bereich zeigt seine Belege.
 */

const BREITE = 1000;
const RAND = 270;
const KNOTEN = 14;
const TOPF = 150;
const LUECKE = 14;
const MIN_HOEHE = 10;
/** Kleinere Posten als dieser Anteil am Ganzen stehen zusammen als „Kleineres“ */
const KLEIN = 0.012;

type Farbe = BereichZweig | "rest" | "fehlt";
interface Knoten {
  key: string;
  name: string;
  farbe: Farbe;
  cents: number;
  /** Bereich hinter dem Knoten; ohne ihn führt kein Klick weiter */
  bereichId?: string;
  hinweis?: string;
}

const FARBE: Record<Farbe, string> = {
  eigenes: "var(--zweig-eigenes)",
  fremdes: "var(--zweig-fremdes)",
  gemeinsam: "var(--zweig-gemeinsam)",
  neutral: "var(--zweig-gemeinsam)",
  rest: "var(--ink)",
  fehlt: "var(--danger-ink)",
};

function knoten(posten: readonly FlussPosten[], gesamt: number, seite: "ein" | "aus"): Knoten[] {
  const gross = posten.filter((p) => p.cents >= gesamt * KLEIN);
  const klein = posten.filter((p) => p.cents < gesamt * KLEIN);
  const liste: Knoten[] = (klein.length > 1 ? gross : posten).map((p) => ({
    key: `${seite}-${p.id}`,
    // Zusätze in Klammern („Auftragsarbeit (Design, Bühne)“) passen nicht neben das Band
    name: p.name.replace(/\s*\([^)]*\)\s*$/, ""),
    farbe: p.zweig,
    cents: p.cents,
    bereichId: p.id,
  }));
  if (klein.length > 1) {
    liste.push({
      key: `${seite}-klein`,
      name: "Kleineres",
      farbe: "gemeinsam",
      cents: klein.reduce((s, p) => s + p.cents, 0),
      hinweis: klein.map((p) => `${p.name} ${euro(p.cents)}`).join(", "),
    });
  }
  return liste;
}

const prozent = (teil: number, ganzes: number) => `${Math.round((teil / ganzes) * 100)} %`;

export function GeldflussCard({ uebersicht, jahr }: { uebersicht: GeschaeftUebersicht; jahr?: number }) {
  const fluss = geldfluss(uebersicht.zeilen, jahr);
  const gesamt = Math.max(fluss.einnahmen, fluss.ausgaben);
  const links = knoten(fluss.ein, gesamt, "ein");
  const rechts = knoten(fluss.aus, gesamt, "aus");
  if (fluss.rest < 0) links.push({ key: "fehlt", name: "Draufgezahlt", farbe: "fehlt", cents: -fluss.rest });

  const anzahl = Math.max(links.length, rechts.length, 1);
  const basis = Math.max(400, anzahl * 44);
  const k = gesamt > 0 ? (basis - LUECKE * (anzahl - 1)) / gesamt : 0;
  const hoehe = (q: Knoten) => Math.max(q.cents * k, MIN_HOEHE);
  const seitenhoehe = (liste: Knoten[]) => liste.reduce((s, q) => s + hoehe(q), 0) + LUECKE * Math.max(liste.length - 1, 0);
  const flaeche = Math.max(basis, seitenhoehe(links), seitenhoehe(rechts));
  const H = flaeche + 32;
  const topfX = (BREITE - TOPF) / 2;
  const topfH = gesamt * k;
  const topfY = 16 + (flaeche - topfH) / 2;
  const ausH = fluss.ausgaben * k;
  const restH = Math.max(fluss.rest, 0) * k;

  /** Band von einer Kante (x0, Höhe h0 ab y0) zur anderen (x1, Höhe h1 ab y1) */
  const band = (x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) => {
    const c = (x0 + x1) / 2;
    return `M${x0},${y0} C${c},${y0} ${c},${y1} ${x1},${y1} L${x1},${y1 + h1} C${c},${y1 + h1} ${c},${y0 + h0} ${x0},${y0 + h0} Z`;
  };

  const seite = (liste: Knoten[], linkeSeite: boolean) => {
    const x = linkeSeite ? RAND : BREITE - RAND - KNOTEN;
    let y = 16 + (flaeche - seitenhoehe(liste)) / 2;
    let yTopf = topfY;
    return liste.map((q) => {
      const h = hoehe(q);
      const hTopf = q.cents * k;
      const pfad = linkeSeite ? band(x + KNOTEN, y, h, topfX, yTopf, hTopf) : band(topfX + TOPF, yTopf, hTopf, x, y, h);
      const titel = `${q.name}: ${euro(q.cents)}, ${prozent(q.cents, gesamt)} ${linkeSeite ? "der Einnahmen" : "vom Geld"}${q.hinweis ? ` (${q.hinweis})` : ""}`;
      const inhalt = (
        <>
          <title>{titel}</title>
          <path d={pfad} fill={FARBE[q.farbe]} className="fluss-band" />
          <rect x={x} y={y} width={KNOTEN} height={h} rx={3} fill={FARBE[q.farbe]} />
          <text x={linkeSeite ? x - 12 : x + KNOTEN + 12} y={y + h / 2 + 5} style={{ textAnchor: linkeSeite ? "end" : "start" }} className="fluss-name">
            {q.name}
            <tspan dx={8} className="fluss-wert">
              {euro(q.cents)}
            </tspan>
          </text>
        </>
      );
      y += h + LUECKE;
      yTopf += hTopf;
      return q.bereichId ? (
        <Link
          key={q.key}
          to="/geschaeft"
          search={{ bereich: q.bereichId, jahr, fluss: jahr }}
          hash="posten-heading"
          className="fluss-knoten"
          aria-label={`${titel}. Belege anzeigen`}
        >
          {inhalt}
        </Link>
      ) : (
        <g key={q.key}>{inhalt}</g>
      );
    });
  };

  const wann = jahr ? `Im Jahr ${jahr}` : uebersicht.jahre.length > 0 ? `Seit ${uebersicht.jahre[0]}` : "Bisher";
  return (
    <section className="card stack geschaeft-fluss" aria-labelledby="fluss-heading">
      <nav className="fluss-jahre" aria-label="Zeitraum">
        <Link to="/geschaeft" search={{}} className={jahr === undefined ? "fluss-chip fluss-chip-aktiv" : "fluss-chip"}>
          Alle Jahre
        </Link>
        {uebersicht.jahre.map((j) => (
          <Link key={j} to="/geschaeft" search={{ fluss: j }} className={jahr === j ? "fluss-chip fluss-chip-aktiv" : "fluss-chip"}>
            {j}
          </Link>
        ))}
      </nav>
      <p className="fluss-satz" id="fluss-heading">
        {wann} hast du <b>{euro(fluss.einnahmen)}</b> eingenommen und <b>{euro(fluss.ausgaben)}</b> ausgegeben.{" "}
        {fluss.rest >= 0 ? (
          <>
            Übrig geblieben sind <b>{euro(fluss.rest)}</b>.
          </>
        ) : (
          <>
            Das sind <b>{euro(-fluss.rest)}</b> mehr, als reinkam.
          </>
        )}
      </p>
      <div className="fluss-legende small muted">
        {(["fremdes", "eigenes", "gemeinsam"] as const).map((zweig) => (
          <span key={zweig}>
            <i style={{ background: FARBE[zweig] }} />
            {BEREICH_ZWEIG_LABEL[zweig]}
          </span>
        ))}
        <span>Links kommt Geld rein, rechts geht es raus. Ein Klick auf einen Bereich zeigt die Belege.</span>
      </div>
      {gesamt === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          In diesem Zeitraum gibt es keine Belege.
        </p>
      ) : (
        <div className="table-scroll">
          <svg
            viewBox={`0 0 ${BREITE} ${H}`}
            className="fluss-bild"
            role="group"
            aria-label="Geldfluss: Einnahmen links, Ausgaben rechts, in der Mitte was übrig blieb"
          >
            {seite(links, true)}
            {seite(rechts, false)}
            <rect x={topfX} y={topfY} width={TOPF} height={Math.max(ausH - (restH > 0 ? 2 : 0), 0)} rx={6} className="fluss-topf-aus" />
            {ausH >= 40 && (
              <text x={BREITE / 2} y={topfY + ausH / 2 - 3} style={{ textAnchor: "middle" }} className="fluss-topf-text">
                Ausgegeben
                <tspan x={BREITE / 2} dy={18} className="fluss-topf-zahl">
                  {euro(fluss.ausgaben)}
                </tspan>
              </text>
            )}
            {restH > 0 && (
              <>
                <rect x={topfX - 8} y={topfY + ausH} width={TOPF + 16} height={restH} rx={6} className="fluss-topf-rest">
                  <title>{`Bleibt übrig: ${euro(fluss.rest)}, ${prozent(fluss.rest, fluss.einnahmen)} der Einnahmen`}</title>
                </rect>
                {restH >= 58 ? (
                  <text x={BREITE / 2} y={topfY + ausH + restH / 2 - 12} style={{ textAnchor: "middle" }} className="fluss-rest-text">
                    Bleibt übrig
                    <tspan x={BREITE / 2} dy={22} className="fluss-rest-zahl">
                      {euro(fluss.rest)}
                    </tspan>
                    <tspan x={BREITE / 2} dy={18}>
                      {prozent(fluss.rest, fluss.einnahmen)} der Einnahmen
                    </tspan>
                  </text>
                ) : (
                  restH >= 18 && (
                    <text x={BREITE / 2} y={topfY + ausH + restH / 2 + 5} style={{ textAnchor: "middle" }} className="fluss-rest-text">
                      Bleibt übrig {euro(fluss.rest)}
                    </text>
                  )
                )}
              </>
            )}
          </svg>
        </div>
      )}
      {fluss.rest > 0 && (
        <p className="small muted" style={{ margin: 0 }}>
          Der dunkle Block in der Mitte ist dein Puffer: Geld, das weder ausgegeben noch in die Marke gesteckt wurde. Wie viel davon noch auf dem Geschäftskonto
          liegt und wie viel du entnommen hast, lässt sich erst sagen, wenn die Bankumsätze in Haben sind.
        </p>
      )}
    </section>
  );
}
