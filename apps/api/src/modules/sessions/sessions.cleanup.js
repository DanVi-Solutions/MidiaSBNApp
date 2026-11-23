import { sessionsRepository } from "./sessions.repository.js";

const ONE_HOUR = 60 * 60 * 1000;

export async function purgeExpiredSessions(repository = sessionsRepository) {
  return repository.deleteExpired();
}

export function startSessionCleanupJob() {
  const run = async () => {
    try {
      const deleted = await purgeExpiredSessions();
      if (deleted > 0) console.log(`Limpeza de sessões: ${deleted} sessão(ões) expirada(s) apagada(s)`);
    } catch (error) {
      console.error("Falha na limpeza de sessões", error);
    }
  };

  run();
  return setInterval(run, ONE_HOUR).unref();
}
