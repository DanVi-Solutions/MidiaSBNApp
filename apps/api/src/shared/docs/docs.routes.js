import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { markdown } from "./markdown.js";
import { buildOpenApiDocument } from "./openapi.js";

const DOC_INFO = {
  title: "MídiaSBN API",
  version: "0.1.0",
  description: markdown(
    "API do sistema de escalas de voluntários dos ministérios.",
    "",
    "## Glossário",
    "| Termo na API | Significado |",
    "|---|---|",
    "| `credential` | Conta de uma pessoa (voluntário ou gestor). Não guarda dados pessoais além do nome. |",
    "| `credentialNumber` | Código de acesso da pessoa, no formato `SBN-XXXXXXXXXX`. É a única forma de entrar no sistema. |",
    "| `department` | **Ministério** (ex.: Mídia, Louvor, Recepção). |",
    "| `username` | Apelido único escolhido pela pessoa no primeiro acesso (`@fulano`). |",
    "| `session` | Um dispositivo em que a pessoa está logada. |",
    "",
    "## Papéis (`role`), do maior para o menor",
    "Cada papel pode tudo o que os papéis abaixo dele podem.",
    "1. `ADMINISTRATOR` — acesso total, não pertence a ministérios.",
    "2. `GENERAL_MANAGER` — responsável por um grupo de ministérios (pertence a um ou mais).",
    "3. `DEPARTMENT_MANAGER` — responsável por um único ministério.",
    "4. `SCHEDULER_MANAGER` — responsável pela escala do seu ministério.",
    "5. `VOLUNTEER` — participante de um ministério.",
    "",
    "Regra geral: um gestor só age sobre pessoas com papel **abaixo** do seu e que estejam em ministérios " +
      "dos quais ele participa. O administrador age sobre qualquer pessoa.",
    "",
    "## Situação da conta (`status`)",
    "| Status | Significado | O que a pessoa pode fazer |",
    "|---|---|---|",
    "| `PENDING` | Conta recém-criada; o código ainda não foi trocado. | Entrar e fazer o primeiro acesso. |",
    "| `ACTIVE` | Conta em uso normal. | Tudo o que o papel permitir. |",
    "| `RECOVERING` | Um gestor gerou um código novo porque a pessoa perdeu o acesso. | Entrar e concluir a recuperação. |",
    "| `INACTIVE` | Conta desativada. | Nada; não consegue entrar. |",
    "",
    "Enquanto a conta está `PENDING` ou `RECOVERING`, o código fica legível para o gestor copiar e enviar. " +
      "Ao concluir o primeiro acesso ou a recuperação, um **novo** código é gerado e passa a ser guardado " +
      "criptografado — ele só é exibido naquela resposta.",
    "",
    "## Como autenticar",
    "1. `POST /auth/login` com o código da credencial → recebe `accessToken` e `refreshToken`.",
    "2. Clique em **Authorize** e cole o `accessToken`. Ele vale 15 minutos.",
    "3. Quando expirar, `POST /auth/refresh` com o `refreshToken` devolve um par novo (o refresh vale 30 dias).",
    "",
    "## Erros",
    "Todo erro responde `{ \"error\": \"mensagem\", \"details\": ... }`.",
    "- `401` — não autenticado, token inválido/expirado ou sessão encerrada.",
    "- `403` — sem permissão, ou a situação da conta não permite a ação.",
    "- `404` — recurso não encontrado.",
    "- `409` — conflito com o estado atual (ex.: username em uso).",
    "- `422` — dados inválidos; `details` lista cada campo com problema.",
    "- `429` — muitas tentativas; aguarde alguns minutos.",
    "- `503` — serviço temporariamente indisponível (ex.: sistema em modo de manutenção).",
  ),
};

export const docsRoutes = Router();

let document;
const getDocument = () => (document ??= buildOpenApiDocument(DOC_INFO));

docsRoutes.get("/openapi.json", (req, res) => res.json(getDocument()));

docsRoutes.use(
  "/",
  swaggerUi.serve,
  swaggerUi.setup(null, {
    customSiteTitle: DOC_INFO.title,
    swaggerOptions: {
      url: "/docs/openapi.json",
      persistAuthorization: true,
      operationsSorter: function byHttpMethod(a, b) {
        const order = ["get", "post", "put", "patch", "delete"];
        return order.indexOf(a.get("method")) - order.indexOf(b.get("method"));
      },
    },
  }),
);
