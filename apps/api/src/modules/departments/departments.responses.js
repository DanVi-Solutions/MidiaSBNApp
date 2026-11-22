import { z } from "zod";

export const department = z.object({
  id: z.uuid(),
  name: z.string().meta({ example: "Mídia" }),
  description: z.string().nullable(),
  membersCount: z.number().int().meta({
    description: "Quantidade de pessoas no ministério (sem contar transferências ainda não aprovadas).",
  }),
});

export const departmentList = z.array(department);
