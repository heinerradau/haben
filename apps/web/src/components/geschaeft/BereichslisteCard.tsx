import { BEREICH_REGEL_FELDER, BEREICH_ZWEIGE } from "@haben/core";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { useAction } from "../../lib/use-action.ts";
import { saveBereichsliste } from "../../server/functions/geschaeft.ts";
import type { Bereichsliste } from "../../server/modules/geschaeft/index.ts";
import { Field } from "../Field.tsx";
import { NoticeBanner } from "../NoticeBanner.tsx";

/**
 * Bereiche und Regeln als eine Liste im JSON-Format bearbeiten, sichern und übertragen. Bewusst schlicht: Die Liste
 * ändert sich selten, und ein Assistent oder ein Skript kann sie so als Ganzes pflegen.
 */
export function BereichslisteCard({ liste, offen }: { liste: Bereichsliste; offen: boolean }) {
  const router = useRouter();
  const save = useServerFn(saveBereichsliste);
  const gespeichert = JSON.stringify(liste, null, 2);
  const [text, setText] = useState(gespeichert);
  const { busy, notice, setNotice, run } = useAction();

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
      const ergebnis = await save({ data: daten as Bereichsliste });
      await router.invalidate();
      setNotice({ tone: "ok", text: `Gespeichert: ${ergebnis.bereiche} Bereiche mit ${ergebnis.regeln} Regeln.` });
    });
  }

  return (
    <details className="card" open={offen}>
      <summary style={{ cursor: "pointer", fontWeight: 500 }}>Bereiche und Regeln bearbeiten</summary>
      <form className="stack" onSubmit={onSubmit} style={{ marginTop: 12 }}>
        <p className="small muted" style={{ margin: 0 }}>
          Jeder Bereich hat einen Namen, einen Zweig ({BEREICH_ZWEIGE.join(", ")}) und Regeln. Eine Regel passt, wenn das Feld (
          {BEREICH_REGEL_FELDER.join(", ")}) das Muster enthält; Groß- und Kleinschreibung sind egal. „richtung“ beschränkt eine Regel auf „einnahme“ oder
          „ausgabe“, ein höherer „rang“ gewinnt, sonst das längere Muster. Ein Bereich, der aus der Liste verschwindet, verliert seine Regeln und Zuordnungen
          von Hand.
        </p>
        <Field label="Liste (JSON)">
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
            {busy ? "Speichere …" : "Liste speichern"}
          </button>
          <button type="button" className="btn" disabled={busy || text === gespeichert} onClick={() => setText(gespeichert)}>
            Zurücksetzen
          </button>
        </div>
      </form>
    </details>
  );
}
