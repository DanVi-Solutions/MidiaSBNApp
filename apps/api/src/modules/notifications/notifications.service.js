import { isAdmin } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";
import { pushTestMessage } from "./notifications.messages.js";
import { notifier as defaultNotifier } from "./notifications.notifier.js";
import { pushConfig } from "./notifications.push.js";
import { notificationsRepository } from "./notifications.repository.js";
import { pushSubscriptionsRepository } from "./push-subscriptions.repository.js";

const NOT_FOUND = "Notificação não encontrada";

function assertCanReceivePush(auth) {
  if (isAdmin(auth)) {
    throw AppError.forbidden("O administrador recebe as notificações apenas pelo sino do sistema");
  }
}

function assertPushEnabled() {
  if (!pushConfig.enabled) {
    throw new AppError("As notificações no dispositivo ainda não foram configuradas no servidor", 503);
  }
}

export function createNotificationsService({
  repository = notificationsRepository,
  subscriptions = pushSubscriptionsRepository,
  notifier = defaultNotifier,
} = {}) {
  return {
    async list(auth, { cursor, limit }) {
      if (cursor && !(await repository.belongsTo(cursor, auth.id))) throw AppError.notFound(NOT_FOUND);

      const [items, unreadCount] = await Promise.all([
        repository.list(auth.id, { cursor, limit: limit + 1 }),
        repository.countUnread(auth.id),
      ]);
      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, limit) : items;
      return { items: page, nextCursor: hasMore ? page.at(-1).id : null, unreadCount };
    },

    async unreadCount(auth) {
      return { unreadCount: await repository.countUnread(auth.id) };
    },

    async markRead(auth, id) {
      const notification = await repository.markRead(id, auth.id);
      if (!notification) throw AppError.notFound(NOT_FOUND);
      return notification;
    },

    async markAllRead(auth) {
      return { updated: await repository.markAllRead(auth.id) };
    },

    async delete(auth, id) {
      if (!(await repository.delete(id, auth.id))) throw AppError.notFound(NOT_FOUND);
    },

    async deleteAll(auth) {
      return { deleted: await repository.deleteAll(auth.id) };
    },

    pushSettings(auth) {
      return { enabled: pushConfig.enabled && !isAdmin(auth), publicKey: isAdmin(auth) ? null : pushConfig.publicKey };
    },

    async pushStatus(auth, { endpoint }) {
      return { registered: !isAdmin(auth) && (await subscriptions.isRegistered(endpoint, auth.id)) };
    },

    async subscribe(auth, { endpoint, keys }) {
      assertCanReceivePush(auth);
      assertPushEnabled();
      await subscriptions.upsert({
        credentialId: auth.id,
        sessionId: auth.sessionId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });
      return { registered: true };
    },

    async unsubscribe(auth, { endpoint }) {
      await subscriptions.deleteOwned(endpoint, auth.id);
    },

    async sendTest(auth) {
      assertCanReceivePush(auth);
      assertPushEnabled();
      const devices = await subscriptions.findOfSession(auth.sessionId);
      if (devices.length === 0) {
        throw AppError.unprocessable("Ative as notificações neste dispositivo antes de enviar um teste");
      }
      const payload = { id: null, type: "TEST", ...pushTestMessage, url: pushTestMessage.link };
      const delivered = await notifier.deliver(devices.map((subscription) => ({ subscription, payload })));
      return { delivered };
    },
  };
}

export const notificationsService = createNotificationsService();
