import { z } from "zod";
import { ASSIGNABLE_ROLE_LIST } from "../../shared/auth/roles.js";

const name = z
  .string()
  .trim()
  .min(2, "Nome muito curto")
  .max(80, "Nome muito longo")
  .meta({ description: "Nome de exibição da pessoa (2 a 80 caracteres).", example: "Maria" });

export const username = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^@/, ""))
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9_.]{3,15}$/, "Use de 3 a 15 caracteres: letras, números, _ ou ."),
  )
  .meta({
    description:
      "Apelido único (3 a 15 caracteres: letras, números, `_` ou `.`). O `@` inicial é opcional; " +
      "é salvo sem ele e em minúsculas.",
    example: "@maria",
  });

const uuid = z.uuid("ID inválido");

const departmentIds = z
  .array(uuid)
  .max(50)
  .transform((ids) => [...new Set(ids)])
  .meta({
    description:
      "IDs dos ministérios (`department`). ADMINISTRATOR: nenhum. GENERAL_MANAGER: um ou mais. Demais papéis: " +
      "exatamente um.",
  });

const role = z.enum(ASSIGNABLE_ROLE_LIST, "Papel inválido").meta({
  description:
    "Papel da pessoa, do maior para o menor: ADMINISTRATOR, GENERAL_MANAGER, DEPARTMENT_MANAGER, " +
    "SCHEDULER_MANAGER, VOLUNTEER.",
});

export const idParams = z.object({ id: uuid.meta({ description: "ID da credencial" }) });

export const transferIdParams = z.object({
  transferId: uuid.meta({ description: "ID do pedido de transferência (veja `GET /credentials/transfers`)" }),
});

export const createBody = z.object({
  name,
  role,
  departmentIds: departmentIds.default([]),
});

const activationToken = z
  .string()
  .min(1)
  .meta({ description: "Token assinado retornado por `POST /credentials/me/prepare-code`." });

export const firstAccessBody = z.object({
  name: name.optional().meta({ description: "Opcional: corrige o nome cadastrado pelo gestor." }),
  username,
  activationToken: activationToken.optional(),
});

export const completeRecoveryBody = z.object({
  activationToken: activationToken.optional(),
});

export const updateMeBody = z
  .object({ name: name.optional(), username: username.optional() })
  .refine((data) => data.name || data.username, "Informe name e/ou username");

export const usernameQuery = z.object({ username });

export const changeRoleBody = z.object({
  role,
  departmentIds: departmentIds.optional().meta({
    description:
      "Opcional. Novos ministérios da pessoa. Se omitido, mantém os atuais — o que só funciona se a quantidade " +
      "continuar válida para o novo papel.",
  }),
});

export const setDepartmentsBody = z.object({ departmentIds });

export const changeStatusBody = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"], "Use ACTIVE ou INACTIVE").meta({
    description: "`INACTIVE` desativa a conta. `ACTIVE` reativa uma conta inativa.",
  }),
});

export const transferBody = z.object({
  fromDepartmentId: uuid.meta({ description: "Ministério de onde a pessoa sai" }),
  toDepartmentId: uuid.meta({ description: "Ministério para onde a pessoa vai" }),
});
