/*
 * Zugang für KI-Assistenten über MCP (#96): Endpunkt /api/mcp, API-Tokens, Protokoll der Werkzeugaufrufe und die
 * Werkzeuge selbst. Stufe 1: lesen, für lokale Clients mit API-Token; dazu Belege anlegen mit eigenem Recht, auch über
 * POST /api/v1/belege (#104).
 *
 * Öffentliche Schnittstelle des Moduls: Andere Module, Server Functions und Routen importieren nur von hier
 * (Lint-Regel haben/modulgrenzen, eslint/modulgrenzen.js).
 */
export { handleBelegeApiRequest } from "./api.ts";
export { handleMcpRequest } from "./server.ts";
export {
  createMcpToken,
  listMcpTokens,
  MCP_SCOPES,
  MCP_TOKEN_DAYS,
  mcpEnabled,
  McpError,
  mcpTokenInputSchema,
  recentMcpCalls,
  revokeMcpToken,
  setMcpEnabled,
} from "./tokens.ts";
export { MCP_TOOLS } from "./tools.ts";
