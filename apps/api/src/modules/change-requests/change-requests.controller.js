import { changeRequestsService } from "./change-requests.service.js";

export function createChangeRequestsController(service = changeRequestsService) {
  return {
    async listMine(req, res) {
      res.json(await service.listMine(req.auth));
    },

    async request(req, res) {
      res.status(201).json(await service.request(req.auth, req.validated.body));
    },

    async accept(req, res) {
      res.json(await service.accept(req.auth, req.validated.params.assignmentId));
    },

    async reject(req, res) {
      res.json(await service.reject(req.auth, req.validated.params.assignmentId));
    },

    async cancel(req, res) {
      await service.cancel(req.auth, req.validated.params.assignmentId);
      res.status(204).end();
    },
  };
}
