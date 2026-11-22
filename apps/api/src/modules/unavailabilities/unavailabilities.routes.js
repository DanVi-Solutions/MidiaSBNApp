import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createUnavailabilitiesController } from "./unavailabilities.controller.js";
import * as res from "./unavailabilities.responses.js";
import {
  createBody,
  credentialIdParams,
  departmentIdParams,
  idParams,
  rangeQuery,
  updateBody,
} from "./unavailabilities.validation.js";

const controller = createUnavailabilitiesController();

export const unavailabilitiesRouter = createDocumentedRouter({
  prefix: "/unavailabilities",
  tag: "Unavailabilities",
  tagDescription: markdown(
    "**Indisponibilidades**: períodos pontuais em que a pessoa não pode servir (viagem, compromisso, doença), " +
      "mesmo que esteja disponível naquele dia da semana.",
    "",
    "O motivo (`reason`) é privado: só a própria pessoa o vê. Os gestores veem apenas o período.",
  ),
});
const r = unavailabilitiesRouter;

r.get(
  "/me",
  {
    summary: "Minhas indisponibilidades",
    description: markdown(
      "Lista as ausências da pessoa logada que ainda não terminaram (ou que cruzam o intervalo `from`–`to`, se " +
        "informado), da mais próxima para a mais distante.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa.",
    ),
    query: rangeQuery,
    responses: { 200: res.myUnavailabilities },
  },
  controller.listMine,
);

r.get(
  "/credentials/:credentialId",
  {
    summary: "Indisponibilidades de uma pessoa",
    description: markdown(
      "Lista as ausências da pessoa que ainda não terminaram (ou no intervalo `from`–`to`). O motivo só vem " +
        "quando é a própria pessoa consultando.",
      "",
      "**Quem pode:** a própria pessoa, o administrador, ou scheduler manager ou acima que participe de um " +
        "ministério em comum com ela.",
    ),
    params: credentialIdParams,
    query: rangeQuery,
    responses: { 200: res.unavailabilitiesOf },
  },
  controller.listOf,
);

r.get(
  "/departments/:departmentId",
  {
    summary: "Indisponibilidades de um ministério",
    description: markdown(
      "Lista as ausências dos membros do ministério no intervalo `from`–`to` (padrão: de agora até 60 dias). " +
        "Útil para montar as escalas sabendo quem estará fora.",
      "",
      "**Quem pode:** o administrador, ou scheduler manager ou acima que participe do ministério.",
    ),
    params: departmentIdParams,
    query: rangeQuery,
    responses: { 200: res.departmentUnavailabilities },
  },
  controller.listDepartment,
);

r.post(
  "/",
  {
    summary: "Registrar uma indisponibilidade",
    description: markdown(
      "Registra um período em que a pessoa logada não poderá servir. O período não pode já ter terminado.",
      "",
      "A resposta traz `conflictingAssignments`: as escalas em que a pessoa já está nesse período. Se houver " +
        "alguma, sugira pedir troca (`POST /change-requests`) — a indisponibilidade não tira ninguém da escala " +
        "automaticamente.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa, para si mesma.",
    ),
    body: createBody,
    responses: { 201: res.savedUnavailability },
  },
  controller.create,
);

r.patch(
  "/:id",
  {
    summary: "Editar uma indisponibilidade",
    description: markdown(
      "Altera o período e/ou o motivo. Envie apenas os campos que quer mudar. Também devolve " +
        "`conflictingAssignments`.",
      "",
      "**Quem pode:** apenas a dona da indisponibilidade.",
    ),
    params: idParams,
    body: updateBody,
    responses: { 200: res.savedUnavailability },
  },
  controller.update,
);

r.delete(
  "/:id",
  {
    summary: "Excluir uma indisponibilidade",
    description: "**Quem pode:** apenas a dona da indisponibilidade.",
    params: idParams,
    responses: { 204: null },
  },
  controller.delete,
);
