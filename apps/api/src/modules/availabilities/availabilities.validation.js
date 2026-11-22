import { z } from "zod";
import { uuidParam } from "../../shared/http/schemas.js";
import { WEEKDAYS } from "../../shared/time/zonedTime.js";

const period = (description) => z.boolean().default(false).meta({ description });

const day = z.object({
  weekday: z.enum(WEEKDAYS, "Dia da semana inválido").meta({ description: "Dia da semana" }),
  morning: period("Disponível de manhã (00:00 às 11:59)"),
  afternoon: period("Disponível à tarde (12:00 às 17:59)"),
  night: period("Disponível à noite (18:00 às 23:59)"),
});

export const replaceWeekBody = z.object({
  days: z
    .array(day)
    .max(7)
    .refine((days) => new Set(days.map((d) => d.weekday)).size === days.length, "Dia da semana repetido")
    .meta({ description: "Dias em que a pessoa está disponível. Dias omitidos ficam como indisponíveis." }),
});

export const credentialIdParams = z.object({ credentialId: uuidParam("ID da credencial") });

export const departmentIdParams = z.object({ departmentId: uuidParam("ID do ministério (department)") });
