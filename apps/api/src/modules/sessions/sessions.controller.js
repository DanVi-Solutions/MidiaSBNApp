import { sessionsService } from "./sessions.service.js";

export function createSessionsController(service = sessionsService) {
  return {
    async listMine(req, res) {
      res.json(await service.listMine(req.auth));
    },

    async listOf(req, res) {
      res.json(await service.listOf(req.auth, req.validated.params.credentialId));
    },

    async endMyOthers(req, res) {
      res.json(await service.endMyOthers(req.auth));
    },

    async endMine(req, res) {
      await service.endMine(req.auth, req.validated.params.sessionId);
      res.status(204).end();
    },

    async endAllOf(req, res) {
      res.json(await service.endAllOf(req.auth, req.validated.params.credentialId));
    },
  };
}
