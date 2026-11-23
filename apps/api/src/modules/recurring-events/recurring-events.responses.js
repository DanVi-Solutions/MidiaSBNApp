import { z } from "zod";
import { WEEKDAYS } from "../../shared/time/zonedTime.js";

const department = z.object({ id: z.uuid(), name: z.string() });

export const recurringEvent = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  weekday: z.enum(WEEKDAYS),
  times: z.array(z.string()).meta({ example: ["08:00", "10:00", "18:00"] }),
  isGlobal: z.boolean().meta({ description: "`true` = evento geral disponível para todos os ministérios." }),
  createdById: z.uuid().nullable(),
  departments: z.array(department),
  departmentId: z.uuid().nullable().meta({ description: "Compatibilidade para eventos vinculados a um único ministério." }),
  department: department.nullable(),
});

export const recurringEventList = z.array(recurringEvent);

export const applied = z.object({
  months: z.array(z.string()).meta({ description: "Meses considerados.", example: ["2026-11", "2026-12"] }),
  departments: z.array(department).meta({ description: "Ministérios que receberam as escalas." }),
  created: z.number().int().meta({ description: "Escalas criadas agora." }),
  skipped: z.number().int().meta({
    description: "Escalas que já existiam no mesmo ministério e horário (ex.: evento aplicado duas vezes).",
  }),
  outsideWindow: z.number().int().meta({
    description: "Ocorrências ignoradas por estarem fora do período liberado (no passado ou depois do limite).",
  }),
  lastEditableDay: z.string().meta({ description: "Último dia liberado para escalas.", example: "2027-01-03" }),
});
