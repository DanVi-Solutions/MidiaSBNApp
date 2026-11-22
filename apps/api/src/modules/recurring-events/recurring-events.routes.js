import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createRecurringEventsController } from "./recurring-events.controller.js";
import * as res from "./recurring-events.responses.js";
import { applyBody, createBody, idParams, updateBody } from "./recurring-events.validation.js";

const controller = createRecurringEventsController();

const manageRule = markdown(
  "**Quem pode:**",
  "- evento geral: general manager ou o administrador;",
  "- evento de um ministério: o administrador, ou scheduler manager ou acima que participe do ministério.",
);

export const recurringEventsRouter = createDocumentedRouter({
  prefix: "/recurring-events",
  tag: "Recurring events",
  tagDescription: markdown(
    "**Eventos recorrentes**: modelos de eventos que se repetem toda semana (ex.: culto de domingo às 08:00, " +
      "10:00 e 18:00; culto de jovens aos sábados).",
    "",
    "Um evento pode ser **geral** (`departmentId` nulo, vale para todos os ministérios) ou de **um ministério**. " +
      "O botão \"Utilizar Evento Recorrente\" corresponde a `POST /recurring-events/{id}/apply`, que gera as " +
      "escalas do mês a partir do modelo.",
  ),
});
const r = recurringEventsRouter;

r.get(
  "/",
  {
    summary: "Listar eventos recorrentes",
    description: markdown(
      "Lista os eventos gerais e os dos ministérios dos quais a pessoa participa (administrador: todos), " +
        "ordenados por dia da semana.",
      "",
      "**Quem pode:** scheduler manager ou acima.",
    ),
    responses: { 200: res.recurringEventList },
  },
  controller.list,
);

r.get(
  "/:id",
  {
    summary: "Detalhar evento recorrente",
    description: "**Quem pode:** scheduler manager ou acima (eventos de ministério: só quem participa dele).",
    params: idParams,
    responses: { 200: res.recurringEvent },
  },
  controller.getById,
);

r.post(
  "/",
  {
    summary: "Criar evento recorrente",
    description: markdown("Cadastra o modelo. Nenhuma escala é criada até ele ser utilizado (`/apply`).", "", manageRule),
    body: createBody,
    responses: { 201: res.recurringEvent },
  },
  controller.create,
);

r.post(
  "/:id/apply",
  {
    summary: "Utilizar evento recorrente (gerar escalas do período liberado)",
    description: markdown(
      "Gera uma escala para cada ocorrência do evento (dia da semana do evento × horário) dentro do **período " +
        "liberado** para escalas — de agora até o 1º domingo do segundo mês seguinte (veja `GET /schedules/window`). " +
        "Informe `month` para gerar só um mês. Ocorrências fora do período são ignoradas e contadas em `outsideWindow`.",
      "",
      "- **Evento de um ministério:** gera as escalas desse ministério.",
      "- **Evento geral:** gera uma escala para cada ministério em `departmentIds` (padrão: todos os que você " +
        "gerencia; administrador: todos os ministérios).",
      "",
      "As escalas nascem **não publicadas** e sem pessoas. Pode ser chamado de novo sem duplicar: escalas que já " +
        "existem no mesmo ministério e horário são contadas em `skipped`.",
      "",
      "**Quem pode:** o administrador, ou scheduler manager ou acima, apenas para ministérios dos quais participa.",
    ),
    params: idParams,
    body: applyBody,
    responses: { 201: res.applied },
  },
  controller.apply,
);

r.patch(
  "/:id",
  {
    summary: "Editar evento recorrente",
    description: markdown(
      "Altera nome, descrição, dia da semana ou horários. O ministério do evento não pode ser trocado. Escalas já " +
        "geradas não mudam.",
      "",
      manageRule,
    ),
    params: idParams,
    body: updateBody,
    responses: { 200: res.recurringEvent },
  },
  controller.update,
);

r.delete(
  "/:id",
  {
    summary: "Excluir evento recorrente",
    description: markdown("Remove o modelo. As escalas já geradas por ele continuam existindo.", "", manageRule),
    params: idParams,
    responses: { 204: null },
  },
  controller.delete,
);
