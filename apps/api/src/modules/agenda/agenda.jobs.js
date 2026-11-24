import { agendaWindow } from "../../shared/time/agendaWindow.js";
import { scheduleWindow } from "../../shared/time/scheduleWindow.js";
import { agendaRepository } from "./agenda.repository.js";

const FIVE_MINUTES = 5 * 60 * 1000;

export async function scheduleAgendaEvents({ repository = agendaRepository, now = new Date() } = {}) {
  const window = scheduleWindow(now);
  const pending = await repository.listUnscheduled({ from: window.editableFrom, until: window.editableUntil });
  return repository.createSchedules(pending, now);
}

export async function purgeAgendaFromPreviousCycles({ repository = agendaRepository, now = new Date() } = {}) {
  return repository.deleteBefore(agendaWindow(now).purgeBefore);
}

export function startAgendaJobs() {
  const run = async () => {
    try {
      const created = await scheduleAgendaEvents();
      if (created > 0) console.log(`Agenda Sobrenatural: ${created} escala(s) criada(s) a partir dos eventos`);
    } catch (error) {
      console.error("Falha ao levar os eventos da agenda para as escalas", error);
    }

    try {
      const deleted = await purgeAgendaFromPreviousCycles();
      if (deleted > 0) console.log(`Agenda Sobrenatural: ${deleted} evento(s) de ciclos anteriores apagado(s)`);
    } catch (error) {
      console.error("Falha na limpeza da agenda", error);
    }
  };

  run();
  return setInterval(run, FIVE_MINUTES).unref();
}
