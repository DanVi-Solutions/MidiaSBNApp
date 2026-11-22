import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createSchedulesController } from "./schedules.controller.js";
import * as res from "./schedules.responses.js";
import {
  assignBody,
  assignmentParams,
  createBody,
  idParams,
  listQuery,
  mineQuery,
  updateBody,
} from "./schedules.validation.js";

const controller = createSchedulesController();

const manageRule = markdown(
  "**Quem pode:** o administrador, ou scheduler manager ou acima que participe do ministério da escala.",
  "",
  "Só funciona para escalas dentro do período liberado (veja `GET /schedules/window`); fora dele responde 422.",
);

export const schedulesRouter = createDocumentedRouter({
  prefix: "/schedules",
  tag: "Schedules",
  tagDescription: markdown(
    "**Escalas**: cada culto/evento de um ministério, com as pessoas que vão servir nele.",
    "",
    "Uma escala nasce como **rascunho** (`published: false`), visível apenas para quem gerencia as escalas do " +
      "ministério. Ao publicar (`PATCH` com `published: true`), os membros do ministério passam a vê-la.",
    "",
    "Cada ministério só pode ter uma escala por dia e horário.",
    "",
    "## Período liberado",
    "Escalas só podem ser criadas, editadas, excluídas ou ter pessoas alteradas dentro de uma janela:",
    "- **de agora** (o passado fica travado)",
    "- **até o 1º domingo do segundo mês seguinte ao ciclo**.",
    "",
    "Um novo ciclo começa quando faltam 14 dias para o mês acabar, liberando mais um mês. Exemplo: até 16/11 vale o " +
      "ciclo de outubro (libera até o 1º domingo de dezembro); a partir de 17/11 vale o de novembro (libera até o " +
      "1º domingo de janeiro).",
    "",
    "A cada novo ciclo, as escalas dos meses anteriores ao mês do ciclo são **apagadas automaticamente**, junto com " +
      "quem estava escalado nelas.",
  ),
});
const r = schedulesRouter;

r.get(
  "/",
  {
    summary: "Listar escalas",
    description: markdown(
      "Lista as escalas a partir de `from` (padrão: agora), em ordem cronológica. Filtre por ministério com " +
        "`departmentId`.",
      "",
      "**O que cada um vê:**",
      "- administrador: todas;",
      "- scheduler manager ou acima: rascunhos e publicadas dos ministérios dos quais participa;",
      "- demais: apenas as publicadas dos seus ministérios.",
    ),
    query: listQuery,
    responses: { 200: res.scheduleList },
  },
  controller.list,
);

r.get(
  "/window",
  {
    summary: "Período liberado para mexer nas escalas",
    description: markdown(
      "Informa de quando até quando as escalas podem ser criadas, editadas ou excluídas agora, e quando o próximo " +
        "mês será liberado. Use para travar as datas no calendário do front.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa.",
    ),
    responses: { 200: res.window },
  },
  controller.window,
);

r.get(
  "/me",
  {
    summary: "Minhas escalas",
    description: markdown(
      "Lista as escalas **publicadas** em que a pessoa logada está, a partir de `from` (padrão: agora). Cada item " +
        "traz o `id` da participação, usado para pedir troca em `POST /change-requests`.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa.",
    ),
    query: mineQuery,
    responses: { 200: res.myAssignments },
  },
  controller.listMine,
);

r.get(
  "/:id",
  {
    summary: "Detalhar uma escala",
    description: markdown(
      "Retorna a escala com todas as pessoas escaladas e os pedidos de troca em andamento.",
      "",
      "**Quem pode:** quem gerencia as escalas do ministério; ou membros do ministério, se a escala estiver " +
        "publicada (rascunhos respondem 404 para eles).",
    ),
    params: idParams,
    responses: { 200: res.schedule },
  },
  controller.getById,
);

r.get(
  "/:id/available-credentials",
  {
    summary: "Sugerir pessoas para a escala",
    description: markdown(
      "Lista os membros do ministério que **ainda não estão** na escala, indicando se podem servir no horário dela:",
      "- `hasWeeklyAvailability`: marcou disponibilidade no dia da semana e período (manhã/tarde/noite) da escala;",
      "- `isUnavailable`: registrou uma ausência que cobre o horário;",
      "- `available`: as duas condições favoráveis.",
      "",
      "Os disponíveis vêm primeiro. Contas desativadas ficam de fora.",
      "",
      manageRule,
    ),
    params: idParams,
    responses: { 200: res.candidates },
  },
  controller.availableCredentials,
);

r.post(
  "/",
  {
    summary: "Criar escala",
    description: markdown(
      "Cria uma escala avulsa, como rascunho e sem pessoas. Para gerar as escalas do mês a partir de um modelo, " +
        "use `POST /recurring-events/{id}/apply`.",
      "",
      manageRule,
    ),
    body: createBody,
    responses: { 201: res.schedule, 409: { description: "O ministério já tem uma escala neste dia e horário" } },
  },
  controller.create,
);

r.post(
  "/:id/credentials",
  {
    summary: "Escalar uma pessoa",
    description: markdown(
      "Adiciona a pessoa à escala. Ela precisa participar do ministério da escala e não pode estar com a conta " +
        "desativada.",
      "",
      "Se a pessoa não marcou disponibilidade nesse período ou registrou ausência, a escalação acontece mesmo " +
        "assim e a resposta traz `warnings` para o front avisar o gestor.",
      "",
      manageRule,
    ),
    params: idParams,
    body: assignBody,
    responses: {
      201: res.assigned,
      409: { description: "A pessoa já está nesta escala" },
      422: { description: "A pessoa não participa do ministério ou está com a conta desativada" },
    },
  },
  controller.assign,
);

r.patch(
  "/:id",
  {
    summary: "Editar ou publicar uma escala",
    description: markdown(
      "Altera nome, descrição, data/hora ou publicação. Envie apenas os campos que quer mudar. O ministério da " +
        "escala não pode ser trocado.",
      "",
      manageRule,
    ),
    params: idParams,
    body: updateBody,
    responses: { 200: res.schedule, 409: { description: "O ministério já tem uma escala neste dia e horário" } },
  },
  controller.update,
);

r.delete(
  "/:id",
  {
    summary: "Excluir uma escala",
    description: markdown("Remove a escala e todas as participações (inclusive pedidos de troca).", "", manageRule),
    params: idParams,
    responses: { 204: null },
  },
  controller.delete,
);

r.delete(
  "/:id/credentials/:credentialId",
  {
    summary: "Tirar uma pessoa da escala",
    description: markdown("Remove a participação da pessoa, inclusive um pedido de troca em andamento.", "", manageRule),
    params: assignmentParams,
    responses: { 204: null },
  },
  controller.unassign,
);
