import { z } from "zod";
import { uuidParam } from "../../shared/http/schemas.js";
import { WEEKDAYS } from "../../shared/time/zonedTime.js";

const name = z
  .string()
  .trim()
  .min(2, "Nome muito curto")
  .max(80, "Nome muito longo")
  .meta({
    description: "Nome do evento. Vira o nome das escalas geradas.",
    example: "Culto de domingo",
  });

const description = z
  .string()
  .trim()
  .max(255, "Descrição muito longa")
  .meta({
    description: "Descrição. Também é copiada para as escalas geradas.",
  });

const weekday = z
  .enum(WEEKDAYS, "Dia da semana inválido")
  .meta({ description: "Dia da semana em que o evento acontece" });

const times = z
  .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:mm"))
  .min(1, "Informe ao menos um horário")
  .max(10)
  .transform((values) => [...new Set(values)].sort())
  .meta({
    description:
      "Horários de início, no formato HH:mm e no fuso do sistema. Repetidos são ignorados.",
    example: ["08:00", "10:00", "18:00"],
  });

const departmentIds = z
  .array(z.uuid("ID inválido"))
  .min(1)
  .max(50)
  .transform((ids) => [...new Set(ids)]);

export const idParams = z.object({ id: uuidParam("ID do evento recorrente") });

export const createBody = z.object({
  name,
  description: description.optional(),
  weekday,
  times,
  departmentId: z.uuid("ID inválido").nullable().optional().meta({
    description:
      "Ministério do evento. Omitido ou `null` = evento **geral**, para todos os ministérios.",
  }),
});

export const updateBody = z
  .object({
    name: name.optional(),
    description: description
      .nullable()
      .optional()
      .meta({ description: "Envie `null` para apagar." }),
    weekday: weekday.optional(),
    times: times.optional(),
  })
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe ao menos um campo",
  );

export const applyBody = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM")
      .optional()
      .meta({
        description:
          "Gera apenas este mês. Padrão: todos os meses do período liberado.",
        example: "2026-12",
      }),
    departmentIds: departmentIds.optional().meta({
      description:
        "Apenas para eventos gerais: ministérios que receberão as escalas. Padrão: todos os que você gerencia " +
        "(administrador: todos os ministérios). Ignorado em eventos de um ministério.",
    }),
    selfSignup: z
      .boolean()
      .default(false)
      .meta({
        description:
          "`true` gera escalas de **inscrição voluntária** (os próprios membros se inscrevem). `false` gera escalas " +
          "comuns, preenchidas pelos gestores.",
      }),
    volunteersNeeded: z
      .number()
      .int("Use um número inteiro")
      .min(1, "Mínimo de 1 pessoa")
      .max(100, "Máximo de 100 pessoas")
      .optional()
      .meta({
        description:
          "Quantidade de pessoas de cada escala gerada. Obrigatório quando `selfSignup` é `true`.",
        example: 4,
      }),
  })
  .refine((data) => !data.selfSignup || data.volunteersNeeded !== undefined, {
    message:
      "Informe volunteersNeeded para gerar escalas de inscrição voluntária",
    path: ["volunteersNeeded"],
  });
