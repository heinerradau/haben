/*
 * Klartext-Namen für Kontakte in der Auswertung der Geschäftsbereiche: „Meta Platforms Ireland Limited“ sagt wenig,
 * „Facebook- und Instagram-Werbung“ versteht man sofort. Eigene Namen (Muster → Name) gehen vor, dann die bekannten
 * Anbieter; sonst bleibt der Name ohne Rechtsform. Kontakte mit demselben Klartext-Namen zählen zusammen, etwa die
 * verschiedenen Schreibweisen von Apple.
 */

export interface KontaktName {
  /** Teilzeichenkette des Kontakts, Groß- und Kleinschreibung egal */
  muster: string;
  name: string;
}

/** Verbreitete Anbieter, deren Rechnungsname nicht sagt, wofür man zahlt */
export const BEKANNTE_KONTAKTNAMEN: readonly KontaktName[] = [
  { muster: "Meta Platforms", name: "Facebook- und Instagram-Werbung" },
  { muster: "Facebook", name: "Facebook- und Instagram-Werbung" },
  { muster: "Google Ireland", name: "Google-Werbung" },
  { muster: "Google Commerce", name: "Google (Apps und Speicher)" },
  { muster: "google play", name: "Google (Apps und Speicher)" },
  { muster: "Apple", name: "Apple (Apps und iCloud)" },
  { muster: "Adobe", name: "Adobe (Photoshop und Co.)" },
  { muster: "Anthropic", name: "Claude (KI)" },
  { muster: "Openai", name: "ChatGPT (KI)" },
  { muster: "Midjourney", name: "Midjourney (KI-Bilder)" },
  { muster: "Openrouter", name: "OpenRouter (KI)" },
  { muster: "Haufe", name: "Lexware Office" },
  { muster: "Lexware", name: "Lexware Office" },
  { muster: "Shopify", name: "Shopify (Online-Shop)" },
  { muster: "Klaviyo", name: "Klaviyo (Newsletter)" },
  { muster: "Etsy", name: "Etsy-Gebühren" },
  { muster: "PayPal", name: "PayPal-Gebühren" },
  { muster: "SumUp", name: "Kartenzahlungen (SumUp)" },
  { muster: "DHL", name: "DHL (Pakete)" },
  { muster: "Deutsche Post", name: "Deutsche Post (Briefe)" },
  { muster: "Telekom", name: "Telekom" },
  { muster: "Vodafone", name: "Vodafone" },
  { muster: "Amazon", name: "Amazon" },
  { muster: "Airbnb", name: "Airbnb (Unterkunft)" },
  { muster: "Booking.com", name: "Booking.com (Unterkunft)" },
  { muster: "DB Vertrieb", name: "Deutsche Bahn" },
  { muster: "DB Fernverkehr", name: "Deutsche Bahn" },
  { muster: "Cloudflare", name: "Cloudflare (Website)" },
  { muster: "Sammellieferant", name: "Verschiedene Lieferanten" },
  { muster: "Sammelkunde", name: "Verschiedene Kunden" },
];

/** Rechtsformen und Zusätze am Ende eines Firmennamens */
const RECHTSFORM =
  /[\s,.-]+(gmbh\s*&(?:amp;)?\s*co\.?\s*kg|gmbh|mbh|ag|ug(\s*\(haftungsbeschränkt\))?|kg|ohg|gbr|e\.\s?k\.|ltd\.?|limited|inc\.?|llc|pbc|s\.?\s?a\.?\s?r\.?\s?l\.?|aps|s\.r\.o\.|b\.v\.|uc|international|ireland|deutschland|europe|distribution|services|opco)[\s,.-]*$/i;

function ohneRechtsform(kontakt: string): string {
  let name = kontakt.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 4; i++) {
    const kuerzer = name.replace(RECHTSFORM, "").trim();
    if (kuerzer === name || kuerzer.length < 3) break;
    name = kuerzer;
  }
  return name;
}

/** Name, unter dem ein Kontakt in der Auswertung steht */
export function klartextName(kontakt: string, eigene: readonly KontaktName[] = []): string {
  const klein = kontakt.toLowerCase();
  for (const liste of [eigene, BEKANNTE_KONTAKTNAMEN]) {
    const treffer = liste.find((n) => n.muster.trim() !== "" && klein.includes(n.muster.trim().toLowerCase()));
    if (treffer) return treffer.name;
  }
  return ohneRechtsform(kontakt) || "Ohne Namen";
}
