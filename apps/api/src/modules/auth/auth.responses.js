import { z } from "zod";
import { ROLE_LIST } from "../../shared/auth/roles.js";

const sessionCredential = z.object({
  id: z.uuid(),
  name: z.string(),
  username: z.string().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING"]),
  role: z.enum(ROLE_LIST),
});

export const session = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.iso.datetime(),
  credential: sessionCredential,
});

export const recoveredSession = session.extend({
  credentialNumber: z.string().meta({ example: "SBN-7KQ4M2XPRA" }),
});

export const recoveryCodes = z.object({
  recoveryCodes: z.array(z.string().meta({ example: "ABCDE-23456" })),
});

export const recoveryCodesStatus = z.object({ remaining: z.number().int() });
