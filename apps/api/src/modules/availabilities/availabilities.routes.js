import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createAvailabilitiesController } from "./availabilities.controller.js";
import * as res from "./availabilities.responses.js";
import {
  credentialIdParams,
  departmentIdParams,
  replaceWeekBody,
  worshipServiceBody,
} from "./availabilities.validation.js";

const controller = createAvailabilitiesController();

export const availabilitiesRouter = createDocumentedRouter({
  prefix: "/availabilities",
  tag: "Availabilities",
  tagDescription: markdown(
    "**Disponibilidade semanal**: em quais dias e períodos a pessoa costuma poder servir.",
    "",
    "Os períodos são: manhã (00:00 às 11:59), tarde (12:00 às 17:59) e noite (18:00 às 23:59), no fuso do " +
      "sistema. Para ausências pontuais (viagem, compromisso), use **Unavailabilities**.",
  ),
});
const r = availabilitiesRouter;

r.get(
  "/me",
  {
    summary: "Minha disponibilidade semanal",
    description: markdown(
      "Retorna os 7 dias da semana, de domingo a sábado, com os períodos em que a pessoa logada está disponível. " +
        "Quem nunca preencheu recebe todos os períodos como `false`.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa.",
    ),
    responses: { 200: res.week },
  },
  controller.getMine,
);

r.get(
  "/me/worship-service",
  {
    summary: "Meu horário de culto",
    description: markdown(
      "Retorna qual culto de domingo a pessoa logada frequenta. A distribuição automática evita escalar a pessoa " +
        "nesse horário, e quem monta a escala vê um aviso quando a escala coincide com ele.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa.",
    ),
    responses: { 200: res.worshipService },
  },
  controller.getMyWorshipService,
);

r.put(
  "/me/worship-service",
  {
    summary: "Informar meu horário de culto",
    description: markdown(
      "Define o culto de domingo que a pessoa logada frequenta: 08:15 às 10:00, 10:30 às 12:00 ou 18:00 às 20:00.",
      "",
      "Uma escala de domingo coincide com o culto quando começa a partir de 1 hora antes do culto e antes de ele " +
        "terminar.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa, para si mesma.",
    ),
    body: worshipServiceBody,
    responses: { 200: res.worshipService },
  },
  controller.setMyWorshipService,
);

r.get(
  "/credentials/:credentialId",
  {
    summary: "Disponibilidade semanal de uma pessoa",
    description: markdown(
      "Retorna os 7 dias da semana com os períodos em que a pessoa está disponível.",
      "",
      "**Quem pode:** a própria pessoa, o administrador, ou scheduler manager ou acima que participe de um " +
        "ministério em comum com ela.",
    ),
    params: credentialIdParams,
    responses: { 200: res.week },
  },
  controller.getOf,
);

r.get(
  "/departments/:departmentId",
  {
    summary: "Disponibilidade semanal de todo um ministério",
    description: markdown(
      "Retorna a grade semanal de cada membro do ministério (contas desativadas ficam de fora). Útil para " +
        "planejar as escalas do mês.",
      "",
      "**Quem pode:** o administrador, ou scheduler manager ou acima que participe do ministério.",
    ),
    params: departmentIdParams,
    responses: { 200: res.departmentWeeks },
  },
  controller.listDepartment,
);

r.put(
  "/me",
  {
    summary: "Salvar minha disponibilidade semanal",
    description: markdown(
      "Substitui a grade inteira da pessoa logada. Envie apenas os dias em que ela tem algum período disponível; " +
        "dias omitidos e períodos omitidos ficam como indisponíveis.",
      "",
      "Exemplo: disponível domingo de manhã e à noite, e quarta à noite:",
      "```json",
      '{ "days": [',
      '  { "weekday": "SUNDAY", "morning": true, "night": true },',
      '  { "weekday": "WEDNESDAY", "night": true }',
      "] }",
      "```",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa, para si mesma.",
    ),
    body: replaceWeekBody,
    responses: { 200: res.week },
  },
  controller.replaceMine,
);
