import { createHmac } from "node:crypto";
import { env } from "../../config/env.js";

export function hashCredentialNumber(credentialNumber) {
  return createHmac("sha256", env.CREDENTIAL_NUMBER_SECRET).update(credentialNumber).digest("hex");
}
