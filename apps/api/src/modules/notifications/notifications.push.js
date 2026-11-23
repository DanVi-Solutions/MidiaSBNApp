import webpush from "web-push";
import { env } from "../../config/env.js";

const isConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);

if (isConfigured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

const EXPIRED_SUBSCRIPTION_STATUSES = new Set([404, 410]);
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

export const pushConfig = Object.freeze({
  enabled: isConfigured,
  publicKey: isConfigured ? env.VAPID_PUBLIC_KEY : null,
});

export const DELIVERY = Object.freeze({ SENT: "SENT", EXPIRED: "EXPIRED", FAILED: "FAILED" });

export async function sendPush(subscription, payload) {
  if (!isConfigured) return DELIVERY.FAILED;
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { TTL: ONE_DAY_IN_SECONDS },
    );
    return DELIVERY.SENT;
  } catch (error) {
    if (EXPIRED_SUBSCRIPTION_STATUSES.has(error.statusCode)) return DELIVERY.EXPIRED;
    console.error("Falha ao enviar notificação push", error.statusCode ?? error.message);
    return DELIVERY.FAILED;
  }
}
