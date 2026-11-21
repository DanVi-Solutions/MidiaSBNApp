import { z } from "zod";
import { username } from "../credentials/credentials.validation.js";

export const credentialIdParams = z.object({ credentialId: z.uuid("ID inválido") });

export const recoverBody = z.object({
  username,
  recoveryCode: z
    .string()
    .trim()
    .min(1, "Informe o código de recuperação")
    .max(30)
    .meta({ example: "ABCDE-23456" }),
});
