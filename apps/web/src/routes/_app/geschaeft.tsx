import { BEREICH_ZWEIG_LABEL, BEREICH_ZWEIGE, bereichSummeGesamt, formatEuro, type BereichSumme } from "@haben/core";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod/mini";
import { BereichCard } from "../../components/geschaeft/BereichCard.tsx";
import { BereichslisteCard } from "../../components/geschaeft/BereichslisteCard.tsx";
import { FixkostenCard } from "../../components/geschaeft/FixkostenCard.tsx";
import { GeldflussCard } from "../../components/geschaeft/GeldflussCard.tsx";
import { JahreCard } from "../../components/geschaeft/JahreCard.tsx";
import { KundenCards, MarkeCard } from "../../components/geschaeft/MarkeCard.tsx";
import { PostenCard } from "../../components/geschaeft/PostenCard.tsx";
import { WarenCard } from "../../components/geschaeft/WarenCard.tsx";
import { NoticeBanner } from "../../components/NoticeBanner.tsx";
import { ScrollTable } from "../../components/ScrollTable.tsx";
import { useAction } from "../../lib/use-action.ts";
import { assignBeleg, getGeschaeft } from "../../server/functions/geschaeft.ts";
import styles from "../../styles/auswertungen.css?url";

/**
 * Geschäftsbereiche: was jeder Bereich des Betriebs je Jahr eingenommen und gekostet hat, zusammengefasst nach Zweigen
 * (das eigene Geschäft, Arbeit für andere, gemeinsame Kosten). Eine Auswertung für den Inhaber über den archivierten
 * Altbestand, netto nach Belegdatum; keine Gewinnermittlung.
 */
export const Route = createFileRoute("/_app/geschaeft")({
  validateSearch: z.object({
    bereich: z.optional(z.union([z.uuid(), z.literal("offen")])),
    jahr: z.optional(z.int().check(z.minimum(1990), z.maximum(2200))),
    /** Jahr des Geldflusses; ohne Angabe alle Jahre */
    fluss: z.optional(z.int().check(z.minimum(1990), z.maximum(2200))),
  }),
  loaderDeps: ({ search }) => ({ bereich: search.bereich, jahr: search.jahr }),
  loader: ({ deps }) => getGeschaeft({ data: deps }),
  head: () => ({ meta: [{ title: "Geschäftsbereiche · Haben" }], links: [{ rel: "stylesheet", href: styles }] }),
  component: GeschaeftPage,
});

type Data = Awaited<ReturnType<typeof getGeschaeft>>;
type Uebersicht = Data["uebersicht"];

const LEER: BereichSumme = { einnahmen: 0, ausgaben: 0, ergebnis: 0, posten: 0 };

function ergebnisFarbe(cents: number): string | undefined {
  return cents < 0 ? "var(--danger-ink)" : undefined;
}

