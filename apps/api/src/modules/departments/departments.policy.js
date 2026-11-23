import { isAdmin } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";

export function assertIsAdmin(actor) {
  if (!isAdmin(actor)) throw AppError.forbidden("Apenas o administrador pode fazer esta ação");
}

export function assertCanUpdate(actor) {
  assertIsAdmin(actor);
}
