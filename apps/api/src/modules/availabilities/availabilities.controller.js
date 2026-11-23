import { availabilitiesService } from "./availabilities.service.js";

export function createAvailabilitiesController(service = availabilitiesService) {
  return {
    async getMine(req, res) {
      res.json(await service.getMine(req.auth));
    },

    async getOf(req, res) {
      res.json(await service.getOf(req.auth, req.validated.params.credentialId));
    },

    async listDepartment(req, res) {
      res.json(await service.listDepartment(req.auth, req.validated.params.departmentId));
    },

    async getMyWorshipService(req, res) {
      res.json(await service.getMyWorshipService(req.auth));
    },

    async setMyWorshipService(req, res) {
      res.json(await service.setMyWorshipService(req.auth, req.validated.body.worshipService));
    },

    async replaceMine(req, res) {
      res.json(await service.replaceMine(req.auth, req.validated.body.days));
    },
  };
}
