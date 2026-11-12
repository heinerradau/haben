import { z } from "zod";
import { cancellationInputSchema, documentPatchSchema as documentPatchInputSchema } from "../belege/index.ts";
import { requestSchemas } from "./schemas.ts";

/* Request-Schemas der schreibenden Beleg-Endpunkte für Werkzeuge mit eigenem Recht (belege:aendern, belege:buchen) */

/** Nur die genannten Felder eines noch nicht gebuchten Belegs ändern */
export const documentPatchSchema = documentPatchInputSchema.register(requestSchemas, { id: "DocumentPatch" });

/** Storno eines gebuchten Belegs; der Grund steht danach am Storno */
export const documentCancelSchema = cancellationInputSchema
  .extend({ reason: z.string().trim().min(1, "Bitte den Grund des Stornos angeben.").max(500).describe("Warum der Beleg storniert wird") })
  .strict()
  .register(requestSchemas, { id: "DocumentCancel" });
