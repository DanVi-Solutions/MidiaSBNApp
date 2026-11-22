import { z } from "zod";

const unavailability = z.object({
  id: z.uuid(),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
});

const withReason = unavailability.extend({ reason: z.string().nullable() });

export const myUnavailabilities = z.array(withReason);

export const unavailabilitiesOf = z.array(
  unavailability.extend({
    reason: z.string().nullable().optional().meta({ description: "Presente apenas quando a pessoa consulta as próprias." }),
  }),
);

export const departmentUnavailabilities = z.array(
  unavailability.extend({
    reason: z.string().nullable().optional().meta({ description: "Presente apenas nas ausências da própria pessoa." }),
    credential: z.object({ id: z.uuid(), name: z.string(), username: z.string().nullable() }),
  }),
);

export const savedUnavailability = withReason.extend({
  conflictingAssignments: z
    .array(
      z.object({
        id: z.uuid().meta({ description: "ID da participação na escala (use para pedir troca em /change-requests)." }),
        schedule: z.object({
          id: z.uuid(),
          name: z.string(),
          scheduleAt: z.iso.datetime(),
          department: z.object({ id: z.uuid(), name: z.string() }),
        }),
      }),
    )
    .meta({
      description:
        "Escalas em que a pessoa já está durante a ausência. Se não estiver vazio, sugira pedir troca de escala.",
    }),
});
