import { env } from "../../env.ts";
import { DocumentError, MAX_DOCUMENT_SIZE, uploadDocument } from "../belege/index.ts";
import { McpError, type McpAccess } from "./tokens.ts";

/*
 * Belege anlegen über einen API-Zugang (#104, Schritt 1): als MCP-Werkzeug „beleg_anlegen“ und als POST /api/v1/belege.
 * Beides landet wie ein Upload in der Oberfläche als „Zu prüfen“ (E-Rechnungen gelesen, sonst KI-Auslesung, falls
 * eingerichtet). Gebucht wird nichts; das macht der Nutzer in Haben.
 */

/** Akteur im Audit-Log, getrennt nach Weg; der Name des Zugangs steht in der Notiz am Beleg */
export const AGENT_ACTORS = { mcp: "agent:mcp", api: "agent:api" } as const;

/** Base64 eines Belegs bis MAX_DOCUMENT_SIZE (4 Zeichen je 3 Bytes, aufgerundet) */
export const MAX_BASE64_LENGTH = Math.ceil(MAX_DOCUMENT_SIZE / 3) * 4;

export interface AgentDocumentResult {
  id: string;
  /** Dieselbe Datei gab es schon; geliefert wird der vorhandene Beleg */
  doppelt: boolean;
  link: string;
}

/** Notiz am Beleg: woher er kam, dazu der Hinweis des Aufrufers */
function originNote(access: McpAccess, via: keyof typeof AGENT_ACTORS, hint?: string): string {
  const origin = via === "mcp" ? `Über KI-Assistent „${access.clientName}“` : `Über API-Zugang „${access.clientName}“`;
  const text = hint?.trim();
  return text ? `${origin}: ${text}` : origin;
}

/** Legt einen Beleg aus einer Datei an; Fehler, die der Aufrufer beheben kann, kommen als McpError */
export async function createAgentDocument(
  access: McpAccess,
  via: keyof typeof AGENT_ACTORS,
  file: { bytes: Uint8Array; filename: string },
  hint?: string,
): Promise<AgentDocumentResult> {
  if (!access.scopes.includes("belege:anlegen")) throw new McpError("Dieser Zugang darf keine Belege anlegen.");
  try {
    const result = await uploadDocument(AGENT_ACTORS[via], file, {
      note: originNote(access, via, hint),
      background: (work) => void work.catch((error: unknown) => console.error("Belegauslesung", error)),
    });
    return { id: result.id, doppelt: result.duplicate, link: `${env().BETTER_AUTH_URL.replace(/\/$/, "")}/belege/${result.id}` };
  } catch (error) {
    if (error instanceof DocumentError) throw new McpError(error.message);
    throw error;
  }
}

/** Liest Base64 streng: nur das Alphabet (auch URL-sicher), Auffüllung höchstens am Ende */
export function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/\s+/g, "");
  if (clean.length === 0 || clean.length > MAX_BASE64_LENGTH) throw new McpError("Die Datei fehlt oder ist größer als 20 MB.");
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(clean)) throw new McpError("Der Inhalt ist kein gültiges Base64.");
  return new Uint8Array(Buffer.from(clean, "base64"));
}
