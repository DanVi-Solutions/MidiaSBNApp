import { Router } from "express";
import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { availabilitiesRouter } from "./modules/availabilities/availabilities.routes.js";
import { changeRequestsRouter } from "./modules/change-requests/change-requests.routes.js";
import { credentialsRouter } from "./modules/credentials/credentials.routes.js";
import { departmentsRouter } from "./modules/departments/departments.routes.js";
import { recurringEventsRouter } from "./modules/recurring-events/recurring-events.routes.js";
import { schedulesRouter } from "./modules/schedules/schedules.routes.js";
import { sessionsRouter } from "./modules/sessions/sessions.routes.js";
import { unavailabilitiesRouter } from "./modules/unavailabilities/unavailabilities.routes.js";
import { docsRoutes } from "./shared/docs/docs.routes.js";
import { registerMountedTag } from "./shared/docs/openapi.js";

export const routes = Router();

routes.get("/health", (req, res) => res.json({ status: "ok" }));

const modules = [
  authRouter,
  sessionsRouter,
  credentialsRouter,
  departmentsRouter,
  availabilitiesRouter,
  unavailabilitiesRouter,
  recurringEventsRouter,
  schedulesRouter,
  changeRequestsRouter,
];

for (const module of modules) {
  routes.use(module.prefix, module.router);
  registerMountedTag(module.tag);
}

if (env.DOCS_ENABLED) routes.use("/docs", docsRoutes);
