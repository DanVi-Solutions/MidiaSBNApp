import { z } from "zod";
import { WEEKDAYS } from "../../shared/time/zonedTime.js";

const day = z.object({
  weekday: z.enum(WEEKDAYS),
  morning: z.boolean(),
  afternoon: z.boolean(),
  night: z.boolean(),
});

export const week = z.array(day).meta({ description: "Sempre os 7 dias, de domingo a sábado." });

export const departmentWeeks = z.array(
  z.object({
    credential: z.object({ id: z.uuid(), name: z.string(), username: z.string().nullable() }),
    week,
  }),
);
