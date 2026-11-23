import { z } from "zod";
import { uuidParam } from "../../shared/http/schemas.js";

export const idParams = z.object({ id: uuidParam("ID da notificação") });

export const listQuery = z.object({
  cursor: z.uuid("Cursor inválido").optional().meta({
    description: "Valor de `nextCursor` da página anterior. Omita para começar pelas mais recentes.",
  }),
  limit: z.coerce.number().int().min(1).max(50).default(20).meta({ description: "Itens por página (1 a 50)." }),
});

const endpoint = z
  .url("Endpoint inválido")
  .max(1024)
  .refine((value) => value.startsWith("https://"), "O endpoint precisa usar https")
  .meta({ description: "`subscription.endpoint` devolvido pelo navegador em `pushManager.subscribe()`." });

export const subscriptionBody = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().min(1).max(255).meta({ description: "`subscription.toJSON().keys.p256dh`" }),
    auth: z.string().min(1).max(255).meta({ description: "`subscription.toJSON().keys.auth`" }),
  }),
});

export const endpointBody = z.object({ endpoint });

export const endpointQuery = z.object({ endpoint });
