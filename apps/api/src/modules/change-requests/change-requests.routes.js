import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createChangeRequestsController } from "./change-requests.controller.js";
import * as res from "./change-requests.responses.js";
import { assignmentIdParams, requestBody } from "./change-requests.validation.js";

const controller = createChangeRequestsController();

export const changeRequestsRouter = createDocumentedRouter({
  prefix: "/change-requests",
  tag: "Change requests",
  tagDescription: markdown(
    "**Trocas de escala**: quando quem está escalado não pode ir, indica um substituto do mesmo ministério.",
    "",
    "1. A pessoa escalada pede a troca indicando o substituto (`POST /change-requests`).",
    "2. O substituto vê o pedido em `GET /change-requests` (lista `received`).",
    "3. Se **aceitar**, ele assume o lugar na escala e a pessoa original sai.",
    "4. Se **recusar**, o pedido fica `REJECTED` e a pessoa original pode indicar outro substituto.",
    "",
    "Trocas só são possíveis antes do horário da escala.",
  ),
});
const r = changeRequestsRouter;

r.get(
  "/",
  {
    summary: "Meus pedidos de troca",
    description: markdown(
      "Retorna, para escalas que ainda não começaram:",
      "- `received`: pedidos em que você foi indicado como substituto e ainda não respondeu;",
      "- `sent`: pedidos que você fez, aguardando resposta ou recusados.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa.",
    ),
    responses: { 200: res.myChangeRequests },
  },
  controller.listMine,
);

r.post(
  "/",
  {
    summary: "Pedir troca de escala",
    description: markdown(
      "Indica um substituto para uma escala em que você está. Se já havia um pedido (aguardando ou recusado), " +
        "ele é substituído pelo novo.",
      "",
      "**Regras:** a escala precisa estar publicada e ainda não ter começado; o substituto precisa ser outra " +
        "pessoa, membro do mesmo ministério, com a conta ativa, e não pode já estar na escala.",
      "",
      "**Quem pode:** apenas a pessoa escalada.",
    ),
    body: requestBody,
    responses: {
      201: res.changeRequest,
      404: { description: "Participação não encontrada (ou não é sua)" },
      409: { description: "A escala já começou ou o substituto já está nela" },
      422: { description: "Substituto inválido" },
    },
  },
  controller.request,
);

r.post(
  "/:assignmentId/accept",
  {
    summary: "Aceitar ser substituto",
    description: markdown(
      "Você assume o lugar na escala e a pessoa que pediu a troca sai dela.",
      "",
      "**Quem pode:** apenas o substituto indicado, enquanto o pedido estiver aguardando e a escala não tiver começado.",
    ),
    params: assignmentIdParams,
    responses: {
      200: res.changeRequest,
      409: { description: "Pedido já respondido/cancelado, escala já começou ou você já está nela" },
    },
  },
  controller.accept,
);

r.post(
  "/:assignmentId/reject",
  {
    summary: "Recusar ser substituto",
    description: markdown(
      "O pedido fica `REJECTED`; a pessoa original continua na escala e pode indicar outro substituto.",
      "",
      "**Quem pode:** apenas o substituto indicado, enquanto o pedido estiver aguardando.",
    ),
    params: assignmentIdParams,
    responses: { 200: res.changeRequest, 409: { description: "Pedido já respondido ou escala já começou" } },
  },
  controller.reject,
);

r.delete(
  "/:assignmentId",
  {
    summary: "Cancelar meu pedido de troca",
    description: markdown(
      "Desfaz o pedido (aguardando ou recusado). Você continua na escala.",
      "",
      "**Quem pode:** apenas a pessoa escalada que fez o pedido.",
    ),
    params: assignmentIdParams,
    responses: { 204: null, 409: { description: "Não há pedido para cancelar" } },
  },
  controller.cancel,
);
