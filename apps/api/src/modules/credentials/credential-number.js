import { randomInt } from "node:crypto";
import { isUniqueViolationOn } from "../../shared/errors/prismaErrors.js";

const UNAMBIGUOUS_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 10;
const MAX_COLLISION_ATTEMPTS = 5;

function randomFromAlphabet(length) {
  let code = "";
  for (let i = 0; i < length; i++) code += UNAMBIGUOUS_ALPHABET[randomInt(UNAMBIGUOUS_ALPHABET.length)];
  return code;
}

export function generateCredentialNumber(role) {
  const prefix = role === "DEVELOPER" ? "DEV" : "SBN";
  return `${prefix}-${randomFromAlphabet(LENGTH)}`;
}

export async function retryOnCredentialNumberCollision(operation, generate = generateCredentialNumber) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation(generate());
    } catch (error) {
      const canRetry = isUniqueViolationOn(error, "credential_number") && attempt < MAX_COLLISION_ATTEMPTS;
      if (!canRetry) throw error;
    }
  }
}
