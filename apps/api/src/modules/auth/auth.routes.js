import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { loginRateLimit, tooManyAttemptsResponse } from "../../shared/middlewares/rateLimit.js";
import { createAuthController } from "./auth.controller.js";
import * as res from "./auth.responses.js";
import { loginBody, refreshTokenBody } from "./auth.validation.js";

const controller = createAuthController();

export const authRouter = createDocumentedRouter({ prefix: "/auth", tag: "Auth" });
const r = authRouter;

r.post(
  "/login",
  {
    summary: "Entrar com o código da credencial",
    description: "Credenciais PENDING também entram, para concluir o primeiro acesso.",
    auth: false,
    before: [loginRateLimit],
    body: loginBody,
    responses: {
      200: res.session,
      401: { description: "Código de credencial inválido" },
      403: { description: "Credencial inativa" },
      429: tooManyAttemptsResponse,
    },
  },
  controller.login,
);

r.post(
  "/refresh",
  {
    summary: "Renovar a sessão",
    description: "Troca o refresh token por um novo par de tokens. O refresh token usado deixa de valer.",
    auth: false,
    body: refreshTokenBody,
    responses: {
      200: res.session,
      401: { description: "Sessão inválida ou expirada" },
      403: { description: "Credencial inativa" },
    },
  },
  controller.refresh,
);

r.post(
  "/logout",
  {
    summary: "Encerrar a sessão atual",
    auth: false,
    body: refreshTokenBody,
    responses: { 204: null },
  },
  controller.logout,
);

r.post(
  "/logout-all",
  {
    summary: "Encerrar todas as sessões",
    statuses: null,
    responses: { 204: null },
  },
  controller.logoutAll,
);
