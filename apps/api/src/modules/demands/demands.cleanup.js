import { demandsRepository } from "./demands.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export const COMPLETED_DEMAND_RETENTION_DAYS = 15;
export const COMPLETED_DEMAND_RETENTION_MS = COMPLETED_DEMAND_RETENTION_DAYS * DAY_MS;

export function completedDemandCutoff(now = new Date()) {
  return new Date(now.getTime() - COMPLETED_DEMAND_RETENTION_MS);
}

export async function purgeExpiredCompletedDemands({
  repository = demandsRepository,
  now = new Date(),
} = {}) {
  return repository.deleteCompletedBefore(completedDemandCutoff(now));
}

export function startDemandCleanupJob() {
  const run = async () => {
    try {
      const deleted = await purgeExpiredCompletedDemands();
      if (deleted > 0) console.log(`Limpeza de demandas: ${deleted} demanda(s) finalizada(s) removida(s)`);
    } catch (error) {
      console.error("Falha na limpeza de demandas", error);
    }
  };

  run();
  return setInterval(run, ONE_HOUR_MS).unref();
}
