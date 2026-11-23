import { DELIVERY, sendPush } from "./notifications.push.js";
import { notificationsRepository } from "./notifications.repository.js";
import { pushSubscriptionsRepository } from "./push-subscriptions.repository.js";

const BODY_LIMIT = 255;

const fitBody = (body) => (body.length <= BODY_LIMIT ? body : `${body.slice(0, BODY_LIMIT - 1)}…`);

export const toPushPayload = (notification) => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  body: notification.body,
  url: notification.link ?? "/schedule",
});

export function createNotifier({
  repository = notificationsRepository,
  subscriptions = pushSubscriptionsRepository,
  push = sendPush,
} = {}) {
  async function deliver(pairs) {
    const results = await Promise.all(
      pairs.map(async ({ subscription, payload }) => ({ subscription, outcome: await push(subscription, payload) })),
    );
    const expiredIds = results
      .filter(({ outcome }) => outcome === DELIVERY.EXPIRED)
      .map(({ subscription }) => subscription.id);
    await subscriptions.deleteMany(expiredIds);
    return results.filter(({ outcome }) => outcome === DELIVERY.SENT).length;
  }

  async function pushToDevices(created) {
    const targets = await subscriptions.findDeliverable([...new Set(created.map((row) => row.credentialId))]);
    const pairs = created.flatMap((notification) =>
      targets
        .filter((subscription) => subscription.credentialId === notification.credentialId)
        .map((subscription) => ({ subscription, payload: toPushPayload(notification) })),
    );
    await deliver(pairs);
  }

  return {
    async send(entries, { except } = {}) {
      const rows = entries
        .filter(({ credentialId }) => credentialId && credentialId !== except)
        .map(({ credentialId, message }) => ({
          credentialId,
          type: message.type,
          title: message.title,
          body: fitBody(message.body),
          link: message.link ?? null,
          scheduleId: message.scheduleId ?? null,
        }));
      if (rows.length === 0) return [];

      try {
        const created = await repository.createMany(rows);
        pushToDevices(created).catch((error) => console.error("Falha ao distribuir notificações push", error));
        return created;
      } catch (error) {
        console.error("Falha ao registrar notificações", error);
        return [];
      }
    },

    to(credentialIds, message, options) {
      return this.send(
        [...new Set(credentialIds)].map((credentialId) => ({ credentialId, message })),
        options,
      );
    },

    async safely(task) {
      try {
        await task();
      } catch (error) {
        console.error("Falha ao preparar notificações", error);
      }
    },

    discardAboutSchedule(credentialId, scheduleId, types) {
      return this.safely(() => repository.discardAboutSchedule(credentialId, scheduleId, types));
    },

    deliver,
  };
}

export const notifier = createNotifier();
