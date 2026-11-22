import { z } from "zod";
import { uuidParam } from "../../shared/http/schemas.js";

export const assignmentIdParams = z.object({
  assignmentId: uuidParam("ID da participação na escala (o `id` retornado em `GET /schedules/me`)."),
});

export const requestBody = z.object({
  assignmentId: z.uuid("ID inválido").meta({
    description: "ID da sua participação na escala (o `id` retornado em `GET /schedules/me`).",
  }),
  substituteId: z.uuid("ID inválido").meta({ description: "Pessoa que você indica para ficar no seu lugar." }),
});
