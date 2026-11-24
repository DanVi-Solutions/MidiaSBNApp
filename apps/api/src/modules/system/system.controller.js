import { systemService } from "./system.service.js";

export function createSystemController(service = systemService) {
  return {
    async getStatus(req, res) {
      res.json(await service.getStatus());
    },

    async getConfig(req, res) {
      res.json(await service.getConfig(req.auth));
    },

    async updateConfig(req, res) {
      res.json(await service.updateConfig(req.auth, req.validated.body));
    },
  };
}
