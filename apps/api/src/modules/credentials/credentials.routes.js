import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { createCredentialsController } from "./credentials.controller.js";
import * as res from "./credentials.responses.js";
import {
  changeRoleBody,
  changeStatusBody,
  createBody,
  firstAccessBody,
  idParams,
  setDepartmentsBody,
  transferBody,
  transferIdParams,
  updateMeBody,
  usernameQuery,
} from "./credentials.validation.js";

const controller = createCredentialsController();

export const credentialsRouter = createDocumentedRouter({ prefix: "/credentials", tag: "Credentials" });
const r = credentialsRouter;

r.get(
  "/me",
  {
    summary: "Dados da própria credencial",
    description: "Único endpoint de leitura que retorna o código da credencial.",
    statuses: null,
    responses: { 200: res.credentialWithNumber },
  },
  controller.getMe,
);

r.post(
  "/me/first-access",
  {
    summary: "Primeiro acesso",
    description: "Define o username (e opcionalmente corrige o nome). Muda o status de PENDING para ACTIVE.",
    statuses: ["PENDING"],
    body: firstAccessBody,
    responses: { 200: res.credential, 409: { description: "Username já está em uso" } },
  },
  controller.firstAccess,
);

r.patch(
  "/me",
  {
    summary: "Editar o próprio nome e/ou username",
    body: updateMeBody,
    responses: { 200: res.credential, 409: { description: "Username já está em uso" } },
  },
  controller.updateMe,
);

r.get(
  "/username-availability",
  {
    summary: "Verificar se um username está disponível",
    statuses: null,
    query: usernameQuery,
    responses: { 200: res.usernameAvailability },
  },
  controller.usernameAvailability,
);

r.get(
  "/transfers",
  {
    summary: "Transferências aguardando minha aprovação",
    description: "General manager: pedidos para os seus departamentos. Administrador: todos.",
    responses: { 200: res.transferList },
  },
  controller.listTransfers,
);

r.post(
  "/transfers/:transferId/approve",
  {
    summary: "Aprovar transferência",
    description: "Apenas general manager do departamento de destino (ou administrador).",
    params: transferIdParams,
    responses: { 200: res.transferReviewed },
  },
  controller.approveTransfer,
);

r.post(
  "/transfers/:transferId/reject",
  {
    summary: "Recusar transferência",
    description: "Apenas general manager do departamento de destino (ou administrador).",
    params: transferIdParams,
    responses: { 200: res.transferReviewed },
  },
  controller.rejectTransfer,
);

r.get(
  "/",
  {
    summary: "Listar credenciais",
    description: "Scheduler manager ou acima: credenciais dos seus departamentos. Administrador: todas.",
    responses: { 200: res.credentialList },
  },
  controller.list,
);

r.post(
  "/",
  {
    summary: "Criar credencial",
    description:
      "Gera o código da credencial e cria com status PENDING.\n\n" +
      "- **Administrador**: qualquer papel (general manager com 1+ departamentos, administrador sem departamento, demais com 1).\n" +
      "- **General manager**: até general manager, somente nos seus departamentos.\n" +
      "- **Department manager**: scheduler manager ou voluntário, no seu departamento.",
    body: createBody,
    responses: { 201: res.credentialWithNumber },
  },
  controller.create,
);

r.get(
  "/:id",
  {
    summary: "Detalhar credencial",
    params: idParams,
    responses: { 200: res.credential },
  },
  controller.getById,
);

r.delete(
  "/:id",
  {
    summary: "Excluir credencial",
    description: "O próprio usuário ou general manager+ (sobre papéis abaixo do seu, nos seus departamentos).",
    params: idParams,
    responses: {
      204: null,
      409: { description: "A credencial participa de escalas; desative-a em vez de excluir" },
    },
  },
  controller.delete,
);

r.patch(
  "/:id/status",
  {
    summary: "Desativar ou reativar credencial",
    description:
      "INACTIVE: o próprio usuário ou general manager+ (encerra todas as sessões). " +
      "ACTIVE (reativar): apenas general manager+.",
    params: idParams,
    body: changeStatusBody,
    responses: { 200: res.credential, 409: { description: "Status atual não permite a mudança" } },
  },
  controller.changeStatus,
);

r.post(
  "/:id/credential-number",
  {
    summary: "Gerar novo código de credencial",
    description:
      "O próprio usuário ou department manager+. Apaga todas as sessões; " +
      "se for o próprio usuário, devolve uma sessão nova.",
    params: idParams,
    responses: { 200: res.regeneratedNumber },
  },
  controller.regenerateCredentialNumber,
);

r.patch(
  "/:id/role",
  {
    summary: "Alterar papel",
    description:
      "Department manager: até scheduler manager. General manager: até general manager, " +
      "com departamentos que ele possui. Se `departmentIds` for omitido, mantém os atuais.",
    params: idParams,
    body: changeRoleBody,
    responses: { 200: res.credential },
  },
  controller.changeRole,
);

r.put(
  "/:id/departments",
  {
    summary: "Definir departamentos (administrador)",
    description: "Substitui todos os departamentos. General manager: 1+; demais: exatamente 1.",
    params: idParams,
    body: setDepartmentsBody,
    responses: { 200: res.credential },
  },
  controller.setDepartments,
);

r.post(
  "/:id/transfer",
  {
    summary: "Transferir de departamento",
    description:
      "General manager+. Imediata (200) se o destino também for seu departamento; " +
      "caso contrário fica pendente (202) até um general manager do destino aprovar.",
    params: idParams,
    body: transferBody,
    responses: {
      200: res.transferCompleted,
      202: { description: "Aguardando aprovação", schema: res.transferPending },
      409: { description: "Já existe uma transferência pendente" },
    },
  },
  controller.transfer,
);
