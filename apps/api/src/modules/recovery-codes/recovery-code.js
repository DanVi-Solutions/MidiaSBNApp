import { randomFromAlphabet } from "../credentials/credential-number.js";

export const RECOVERY_CODE_COUNT = 8;
const GROUP_LENGTH = 5;

export function generateRecoveryCode() {
  const code = randomFromAlphabet(GROUP_LENGTH * 2);
  return `${code.slice(0, GROUP_LENGTH)}-${code.slice(GROUP_LENGTH)}`;
}

export const normalizeRecoveryCode = (code) => code.replace(/[\s-]/g, "").toUpperCase();
