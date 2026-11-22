import { z } from "zod";

export const loginBody = z.object({
  credentialNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Informe o código da credencial")
    .max(30)
    .meta({
      description: "Código da credencial. Maiúsculas e minúsculas são aceitas.",
      example: "SBN-7KQ4M2XPRA",
    }),
});

export const refreshTokenBody = z.object({
  refreshToken: z
    .string()
    .min(1, "Informe o refresh token")
    .max(200)
    .meta({ description: "O `refreshToken` recebido no login ou na última renovação." }),
});
