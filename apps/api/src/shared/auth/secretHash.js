import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const PARAMS = { N: 2 ** 14, r: 8, p: 1 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

async function derive(secret, salt, { N, r, p }) {
  return scryptAsync(secret, salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r });
}

export async function hashSecret(secret) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(secret, salt, PARAMS);
  const { N, r, p } = PARAMS;
  return ["scrypt", N, r, p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifySecret(secret, stored) {
  const [algorithm, N, r, p, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt") return false;

  const expectedKey = Buffer.from(expected, "base64url");
  const key = await derive(secret, Buffer.from(salt, "base64url"), { N: +N, r: +r, p: +p });
  return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
}
