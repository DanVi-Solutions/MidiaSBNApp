import { recurringEventsService } from "./recurring-events.service.js";

export function createRecurringEventsController(service = recurringEventsService) {
  return {
    async list(req, res) {
      res.json(await service.list(req.auth));
    },

    async getById(req, res) {
      res.json(await service.getById(req.auth, req.validated.params.id));
    },

    async create(req, res) {
      res.status(201).json(await service.create(req.auth, req.validated.body));
    },

    async apply(req, res) {
      res.status(201).json(await service.apply(req.auth, req.validated.params.id, req.validated.body));
    },

    async update(req, res) {
      res.json(await service.update(req.auth, req.validated.params.id, req.validated.body));
    },

    async promote(req, res) {
      res.json(await service.promote(req.auth, req.validated.params.id));
    },

    async delete(req, res) {
      await service.delete(req.auth, req.validated.params.id);
      res.status(204).end();
    },
  };
}
