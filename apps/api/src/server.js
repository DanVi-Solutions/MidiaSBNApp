import { app } from "./app.js";
import { prisma } from "./config/database.js";
import { env } from "./config/env.js";
import { startScheduleCleanupJob } from "./modules/schedules/schedules.cleanup.js";

const server = app.listen(env.PORT, () => {
  console.log(`API rodando em http://localhost:${env.PORT}`);
});

const cleanupJob = startScheduleCleanupJob();

async function shutdown(signal) {
  console.log(`${signal} recebido, encerrando...`);
  clearInterval(cleanupJob);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
