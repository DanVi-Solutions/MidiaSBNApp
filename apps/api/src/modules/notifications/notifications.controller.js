import { notificationsService } from "./notifications.service.js";

export function createNotificationsController(service = notificationsService) {
  return {
    async list(req, res) {
      res.json(await service.list(req.auth, req.validated.query));
    },

    async unreadCount(req, res) {
      res.json(await service.unreadCount(req.auth));
    },

    async markRead(req, res) {
      res.json(await service.markRead(req.auth, req.validated.params.id));
    },

    async markAllRead(req, res) {
      res.json(await service.markAllRead(req.auth));
    },

    async delete(req, res) {
      await service.delete(req.auth, req.validated.params.id);
      res.status(204).end();
    },

    async deleteAll(req, res) {
      res.json(await service.deleteAll(req.auth));
    },

    pushSettings(req, res) {
      res.json(service.pushSettings(req.auth));
    },

    async pushStatus(req, res) {
      res.json(await service.pushStatus(req.auth, req.validated.query));
    },

    async subscribe(req, res) {
      res.json(await service.subscribe(req.auth, req.validated.body));
    },

    async unsubscribe(req, res) {
      await service.unsubscribe(req.auth, req.validated.body);
      res.status(204).end();
    },

    async sendTest(req, res) {
      res.json(await service.sendTest(req.auth));
    },
  };
}
