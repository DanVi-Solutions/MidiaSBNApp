import { authService } from "./auth.service.js";

export function createAuthController(service = authService) {
  return {
    async login(req, res) {
      res.json(await service.login(req.validated.body));
    },

    async refresh(req, res) {
      res.json(await service.refresh(req.validated.body));
    },

    async logout(req, res) {
      await service.logout(req.validated.body);
      res.status(204).end();
    },

    async logoutAll(req, res) {
      await service.logoutAll(req.auth);
      res.status(204).end();
    },
  };
}
