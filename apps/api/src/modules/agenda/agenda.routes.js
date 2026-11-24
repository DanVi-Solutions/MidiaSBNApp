import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { publicReadRateLimit, tooManyAttemptsResponse } from "../../shared/middlewares/rateLimit.js";
import { createAgendaController } from "./agenda.controller.js";
import * as res from "./agenda.responses.js";
import { createBody, idParams, listQuery, updateBody } from "./agenda.validation.js";

const controller = createAgendaController();

const editRule = markdown(
  "**Quem pode:** líderes gerais (a agenda é compartilhada entre eles), administradores e desenvolvedores.",
  "Líderes gerais só incluem ou retiram os ministérios que gerenciam.",
);

export const agendaRouter = createDocumentedRouter({
  prefix: "/agenda",
  tag: "Agenda",
  tagDescription: markdown(
    "**Agenda Sobrenatural**: os eventos do ano, com os ministérios que vão servir em cada um.",
    "",
    "O ciclo é anual: de 1º de janeiro até o primeiro domingo de janeiro do ano seguinte. O próximo ano é liberado " +
      "a partir de 17 de novembro, e os eventos de ciclos anteriores são apagados automaticamente.",
    "",
    "Todo evento nasce como **rascunho**, visível só para quem edita a agenda. Depois de publicado, ele aparece " +
      "para todos e, quando a data entra no período das escalas, cada ministério indicado recebe uma escala em " +
      "rascunho, sem ninguém escalado. O nome da escala pode ser trocado sem alterar o evento. Remarcar ou cancelar " +
      "o evento tira as pessoas das escalas e as avisa.",
  ),
});
const r = agendaRouter;

r.get(
  "/public",
  {
    summary: "Agenda pública",
    description: markdown(
      "Eventos **publicados** dos ciclos visíveis, para a página pública da Agenda Sobrenatural. Não traz rascunhos, " +
        "ministérios nem quem criou o evento.",
      "",
      "**Quem pode:** qualquer pessoa, sem login.",
    ),
    auth: false,
    before: [publicReadRateLimit],
    responses: { 200: res.publicAgenda, 429: tooManyAttemptsResponse },
  },
  controller.publicAgenda,
);

r.get(
  "/window",
  {
    summary: "Ciclos da agenda",
    description: markdown("Ciclos visíveis, limite para marcar eventos e se a pessoa pode editar.", "", "**Quem pode:** qualquer pessoa com a conta ativa."),
    responses: { 200: res.window },
  },
  controller.window,
);

r.get(
  "/",
  {
    summary: "Listar eventos da agenda",
    description: markdown(
      "Sem `year`, devolve todos os eventos dos ciclos visíveis, em ordem de data. Rascunhos só aparecem para quem edita a agenda.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa.",
    ),
    query: listQuery,
    responses: { 200: res.agendaEventList },
  },
  controller.list,
);

r.get(
  "/:id",
  {
    summary: "Detalhar evento da agenda",
    description: "**Quem pode:** qualquer pessoa com a conta ativa.",
    params: idParams,
    responses: { 200: res.agendaEvent },
  },
  controller.getById,
);

r.post(
  "/",
  {
    summary: "Marcar evento na agenda",
    description: markdown(
      "A data não pode estar no passado nem depois do limite da agenda (veja `GET /agenda/window`).",
      "",
      editRule,
    ),
    body: createBody,
    responses: { 201: res.agendaEvent },
  },
  controller.create,
);

r.patch(
  "/:id",
  {
    summary: "Editar evento da agenda",
    description: markdown(
      "Trocar nome, descrição ou local não altera as escalas já criadas.",
      "",
      "Ao **remarcar**, as pessoas escaladas saem das escalas do evento e são avisadas. Se a nova data estiver no " +
        "período das escalas, as escalas mudam de data e voltam para rascunho; se não, são apagadas e recriadas quando " +
        "a data entrar no período.",
      "",
      "Ao **retirar um ministério**, a escala dele é apagada e quem estava escalado é avisado.",
      "",
      "Eventos que já aconteceram não podem ser alterados (409).",
      "",
      editRule,
    ),
    params: idParams,
    body: updateBody,
    responses: { 200: res.agendaEvent },
  },
  controller.update,
);

r.delete(
  "/:id",
  {
    summary: "Cancelar evento da agenda",
    description: markdown(
      "Apaga o evento e as escalas geradas por ele. Quem estava escalado é avisado.",
      "",
      "Eventos que já aconteceram não podem ser cancelados (409).",
      "",
      editRule,
    ),
    params: idParams,
    responses: { 204: null },
  },
  controller.delete,
);
