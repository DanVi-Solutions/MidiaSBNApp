import { schedulesService } from "./schedules.service.js";

export function createSchedulesController(service = schedulesService) {
  return {
    window(req, res) {
      res.json(service.window());
    },

    async list(req, res) {
      res.json(await service.list(req.auth, req.validated.query));
    },

    async listMine(req, res) {
      res.json(await service.listMine(req.auth, req.validated.query));
    },

    async getById(req, res) {
      res.json(await service.getById(req.auth, req.validated.params.id));
    },

    async availableCredentials(req, res) {
      res.json(await service.availableCredentials(req.auth, req.validated.params.id));
    },

    async create(req, res) {
      res.status(201).json(await service.create(req.auth, req.validated.body));
    },

    async assign(req, res) {
      res.status(201).json(await service.assign(req.auth, req.validated.params.id, req.validated.body.credentialId));
    },

    async update(req, res) {
      res.json(await service.update(req.auth, req.validated.params.id, req.validated.body));
    },

    async delete(req, res) {
      await service.delete(req.auth, req.validated.params.id);
      res.status(204).end();
    },

    async unassign(req, res) {
      const { id, credentialId } = req.validated.params;
      await service.unassign(req.auth, id, credentialId);
      res.status(204).end();
    },
  };
}
