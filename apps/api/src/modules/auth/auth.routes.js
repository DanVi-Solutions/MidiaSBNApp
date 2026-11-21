import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { loginRateLimit, recoveryRateLimit } from "../../shared/middlewares/rateLimit.js";
import { createAuthController } from "./auth.controller.js";
import * as res from "./auth.responses.js";
import { loginBody, recoverBody, refreshTokenBody } from "./auth.validation.js";

const controller = createAuthController();

const tooManyAttempts = { description: "Muitas tentativas; aguarde alguns minutos" };

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
      429: tooManyAttempts,
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

r.post(
  "/recovery-codes",
  {
    summary: "Gerar códigos de recuperação",
    description:
      "Gera 8 códigos de uso único e invalida os anteriores. " +
      "Os códigos são exibidos apenas nesta resposta; recomenda-se chamar logo após o primeiro acesso.",
    responses: { 201: res.recoveryCodes },
  },
  controller.generateRecoveryCodes,
);

r.get(
  "/recovery-codes",
  {
    summary: "Quantos códigos de recuperação restam",
    responses: { 200: res.recoveryCodesStatus },
  },
  controller.recoveryCodesStatus,
);

r.post(
  "/recover",
  {
    summary: "Recuperar acesso com um código de recuperação",
    description:
      "Consome o código informado, gera um novo código de credencial, encerra todas as sessões " +
      "e devolve uma sessão nova.",
    auth: false,
    before: [recoveryRateLimit],
    body: recoverBody,
    responses: {
      200: res.recoveredSession,
      401: { description: "Username ou código de recuperação inválido" },
      403: { description: "Credencial inativa" },
      429: tooManyAttempts,
    },
  },
  controller.recover,
);
