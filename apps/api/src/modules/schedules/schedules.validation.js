import { z } from "zod";
import { dateTime, uuidParam } from "../../shared/http/schemas.js";

const name = z
  .string()
  .trim()
  .min(2, "Nome muito curto")
  .max(80, "Nome muito longo")
  .meta({ description: "Nome da escala.", example: "Culto de domingo" });

const description = z.string().trim().max(255, "Descrição muito longa").meta({ description: "Descrição livre." });

export const idParams = z.object({ id: uuidParam("ID da escala") });

export const assignmentParams = z.object({
  id: uuidParam("ID da escala"),
  credentialId: uuidParam("ID da credencial escalada"),
});

export const listQuery = z.object({
  departmentId: z.uuid("ID inválido").optional().meta({ description: "Filtra por um ministério (department)." }),
  from: dateTime("Início do intervalo. Padrão: agora.").optional(),
  to: dateTime("Fim do intervalo.").optional(),
});

export const mineQuery = z.object({
  from: dateTime("A partir de quando. Padrão: agora.").optional(),
});

export const createBody = z.object({
  departmentId: z.uuid("ID inválido").meta({ description: "Ministério (department) da escala." }),
  name,
  scheduleAt: dateTime("Data e hora de início da escala."),
  description: description.optional(),
});

export const updateBody = z
  .object({
    name: name.optional(),
    scheduleAt: dateTime("Data e hora de início da escala.").optional(),
    description: description.nullable().optional().meta({ description: "Envie `null` para apagar." }),
    published: z.boolean().optional().meta({
      description: "`true` publica a escala (os voluntários passam a vê-la); `false` volta para rascunho.",
    }),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), "Informe ao menos um campo");

export const assignBody = z.object({
  credentialId: z.uuid("ID inválido").meta({ description: "Pessoa a escalar." }),
});
