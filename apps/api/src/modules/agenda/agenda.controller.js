import { agendaService } from "./agenda.service.js";

export function createAgendaController(service = agendaService) {
  return {
    window(req, res) {
      res.json(service.window(req.auth));
    },

    async publicAgenda(req, res) {
      res.set("Cache-Control", "public, max-age=60");
      res.json(await service.publicAgenda());
    },

    async list(req, res) {
      res.json(await service.list(req.auth, req.validated.query));
    },

    async getById(req, res) {
      res.json(await service.getById(req.auth, req.validated.params.id));
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
