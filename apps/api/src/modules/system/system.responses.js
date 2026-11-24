import { z } from "zod";

export const systemStatus = z.object({
  maintenanceMode: z.boolean().meta({
    description: "Indica se o sistema está em modo de manutenção.",
  }),
});

export const systemConfig = z.object({
  maintenanceMode: z.boolean().meta({
    description: "Indica se o modo de manutenção está ativo.",
  }),
  updatedAt: z.iso.datetime().nullable().meta({
    description: "Data da última atualização da configuração, ou `null` se nunca alterada.",
  }),
});
