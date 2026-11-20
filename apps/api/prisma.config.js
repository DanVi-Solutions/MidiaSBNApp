import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// O Prisma 7 não carrega o .env sozinho.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // A CLI (migrate, studio) usa a conexão DIRETA do Supabase, sem pooler.
    url: process.env.DIRECT_URL,
  },
});
