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

    async generateRecoveryCodes(req, res) {
      res.status(201).json(await service.generateRecoveryCodes(req.auth));
    },

    async recoveryCodesStatus(req, res) {
      res.json(await service.recoveryCodesStatus(req.auth));
    },

    async recover(req, res) {
      res.json(await service.recover(req.validated.body));
    },
  };
}