function ZweigTabelle({ uebersicht }: { uebersicht: Uebersicht }) {
  const { jahre, zweige, offen, gesamt } = uebersicht;
  const zeilen: { key: string; titel: string; jeJahr: Record<number, BereichSumme>; link?: "offen" }[] = [
    ...BEREICH_ZWEIGE.filter((z) => z !== "neutral").map((z) => ({ key: z, titel: BEREICH_ZWEIG_LABEL[z], jeJahr: zweige[z] })),
    ...(uebersicht.offenGesamt.posten > 0 ? [{ key: "offen", titel: "Noch nicht zugeordnet", jeJahr: offen, link: "offen" as const }] : []),
  ];
  return (
    <section className="card" aria-labelledby="zweige-heading">
      <h2 id="zweige-heading" style={{ margin: 0, fontSize: 16 }}>
        Zweige je Jahr
      </h2>
      <p className="small muted" style={{ margin: "4px 0 12px" }}>
        Einnahmen minus Ausgaben, netto nach Belegdatum. Darunter klein: Einnahmen und Ausgaben.
      </p>
      <div className="table-scroll">
        <ScrollTable className="report-table">
          <caption className="visually-hidden">Ergebnis je Zweig und Jahr</caption>
          <thead>
            <tr>
              <th scope="col">Zweig</th>
              {jahre.map((jahr) => (
                <th key={jahr} scope="col" className="num">
                  {jahr}
                </th>
              ))}
              <th scope="col" className="num">
                Summe
              </th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((zeile) => (
              <tr key={zeile.key}>
                <th scope="row">
                  {zeile.link ? (
                    <Link to="/geschaeft" search={{ bereich: zeile.link }}>
                      {zeile.titel}
                    </Link>
                  ) : (
                    zeile.titel
                  )}
                </th>
                {jahre.map((jahr) => (
                  <Zelle key={jahr} summe={zeile.jeJahr[jahr] ?? LEER} />
                ))}
                <Zelle summe={bereichSummeGesamt(zeile.jeJahr)} />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Zusammen</th>
              {jahre.map((jahr) => (
                <Zelle key={jahr} summe={gesamt[jahr] ?? LEER} />
              ))}
              <Zelle summe={bereichSummeGesamt(gesamt)} />
            </tr>
          </tfoot>
        </ScrollTable>
      </div>
    </section>
  );
}

function Zelle({ summe }: { summe: BereichSumme }) {
  if (summe.posten === 0) return <td className="num muted">–</td>;
  return (
    <td className="num">
      <span className="mono" style={{ color: ergebnisFarbe(summe.ergebnis) }}>
        {formatEuro(summe.ergebnis)}
      </span>
      {summe.einnahmen !== 0 && <div className="small muted">+{formatEuro(summe.einnahmen)}</div>}
      {summe.ausgaben !== 0 && <div className="small muted">−{formatEuro(summe.ausgaben)}</div>}
    </td>
  );
}

function BereichTabelle({ uebersicht, gewaehlt, jahr }: { uebersicht: Uebersicht; gewaehlt?: string; jahr?: number }) {
  const { jahre, zeilen } = uebersicht;
  return (
    <section className="card" aria-labelledby="bereiche-heading">
      <h2 id="bereiche-heading" style={{ margin: 0, fontSize: 16 }}>
        Bereiche je Jahr
      </h2>
      <p className="small muted" style={{ margin: "4px 0 12px" }}>
        Ein Klick auf eine Zahl zeigt die Belege dahinter.
      </p>
      <div className="table-scroll">
        <ScrollTable className="report-table">
          <caption className="visually-hidden">Ergebnis je Bereich und Jahr, nach Zweigen gruppiert</caption>
          <thead>
            <tr>
              <th scope="col">Bereich</th>
              {jahre.map((j) => (
                <th key={j} scope="col" className="num">
                  {j}
                </th>
              ))}
              <th scope="col" className="num">
                Summe
              </th>
            </tr>
          </thead>
          {BEREICH_ZWEIGE.map((zweig) => {
            const imZweig = zeilen.filter((z) => z.bereich.zweig === zweig);
            if (imZweig.length === 0) return null;
            return (
              <tbody key={zweig}>
                <tr className="group-row">
                  <th scope="colgroup" colSpan={jahre.length + 2}>
                    {BEREICH_ZWEIG_LABEL[zweig]}
                  </th>
                </tr>
                {imZweig.map((zeile) => (
                  <tr key={zeile.bereich.id}>
                    <th scope="row" style={{ fontWeight: gewaehlt === zeile.bereich.id ? 600 : 400 }}>
                      <Link to="/geschaeft" search={{ bereich: zeile.bereich.id }}>
                        {zeile.bereich.name}
                      </Link>
                    </th>
                    {jahre.map((j) => {
                      const summe = zeile.jeJahr[j] ?? LEER;
                      if (summe.posten === 0)
                        return (
                          <td key={j} className="num muted">
                            –
                          </td>
                        );
                      const aktiv = gewaehlt === zeile.bereich.id && jahr === j;
                      return (
                        <td key={j} className="num">
                          <Link
                            to="/geschaeft"
                            search={{ bereich: zeile.bereich.id, jahr: j }}
                            className="mono"
                            style={{ color: ergebnisFarbe(summe.ergebnis), fontWeight: aktiv ? 600 : 400 }}
                            aria-label={`${zeile.bereich.name} ${j}: ${formatEuro(summe.ergebnis)}, Belege anzeigen`}
                          >
                            {formatEuro(summe.ergebnis)}
                          </Link>
                        </td>
                      );
                    })}
                    <td className="num mono" style={{ color: ergebnisFarbe(zeile.gesamt.ergebnis) }}>
                      {formatEuro(zeile.gesamt.ergebnis)}
                    </td>
                  </tr>
                ))}
              </tbody>
            );
          })}
        </ScrollTable>
      </div>
    </section>
  );
}

function GeschaeftPage() {
  const { uebersicht, liste, waren, posten } = Route.useLoaderData();
  const { bereich, jahr, fluss } = Route.useSearch();
  const router = useRouter();
  const assign = useServerFn(assignBeleg);
  const { busy, notice, run } = useAction();
  const leer = uebersicht.zeilen.length === 0;
  const gewaehlterName = bereich === "offen" ? "Noch nicht zugeordnet" : uebersicht.zeilen.find((z) => z.bereich.id === bereich)?.bereich.name;

  const zuordnen = (belegId: string, bereichId: string | null) =>
    run(async () => {
      await assign({ data: { belegId, bereichId } });
      await router.invalidate();
    });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link to="/auswertungen">Auswertungen</Link>
          </div>
          <h1>Geschäftsbereiche</h1>
        </div>
      </div>

      <NoticeBanner notice={notice} />

      {leer ? (
        <section className="card stack">
          <h2 style={{ margin: 0, fontSize: 16 }}>Noch keine Bereiche</h2>
          <p style={{ margin: 0 }}>
            Geschäftsbereiche teilen deine Belege danach auf, wozu sie gehören: etwa „Auftragsarbeit“ und „Kurse“ als Arbeit für andere, „Online-Shop“ und
            „Ware“ als eigenes Geschäft, „Fahrzeug“ als gemeinsame Kosten. Regeln ordnen die Belege zu, zum Beispiel „Kontakt enthält Theater“. Lege unten die
            Liste an; danach zeigt diese Seite, woher dein Geld kommt und wohin es geht.
          </p>
        </section>
      ) : (
        <GeldflussCard uebersicht={uebersicht} jahr={fluss} />
      )}

      {posten && gewaehlterName && (
        <BereichCard
          bereich={uebersicht.zeilen.find((z) => z.bereich.id === bereich)?.bereich ?? null}
          titel={gewaehlterName}
          jahre={uebersicht.jahre}
          jahr={jahr}
          fluss={fluss}
          liste={posten}
        >
          <PostenCard
            titel={`${gewaehlterName}${jahr ? ` ${jahr}` : ""}`}
            liste={posten}
            bereiche={uebersicht.zeilen.map((z) => z.bereich)}
            busy={busy}
            onAssign={zuordnen}
          />
        </BereichCard>
      )}

      {!leer && (
        <>
          <JahreCard uebersicht={uebersicht} fluss={fluss} />
          <FixkostenCard uebersicht={uebersicht} />
          <MarkeCard uebersicht={uebersicht} />
          <WarenCard key={waren.stand ?? "leer"} bestand={waren} />
          <KundenCards uebersicht={uebersicht} />
        </>
      )}

      {!leer && (
        <details className="geschaeft-zahlen">
          <summary>Zahlen zum Nachschlagen (Tabellen)</summary>
          <div className="stack-lg">
            <ZweigTabelle uebersicht={uebersicht} />
            <BereichTabelle uebersicht={uebersicht} gewaehlt={bereich} jahr={jahr} />
          </div>
        </details>
      )}

      <BereichslisteCard liste={liste} offen={leer} />

      <p className="small muted" style={{ margin: 0 }}>
        Gezählt werden die archivierten Belege aus dem Umzug (Archiv), netto nach Belegdatum, ohne stornierte Belege. Abschreibungen, private Anteile und
        Umsatzsteuer rechnet diese Seite nicht; für das Finanzamt gilt die EÜR unter <Link to="/auswertungen">Auswertungen</Link>.
      </p>
    </>
  );
}
