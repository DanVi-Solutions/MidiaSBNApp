import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_DAYS = 30;

const secret = new TextEncoder().encode(env.JWT_SECRET);

export function signAccessToken(credentialId) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(credentialId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secret);
}

export async function verifyAccessToken(token) {
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  return payload;
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken() {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, tokenHash: hashToken(token), expiresAt };
}
