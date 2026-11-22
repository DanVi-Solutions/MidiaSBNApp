import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { credentialList } from "../credentials/credentials.responses.js";
import { createDepartmentsController } from "./departments.controller.js";
import * as res from "./departments.responses.js";
import { createBody, credentialIdParams, idParams, updateBody } from "./departments.validation.js";

const controller = createDepartmentsController();

export const departmentsRouter = createDocumentedRouter({
  prefix: "/departments",
  tag: "Departments",
  tagDescription: markdown(
    "**Ministérios** (`department`): os grupos de serviço da igreja, como Mídia, Louvor e Recepção.",
    "",
    "Toda pessoa (exceto o administrador) pertence a ministérios: o general manager a um ou mais, os demais a " +
      "exatamente um. Cada ministério tem as próprias escalas.",
  ),
});
const r = departmentsRouter;

r.get(
  "/",
  {
    summary: "Listar todos os ministérios",
    description: markdown(
      "Retorna todos os ministérios cadastrados, em ordem alfabética, com a quantidade de membros de cada um.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa.",
    ),
    responses: { 200: res.departmentList },
  },
  controller.list,
);

r.get(
  "/me",
  {
    summary: "Listar os meus ministérios",
    description: markdown(
      "Retorna os ministérios dos quais a pessoa logada participa. Transferências ainda não aprovadas não entram.",
      "",
      "O administrador não pertence a ministérios, então recebe uma lista vazia.",
      "",
      "**Quem pode:** qualquer pessoa logada, inclusive com o primeiro acesso ou a recuperação pendentes.",
    ),
    statuses: null,
    responses: { 200: res.departmentList },
  },
  controller.listMine,
);

r.get(
  "/credentials/:credentialId",
  {
    summary: "Listar os ministérios de uma pessoa",
    description: markdown(
      "Retorna os ministérios dos quais a credencial informada participa.",
      "",
      "**Quem pode:**",
      "- a própria pessoa;",
      "- o administrador;",
      "- scheduler manager ou acima que participe de ao menos um ministério em comum com a pessoa.",
    ),
    params: credentialIdParams,
    responses: { 200: res.departmentList },
  },
  controller.listOf,
);

r.get(
  "/:id",
  {
    summary: "Detalhar um ministério",
    description: markdown(
      "Retorna nome, descrição e quantidade de membros do ministério.",
      "",
      "**Quem pode:** qualquer pessoa com a conta ativa.",
    ),
    params: idParams,
    responses: { 200: res.department },
  },
  controller.getById,
);

r.get(
  "/:id/credentials",
  {
    summary: "Listar os membros de um ministério",
    description: markdown(
      "Retorna as pessoas que participam do ministério, em ordem alfabética. O código da credencial nunca é " +
        "incluído nesta listagem.",
      "",
      "**Quem pode:**",
      "- o administrador, em qualquer ministério;",
      "- scheduler manager ou acima, apenas nos ministérios dos quais participa.",
    ),
    params: idParams,
    responses: { 200: credentialList },
  },
  controller.listMembers,
);

r.post(
  "/",
  {
    summary: "Criar ministério",
    description: markdown(
      "Cadastra um novo ministério, ainda sem membros. Depois, as pessoas são incluídas pela criação de " +
        "credenciais, pela troca de ministério ou pelo administrador.",
      "",
      "**Quem pode:** apenas o administrador.",
    ),
    body: createBody,
    responses: {
      201: res.department,
      409: { description: "Já existe um ministério com esse nome" },
    },
  },
  controller.create,
);

r.patch(
  "/:id",
  {
    summary: "Editar ministério",
    description: markdown(
      "Altera o nome e/ou a descrição. Envie apenas os campos que quer mudar; `description: null` apaga a descrição.",
      "",
      "**Quem pode:**",
      "- o administrador, em qualquer ministério;",
      "- department manager ou acima, apenas nos ministérios dos quais participa.",
    ),
    params: idParams,
    body: updateBody,
    responses: {
      200: res.department,
      409: { description: "Já existe um ministério com esse nome" },
    },
  },
  controller.update,
);

r.delete(
  "/:id",
  {
    summary: "Excluir ministério",
    description: markdown(
      "Remove o ministério definitivamente. Para não deixar ninguém sem ministério nem apagar histórico, a " +
        "exclusão só é permitida quando:",
      "- não há mais membros (transfira-os antes);",
      "- o ministério não tem escalas.",
      "",
      "Eventos recorrentes do ministério e pedidos de transferência para ele são apagados junto.",
      "",
      "**Quem pode:** apenas o administrador.",
    ),
    params: idParams,
    responses: {
      204: null,
      409: { description: "O ministério ainda tem membros ou possui escalas" },
    },
  },
  controller.delete,
);
