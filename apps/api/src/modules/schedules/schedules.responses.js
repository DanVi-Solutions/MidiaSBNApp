import { z } from "zod";

const department = z.object({ id: z.uuid(), name: z.string() });
const person = z.object({ id: z.uuid(), name: z.string(), username: z.string().nullable() });
const changeStatus = z.enum(["NONE", "REQUESTED", "REJECTED"]).meta({
  description: "Pedido de troca: NONE (nenhum), REQUESTED (aguardando o substituto), REJECTED (substituto recusou).",
});

const scheduleBase = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  scheduleAt: z.iso.datetime(),
  published: z.boolean().meta({ description: "`false` = rascunho, visível só para quem gerencia as escalas." }),
  selfSignup: z.boolean().meta({ description: "`true` = os próprios membros do ministério se inscrevem." }),
  volunteersNeeded: z.number().int().nullable().meta({ description: "Quantidade de pessoas que a escala precisa." }),
  recurringEventId: z.uuid().nullable().meta({ description: "Evento recorrente que gerou a escala, se houver." }),
  department,
  assignedCount: z.number().int().meta({ description: "Quantidade de pessoas escaladas." }),
});

export const scheduleList = z.array(scheduleBase);

export const window = z.object({
  cycleMonth: z.string().meta({ description: "Mês em que o ciclo atual começou.", example: "2026-11" }),
  editableFrom: z.iso.datetime().meta({ description: "Agora: escalas anteriores não podem ser alteradas." }),
  editableUntil: z.iso.datetime().meta({
    description: "Limite exclusivo: escalas a partir deste instante ainda estão travadas.",
  }),
  lastEditableDay: z.string().meta({
    description: "Último dia liberado (o 1º domingo do mês +2 do ciclo).",
    example: "2027-01-03",
  }),
  nextReleaseOn: z.string().meta({
    description: "Dia em que o próximo ciclo começa e mais um mês é liberado.",
    example: "2026-12-18",
  }),
  purgeBefore: z.iso.datetime().meta({
    description: "Escalas anteriores a este instante (meses antes do ciclo atual) são apagadas automaticamente.",
  }),
});

export const schedule = scheduleBase.extend({
  assignments: z.array(
    z.object({
      id: z.uuid().meta({ description: "ID da participação (usado nos pedidos de troca)." }),
      changeStatus,
      credential: person,
      credentialChange: z.object({ id: z.uuid(), name: z.string() }).nullable().meta({
        description: "Substituto indicado no pedido de troca, se houver.",
      }),
    }),
  ),
});

export const assigned = z.object({
  schedule,
  warnings: z.array(z.enum(["NO_WEEKLY_AVAILABILITY", "UNAVAILABLE", "OVER_CAPACITY"])).meta({
    description:
      "Avisos sobre a pessoa escalada: NO_WEEKLY_AVAILABILITY (não marcou disponibilidade neste dia e período), " +
      "UNAVAILABLE (registrou uma ausência neste horário), OVER_CAPACITY (a escala passou de `volunteersNeeded`). " +
      "A escalação é feita mesmo assim.",
  }),
});

export const myAssignments = z.array(
  z.object({
    id: z.uuid().meta({ description: "ID da participação. Use em `POST /change-requests` para pedir troca." }),
    changeStatus,
    credentialChange: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    schedule: z.object({
      id: z.uuid(),
      name: z.string(),
      description: z.string().nullable(),
      scheduleAt: z.iso.datetime(),
      department,
    }),
  }),
);

export const candidates = z.array(
  z.object({
    credential: person,
    hasWeeklyAvailability: z.boolean().meta({ description: "Marcou disponibilidade neste dia da semana e período." }),
    isUnavailable: z.boolean().meta({ description: "Registrou uma ausência que cobre o horário da escala." }),
    available: z.boolean().meta({ description: "Resumo: disponível e sem ausência registrada." }),
  }),
);

export const openSchedules = z.array(
  scheduleBase.extend({
    freeSlots: z.number().int().meta({ description: "Vagas restantes." }),
    signedUp: z.boolean().meta({ description: "`true` se a pessoa logada já está inscrita." }),
  }),
);

export const distribution = z.object({
  dryRun: z.boolean(),
  assignedTotal: z.number().int().meta({ description: "Total de pessoas escaladas (ou que seriam, em `dryRun`)." }),
  missingTotal: z.number().int().meta({ description: "Total de vagas que não puderam ser preenchidas." }),
  schedules: z.array(
    z.object({
      schedule: z.object({
        id: z.uuid(),
        name: z.string(),
        scheduleAt: z.iso.datetime(),
        day: z.string().meta({ description: "Data local da escala.", example: "2026-12-06" }),
        department,
      }),
      requested: z.number().int().meta({ description: "Quantidade total desejada." }),
      alreadyAssigned: z.number().int().meta({ description: "Pessoas que já estavam na escala antes da distribuição." }),
      assigned: z.array(
        z.object({
          credential: person,
          sameDayConflict: z.boolean().meta({
            description: "`true` se a pessoa ficou com mais de uma escala no mesmo dia (evitado ao máximo).",
          }),
        }),
      ),
      missing: z.number().int().meta({
        description: "Vagas não preenchidas por falta de pessoas disponíveis no ministério.",
      }),
    }),
  ),
});
