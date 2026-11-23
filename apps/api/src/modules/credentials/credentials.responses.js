import { z } from "zod";
import { ROLE_LIST } from "../../shared/auth/roles.js";

const id = z.uuid();
const role = z.enum(ROLE_LIST);
const credentialNumber = z.string().meta({ example: "SBN-7KQ4M2XPRA" });

const department = z
  .object({ id, name: z.string().meta({ example: "Mídia" }) })
  .meta({ description: "Ministério" });
const person = z.object({ id, name: z.string() });

export const credential = z.object({
  id,
  name: z.string().meta({ example: "Maria" }),
  username: z.string().nullable().meta({ description: "Nulo até a pessoa fazer o primeiro acesso.", example: "maria" }),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING", "RECOVERING"]).meta({
    description: "Situação da conta. Veja a introdução da documentação.",
  }),
  role,
  departments: z.array(department).meta({ description: "Ministérios dos quais a pessoa participa." }),
  pendingTransfer: z
    .object({
      id: id.meta({ description: "Use em `/credentials/transfers/{transferId}/approve` ou `/reject`." }),
      from: department.nullable(),
      to: department,
      requestedBy: person.nullable().meta({ description: "Quem pediu a transferência." }),
    })
    .nullable()
    .meta({ description: "Pedido de troca de ministério aguardando aprovação, se houver." }),
});

export const credentialList = z.array(credential);

export const credentialWithNumber = credential.extend({
  credentialNumber: credentialNumber.meta({
    description: "Código de acesso. Copie e guarde: dependendo da rota, ele não é exibido novamente.",
  }),
});

export const preparedCode = z.object({
  credentialNumber: credentialNumber.meta({
    description: "Novo código definitivo sugerido para o usuário copiar antes de concluir a ativação.",
  }),
  activationToken: z.string().meta({
    description: "Token assinado para confirmar este código em `first-access` ou `complete-recovery`.",
  }),
});

export const credentialWithOptionalNumber = credential.extend({
  credentialNumber: credentialNumber.nullable().meta({
    description: "Preenchido apenas enquanto o código ainda não foi criptografado (PENDING ou RECOVERING).",
  }),
});

export const usernameAvailability = z.object({ username: z.string(), available: z.boolean() });

export const regeneratedNumber = credentialWithNumber.extend({
  accessToken: z.string().optional().meta({ description: "Apenas quando a própria pessoa troca o código." }),
  refreshToken: z.string().optional().meta({ description: "Apenas quando a própria pessoa troca o código." }),
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
  credential: credential.optional().meta({ description: "Presente quando aprovada: a pessoa já no ministério novo." }),
});
