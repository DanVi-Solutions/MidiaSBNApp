import { ZodError } from "zod";
import { AppError } from "./AppError.js";
import { isPrismaError } from "./prismaErrors.js";

export function errorHandler(error, req, res, _next) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message, details: error.details });
  }

  if (error instanceof ZodError) {
    return res.status(422).json({
      error: "Dados inválidos",
      details: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    });
  }

  if (isPrismaError(error, "P2002")) {
    return res.status(409).json({ error: "Já existe um registro com esses dados" });
  }

  if (isPrismaError(error, "P2025")) {
    return res.status(404).json({ error: "Recurso não encontrado" });
  }

  if (isPrismaError(error, "P2003")) {
    return res.status(409).json({ error: "Registro está vinculado a outros dados" });
  }

  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido no corpo da requisição" });
  }

  console.error(error);
  return res.status(500).json({ error: "Erro interno do servidor" });
}
