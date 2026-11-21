import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa ter pelo menos 32 caracteres"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DOCS_ENABLED: z.stringbool().optional(),
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
