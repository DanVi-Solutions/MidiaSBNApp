import { z } from "zod";

const session = z.object({
  id: z.uuid().meta({ description: "ID da sessão. Use em `DELETE /sessions/{sessionId}`." }),
  userAgent: z.string().nullable().meta({
    description: "Navegador ou app que abriu a sessão. Útil para a pessoa reconhecer o dispositivo.",
    example: "Mozilla/5.0 (Linux; Android 14) Chrome/130.0",
  }),
  startedAt: z.iso.datetime().meta({ description: "Quando a pessoa entrou neste dispositivo." }),
  expiresAt: z.iso.datetime().meta({ description: "Quando a sessão expira se não for renovada." }),
});

export const mySessions = z.array(
  session.extend({
    current: z.boolean().meta({ description: "`true` para a sessão que fez esta requisição (este dispositivo)." }),
  }),
);

export const sessions = z.array(session);

export const endedSessions = z.object({
  ended: z.number().int().meta({ description: "Quantidade de sessões encerradas." }),
});
