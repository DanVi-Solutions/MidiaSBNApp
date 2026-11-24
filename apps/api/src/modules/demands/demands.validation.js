import { z } from "zod";
import { dateTime, uuidParam } from "../../shared/http/schemas.js";

const demandStatus = z.enum(["IN_PROGRESS", "COMPLETED"], "Use IN_PROGRESS ou COMPLETED").meta({
  description: "Situação da demanda: IN_PROGRESS (em progresso) ou COMPLETED (finalizada).",
});

const title = z
  .string()
  .trim()
  .min(2, "Título muito curto")
  .max(120, "Título muito longo")
  .meta({ description: "Título da demanda (2 a 120 caracteres).", example: "Editar vídeo de domingo" });

const description = z
  .string()
  .trim()
  .max(500, "Descrição muito longa")
  .meta({ description: "Detalhes opcionais sobre o que precisa ser feito." });

const dueAt = dateTime("Prazo opcional da demanda");

const assigneeIds = z
  .array(uuidParam("ID do responsável"))
  .max(50)
  .transform((ids) => [...new Set(ids)]);

export const idParams = z.object({
  id: uuidParam("ID da demanda"),
});

export const listQuery = z.object({
  departmentId: uuidParam("ID do ministério").optional(),
  status: demandStatus.optional(),
});

export const candidatesQuery = z.object({
  departmentId: uuidParam("ID do ministério"),
});

export const createBody = z.object({
  title,
  description: description.nullable().optional(),
  departmentId: uuidParam("ID do ministério"),
  assigneeIds: assigneeIds.optional(),
  dueAt: dueAt.nullable().optional(),
});

export const updateBody = z
  .object({
    title: title.optional(),
    description: description.nullable().optional(),
    assigneeIds: assigneeIds.optional(),
    status: demandStatus.optional(),
    dueAt: dueAt.nullable().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), "Informe ao menos um campo para atualizar");
