import { agendaWindow } from "../../shared/time/agendaWindow.js";
import { scheduleAtForSlot } from "../../shared/time/agendaSlots.js";
import { isInsideWindow, scheduleWindow } from "../../shared/time/scheduleWindow.js";
import { localDateOf } from "../../shared/time/zonedTime.js";
import { agendaRepository } from "./agenda.repository.js";

const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

export async function scheduleAgendaEvents({ repository = agendaRepository, now = new Date() } = {}) {
  const window = scheduleWindow(now);
  const candidates = await repository.listSchedulingCandidates({
    from: new Date(now.getTime() - ONE_DAY),
    until: window.editableUntil,
  });

  const schedules = [];
  const syncedSlotUpdates = [];
  for (const { departmentId, syncedSlots, agendaEvent } of candidates) {
    const date = localDateOf(agendaEvent.startsAt);
    const newSlots = agendaEvent.times.filter((time) => {
      if (syncedSlots.includes(time)) return false;
      return isInsideWindow(scheduleAtForSlot(date, time), window);
    });
    if (newSlots.length === 0) continue;

    for (const time of newSlots) {
      schedules.push({
        name: agendaEvent.name,
        description: agendaEvent.description,
        scheduleAt: scheduleAtForSlot(date, time),
        departmentId,
        agendaEventId: agendaEvent.id,
        agendaSlot: time,
      });
    }
    syncedSlotUpdates.push({ agendaEventId: agendaEvent.id, departmentId, syncedSlots: [...syncedSlots, ...newSlots] });
  }

  return repository.createSchedules(schedules, syncedSlotUpdates);
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
