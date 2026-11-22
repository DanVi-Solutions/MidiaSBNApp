import { AppError } from "../../shared/errors/AppError.js";
import { isUniqueViolationOn } from "../../shared/errors/prismaErrors.js";
import { changeRequestsRepository } from "./change-requests.repository.js";

const NOT_FOUND = "Participação na escala não encontrada";

function ensureUpcoming(assignment) {
  if (assignment.schedule.scheduleAt <= new Date()) {
    throw AppError.conflict("A escala já começou; trocas não são mais possíveis");
  }
}

export function createChangeRequestsService({ repository = changeRequestsRepository } = {}) {
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

      return repository.request(assignmentId, substituteId);
    },

    async cancel(auth, assignmentId) {
      const assignment = await findOwnAssignment(auth, assignmentId);
      if (assignment.changeStatus === "NONE") throw AppError.conflict("Não há pedido de troca para cancelar");
      await repository.cancel(assignmentId);
    },

    async accept(auth, assignmentId) {
      await findRequestAddressedTo(auth, assignmentId);

      try {
        if (!(await repository.accept(assignmentId, auth.id))) {
          throw AppError.conflict("Este pedido de troca já foi respondido ou cancelado");
        }
      } catch (error) {
        if (isUniqueViolationOn(error, "credential_schedule")) throw AppError.conflict("Você já está nesta escala");
        throw error;
      }

      return repository.findAssignment(assignmentId);
    },

    async reject(auth, assignmentId) {
      await findRequestAddressedTo(auth, assignmentId);
      return repository.reject(assignmentId);
    },
  };
}

export const changeRequestsService = createChangeRequestsService();
