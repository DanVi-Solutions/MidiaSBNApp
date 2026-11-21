import { z } from "zod";
import { ROLE_LIST } from "../../shared/auth/roles.js";

const id = z.uuid();
const role = z.enum(ROLE_LIST);
const credentialNumber = z.string().meta({ example: "SBN-7KQ4M2XPRA" });

const department = z.object({ id, name: z.string() });
const person = z.object({ id, name: z.string() });

export const credential = z.object({
  id,
  name: z.string(),
  username: z.string().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING"]),
  role,
  departments: z.array(department),
  pendingTransfer: z
    .object({ id, from: department.nullable(), to: department, requestedBy: person.nullable() })
    .nullable(),
});

export const credentialList = z.array(credential);

export const credentialWithNumber = credential.extend({ credentialNumber });

export const usernameAvailability = z.object({ username: z.string(), available: z.boolean() });

export const regeneratedNumber = z.object({
  credentialNumber,
  accessToken: z.string().optional().meta({ description: "Apenas quando o próprio usuário troca o código" }),
  refreshToken: z.string().optional().meta({ description: "Apenas quando o próprio usuário troca o código" }),
  refreshTokenExpiresAt: z.iso.datetime().optional(),
});

export const transfer = z.object({
  id,
  credential: z.object({ id, name: z.string(), username: z.string().nullable(), role }),
  from: department.nullable(),
  to: department,
  requestedBy: person.nullable(),
});

export const transferList = z.array(transfer);

export const transferCompleted = z.object({ status: z.literal("COMPLETED"), credential });

export const transferPending = z.object({ status: z.literal("PENDING"), transfer });

export const transferReviewed = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  credential: credential.optional(),
});
