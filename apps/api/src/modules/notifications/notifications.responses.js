import { z } from "zod";

const notificationType = z
  .enum([
    "SCHEDULE_ASSIGNED",
    "SCHEDULE_UNASSIGNED",
    "SCHEDULE_CHANGED",
    "SCHEDULE_CANCELLED",
    "SCHEDULE_REMINDER",
    "SELF_SIGNUP_OPENED",
    "CHANGE_REQUEST_RECEIVED",
    "CHANGE_REQUEST_ACCEPTED",
    "CHANGE_REQUEST_REJECTED",
    "CHANGE_REQUEST_CANCELLED",
    "TRANSFER_REQUESTED",
    "TRANSFER_REJECTED",
    "DEPARTMENT_CHANGED",
    "ROLE_CHANGED",
    "UNAVAILABILITY_CONFLICT",
    "SCHEDULE_CYCLE_OPENED",
    "ASSIGNMENT_DECLINED",
    "PRESENCE_NOT_CONFIRMED",
  ])
  .meta({ description: "O que originou o aviso. Útil para escolher ícone ou cor no frontend." });

export const notification = z.object({
  id: z.uuid(),
  type: notificationType,
  title: z.string().meta({ example: "Você está em uma nova escala" }),
  body: z.string().meta({ example: "Culto de domingo (Mídia) — domingo, 06/12 às 19:00." }),
  link: z.string().nullable().meta({ description: "Página do frontend relacionada ao aviso.", example: "/schedule" }),
  scheduleId: z.uuid().nullable().meta({ description: "Escala relacionada, quando houver." }),
  readAt: z.iso.datetime().nullable().meta({ description: "`null` enquanto não foi lida." }),
  createdAt: z.iso.datetime(),
});

export const notificationPage = z.object({
  items: z.array(notification),
  nextCursor: z.uuid().nullable().meta({ description: "Envie em `cursor` para buscar a próxima página. `null` quando acabou." }),
  unreadCount: z.number().int().meta({ description: "Total de notificações não lidas (não só desta página)." }),
});

export const unreadCount = z.object({ unreadCount: z.number().int() });

export const updatedCount = z.object({ updated: z.number().int() });

export const deletedCount = z.object({ deleted: z.number().int() });

export const pushSettings = z.object({
  enabled: z.boolean().meta({
    description: "`false` quando o servidor não tem as chaves VAPID ou quando quem pergunta é o administrador.",
  }),
  publicKey: z.string().nullable().meta({
    description: "Chave pública VAPID para usar em `pushManager.subscribe({ applicationServerKey })`.",
  }),
});

export const pushRegistration = z.object({
  registered: z.boolean().meta({ description: "`true` se este dispositivo está recebendo notificações desta conta." }),
});

export const pushTestResult = z.object({
  delivered: z.number().int().meta({ description: "Quantos dispositivos desta sessão receberam o teste." }),
});
