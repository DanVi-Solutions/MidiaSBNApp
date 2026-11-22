import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createSessionsController } from "./sessions.controller.js";
import * as res from "./sessions.responses.js";
import { credentialIdParams, sessionIdParams } from "./sessions.validation.js";

const controller = createSessionsController();

const managerRule = markdown(
  "**Quem pode:**",
  "- a própria pessoa;",
  "- department manager ou acima, sobre quem tem papel abaixo do seu e participa de um ministério em comum;",
  "- o administrador, sobre qualquer pessoa.",
);

export const sessionsRouter = createDocumentedRouter({
  prefix: "/sessions",
  tag: "Sessions",
  tagDescription: markdown(
    "Dispositivos em que a pessoa está logada. Cada login abre uma sessão; renovar o token mantém a mesma sessão.",
    "",
    "Encerrar uma sessão bloqueia aquele dispositivo **na hora**: o `accessToken` dele para de funcionar e a " +
      "pessoa precisa entrar de novo.",
  ),
});
const r = sessionsRouter;

r.get(
  "/",
  {
    summary: "Listar meus dispositivos conectados",
    description: markdown(
      "Retorna as sessões abertas da pessoa logada, da mais recente para a mais antiga. `current: true` " +
        "marca o dispositivo que fez esta requisição.",
      "",
      "**Quem pode:** qualquer pessoa logada.",
    ),
    statuses: null,
    responses: { 200: res.mySessions },
  },
  controller.listMine,
);

r.get(
  "/credentials/:credentialId",
  {
    summary: "Listar os dispositivos conectados de uma pessoa",
    description: markdown(
      "Retorna as sessões abertas da credencial informada. Útil para o suporte verificar onde a pessoa está logada.",
      "",
      managerRule,
    ),
    params: credentialIdParams,
    responses: { 200: res.sessions },
  },
  controller.listOf,
);

r.delete(
  "/",
  {
    summary: "Sair de todos os outros dispositivos",
    description: markdown(
      "Encerra todas as sessões da pessoa logada, **exceto** a deste dispositivo. Para sair também deste, " +
        "chame `POST /auth/logout` em seguida.",
      "",
      "**Quem pode:** qualquer pessoa logada.",
    ),
    statuses: null,
    responses: { 200: res.endedSessions },
  },
  controller.endMyOthers,
);

r.delete(
  "/:sessionId",
  {
    summary: "Sair de um dispositivo específico",
    description: markdown(
      "Encerra uma das sessões da pessoa logada, por exemplo a de um celular perdido. Pode ser a sessão atual.",
      "",
      "Só encerra sessões da própria pessoa: o ID de uma sessão de outra pessoa responde 404.",
      "",
      "**Quem pode:** qualquer pessoa logada.",
    ),
    statuses: null,
    params: sessionIdParams,
    responses: { 204: null },
  },
  controller.endMine,
);

r.delete(
  "/credentials/:credentialId",
  {
    summary: "Desconectar uma pessoa de todos os dispositivos",
    description: markdown(
      "Encerra todas as sessões da credencial informada. A pessoa continua podendo entrar com o código dela; " +
        "para impedir isso, desative a conta ou gere um código novo.",
      "",
      managerRule,
    ),
    params: credentialIdParams,
    responses: { 200: res.endedSessions },
  },
  controller.endAllOf,
);
