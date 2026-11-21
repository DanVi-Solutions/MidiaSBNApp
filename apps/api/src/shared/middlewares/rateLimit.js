import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function createLimiter(limit, message) {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}

export const loginRateLimit = createLimiter(10, "Muitas tentativas de login. Tente novamente em alguns minutos.");

export const recoveryRateLimit = createLimiter(5, "Muitas tentativas de recuperação. Tente novamente em alguns minutos.");
