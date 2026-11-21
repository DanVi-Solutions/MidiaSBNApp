import { z } from "zod";
import { ROLE_LIST } from "../../shared/auth/roles.js";

const name = z.string().trim().min(2, "Nome muito curto").max(80, "Nome muito longo");

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
    description: "3 a 15 caracteres: letras, números, _ ou . — o @ inicial é opcional e salvo sem ele, em minúsculas",
    example: "@fulano",
  });

const uuid = z.uuid("ID inválido");

const departmentIds = z
  .array(uuid)
  .max(50)
  .transform((ids) => [...new Set(ids)]);

const role = z.enum(ROLE_LIST, "Papel inválido");

export const idParams = z.object({ id: uuid });

export const departmentIdParams = z.object({ departmentId: uuid });

export const transferIdParams = z.object({ transferId: uuid });

export const createBody = z.object({
  name,
  role,
  departmentIds: departmentIds.default([]),
});

export const firstAccessBody = z.object({
  name: name.optional(),
  username,
});

export const updateMeBody = z
  .object({ name: name.optional(), username: username.optional() })
  .refine((data) => data.name || data.username, "Informe name e/ou username");

export const usernameQuery = z.object({ username });

export const changeRoleBody = z.object({
  role,
  departmentIds: departmentIds.optional(),
});

export const setDepartmentsBody = z.object({ departmentIds });

export const changeStatusBody = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"], "Use ACTIVE ou INACTIVE"),
});

export const transferBody = z.object({
  fromDepartmentId: uuid,
  toDepartmentId: uuid,
});
