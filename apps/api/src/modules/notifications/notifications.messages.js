import { formatDay, formatMoment, formatMonthName } from "../../shared/time/formatting.js";

const ROLE_LABELS = {
  ADMINISTRATOR: "Administrador",
  GENERAL_MANAGER: "Líder Geral",
  DEPARTMENT_MANAGER: "Gerente do Ministério",
  SCHEDULER_MANAGER: "Responsável das Escalas",
  VOLUNTEER: "Membro Voluntário",
};

const SCHEDULE_PAGE = "/schedule";
const CONFIRM_PRESENCE = "Confirme sua presença no app.";
const PARTICIPANTS_PAGE = "/participants";
const PROFILE_PAGE = "/profile";

const scheduleLabel = (schedule) => `${schedule.name} (${schedule.department.name})`;
const when = (schedule) => formatMoment(schedule.scheduleAt);
const listNames = (names) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;

function aboutSchedule(type, schedule, title, body) {
  return { type, title, body, link: SCHEDULE_PAGE, scheduleId: schedule.id };
}

export const messages = {
  scheduleAssigned: (schedule) =>
    aboutSchedule(
      "SCHEDULE_ASSIGNED",
      schedule,
      "Você está em uma nova escala",
      `${scheduleLabel(schedule)} — ${when(schedule)}. ${CONFIRM_PRESENCE}`,
    ),

  scheduleUnassigned: (schedule) =>
    aboutSchedule(
      "SCHEDULE_UNASSIGNED",
      schedule,
      "Você não está mais em uma escala",
      `Você foi retirado de ${scheduleLabel(schedule)} — ${when(schedule)}.`,
    ),

  scheduleMoved: (schedule) =>
    aboutSchedule(
      "SCHEDULE_CHANGED",
      schedule,
      "Escala com novo horário",
      `${scheduleLabel(schedule)} agora será ${when(schedule)}. ${CONFIRM_PRESENCE}`,
    ),

  scheduleRenamed: (schedule, previousName) =>
    aboutSchedule(
      "SCHEDULE_CHANGED",
      schedule,
      "Escala atualizada",
      `A escala "${previousName}" agora se chama "${schedule.name}" — ${when(schedule)}.`,
    ),

  scheduleCancelled: (schedule) => ({
    type: "SCHEDULE_CANCELLED",
    title: "Escala cancelada",
    body: `${scheduleLabel(schedule)} — ${when(schedule)} foi cancelada.`,
    link: SCHEDULE_PAGE,
    scheduleId: null,
  }),

  scheduleReminder: (schedule, { confirmed }) =>
    aboutSchedule(
      "SCHEDULE_REMINDER",
      schedule,
      "Sua escala está chegando",
      `${scheduleLabel(schedule)} — ${when(schedule)}.${confirmed ? "" : ` ${CONFIRM_PRESENCE}`}`,
    ),

  selfSignupOpened: (schedule) =>
    aboutSchedule(
      "SELF_SIGNUP_OPENED",
      schedule,
      "Vagas abertas para inscrição",
      `${scheduleLabel(schedule)} — ${when(schedule)} aceita inscrições. Garanta sua vaga!`,
    ),

  changeRequestReceived: (requesterName, schedule) =>
    aboutSchedule(
      "CHANGE_REQUEST_RECEIVED",
      schedule,
      "Pedido de substituição",
      `${requesterName} pediu para você assumir o lugar dele(a) em ${scheduleLabel(schedule)} — ${when(schedule)}.`,
    ),

  changeRequestAccepted: (substituteName, schedule) =>
    aboutSchedule(
      "CHANGE_REQUEST_ACCEPTED",
      schedule,
      "Substituição aceita",
      `${substituteName} assumiu o seu lugar em ${scheduleLabel(schedule)} — ${when(schedule)}.`,
    ),

  changeRequestRejected: (substituteName, schedule) =>
    aboutSchedule(
      "CHANGE_REQUEST_REJECTED",
      schedule,
      "Substituição recusada",
      `${substituteName} não pode assumir ${scheduleLabel(schedule)} — ${when(schedule)}. Escolha outra pessoa.`,
    ),

  changeRequestCancelled: (requesterName, schedule) =>
    aboutSchedule(
      "CHANGE_REQUEST_CANCELLED",
      schedule,
      "Pedido de substituição cancelado",
      `${requesterName} cancelou o pedido para ${scheduleLabel(schedule)} — ${when(schedule)}.`,
    ),

  transferRequested: (transfer) => ({
    type: "TRANSFER_REQUESTED",
    title: "Transferência aguardando aprovação",
    body: `${transfer.credential.name} foi indicado(a) para sair de ${transfer.from.name} e entrar em ${transfer.to.name}.`,
    link: PARTICIPANTS_PAGE,
    scheduleId: null,
  }),

  transferRejected: (transfer) => ({
    type: "TRANSFER_REJECTED",
    title: "Transferência recusada",
    body: `A transferência de ${transfer.credential.name} para ${transfer.to.name} não foi aprovada.`,
    link: PARTICIPANTS_PAGE,
    scheduleId: null,
  }),

  departmentChanged: (departmentNames) => ({
    type: "DEPARTMENT_CHANGED",
    title: "Seus ministérios mudaram",
    body:
      departmentNames.length > 0
        ? `Agora você faz parte de ${listNames(departmentNames)}.`
        : "Você não faz mais parte de nenhum ministério.",
    link: PROFILE_PAGE,
    scheduleId: null,
  }),

  roleChanged: (role) => ({
    type: "ROLE_CHANGED",
    title: "Seu papel mudou",
    body: `Agora você é ${ROLE_LABELS[role] ?? role}.`,
    link: PROFILE_PAGE,
    scheduleId: null,
  }),

  unavailabilityConflict: (personName, schedule) =>
    aboutSchedule(
      "UNAVAILABILITY_CONFLICT",
      schedule,
      "Ausência em uma escala",
      `${personName} informou que estará ausente em ${scheduleLabel(schedule)} — ${when(schedule)}.`,
    ),

  cycleOpened: ({ releasedMonth, lastEditableDay }) => ({
    type: "SCHEDULE_CYCLE_OPENED",
    title: `Escalas de ${formatMonthName(releasedMonth)} liberadas`,
    body: `Já é possível montar as escalas de ${formatMonthName(releasedMonth)} (até ${formatDay(lastEditableDay)}). Organize a equipe do seu ministério.`,
    link: SCHEDULE_PAGE,
    scheduleId: null,
  }),
};

export const pushTestMessage = {
  title: "Notificações ativadas",
  body: "Tudo certo! Você receberá os avisos das suas escalas neste dispositivo.",
  link: "/profile",
};
