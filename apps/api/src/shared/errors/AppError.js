export class AppError extends Error {
  constructor(message, statusCode = 400, details) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message, details) {
    return new AppError(message, 400, details);
  }

  static unauthorized(message = "Não autenticado") {
    return new AppError(message, 401);
  }

  static forbidden(message = "Sem permissão para esta ação") {
    return new AppError(message, 403);
  }

  static notFound(message = "Recurso não encontrado") {
    return new AppError(message, 404);
  }

  static conflict(message, details) {
    return new AppError(message, 409, details);
  }

  static unprocessable(message, details) {
    return new AppError(message, 422, details);
  }
}
