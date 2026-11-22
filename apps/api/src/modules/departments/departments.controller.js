import { departmentsService } from "./departments.service.js";

export function createDepartmentsController(service = departmentsService) {
  return {
    async list(req, res) {
      res.json(await service.list());
    },

    async listMine(req, res) {
      res.json(await service.listMine(req.auth));
    },

    async listOf(req, res) {
      res.json(await service.listOf(req.auth, req.validated.params.credentialId));
    },

    async getById(req, res) {
      res.json(await service.getById(req.validated.params.id));
    },

    async listMembers(req, res) {
      res.json(await service.listMembers(req.auth, req.validated.params.id));
    },

    async create(req, res) {
      res.status(201).json(await service.create(req.auth, req.validated.body));
    },

    async update(req, res) {
      res.json(await service.update(req.auth, req.validated.params.id, req.validated.body));
    },

    async delete(req, res) {
      await service.delete(req.auth, req.validated.params.id);
      res.status(204).end();
    },
  };
}
