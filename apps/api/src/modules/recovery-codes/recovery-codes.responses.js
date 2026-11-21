import { z } from "zod";
import { session } from "../auth/auth.responses.js";

export const recoveryCodes = z.object({
  recoveryCodes: z.array(z.string().meta({ example: "ABCDE-23456" })),
});

export const remaining = z.object({ remaining: z.number().int() });

export const recoveredSession = session.extend({
  credentialNumber: z.string().meta({ example: "SBN-7KQ4M2XPRA" }),
});
