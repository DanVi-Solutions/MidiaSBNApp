import { z } from "zod";
import { ROLE_LIST } from "../../shared/auth/roles.js";

const sessionCredential = z.object({
  id: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING", "RECOVERING"]),
  role: z.enum(ROLE_LIST),
});

export const session = z.object({
  accessToken: z.string().meta({
    description: "Envie no cabeçalho `Authorization: Bearer <accessToken>`. Vale 15 minutos.",
  }),
  refreshToken: z.string().meta({
    description: "Guarde com segurança. Serve para renovar a sessão (`POST /auth/refresh`). Vale 30 dias.",
  }),
  refreshTokenExpiresAt: z.iso.datetime(),
  credential: sessionCredential.meta({
    description: "Se `status` for PENDING ou RECOVERING, leve a pessoa para concluir o primeiro acesso ou a recuperação.",
  }),
});
