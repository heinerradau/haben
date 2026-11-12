import { Link } from "@tanstack/react-router";
import type { GeschaeftUebersicht } from "../../server/modules/geschaeft/index.ts";
import { euro } from "./euro.ts";

/*
 * Jahr für Jahr als Säulen: nach oben, was hereinkam (Arbeit für andere und eigenes Geschäft), nach unten, was hinausging
 * (eigenes Geschäft und gemeinsame Kosten). Unter jeder Säule steht, was das Jahr übrig ließ. Ein Klick zeigt den
 * Geldfluss des Jahres.
 */

const HOEHE = 260;

export function JahreCard({ uebersicht, fluss }: { uebersicht: GeschaeftUebersicht; fluss?: number }) {
  const { jahre, zweige } = uebersicht;
  const dat = jahre.map((jahr) => {
    const oben = [
      { key: "fremdes", cents: Math.max(zweige.fremdes[jahr]?.einnahmen ?? 0, 0) },
      { key: "eigenes", cents: Math.max(zweige.eigenes[jahr]?.einnahmen ?? 0, 0) },
    ];
    const unten = [
      { key: "eigenes", cents: Math.max((zweige.eigenes[jahr]?.ausgaben ?? 0) + (zweige.fremdes[jahr]?.ausgaben ?? 0), 0) },
      { key: "gemeinsam", cents: Math.max(zweige.gemeinsam[jahr]?.ausgaben ?? 0, 0) },
    ];
    const rein = oben.reduce((s, t) => s + t.cents, 0);
    const raus = unten.reduce((s, t) => s + t.cents, 0);
    return { jahr, oben, unten, rein, raus, rest: rein - raus };
  });
  const maxRein = Math.max(1, ...dat.map((d) => d.rein));
  const maxRaus = Math.max(1, ...dat.map((d) => d.raus));
  const k = HOEHE / (maxRein + maxRaus);
  const bestes = [...dat].sort((a, b) => b.rest - a.rest)[0];
  return (
    <section className="card stack geschaeft-fluss" aria-labelledby="jahre-heading">
      <div>
        <h2 id="jahre-heading" className="bild-ueberschrift">
          Jahr für Jahr
        </h2>
        <p className="small muted" style={{ margin: "4px 0 0" }}>
          Nach oben, was reinkam. Nach unten, was rausging. Darunter der Gewinn des Jahres.
          {bestes && bestes.rest > 0 ? ` Dein bestes Jahr war ${bestes.jahr}.` : ""} Ein Klick auf ein Jahr zeigt oben seinen Geldfluss.
        </p>
      </div>
      <div className="fluss-legende small muted">
        <span>
          <i style={{ background: "var(--zweig-fremdes)" }} />
          Arbeit für andere
        </span>
        <span>
          <i style={{ background: "var(--zweig-eigenes)" }} />
          Eigenes Geschäft
        </span>
        <span>
          <i style={{ background: "var(--zweig-gemeinsam)" }} />
          Gemeinsame Kosten
        </span>
      </div>
      <div className="jahre-reihe">
        {dat.map((d) => (
          <Link
            key={d.jahr}
            to="/geschaeft"
            search={{ fluss: d.jahr }}
            className={fluss === d.jahr ? "jahre-jahr jahre-jahr-aktiv" : "jahre-jahr"}
            aria-label={`${d.jahr}: ${euro(d.rein)} eingenommen, ${euro(d.raus)} ausgegeben, ${d.rest >= 0 ? "Gewinn" : "Verlust"} ${euro(Math.abs(d.rest))}`}
          >
            <span className="jahre-oben" style={{ height: maxRein * k }}>
              <span className="jahre-zahl">{euro(d.rein)}</span>
              {d.oben.map((t) => t.cents > 0 && <i key={t.key} style={{ height: t.cents * k, background: `var(--zweig-${t.key})` }} />)}
            </span>
            <span className="jahre-unten" style={{ height: maxRaus * k }}>
              {d.unten.map(
                (t) =>
                  t.cents > 0 && (
                    <i
                      key={t.key}
                      className={t.key === "eigenes" ? "jahre-raus-eigenes" : undefined}
                      style={{ height: t.cents * k, background: `var(--zweig-${t.key})` }}
                    />
                  ),
              )}
              <span className="jahre-zahl">−{euro(d.raus)}</span>
            </span>
            <span className="jahre-name">{d.jahr}</span>
            <span className={d.rest >= 0 ? "jahre-rest" : "jahre-rest jahre-rest-minus"}>
              {d.rest >= 0 ? "+" : "−"}
              {euro(Math.abs(d.rest))}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
