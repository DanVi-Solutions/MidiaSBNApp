import { isDeveloper } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";

export function assertIsDeveloper(actor) {
  if (!isDeveloper(actor)) {
    throw AppError.forbidden("Apenas desenvolvedores podem acessar as configurações do sistema");
  }
}
