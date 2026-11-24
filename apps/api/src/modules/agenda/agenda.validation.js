import { z } from "zod";
import { dateTime, uuidParam } from "../../shared/http/schemas.js";

const name = z
  .string()
  .trim()
  .min(2, "Nome muito curto")
  .max(80, "Nome muito longo")
  .meta({ description: "Nome do evento na agenda. As escalas geradas começam com este nome.", example: "Profetizando" });

const description = z.string().trim().max(255, "Descrição muito longa").meta({ description: "Descrição livre." });

const location = z
  .string()
  .trim()
  .max(120, "Local muito longo")
  .meta({ description: "Onde o evento acontece.", example: "Templo principal" });

const startsAt = dateTime("Data e hora de início. Não pode estar no passado nem depois do limite da agenda.");

const departmentIds = z
  .array(z.uuid("ID inválido"))
  .max(50)
  .transform((ids) => [...new Set(ids)])
  .meta({ description: "Ministérios que vão servir no evento. Cada um recebe uma escala quando a data entra no período das escalas." });

export const idParams = z.object({ id: uuidParam("ID do evento da agenda") });

export const listQuery = z.object({
  year: z.coerce
    .number()
    .int()
    .min(2000)
    .max(2100)
    .optional()
    .meta({ description: "Ciclo anual: de 1º de janeiro até o primeiro domingo de janeiro do ano seguinte." }),
});

export const createBody = z.object({
  name,
  description: description.optional(),
  location: location.optional(),
  startsAt,
  departmentIds: departmentIds.default([]),
});

export const updateBody = z
  .object({
    name: name.optional(),
    description: description.nullable().optional().meta({ description: "Envie `null` para apagar." }),
    location: location.nullable().optional().meta({ description: "Envie `null` para apagar." }),
    startsAt: startsAt.optional(),
    published: z.boolean().optional().meta({
      description:
        "`true` publica o evento: ele aparece para todos e os ministérios passam a receber as escalas. Um evento publicado não volta para rascunho.",
    }),
    departmentIds: departmentIds.optional().meta({
      description:
        "Lista completa dos ministérios do evento. Quem não é administrador só pode incluir ou retirar os ministérios que gerencia.",
    }),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), "Informe ao menos um campo");
