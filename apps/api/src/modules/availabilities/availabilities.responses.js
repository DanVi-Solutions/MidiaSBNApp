import { z } from "zod";
import { WEEKDAYS } from "../../shared/time/zonedTime.js";

const day = z.object({
  weekday: z.enum(WEEKDAYS),
  morning: z.boolean(),
  afternoon: z.boolean(),
  night: z.boolean(),
});

export const week = z.array(day).meta({ description: "Sempre os 7 dias, de domingo a sábado." });

export const worshipService = z.object({
  worshipService: z.enum(["SUNDAY_0815", "SUNDAY_1030", "SUNDAY_1800"]).nullable().meta({
    description: "Culto de domingo que a pessoa frequenta. `null` se ainda não informou.",
  }),
});

export const departmentWeeks = z.array(
  z.object({
    credential: z.object({ id: z.uuid(), name: z.string(), username: z.string().nullable() }),
    week,
  }),
);
