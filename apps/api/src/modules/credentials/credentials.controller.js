import { userAgentOf } from "../../shared/http/userAgent.js";
import { credentialsService } from "./credentials.service.js";

export function createCredentialsController(service = credentialsService) {
  return {
    async getMe(req, res) {
      res.json(await service.getMe(req.auth));
    },

    async firstAccess(req, res) {
      res.json(await service.firstAccess(req.auth, req.validated.body));
    },

    async completeRecovery(req, res) {
      res.json(await service.completeRecovery(req.auth));
    },

    async updateMe(req, res) {
      res.json(await service.updateMe(req.auth, req.validated.body));
    },

    async usernameAvailability(req, res) {
      res.json(await service.checkUsername(req.auth, req.validated.query.username));
    },

    async list(req, res) {
      res.json(await service.list(req.auth));
    },

    async create(req, res) {
      res.status(201).json(await service.create(req.auth, req.validated.body));
    },

    async getById(req, res) {
      res.json(await service.getById(req.auth, req.validated.params.id));
    },

    async delete(req, res) {
      await service.delete(req.auth, req.validated.params.id);
      res.status(204).end();
    },

    async changeStatus(req, res) {
      res.json(await service.changeStatus(req.auth, req.validated.params.id, req.validated.body));
    },

    async regenerateCredentialNumber(req, res) {
      const { id } = req.validated.params;
      res.json(await service.regenerateCredentialNumber(req.auth, id, { userAgent: userAgentOf(req) }));
    },

    async changeRole(req, res) {
      res.json(await service.changeRole(req.auth, req.validated.params.id, req.validated.body));
    },

    async setDepartments(req, res) {
      const { departmentIds } = req.validated.body;
      res.json(await service.setDepartments(req.auth, req.validated.params.id, departmentIds));
    },

    async transfer(req, res) {
      const result = await service.transfer(req.auth, req.validated.params.id, req.validated.body);
      res.status(result.status === "PENDING" ? 202 : 200).json(result);
    },

    async listTransfers(req, res) {
      res.json(await service.listTransfers(req.auth));
    },

    async approveTransfer(req, res) {
      res.json(await service.reviewTransfer(req.auth, req.validated.params.transferId, { approve: true }));
    },

    async rejectTransfer(req, res) {
      res.json(await service.reviewTransfer(req.auth, req.validated.params.transferId, { approve: false }));
    },
  };
}
