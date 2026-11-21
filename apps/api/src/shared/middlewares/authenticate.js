import { credentialsRepository } from "../../modules/credentials/credentials.repository.js";
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

  const credential = await credentialsRepository.findAuthById(payload.sub);
  if (!credential) throw AppError.unauthorized("Credencial não encontrada");
  if (credential.status === "INACTIVE") throw AppError.forbidden("Credencial inativa");

  req.auth = credential;
  next();
}

export function requireStatus(...statuses) {
  return (req, res, next) => {
    if (!statuses.includes(req.auth.status)) {
      throw AppError.forbidden(
        req.auth.status === "PENDING"
          ? "Conclua o primeiro acesso antes de continuar"
          : "Status da credencial não permite esta ação",
      );
    }
    next();
  };
}

export const requireActive = requireStatus("ACTIVE");
