import { AppError } from "../../shared/errors/AppError.js";
import { credentialsRepository } from "../credentials/credentials.repository.js";
import { assertCanManageSessionsOf } from "./sessions.policy.js";
import { sessionsRepository } from "./sessions.repository.js";

export function createSessionsService({
  repository = sessionsRepository,
  credentials = credentialsRepository,
} = {}) {
  async function findManageableCredential(auth, credentialId) {
    const target = await credentials.findById(credentialId);
    if (!target) throw AppError.notFound("Credencial não encontrada");
    assertCanManageSessionsOf(auth, target);
  }

  return {
    async listMine(auth) {
      const sessions = await repository.listOpen(auth.id);
      return sessions.map((session) => ({ ...session, current: session.id === auth.sessionId }));
    },

    async listOf(auth, credentialId) {
      await findManageableCredential(auth, credentialId);
      return repository.listOpen(credentialId);
    },

    async endMine(auth, sessionId) {
      if (!(await repository.end(sessionId, auth.id))) throw AppError.notFound("Sessão não encontrada");
    },

    async endMyOthers(auth) {
      return { ended: await repository.endAll(auth.id, { except: auth.sessionId }) };
    },

    async endAllOf(auth, credentialId) {
      await findManageableCredential(auth, credentialId);
      return { ended: await repository.endAll(credentialId) };
    },
  };
}

export const sessionsService = createSessionsService();
