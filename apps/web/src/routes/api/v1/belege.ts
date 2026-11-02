import { createFileRoute } from "@tanstack/react-router";
import { handleBelegeApiRequest } from "../../../server/modules/mcp/index.ts";

/**
 * Belege von außen anlegen (#104): API-Token mit dem Recht „belege:anlegen“ als Bearer-Header, Multipart mit „datei“.
 * Der Beleg landet als „Zu prüfen“; gebucht wird in der Oberfläche.
 */
export const Route = createFileRoute("/api/v1/belege")({
  server: {
    handlers: {
      POST: ({ request }) => handleBelegeApiRequest(request),
    },
  },
});
