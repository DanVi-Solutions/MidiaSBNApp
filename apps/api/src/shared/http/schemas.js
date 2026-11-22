import { z } from "zod";

export const uuidParam = (description) => z.uuid("ID inválido").meta({ description });

export const dateTime = (description) =>
  z.iso
    .datetime({ offset: true, message: "Use data e hora ISO 8601, ex.: 2026-12-06T09:00:00-03:00" })
    .transform((value) => new Date(value))
    .meta({ description, example: "2026-12-06T09:00:00-03:00" });
