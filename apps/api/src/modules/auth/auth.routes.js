import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { loginRateLimit, tooManyAttemptsResponse } from "../../shared/middlewares/rateLimit.js";
import { createAuthController } from "./auth.controller.js";
import * as res from "./auth.responses.js";
import { loginBody, refreshTokenBody } from "./auth.validation.js";

const controller = createAuthController();

export const authRouter = createDocumentedRouter({
  prefix: "/auth",
  tag: "Auth",
  tagDescription: markdown(
    "Entrar, manter e encerrar a sessão do dispositivo atual.",
    "",
    "Não há senha: a pessoa entra apenas com o **código da credencial** (`SBN-XXXXXXXXXX`). Para ver ou " +
      "encerrar outros dispositivos, use o grupo **Sessions**.",
  ),
});
const r = authRouter;

r.post(
  "/login",
  {
    summary: "Entrar com o código da credencial",
    description: markdown(
      "Abre uma sessão neste dispositivo e devolve os tokens de acesso.",
      "",
      "**Depois do login, confira `credential.status`:**",
      "- `PENDING` → leve a pessoa ao primeiro acesso (`POST /credentials/me/first-access`).",
      "- `RECOVERING` → leve a pessoa a concluir a recuperação (`POST /credentials/me/complete-recovery`).",
      "- `ACTIVE` → acesso normal.",
      "",
      "**Limite:** 10 tentativas a cada 15 minutos por IP.",
      "",
      "**Quem pode:** qualquer pessoa com um código válido e conta não desativada.",
    ),
    auth: false,
    before: [loginRateLimit],
    body: loginBody,
    responses: {
      200: res.session,
      401: { description: "Código de credencial inválido" },
      403: { description: "Conta desativada (INACTIVE)" },
      429: tooManyAttemptsResponse,
      503: { description: "Sistema em modo de manutenção" },
    },
  },
  controller.login,
);

r.post(
  "/refresh",
  {
    summary: "Renovar a sessão",
    description: markdown(
      "Troca o `refreshToken` por um par novo de tokens, sem pedir o código de novo. Chame quando o " +
        "`accessToken` expirar (resposta 401).",
      "",
      "O `refreshToken` enviado **deixa de valer** na hora: guarde sempre o novo. Se dois pedidos usarem o " +
        "mesmo refresh ao mesmo tempo, só o primeiro funciona.",
      "",
      "**Quem pode:** quem tiver um refresh token válido (não precisa do `accessToken`).",
    ),
    auth: false,
    body: refreshTokenBody,
    responses: {
      200: res.session,
      401: { description: "Refresh token inválido, já usado, expirado ou sessão encerrada" },
      403: { description: "Conta desativada (INACTIVE)" },
      503: { description: "Sistema em modo de manutenção" },
    },
  },
  controller.refresh,
);

r.post(
  "/logout",
  {
    summary: "Sair deste dispositivo",
    description: markdown(
      "Encerra a sessão do refresh token informado. O `accessToken` dessa sessão também para de funcionar " +
        "na hora.",
      "",
      "Pode ser chamado mais de uma vez sem erro, mesmo com o `accessToken` já expirado.",
      "",
      "Para encerrar outros dispositivos, use `DELETE /sessions` ou `DELETE /sessions/{sessionId}`.",
    ),
    auth: false,
    body: refreshTokenBody,
    responses: { 204: null },
  },
  controller.logout,
);
