import { AppError } from "../../shared/errors/AppError.js";
import { isUniqueViolationOn } from "../../shared/errors/prismaErrors.js";
import { messages } from "../notifications/notifications.messages.js";
import { schedulesRepository } from "../schedules/schedules.repository.js";
import { notifier as defaultNotifier } from "../notifications/notifications.notifier.js";
import { changeRequestsRepository } from "./change-requests.repository.js";

const NOT_FOUND = "Participação na escala não encontrada";

function ensureUpcoming(assignment) {
  if (assignment.schedule.scheduleAt <= new Date()) {
    throw AppError.conflict("A escala já começou; trocas não são mais possíveis");
  }
}

const REQUEST_RECEIVED = ["CHANGE_REQUEST_RECEIVED"];
const OUTDATED_AFTER_HANDING_OVER = [
  "SCHEDULE_ASSIGNED",
  "SCHEDULE_CHANGED",
  "SCHEDULE_REMINDER",
  "CHANGE_REQUEST_REJECTED",
];

export function createChangeRequestsService({
  repository = changeRequestsRepository,
  schedules = schedulesRepository,
  notifier = defaultNotifier,
} = {}) {
  async function findOwnAssignment(auth, id) {
    const assignment = await repository.findAssignment(id);
    if (!assignment || assignment.credentialId !== auth.id) throw AppError.notFound(NOT_FOUND);
    return assignment;
  }

  async function findRequestAddressedTo(auth, id) {
    const assignment = await repository.findAssignment(id);
    if (!assignment || assignment.credentialChangeId !== auth.id) throw AppError.notFound(NOT_FOUND);
    if (assignment.changeStatus !== "REQUESTED") throw AppError.conflict("Este pedido de troca já foi respondido");
    ensureUpcoming(assignment);
    return assignment;
  }

  return {
    async listMine(auth) {
      const [received, sent] = await Promise.all([repository.listReceived(auth.id), repository.listSent(auth.id)]);
      return { received, sent };
    },

    async request(auth, { assignmentId, substituteId }) {
      const assignment = await findOwnAssignment(auth, assignmentId);
      if (!assignment.schedule.published) throw AppError.notFound(NOT_FOUND);
      ensureUpcoming(assignment);

      if (substituteId === auth.id) throw AppError.unprocessable("Escolha outra pessoa como substituta");
      if (!(await repository.findActiveMember(assignment.schedule.department.id, substituteId))) {
        throw AppError.unprocessable("O substituto precisa ser um membro ativo do ministério da escala");
      }
      if (await repository.isAssigned(assignment.schedule.id, substituteId)) {
        throw AppError.conflict("O substituto já está nesta escala");
      }

      if (assignment.changeStatus === "REQUESTED" && assignment.credentialChangeId) {
        await notifier.discardAboutSchedule(assignment.credentialChangeId, assignment.schedule.id, REQUEST_RECEIVED);
        if (assignment.credentialChangeId !== substituteId) {
          await notifier.to(
            [assignment.credentialChangeId],
            messages.changeRequestCancelled(assignment.credential.name, assignment.schedule),
          );
        }
      }

      const requested = await repository.request(assignmentId, substituteId);
      await notifier.to([substituteId], messages.changeRequestReceived(requested.credential.name, requested.schedule));
      return requested;
    },

    async cancel(auth, assignmentId) {
      const assignment = await findOwnAssignment(auth, assignmentId);
      if (assignment.changeStatus === "NONE") throw AppError.conflict("Não há pedido de troca para cancelar");
      await repository.cancel(assignmentId);

      if (assignment.changeStatus === "REQUESTED") {
        await notifier.discardAboutSchedule(assignment.credentialChangeId, assignment.schedule.id, REQUEST_RECEIVED);
        await notifier.to(
          [assignment.credentialChangeId],
          messages.changeRequestCancelled(assignment.credential.name, assignment.schedule),
        );
      }
    },

    async accept(auth, assignmentId) {
      const assignment = await findRequestAddressedTo(auth, assignmentId);

      try {
        if (!(await repository.accept(assignmentId, auth.id))) {
          throw AppError.conflict("Este pedido de troca já foi respondido ou cancelado");
        }
      } catch (error) {
        if (isUniqueViolationOn(error, "credential_schedule")) throw AppError.conflict("Você já está nesta escala");
        throw error;
      }

      const requesterId = assignment.credentialId;
      const scheduleId = assignment.schedule.id;
      await notifier.discardAboutSchedule(auth.id, scheduleId, REQUEST_RECEIVED);
      await notifier.discardAboutSchedule(requesterId, scheduleId, OUTDATED_AFTER_HANDING_OVER);
      await notifier.to([requesterId], messages.changeRequestAccepted(assignment.credentialChange.name, assignment.schedule));
      await notifier.safely(async () => {
        if ((await schedules.countDeclined(scheduleId)) === 0) {
          await notifier.discardForEveryone(scheduleId, ["ASSIGNMENT_DECLINED"]);
        }
      });
      return repository.findAssignment(assignmentId);
    },

    async reject(auth, assignmentId) {
      const assignment = await findRequestAddressedTo(auth, assignmentId);
      const rejected = await repository.reject(assignmentId);
      await notifier.discardAboutSchedule(auth.id, assignment.schedule.id, REQUEST_RECEIVED);
      await notifier.to([assignment.credentialId], messages.changeRequestRejected(assignment.credentialChange.name, assignment.schedule));
      return rejected;
    },
  };
}

export const changeRequestsService = createChangeRequestsService();
