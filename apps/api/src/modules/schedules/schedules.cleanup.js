import { scheduleWindow } from "../../shared/time/scheduleWindow.js";
import { schedulesRepository } from "./schedules.repository.js";

const ONE_HOUR = 60 * 60 * 1000;

export async function purgeSchedulesFromPreviousCycles(repository = schedulesRepository) {
  return repository.deleteBefore(scheduleWindow().purgeBefore);
}

export function startScheduleCleanupJob() {
  const run = async () => {
    try {
      const deleted = await purgeSchedulesFromPreviousCycles();
      if (deleted > 0) console.log(`Limpeza de escalas: ${deleted} escala(s) de ciclos anteriores apagada(s)`);
    } catch (error) {
      console.error("Falha na limpeza de escalas", error);
    }
  };

  run();
  return setInterval(run, ONE_HOUR).unref();
}
