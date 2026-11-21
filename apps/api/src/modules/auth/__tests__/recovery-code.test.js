import { describe, expect, it } from "@jest/globals";
import { hashSecret, verifySecret } from "../../../shared/auth/secretHash.js";
import { generateRecoveryCode, normalizeRecoveryCode } from "../recovery-code.js";

describe("generateRecoveryCode", () => {
  it("gera dois grupos de 5 caracteres sem ambíguos", () => {
    expect(generateRecoveryCode()).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
  });

  it("não repete códigos", () => {
    const codes = new Set(Array.from({ length: 200 }, generateRecoveryCode));
    expect(codes.size).toBe(200);
  });
});

describe("normalizeRecoveryCode", () => {
  it("ignora hífens, espaços e caixa", () => {
    expect(normalizeRecoveryCode(" abcde-23456 ")).toBe("ABCDE23456");
    expect(normalizeRecoveryCode("ABCDE 23456")).toBe("ABCDE23456");
  });
});

describe("hashSecret / verifySecret", () => {
  it("valida o segredo correto e recusa os demais", async () => {
    const stored = await hashSecret("ABCDE23456");
    expect(stored.startsWith("scrypt$")).toBe(true);
    await expect(verifySecret("ABCDE23456", stored)).resolves.toBe(true);
    await expect(verifySecret("ABCDE23457", stored)).resolves.toBe(false);
  });

  it("usa salt diferente a cada hash", async () => {
    expect(await hashSecret("mesmo")).not.toBe(await hashSecret("mesmo"));
  });

  it("recusa formato desconhecido", async () => {
    await expect(verifySecret("x", "bcrypt$abc")).resolves.toBe(false);
  });
});
