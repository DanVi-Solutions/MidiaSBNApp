import { z } from "zod";

const uuid = z.uuid("ID inválido");

const name = z
  .string()
  .trim()
  .min(2, "Nome muito curto")
  .max(80, "Nome muito longo")
  .meta({ description: "Nome do ministério. Único no sistema.", example: "Mídia" });

const description = z
  .string()
  .trim()
  .max(255, "Descrição muito longa")
  .meta({ description: "Descrição livre do ministério.", example: "Transmissão e projeção dos cultos" });

export const idParams = z.object({ id: uuid.meta({ description: "ID do ministério (department)" }) });

export const credentialIdParams = z.object({
  credentialId: uuid.meta({ description: "ID da credencial" }),
});

const hasDemands = z.boolean().meta({
  description: "Indica se o ministério utiliza a página de demandas.",
});

export const createBody = z.object({
  name,
  description: description.optional(),
  hasDemands: hasDemands.optional(),
});

export const updateBody = z
  .object({
    name: name.optional(),
    description: description.nullable().optional().meta({
      description: "Descrição livre do ministério. Envie `null` para apagar.",
    }),
    hasDemands: hasDemands.optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.description !== undefined || data.hasDemands !== undefined,
    "Informe name, description e/ou hasDemands",
  );
