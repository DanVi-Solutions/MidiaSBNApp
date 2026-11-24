import { app } from "./app.js";
import { prisma } from "./config/database.js";
import { env } from "./config/env.js";
import { startAgendaJobs } from "./modules/agenda/agenda.jobs.js";
import { startDemandCleanupJob } from "./modules/demands/demands.cleanup.js";
import { startNotificationJobs } from "./modules/notifications/notifications.jobs.js";
import { pushConfig } from "./modules/notifications/notifications.push.js";
import { startScheduleCleanupJob } from "./modules/schedules/schedules.cleanup.js";
import { startSessionCleanupJob } from "./modules/sessions/sessions.cleanup.js";

const server = app.listen(env.PORT, () => {
  console.log(`API rodando em http://localhost:${env.PORT}`);
});

const backgroundJobs = [
  startScheduleCleanupJob(),
  startDemandCleanupJob(),
  startSessionCleanupJob(),
  startAgendaJobs(),
  startNotificationJobs(),
];

if (!pushConfig.enabled) {
  console.warn("Notificações no dispositivo desativadas: defina VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT");
}

async function shutdown(signal) {
  console.log(`${signal} recebido, encerrando...`);
  backgroundJobs.forEach(clearInterval);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
