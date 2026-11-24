import { z } from "zod";

const cycle = z.object({
  year: z.number().int(),
  from: z.string().meta({ example: "2027-01-01" }),
  until: z.string().meta({ example: "2028-01-02" }),
});

export const window = z.object({
  cycleYear: z.number().int().meta({ description: "Ciclo anual em andamento." }),
  cycles: z.array(cycle).meta({ description: "Ciclos visíveis agora (o próximo aparece a partir de 17 de novembro)." }),
  lastEditableDay: z.string().meta({ description: "Último dia em que é possível marcar eventos.", example: "2028-01-02" }),
  nextReleaseOn: z.string().meta({ description: "Quando o próximo ciclo anual será liberado.", example: "2027-11-17" }),
  canEdit: z.boolean().meta({ description: "`true` se a pessoa pode criar, editar e cancelar eventos." }),
});

export const agendaEvent = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  date: z.string().meta({ example: "2026-12-12" }),
  times: z.array(z.string()).meta({ example: ["09:00", "19:00"] }),
  startsAt: z.iso.datetime().meta({ description: "Primeiro horário do evento." }),
  published: z.boolean().meta({ description: "`false` = rascunho, visível só para quem edita a agenda e sem escalas." }),
  createdBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  departments: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      scheduled: z.boolean().meta({ description: "`true` quando a escala deste ministério já foi criada." }),
    }),
  ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const agendaEventList = z.array(agendaEvent);

export const publicAgenda = z.object({
  cycleYear: z.number().int(),
  cycles: z.array(cycle),
  lastEditableDay: z.string(),
  events: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      description: z.string().nullable(),
      location: z.string().nullable(),
      startsAt: z.iso.datetime(),
      times: z.array(z.string()),
    }),
  ),
});
