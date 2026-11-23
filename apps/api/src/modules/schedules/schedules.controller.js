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

    async confirmPresence(req, res) {
      res.json(await service.confirmPresence(req.auth, req.validated.params.assignmentId));
    },

    async decline(req, res) {
      await service.decline(req.auth, req.validated.params.assignmentId);
      res.status(204).end();
    },

    async checkIn(req, res) {
      res.json(await service.checkIn(req.auth, req.validated.params.assignmentId));
    },

    async listOpen(req, res) {
      res.json(await service.listOpen(req.auth));
    },

    async signUp(req, res) {
      res.status(201).json(await service.signUp(req.auth, req.validated.params.id));
    },

    async withdraw(req, res) {
      await service.withdraw(req.auth, req.validated.params.id);
      res.status(204).end();
    },

    async autoAssign(req, res) {
      const result = await service.autoAssign(req.auth, req.validated.body);
      res.status(result.dryRun ? 200 : 201).json(result);
    },

    async getById(req, res) {
      res.json(await service.getById(req.auth, req.validated.params.id));
    },

    async candidatesAt(req, res) {
      res.json(await service.candidatesAt(req.auth, req.validated.query));
    },

    async replaceDeclined(req, res) {
      const { id, credentialId } = req.validated.params;
      res.json(await service.replaceDeclined(req.auth, id, credentialId, req.validated.body.credentialId));
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
