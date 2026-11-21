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
