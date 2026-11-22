import { Router } from "express";
import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { credentialsRouter } from "./modules/credentials/credentials.routes.js";
import { departmentsRouter } from "./modules/departments/departments.routes.js";
import { sessionsRouter } from "./modules/sessions/sessions.routes.js";
import { docsRoutes } from "./shared/docs/docs.routes.js";

export const routes = Router();

routes.get("/health", (req, res) => res.json({ status: "ok" }));

for (const module of [authRouter, credentialsRouter, departmentsRouter, sessionsRouter]) {
  routes.use(module.prefix, module.router);
}

if (env.DOCS_ENABLED) routes.use("/docs", docsRoutes);
