import { unavailabilitiesService } from "./unavailabilities.service.js";

export function createUnavailabilitiesController(service = unavailabilitiesService) {
  return {
    async listMine(req, res) {
      res.json(await service.listMine(req.auth, req.validated.query));
    },

    async listOf(req, res) {
      res.json(await service.listOf(req.auth, req.validated.params.credentialId, req.validated.query));
    },

    async listDepartment(req, res) {
      res.json(await service.listDepartment(req.auth, req.validated.params.departmentId, req.validated.query));
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
