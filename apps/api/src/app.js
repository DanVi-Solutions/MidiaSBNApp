import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { routes } from "./routes.js";
import { AppError } from "./shared/errors/AppError.js";
import { errorHandler } from "./shared/errors/errorHandler.js";

export const app = express();

app.disable("x-powered-by");
if (env.TRUST_PROXY > 0) app.set("trust proxy", env.TRUST_PROXY);
app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()) }));
app.use(express.json({ limit: "100kb" }));

app.use(routes);

app.use((req) => {
  throw AppError.notFound(`Rota não encontrada: ${req.method} ${req.path}`);
});

app.use(errorHandler);
