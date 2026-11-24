import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createSystemController } from "./system.controller.js";
import * as res from "./system.responses.js";
import { updateSystemConfigBody } from "./system.validation.js";

const controller = createSystemController();

export const systemRouter = createDocumentedRouter({
  prefix: "/system",
  tag: "System",
  tagDescription: markdown(
    "Status operacional e configurações globais do sistema.",
    "",
    "A consulta pública `/system/status` informa se o sistema está em manutenção. As rotas `/system/config` " +
      "são restritas à conta `DEVELOPER`.",
  ),
});
const r = systemRouter;

r.get(
  "/status",
  {
    summary: "Consultar status do sistema",
    description: markdown("Informa se o modo de manutenção está ativo. Rota pública usada pela tela de acesso."),
    auth: false,
    responses: { 200: res.systemStatus },
  },
  controller.getStatus,
);

r.get(
  "/config",
  {
    summary: "Consultar configurações do sistema",
    description: markdown("Retorna o estado atual do modo de manutenção e a data da última alteração."),
    responses: { 200: res.systemConfig },
  },
  controller.getConfig,
);

r.patch(
  "/config",
  {
    summary: "Atualizar configurações do sistema",
    description: markdown("Liga ou desliga o modo de manutenção global do sistema."),
    body: updateSystemConfigBody,
    responses: { 200: res.systemConfig },
  },
  controller.updateConfig,
);
