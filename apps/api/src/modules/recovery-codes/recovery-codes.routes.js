import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { recoveryRateLimit, tooManyAttemptsResponse } from "../../shared/middlewares/rateLimit.js";
import { createRecoveryCodesController } from "./recovery-codes.controller.js";
import * as res from "./recovery-codes.responses.js";
import { credentialIdParams, recoverBody } from "./recovery-codes.validation.js";

const controller = createRecoveryCodesController();

const managerRule =
  "O próprio usuário ou department manager+ (sobre papéis abaixo do seu, nos seus departamentos).";

export const recoveryCodesRouter = createDocumentedRouter({ prefix: "/recovery-codes", tag: "Recovery codes" });
const r = recoveryCodesRouter;

r.get(
  "/",
  {
    summary: "Quantos dos meus códigos de recuperação restam",
    responses: { 200: res.remaining },
  },
  controller.remaining,
);

r.get(
  "/credentials/:credentialId",
  {
    summary: "Quantos códigos de recuperação uma credencial ainda tem",
    description: `Útil para o suporte saber se a pessoa ainda consegue recuperar o acesso. ${managerRule}`,
    params: credentialIdParams,
    responses: { 200: res.remaining },
  },
  controller.remainingOf,
);

r.post(
  "/",
  {
    summary: "Gerar meus códigos de recuperação",
    description:
      "Gera 8 códigos de uso único e invalida os anteriores. " +
      "Os códigos são exibidos apenas nesta resposta; recomenda-se chamar logo após o primeiro acesso.",
    responses: { 201: res.recoveryCodes },
  },
  controller.generate,
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
      429: tooManyAttemptsResponse,
    },
  },
  controller.recover,
);

r.delete(
  "/",
  {
    summary: "Invalidar meus códigos de recuperação",
    responses: { 204: null },
  },
  controller.revoke,
);

r.delete(
  "/credentials/:credentialId",
  {
    summary: "Invalidar os códigos de recuperação de uma credencial",
    description: `Para quando os códigos vazaram ou a pessoa perdeu o papel onde os anotou. ${managerRule}`,
    params: credentialIdParams,
    responses: { 204: null },
  },
  controller.revokeOf,
);
