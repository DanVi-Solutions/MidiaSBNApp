import { z } from "zod";

export const updateSystemConfigBody = z.object({
  maintenanceMode: z.boolean("Informe true ou false para maintenanceMode").meta({
    description: "Ativa ou desativa o modo de manutenção global do sistema.",
  }),
});
