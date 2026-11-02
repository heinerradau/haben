import { MAX_DOCUMENT_SIZE } from "../belege/index.ts";
import { userMessage, INTERNAL_ERROR } from "../../errors.ts";
import { createAgentDocument } from "./belege.ts";
import { rateLimited } from "./server.ts";
import { authenticateMcp, McpError, recordMcpCall } from "./tokens.ts";

/*
 * POST /api/v1/belege (#104, Schritt 1): Belege aus anderen Systemen (Dokumentenarchiv, Postfach, Agenten) als
 * „Zu prüfen“ anlegen. Anmeldung, Rechte, Rate-Limit und Protokoll wie beim MCP-Zugang; nötig ist das Recht
 * „belege:anlegen“. Multipart mit dem Feld „datei“, optional „notiz“.
 */

/** Name im Protokoll der Aufrufe */
export const API_BELEGE_CALL = "api:belege";

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

const fehler = (status: number, message: string, headers: Record<string, string> = {}) => json(status, { fehler: message }, headers);

export async function handleBelegeApiRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") return fehler(405, "Nur POST.", { Allow: "POST" });
  const access = await authenticateMcp(request);
  if (!access) return fehler(401, "Kein gültiges API-Token. In Haben unter Einstellungen → KI-Assistenten anlegen.", { "WWW-Authenticate": 'Bearer realm="haben"' });
  if (!access.scopes.includes("belege:anlegen")) return fehler(403, "Dieser Zugang darf keine Belege anlegen.");
  if (rateLimited(access.tokenId)) return fehler(429, "Zu viele Anfragen, bitte kurz warten.", { "Retry-After": "60" });

  const started = performance.now();
  let ok = false;
  try {
    // Zu große Anfragen gar nicht erst einlesen; etwas Platz für die Felder des Formulars
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_DOCUMENT_SIZE + 64 * 1024) return fehler(413, "Die Datei ist größer als 20 MB.");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fehler(400, "Erwartet wird multipart/form-data mit dem Feld „datei“.");
    }
    const file = form.get("datei");
    if (!(file instanceof File)) return fehler(400, "Das Feld „datei“ fehlt.");
    if (file.size > MAX_DOCUMENT_SIZE) return fehler(413, "Die Datei ist größer als 20 MB.");
    const notiz = form.get("notiz");
    const result = await createAgentDocument(
      access,
      "api",
      { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name || "beleg" },
      typeof notiz === "string" ? notiz.slice(0, 500) : undefined,
    );
    ok = true;
    return json(result.doppelt ? 200 : 201, result);
  } catch (error) {
    if (error instanceof McpError) return fehler(422, error.message);
    const message = userMessage(error);
    if (message === undefined) console.error(error);
    return fehler(500, message ?? INTERNAL_ERROR);
  } finally {
    await recordMcpCall(access, API_BELEGE_CALL, ok, performance.now() - started).catch((error: unknown) => console.error(error));
  }
}
