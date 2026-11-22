import { z } from "zod";
import { dateTime, uuidParam } from "../../shared/http/schemas.js";

const name = z
  .string()
  .trim()
  .min(2, "Nome muito curto")
  .max(80, "Nome muito longo")
  .meta({ description: "Nome da escala.", example: "Culto de domingo" });

const description = z.string().trim().max(255, "Descrição muito longa").meta({ description: "Descrição livre." });

const selfSignup = z.boolean().meta({
  description:
    "`true` = escala de **inscrição voluntária**: os próprios membros do ministério se inscrevem até completar " +
    "`volunteersNeeded`. `false` = as pessoas são definidas pelos gestores (manualmente ou pela distribuição automática).",
});

const volunteersNeeded = z
  .number()
  .int("Use um número inteiro")
  .min(1, "Mínimo de 1 pessoa")
  .max(100, "Máximo de 100 pessoas")
  .meta({ description: "Quantidade de pessoas que a escala precisa. Obrigatório quando `selfSignup` é `true`.", example: 4 });

const requireVolunteersWhenSelfSignup = (data) => !data.selfSignup || data.volunteersNeeded !== undefined;

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

export const createBody = z
  .object({
    departmentId: z.uuid("ID inválido").meta({ description: "Ministério (department) da escala." }),
    name,
    scheduleAt: dateTime("Data e hora de início da escala."),
    description: description.optional(),
    selfSignup: selfSignup.default(false),
    volunteersNeeded: volunteersNeeded.optional(),
  })
  .refine(requireVolunteersWhenSelfSignup, {
    message: "Informe volunteersNeeded para escalas de inscrição voluntária",
    path: ["volunteersNeeded"],
  });

export const updateBody = z
  .object({
    name: name.optional(),
    scheduleAt: dateTime("Data e hora de início da escala.").optional(),
    description: description.nullable().optional().meta({ description: "Envie `null` para apagar." }),
    published: z.boolean().optional().meta({
      description: "`true` publica a escala (os voluntários passam a vê-la); `false` volta para rascunho.",
    }),
    selfSignup: selfSignup.optional(),
    volunteersNeeded: volunteersNeeded.nullable().optional().meta({
      description: "Envie `null` para remover (não permitido enquanto `selfSignup` for `true`).",
    }),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), "Informe ao menos um campo");

export const assignBody = z.object({
  credentialId: z.uuid("ID inválido").meta({ description: "Pessoa a escalar." }),
});

export const autoAssignBody = z.object({
  schedules: z
    .array(
      z.object({
        scheduleId: z.uuid("ID inválido").meta({ description: "Escala selecionada para a distribuição." }),
        volunteers: z
          .number()
          .int("Use um número inteiro")
          .min(1, "Mínimo de 1 pessoa")
          .max(100, "Máximo de 100 pessoas")
          .meta({
            description: "Quantidade total de pessoas desejada na escala (quem já está escalado conta).",
            example: 3,
          }),
      }),
    )
    .min(1, "Selecione ao menos uma escala")
    .max(200)
    .refine((items) => new Set(items.map((item) => item.scheduleId)).size === items.length, "Escala repetida"),
  dryRun: z.boolean().default(false).meta({
    description: "`true` só calcula e devolve a proposta, sem salvar. Use para mostrar uma prévia ao usuário.",
  }),
});
