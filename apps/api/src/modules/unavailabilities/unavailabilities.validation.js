import { z } from "zod";
import { dateTime, uuidParam } from "../../shared/http/schemas.js";

const reason = z
  .string()
  .trim()
  .max(255, "Motivo muito longo")
  .meta({ description: "Motivo da ausência. Visível apenas para a própria pessoa.", example: "Viagem" });

export const idParams = z.object({ id: uuidParam("ID da indisponibilidade") });

export const credentialIdParams = z.object({ credentialId: uuidParam("ID da credencial") });

export const departmentIdParams = z.object({ departmentId: uuidParam("ID do ministério (department)") });

export const rangeQuery = z.object({
  from: dateTime("Início do intervalo. Padrão: agora.").optional(),
  to: dateTime("Fim do intervalo.").optional(),
});

export const createBody = z.object({
  startAt: dateTime("Início da ausência"),
  endAt: dateTime("Fim da ausência (precisa ser depois do início)"),
  reason: reason.optional(),
});

export const updateBody = z
  .object({
    startAt: dateTime("Início da ausência").optional(),
    endAt: dateTime("Fim da ausência").optional(),
    reason: reason.nullable().optional().meta({ description: "Envie `null` para apagar o motivo." }),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), "Informe ao menos um campo");
