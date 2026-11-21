import { recoveryCodesService } from "./recovery-codes.service.js";

export function createRecoveryCodesController(service = recoveryCodesService) {
  return {
    async remaining(req, res) {
      res.json(await service.remaining(req.auth));
    },

    async remainingOf(req, res) {
      res.json(await service.remainingOf(req.auth, req.validated.params.credentialId));
    },

    async generate(req, res) {
      res.status(201).json(await service.generate(req.auth));
    },

    async recover(req, res) {
      res.json(await service.recover(req.validated.body));
    },

    async revoke(req, res) {
      await service.revoke(req.auth);
      res.status(204).end();
    },

    async revokeOf(req, res) {
      await service.revokeOf(req.auth, req.validated.params.credentialId);
      res.status(204).end();
    },
  };
}
