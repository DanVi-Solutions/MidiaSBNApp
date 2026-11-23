import { createDocumentedRouter } from "../../shared/docs/documentedRouter.js";
import { markdown } from "../../shared/docs/markdown.js";
import { createNotificationsController } from "./notifications.controller.js";
import * as res from "./notifications.responses.js";
import { endpointBody, endpointQuery, idParams, listQuery, subscriptionBody } from "./notifications.validation.js";

const controller = createNotificationsController();

const ownOnly = "**Quem pode:** qualquer pessoa ativa, apenas sobre as próprias notificações.";
const devicesRule = "**Quem pode:** qualquer pessoa ativa, exceto o administrador (que recebe avisos só pelo sino).";

export const notificationsRouter = createDocumentedRouter({
  prefix: "/notifications",
  tag: "Notifications",
  tagDescription: markdown(
    "Avisos do sistema para cada pessoa: o **sino** do frontend lista estas notificações.",
    "",
    "Quem não é administrador também pode receber os avisos no **dispositivo** (celular ou computador), via " +
      "Web Push: o navegador pede permissão, gera uma inscrição e o frontend a registra em " +
      "`PUT /notifications/push/subscription`. A inscrição fica presa à sessão: ao sair do sistema, ou quando a " +
      "sessão expira ou é encerrada, o dispositivo para de receber.",
    "",
    "**O que gera notificação:**",
    "- escala publicada com você, você incluído ou retirado de uma escala publicada, mudança de horário ou nome, " +
      "cancelamento;",
    "- lembrete automático 24 horas antes de cada escala (pedindo a confirmação de presença, se ainda faltar);",
    "- vagas abertas para inscrição voluntária no seu ministério;",
    "- pedidos de substituição: recebido, aceito, recusado ou cancelado;",
    "- mudança de papel ou de ministério, transferências aguardando aprovação ou recusadas;",
    "- para quem gerencia escalas: alguém do ministério informou ausência num horário em que está escalado, e a " +
      "virada do ciclo (um novo mês liberado para montar as escalas).",
    "",
    "**Limpeza automática** (a cada 15 minutos): somem as notificações lidas há mais de 15 dias, qualquer " +
      "notificação com mais de 60 dias e as ligadas a escalas que já aconteceram há mais de um dia. Quando uma " +
      "escala é apagada, as notificações dela vão junto. Avisos que perderam o sentido (ex.: pedido de " +
      "substituição cancelado) também são removidos na hora.",
  ),
});
const r = notificationsRouter;

r.get(
  "/",
  {
    summary: "Listar minhas notificações",
    description: markdown(
      "Retorna as notificações da pessoa logada, das mais recentes para as mais antigas, em páginas. Para a " +
        "próxima página, envie o `nextCursor` recebido em `cursor`.",
      "",
      "`unreadCount` traz o total de não lidas, para o número do sino.",
      "",
      ownOnly,
    ),
    query: listQuery,
    responses: { 200: res.notificationPage },
  },
  controller.list,
);

r.get(
  "/unread-count",
  {
    summary: "Contar notificações não lidas",
    description: markdown(
      "Versão leve para atualizar o número do sino periodicamente, sem baixar a lista.",
      "",
      ownOnly,
    ),
    responses: { 200: res.unreadCount },
  },
  controller.unreadCount,
);

r.get(
  "/push",
  {
    summary: "Configuração das notificações no dispositivo",
    description: markdown(
      "Informa se o servidor está pronto para enviar notificações ao dispositivo e devolve a chave pública " +
        "VAPID usada em `pushManager.subscribe()`.",
      "",
      "Para o administrador, sempre retorna `enabled: false`.",
      "",
      "**Quem pode:** qualquer pessoa ativa.",
    ),
    responses: { 200: res.pushSettings },
  },
  controller.pushSettings,
);

r.get(
  "/push/subscription",
  {
    summary: "Verificar se este dispositivo está inscrito",
    description: markdown(
      "Confere se a inscrição do navegador (`endpoint`) está registrada para a pessoa logada. Útil para a tela de " +
        "perfil mostrar se as notificações estão ativas neste dispositivo.",
      "",
      "**Quem pode:** qualquer pessoa ativa.",
    ),
    query: endpointQuery,
    responses: { 200: res.pushRegistration },
  },
  controller.pushStatus,
);

r.post(
  "/push/test",
  {
    summary: "Enviar notificação de teste",
    description: markdown(
      "Envia um aviso de teste para os dispositivos inscritos **nesta sessão**. Não aparece no sino.",
      "",
      devicesRule,
    ),
    responses: {
      200: res.pushTestResult,
      422: { description: "Este dispositivo ainda não ativou as notificações" },
      503: { description: "O servidor não tem as chaves VAPID configuradas" },
    },
  },
  controller.sendTest,
);

r.post(
  "/read-all",
  {
    summary: "Marcar todas como lidas",
    description: markdown("Marca como lidas todas as notificações não lidas da pessoa logada.", "", ownOnly),
    responses: { 200: res.updatedCount },
  },
  controller.markAllRead,
);

r.put(
  "/push/subscription",
  {
    summary: "Ativar notificações neste dispositivo",
    description: markdown(
      "Registra a inscrição Web Push do navegador para a pessoa logada, ligada à sessão atual. Envie o resultado de " +
        "`subscription.toJSON()` (apenas `endpoint` e `keys`).",
      "",
      "Se o mesmo navegador já estava inscrito (inclusive por outra conta), a inscrição passa para quem está logado " +
        "agora. Chame de novo após cada login para religar o dispositivo à nova sessão.",
      "",
      devicesRule,
    ),
    body: subscriptionBody,
    responses: {
      200: res.pushRegistration,
      503: { description: "O servidor não tem as chaves VAPID configuradas" },
    },
  },
  controller.subscribe,
);

r.patch(
  "/:id/read",
  {
    summary: "Marcar uma notificação como lida",
    description: markdown("Marca a notificação como lida. Se já estava lida, nada muda.", "", ownOnly),
    params: idParams,
    responses: { 200: res.notification },
  },
  controller.markRead,
);

r.delete(
  "/",
  {
    summary: "Limpar todas as minhas notificações",
    description: markdown("Apaga todas as notificações da pessoa logada.", "", ownOnly),
    responses: { 200: res.deletedCount },
  },
  controller.deleteAll,
);

r.delete(
  "/push/subscription",
  {
    summary: "Desativar notificações neste dispositivo",
    description: markdown(
      "Remove a inscrição Web Push informada. O frontend também deve chamar `subscription.unsubscribe()` no " +
        "navegador. Ao sair do sistema isso acontece sozinho, pois a inscrição acompanha a sessão.",
      "",
      "**Quem pode:** qualquer pessoa ativa, apenas sobre as próprias inscrições.",
    ),
    body: endpointBody,
    responses: { 204: null },
  },
  controller.unsubscribe,
);

r.delete(
  "/:id",
  {
    summary: "Apagar uma notificação",
    description: markdown("Remove a notificação do sino.", "", ownOnly),
    params: idParams,
    responses: { 204: null },
  },
  controller.delete,
);
