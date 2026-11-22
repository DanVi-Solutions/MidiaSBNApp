import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createSchedulesController } from "./schedules.controller.js";
import * as res from "./schedules.responses.js";
import {
  assignBody,
  autoAssignBody,
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
    "## Formas de preencher uma escala",
    "- **Manual:** o gestor escala cada pessoa (`POST /schedules/{id}/credentials`).",
    "- **Distribuição automática:** o gestor seleciona várias escalas e a quantidade de pessoas de cada uma " +
      "(`POST /schedules/auto-assign`).",
    "- **Inscrição voluntária** (`selfSignup: true`): os próprios membros se inscrevem até completar " +
      "`volunteersNeeded` (`POST /schedules/{id}/sign-up`). Essas escalas não entram na distribuição automática.",
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
  "/open",
  {
    summary: "Escalas abertas para inscrição",
    description: markdown(
      "Lista as escalas de **inscrição voluntária** publicadas e futuras dos ministérios da pessoa logada, com as " +
        "vagas restantes (`freeSlots`) e se ela já está inscrita (`signedUp`).",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa.",
    ),
    responses: { 200: res.openSchedules },
  },
  controller.listOpen,
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
      "Para uma escala de inscrição voluntária, envie `selfSignup: true` e `volunteersNeeded`.",
      "",
      manageRule,
    ),
    body: createBody,
    responses: { 201: res.schedule, 409: { description: "O ministério já tem uma escala neste dia e horário" } },
  },
  controller.create,
);

r.post(
  "/auto-assign",
  {
    summary: "Distribuição automática de pessoas nas escalas",
    description: markdown(
      "Preenche as escalas selecionadas com membros do ministério de cada uma, até a quantidade pedida em " +
        "`volunteers` (quem já está escalado conta). Envie `dryRun: true` para ver a proposta sem salvar.",
      "",
      "**Regras obrigatórias** — só entra quem:",
      "- participa do ministério da escala e tem a conta ativa (ou em recuperação);",
      "- marcou disponibilidade no dia da semana e período (manhã/tarde/noite) da escala;",
      "- não registrou ausência que cubra o horário;",
      "- não está em outra escala no mesmo horário.",
      "",
      "**Critérios de preferência:**",
      "1. evitar a mesma pessoa mais de uma vez no mesmo dia (contando escalas que ela já tem) — ainda pode " +
        "acontecer se não houver alternativa, e vem marcado em `sameDayConflict`;",
      "2. distribuir a carga: quem tem menos escalas pela frente tem prioridade;",
      "3. empates são sorteados.",
      "",
      "As escalas com menos pessoas disponíveis são preenchidas primeiro. Vagas sem candidatos aparecem em `missing`.",
      "",
      "Não aceita escalas de inscrição voluntária, nem escalas fora do período liberado.",
      "",
      "**Quem pode:** o administrador, ou scheduler manager ou acima, em escalas dos ministérios dos quais participa.",
    ),
    body: autoAssignBody,
    responses: {
      200: { description: "Prévia (`dryRun: true`), nada foi salvo", schema: res.distribution },
      201: { description: "Distribuição salva", schema: res.distribution },
      422: { description: "Escala de inscrição voluntária, fora do período liberado ou dados inválidos" },
    },
  },
  controller.autoAssign,
);

r.post(
  "/:id/sign-up",
  {
    summary: "Inscrever-me numa escala",
    description: markdown(
      "A pessoa logada entra numa escala de **inscrição voluntária**, se ainda houver vaga. Vagas são disputadas: " +
        "se duas pessoas se inscreverem ao mesmo tempo na última vaga, só uma consegue.",
      "",
      "**Quem pode:** membros do ministério da escala, com a conta ativa, enquanto a escala estiver publicada e " +
        "não tiver começado.",
    ),
    params: idParams,
    responses: {
      201: res.schedule,
      409: { description: "Escala completa, não aceita inscrições, já começou, ou você já está nela" },
    },
  },
  controller.signUp,
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
  "/:id/sign-up",
  {
    summary: "Cancelar minha inscrição numa escala",
    description: markdown(
      "Sai de uma escala de inscrição voluntária, liberando a vaga. Para escalas definidas pelos gestores, use a " +
        "troca de escala (`POST /change-requests`).",
      "",
      "**Quem pode:** a própria pessoa, antes de a escala começar.",
    ),
    params: idParams,
    responses: { 204: null, 409: { description: "A escala não é de inscrição voluntária ou já começou" } },
  },
  controller.withdraw,
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
