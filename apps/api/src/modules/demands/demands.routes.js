import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createDemandsController } from "./demands.controller.js";
import * as res from "./demands.responses.js";
import { candidatesQuery, createBody, idParams, listQuery, updateBody } from "./demands.validation.js";

const controller = createDemandsController();

export const demandsRouter = createDocumentedRouter({
  prefix: "/demands",
  tag: "Demands",
  tagDescription: markdown(
    "**Demandas** dos ministérios que utilizam a página de demandas (`hasDemands: true`).",
    "",
    "Demandas podem nascer sem responsáveis em `IN_PROGRESS` (com 0, 1 ou mais responsáveis e prazo a partir do dia atual), " +
      "mas só podem ser marcadas como `COMPLETED` quando houver ao menos um responsável associado.",
  ),
});
const r = demandsRouter;

r.get(
  "/",
  {
    summary: "Listar demandas",
    description: markdown(
      "Retorna as demandas dos ministérios visíveis para quem está logado.",
      "",
      "- Administrador/Desenvolvedor: todas;",
      "- Demais papéis: apenas os ministérios dos quais participa.",
    ),
    query: listQuery,
    responses: { 200: res.demandList },
  },
  controller.list,
);

r.get(
  "/candidates",
  {
    summary: "Listar pessoas elegíveis como responsáveis de demanda",
    description: markdown(
      "Retorna membros ativos do ministério que podem ser associados a uma demanda. Líderes gerais e administradores " +
        "só aparecem para auto-associação.",
    ),
    query: candidatesQuery,
    responses: { 200: res.candidateList },
  },
  controller.listCandidates,
);

r.get(
  "/:id",
  {
    summary: "Detalhar uma demanda",
    params: idParams,
    responses: { 200: res.demand },
  },
  controller.getById,
);

r.post(
  "/",
  {
    summary: "Criar demanda",
    description: markdown(
      "Cria uma demanda em `IN_PROGRESS` em um ministério com `hasDemands: true`, podendo receber 0, 1 ou mais " +
        "responsáveis e prazo opcional a partir do dia atual. Membros participantes do ministério (e administradores) " +
        "podem criar demandas.",
    ),
    body: createBody,
    responses: { 201: res.demand },
  },
  controller.create,
);

r.patch(
  "/:id",
  {
    summary: "Atualizar demanda",
    description: markdown(
      "Edita título, descrição, prazo (a partir do dia atual), responsáveis ou status (`IN_PROGRESS` / `COMPLETED`). " +
        "Voluntários editam apenas demandas que criaram ou nas quais estão como responsáveis, e apenas um dos " +
        "responsáveis atuais ou a liderança do ministério pode finalizar ou reabrir uma tarefa atribuída. Para " +
        "finalizar, é obrigatório ter ao menos um responsável associado.",
    ),
    params: idParams,
    body: updateBody,
    responses: { 200: res.demand },
  },
  controller.update,
);

r.delete(
  "/:id",
  {
    summary: "Excluir demanda",
    description: markdown(
      "Exclui permanentemente uma demanda. Permitido para quem a criou ou para a liderança do ministério " +
        "(`DEPARTMENT_MANAGER` ou acima).",
    ),
    params: idParams,
    responses: { 204: null },
  },
  controller.delete,
);
