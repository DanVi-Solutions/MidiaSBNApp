import { scheduleWindow } from "../../shared/time/scheduleWindow.js";
import { jobMarkersRepository } from "./job-markers.repository.js";
import { messages } from "./notifications.messages.js";
import { notifier as defaultNotifier } from "./notifications.notifier.js";
import { notificationsRepository } from "./notifications.repository.js";
import { pushSubscriptionsRepository } from "./push-subscriptions.repository.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const JOB_INTERVAL = 5 * MINUTE;
const REMINDER_LEAD_TIME = DAY;

export const RETENTION = Object.freeze({
  read: 15 * DAY,
  any: 60 * DAY,
  afterSchedule: DAY,
});

export async function sendDueReminders({
  repository = notificationsRepository,
  notifier = defaultNotifier,
  now = new Date(),
} = {}) {
  const due = await repository.findDueReminders({ from: now, until: new Date(now.getTime() + REMINDER_LEAD_TIME) });
  if (due.length === 0) return 0;

  await repository.markRemindersSent(
    due.map((assignment) => assignment.id),
    now,
  );
  await notifier.send(
    due.map((assignment) => ({
      credentialId: assignment.credentialId,
      message: messages.scheduleReminder(assignment.schedule, { confirmed: Boolean(assignment.confirmedAt) }),
    })),
  );
  return due.length;
}

export async function warnUnconfirmedPresence({
  repository = notificationsRepository,
  notifier = defaultNotifier,
  now = new Date(),
} = {}) {
  const started = await repository.findStartedWithoutAttendanceNotice({ from: new Date(now.getTime() - DAY), until: now });
  if (started.length === 0) return 0;

  await repository.markAttendanceNoticeSent(
    started.map((schedule) => schedule.id),
    now,
  );

  const pending = started.filter((schedule) => schedule.credentials.length > 0);
  const entries = await Promise.all(
    pending.map(async (schedule) => {
      const leaders = await repository.departmentLeadersOf(schedule.department.id);
      const message = messages.presenceNotConfirmed(
        schedule.credentials.map((assignment) => assignment.credential.name),
        schedule,
      );
      return leaders.map((credentialId) => ({ credentialId, message }));
    }),
  );
  await notifier.send(entries.flat());
  return pending.length;
}

const CYCLE_MARKER = "schedule_cycle_announced";

export async function announceNewScheduleCycle({
  repository = notificationsRepository,
  markers = jobMarkersRepository,
  notifier = defaultNotifier,
  now = new Date(),
} = {}) {
  const window = scheduleWindow(now);
  const { advanced } = await markers.advance(CYCLE_MARKER, window.cycleMonth);
  if (!advanced) return 0;

  const releasedMonth = Temporal.PlainYearMonth.from(window.cycleMonth).add({ months: 1 }).toString();
  const recipients = await repository.everyoneWhoBuildsSchedules();
  const sent = await notifier.to(recipients, messages.cycleOpened({ releasedMonth, lastEditableDay: window.lastEditableDay }));
  return sent.length;
}

export async function purgeStaleNotifications({
  repository = notificationsRepository,
  subscriptions = pushSubscriptionsRepository,
  now = new Date(),
} = {}) {
  const ago = (duration) => new Date(now.getTime() - duration);
  const [notifications, devices] = await Promise.all([
    repository.deleteStale({
      readBefore: ago(RETENTION.read),
      createdBefore: ago(RETENTION.any),
      scheduleStartedBefore: ago(RETENTION.afterSchedule),
    }),
    subscriptions.deleteOfExpiredSessions(now),
  ]);
  return { notifications, devices };
}

export function startNotificationJobs() {
  const run = async () => {
    try {
      const managers = await announceNewScheduleCycle();
      if (managers > 0) console.log(`Novo ciclo de escalas anunciado para ${managers} pessoa(s)`);
    } catch (error) {
      console.error("Falha ao anunciar o novo ciclo de escalas", error);
    }

    try {
      const unconfirmed = await warnUnconfirmedPresence();
      if (unconfirmed > 0) console.log(`Escalas com presença não confirmada avisadas: ${unconfirmed}`);
    } catch (error) {
      console.error("Falha ao avisar presenças não confirmadas", error);
    }

    try {
      const reminders = await sendDueReminders();
      if (reminders > 0) console.log(`Lembretes de escala enviados: ${reminders}`);
    } catch (error) {
      console.error("Falha ao enviar lembretes de escala", error);
    }

    try {
      const { notifications, devices } = await purgeStaleNotifications();
      if (notifications + devices > 0) {
        console.log(`Limpeza de notificações: ${notifications} aviso(s) e ${devices} inscrição(ões) de dispositivo`);
      }
    } catch (error) {
      console.error("Falha na limpeza de notificações", error);
    }
  };

  run();
  return setInterval(run, JOB_INTERVAL).unref();
}
