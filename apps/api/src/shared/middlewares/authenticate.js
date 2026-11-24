import { credentialsRepository } from "../../modules/credentials/credentials.repository.js";
import { sessionsRepository } from "../../modules/sessions/sessions.repository.js";
import { createMaintenanceError, systemService } from "../../modules/system/system.service.js";
import { isDeveloper } from "../auth/roles.js";
import { verifyAccessToken } from "../auth/tokens.js";
import { AppError } from "../errors/AppError.js";

export async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) throw AppError.unauthorized();

  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    throw AppError.unauthorized("Token inválido ou expirado");
  }

  const [credential, sessionIsOpen] = await Promise.all([
    credentialsRepository.findAuthById(payload.sub),
    payload.sid ? sessionsRepository.isOpen(payload.sid, payload.sub) : false,
  ]);
  if (!credential) throw AppError.unauthorized("Credencial não encontrada");
  if (!sessionIsOpen) throw AppError.unauthorized("Sessão encerrada");
  if (credential.status === "INACTIVE") throw AppError.forbidden("Credencial inativa");
  if (!isDeveloper(credential) && (await systemService.isMaintenanceMode())) {
    throw createMaintenanceError();
  }

  req.auth = { ...credential, sessionId: payload.sid };
  next();
}

const STATUS_BLOCKED_MESSAGE = {
  PENDING: "Conclua o primeiro acesso antes de continuar",
  RECOVERING: "Conclua a recuperação de acesso antes de continuar",
};

export function requireStatus(...statuses) {
  return (req, res, next) => {
    if (!statuses.includes(req.auth.status)) {
      throw AppError.forbidden(STATUS_BLOCKED_MESSAGE[req.auth.status] ?? "Status da credencial não permite esta ação");
    }
    next();
  };
}

export const requireActive = requireStatus("ACTIVE");
