import { z } from "zod";

export const sessionIdParams = z.object({
  sessionId: z.uuid("ID inválido").meta({ description: "ID da sessão (veja `GET /sessions`)" }),
});

export const credentialIdParams = z.object({
  credentialId: z.uuid("ID inválido").meta({ description: "ID da credencial" }),
});
