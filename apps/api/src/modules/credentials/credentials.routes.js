import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createCredentialsController } from "./credentials.controller.js";
import * as res from "./credentials.responses.js";
import {
  changeRoleBody,
  changeStatusBody,
  completeRecoveryBody,
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

const managesTarget =
  "papel abaixo do seu e participa de ao menos um ministério (`department`) em comum com você";

export const credentialsRouter = createDocumentedRouter({
  prefix: "/credentials",
  tag: "Credentials",
  tagDescription: markdown(
    "**Credenciais**: as contas das pessoas (voluntários e gestores).",
    "",
    "**Ciclo de vida do código de acesso:**",
    "1. O gestor cria a credencial → recebe o código e o envia à pessoa (status `PENDING`).",
    "2. A pessoa entra e faz o primeiro acesso → recebe um código **novo**, que passa a ser guardado " +
      "criptografado (status `ACTIVE`).",
    "3. Se a pessoa esquecer o código, um gestor gera outro e envia (status `RECOVERING`).",
    "4. A pessoa entra com ele e conclui a recuperação → recebe um código **novo**, criptografado (status `ACTIVE`).",
    "",
    "Código criptografado não pode ser consultado por ninguém: ele só aparece na resposta que o gerou.",
  ),
});
const r = credentialsRouter;

r.get(
  "/",
  {
    summary: "Listar credenciais",
    description: markdown(
      "Retorna as pessoas visíveis para quem está logado, em ordem alfabética. Nunca inclui o código de acesso.",
      "",
      "**Quem pode e o que vê:**",
      "- administrador: todas as pessoas;",
      "- demais papéis (inclusive voluntário): as pessoas dos ministérios dos quais participa (exceto administradores).",
      "",
      "Para listar os membros de um único ministério, use `GET /departments/{id}/credentials`.",
    ),
    responses: { 200: res.credentialList },
  },
  controller.list,
);

r.get(
  "/me",
  {
    summary: "Meus dados",
    description: markdown(
      "Retorna a conta da pessoa logada, com papel, situação e ministérios.",
      "",
      "`credentialNumber` vem preenchido apenas enquanto a conta está `PENDING` ou `RECOVERING` (o código ainda " +
        "não foi criptografado). Com a conta `ACTIVE`, vem `null`.",
      "",
      "**Quem pode:** qualquer pessoa logada, inclusive com o primeiro acesso ou a recuperação pendentes.",
    ),
    statuses: null,
    responses: { 200: res.credentialWithOptionalNumber },
  },
  controller.getMe,
);

r.get(
  "/username-availability",
  {
    summary: "Verificar se um username está livre",
    description: markdown(
      "Use na tela de primeiro acesso ou de edição de perfil, antes de enviar o formulário. O username da " +
        "própria pessoa conta como livre.",
      "",
      "**Quem pode:** qualquer pessoa logada.",
    ),
    statuses: null,
    query: usernameQuery,
    responses: { 200: res.usernameAvailability },
  },
  controller.usernameAvailability,
);

r.get(
  "/transfers",
  {
    summary: "Listar trocas de ministério aguardando minha aprovação",
    description: markdown(
      "Funciona como a caixa de notificações de transferências: lista os pedidos de troca de ministério que " +
        "a pessoa logada pode aprovar ou recusar.",
      "",
      "**Quem pode e o que vê:**",
      "- general manager: pedidos cujo ministério de destino é um dos seus;",
      "- administrador: todos os pedidos.",
    ),
    responses: { 200: res.transferList },
  },
  controller.listTransfers,
);

r.get(
  "/:id",
  {
    summary: "Detalhar uma credencial",
    description: markdown(
      "Retorna os dados da pessoa, seus ministérios e o pedido de troca de ministério pendente, se houver.",
      "",
      "Para department manager ou acima que gerencia a pessoa, inclui `credentialNumber` enquanto a conta está " +
        "`PENDING` ou `RECOVERING` — assim o gestor pode copiar o código de novo e reenviar.",
      "",
      "**Quem pode:**",
      "- a própria pessoa;",
      "- o administrador;",
      "- qualquer pessoa ativa que participe de um ministério em comum com o alvo (desde que o alvo não seja administrador).",
    ),
    params: idParams,
    responses: { 200: res.credentialWithOptionalNumber },
  },
  controller.getById,
);

r.post(
  "/",
  {
    summary: "Criar credencial",
    description: markdown(
      "Cadastra uma pessoa só com o nome, o papel e os ministérios. O sistema gera o código de acesso " +
        "(`credentialNumber`), que vem na resposta para o gestor enviar à pessoa. A conta nasce `PENDING`.",
      "",
      "**Quem pode criar o quê:**",
      "| Quem cria | Papéis permitidos | Ministérios |",
      "|---|---|---|",
      "| Administrador | Todos | Administrador: nenhum. General manager: um ou mais. Demais: exatamente um. |",
      "| General manager | General manager ou abaixo | Somente ministérios dos quais participa. General manager: um ou mais. Demais: exatamente um. |",
      "| Department manager | Scheduler manager ou voluntário | Exatamente um, o seu. |",
      "| Scheduler manager e voluntário | Nenhum | — |",
    ),
    body: createBody,
    responses: { 201: res.credentialWithNumber },
  },
  controller.create,
);

r.post(
  "/me/prepare-code",
  {
    summary: "Pré-gerar novo código definitivo",
    description: markdown(
      "Gera um novo `credentialNumber` e um `activationToken` assinado para exibição ao usuário antes de substituir " +
        "o código temporário no banco. A conta permanece `PENDING` ou `RECOVERING` até a conclusão.",
      "",
      "**Quem pode:** a própria pessoa, com a conta `PENDING` ou `RECOVERING`.",
    ),
    statuses: ["PENDING", "RECOVERING"],
    responses: { 200: res.preparedCode },
  },
  controller.prepareCode,
);

r.post(
  "/me/first-access",
  {
    summary: "Fazer o primeiro acesso",
    description: markdown(
      "Primeira coisa que a pessoa faz depois de entrar com o código recebido do gestor:",
      "1. escolhe o `username` (e pode corrigir o nome);",
      "2. a conta passa de `PENDING` para `ACTIVE`;",
      "3. o sistema grava criptografado o código pré-gerado (via `activationToken`) ou gera um **código de acesso novo**, devolvido nesta resposta.",
      "",
      "⚠️ Mostre o novo `credentialNumber` para a pessoa copiar: depois de ativada, a credencial **não pode ser consultada novamente**. O código " +
        "antigo deixa de funcionar. A sessão atual continua válida.",
      "",
      "**Quem pode:** a própria pessoa, com a conta `PENDING`.",
    ),
    statuses: ["PENDING"],
    body: firstAccessBody,
    responses: { 200: res.credentialWithNumber, 409: { description: "Username já está em uso" } },
  },
  controller.firstAccess,
);

r.post(
  "/me/complete-recovery",
  {
    summary: "Concluir a recuperação de acesso",
    description: markdown(
      "Para quem perdeu o código e entrou com o código temporário gerado por um gestor (conta `RECOVERING`):",
      "1. a conta volta para `ACTIVE`;",
      "2. o sistema grava criptografado o código pré-gerado (via `activationToken`) ou gera um **código de acesso novo**, devolvido nesta resposta.",
      "",
      "⚠️ Mostre o novo `credentialNumber` para a pessoa copiar: depois de concluída, a credencial **não pode ser consultada novamente**. O código " +
        "temporário deixa de funcionar. A sessão atual continua válida.",
      "",
      "**Quem pode:** a própria pessoa, com a conta `RECOVERING`.",
    ),
    statuses: ["RECOVERING"],
    body: completeRecoveryBody,
    responses: { 200: res.credentialWithNumber },
  },
  controller.completeRecovery,
);

r.post(
  "/transfers/:transferId/approve",
  {
    summary: "Aprovar troca de ministério",
    description: markdown(
      "Efetiva o pedido: a pessoa sai do ministério de origem e entra no de destino, e o pedido é apagado. " +
        "A resposta traz a pessoa já no ministério novo.",
      "",
      "**Quem pode:** general manager do ministério de destino, ou o administrador.",
    ),
    params: transferIdParams,
    responses: { 200: res.transferReviewed },
  },
  controller.approveTransfer,
);

r.post(
  "/transfers/:transferId/reject",
  {
    summary: "Recusar troca de ministério",
    description: markdown(
      "Apaga o pedido. A pessoa continua no ministério de origem.",
      "",
      "**Quem pode:** general manager do ministério de destino, ou o administrador.",
    ),
    params: transferIdParams,
    responses: { 200: res.transferReviewed },
  },
  controller.rejectTransfer,
);

r.post(
  "/:id/credential-number",
  {
    summary: "Gerar um novo código de acesso",
    description: markdown(
      "Gera um código novo e **desconecta a pessoa de todos os dispositivos**. O código anterior deixa de funcionar.",
      "",
      "**Gestor gerando para outra pessoa (recuperação de acesso):** use quando a pessoa esqueceu o código. O " +
        "código novo vem na resposta para o gestor enviar, e a conta passa a `RECOVERING` (ou continua " +
        "`PENDING`, se ela ainda não fez o primeiro acesso). Enquanto isso, o gestor pode copiá-lo de novo em " +
        "`GET /credentials/{id}`.",
      "",
      "**Pessoa trocando o próprio código:** o código novo já nasce criptografado, e a resposta traz uma sessão " +
        "nova (`accessToken` e `refreshToken`) para ela continuar logada neste dispositivo.",
      "",
      "**Quem pode:**",
      "- a própria pessoa;",
      `- department manager ou acima, sobre quem tem ${managesTarget};`,
      "- o administrador, sobre qualquer pessoa.",
      "",
      "Não funciona para contas desativadas: reative a conta, que já gera um código.",
    ),
    params: idParams,
    responses: {
      200: res.regeneratedNumber,
      409: { description: "Conta desativada" },
    },
  },
  controller.regenerateCredentialNumber,
);

r.post(
  "/:id/transfer",
  {
    summary: "Trocar uma pessoa de ministério",
    description: markdown(
      "Move a pessoa do ministério `fromDepartmentId` para o `toDepartmentId`.",
      "",
      "- **Destino também é um ministério seu:** a troca acontece na hora (200).",
      "- **Destino é de outro general manager:** vira um pedido (202), que aparece em `GET /credentials/transfers` " +
        "para os general managers do destino aprovarem ou recusarem. Enquanto isso, a pessoa continua na origem.",
      "",
      "Cada pessoa só pode ter um pedido pendente por vez.",
      "",
      "**Quem pode:**",
      `- general manager, sobre quem tem ${managesTarget}, partindo de um ministério seu;`,
      "- o administrador (a troca é sempre imediata).",
    ),
    params: idParams,
    body: transferBody,
    responses: {
      200: res.transferCompleted,
      202: { description: "Pedido criado, aguardando aprovação", schema: res.transferPending },
      409: { description: "A pessoa já está no destino ou já tem um pedido pendente" },
    },
  },
  controller.transfer,
);

r.put(
  "/:id/departments",
  {
    summary: "Definir os ministérios de uma pessoa",
    description: markdown(
      "Substitui **todos** os ministérios da pessoa pela lista enviada, na hora e sem aprovação. Um pedido de " +
        "troca pendente é cancelado.",
      "",
      "A quantidade precisa respeitar o papel: general manager com um ou mais, administrador com nenhum, demais " +
        "com exatamente um.",
      "",
      "**Quem pode:** apenas o administrador. Gestores usam `POST /credentials/{id}/transfer`.",
    ),
    params: idParams,
    body: setDepartmentsBody,
    responses: { 200: res.credential },
  },
  controller.setDepartments,
);

r.patch(
  "/me",
  {
    summary: "Editar meu nome e/ou username",
    description: markdown(
      "Envie apenas os campos que quer mudar.",
      "",
      "**Quem pode:** a própria pessoa, com a conta `ACTIVE`.",
    ),
    body: updateMeBody,
    responses: { 200: res.credential, 409: { description: "Username já está em uso" } },
  },
  controller.updateMe,
);

r.patch(
  "/:id/status",
  {
    summary: "Desativar ou reativar uma conta",
    description: markdown(
      "**`INACTIVE` (desativar):** a pessoa não consegue mais entrar e é desconectada de todos os dispositivos. " +
        "Use no lugar de excluir quando a pessoa já participou de escalas, para preservar o histórico.",
      "",
      "**`ACTIVE` (reativar):** só para contas desativadas. Gera um código temporário (na resposta, para o gestor " +
        "enviar) e deixa a conta `RECOVERING` até a pessoa entrar e concluir a recuperação.",
      "",
      "Contas `PENDING` não podem ser desativadas nem reativadas.",
      "",
      "**Quem pode:**",
      "- desativar: a própria pessoa (exceto o administrador), ou department manager ou acima sobre quem gerencia;",
      "- reativar: department manager ou acima sobre quem gerencia;",
      "- o administrador, sobre qualquer pessoa.",
    ),
    params: idParams,
    body: changeStatusBody,
    responses: {
      200: res.credentialWithOptionalNumber,
      409: { description: "A situação atual da conta não permite a mudança" },
    },
  },
  controller.changeStatus,
);

r.patch(
  "/:id/role",
  {
    summary: "Alterar o papel de uma pessoa",
    description: markdown(
      "Promove ou rebaixa a pessoa. Ao mudar para um papel que exige outra quantidade de ministérios (ex.: " +
        "general manager com vários → voluntário com um), informe `departmentIds`.",
      "",
      "**Quem pode atribuir o quê:**",
      "| Quem altera | Papéis que pode atribuir | Ministérios |",
      "|---|---|---|",
      "| Administrador | Todos | Quaisquer |",
      "| General manager | General manager ou abaixo | Somente os seus |",
      "| Department manager | Scheduler manager ou voluntário | O seu |",
      "",
      `Só vale para quem tem ${managesTarget}. Ninguém altera o próprio papel.`,
    ),
    params: idParams,
    body: changeRoleBody,
    responses: { 200: res.credential },
  },
  controller.changeRole,
);

r.delete(
  "/:id",
  {
    summary: "Excluir uma conta",
    description: markdown(
      "Remove a conta definitivamente, com seus ministérios, sessões e disponibilidades.",
      "",
      "Se a pessoa já participou de alguma escala, a exclusão é recusada (409) para preservar o histórico: " +
        "desative a conta em `PATCH /credentials/{id}/status`.",
      "",
      "**Quem pode:**",
      "- a própria pessoa, exceto o administrador;",
      `- department manager ou acima, sobre quem tem ${managesTarget};`,
      "- o administrador, sobre qualquer pessoa.",
    ),
    params: idParams,
    responses: {
      204: null,
      409: { description: "A pessoa participa de escalas; desative a conta em vez de excluir" },
    },
  },
  controller.delete,
);
