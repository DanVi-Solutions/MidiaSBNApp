import { z } from "zod";

function isValidTimeZone(timeZone) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa ter pelo menos 32 caracteres"),
  CREDENTIAL_NUMBER_SECRET: z
    .string()
    .min(32, "CREDENTIAL_NUMBER_SECRET precisa ter pelo menos 32 caracteres"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  APP_TIME_ZONE: z
    .string()
    .default("America/Sao_Paulo")
    .refine(isValidTimeZone, "APP_TIME_ZONE precisa ser um fuso IANA válido (ex.: America/Sao_Paulo)"),
  DOCS_ENABLED: z.stringbool().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:|https:\/\/)/, "VAPID_SUBJECT precisa começar com mailto: ou https://")
    .optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Variáveis de ambiente inválidas:\n${issues.join("\n")}`);
}

export const env = {
  ...parsed.data,
  DOCS_ENABLED: parsed.data.DOCS_ENABLED ?? parsed.data.NODE_ENV !== "production",
};
