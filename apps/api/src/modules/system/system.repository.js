import { prisma } from "../../config/database.js";

const DEFAULT_ID = "default";
const CACHE_TTL_MS = 2000;

let cachedConfig = null;
let cachedAt = 0;

function isTestEnv() {
  return process.env.NODE_ENV === "test";
}

function toConfig(row) {
  return {
    maintenanceMode: Boolean(row?.maintenanceMode),
    updatedAt: row?.updatedAt ?? null,
  };
}

export const systemRepository = {
  async getConfig() {
    const now = Date.now();
    if (!isTestEnv() && cachedConfig && now - cachedAt < CACHE_TTL_MS) {
      return cachedConfig;
    }

    const row = await prisma.systemConfig.findUnique({
      where: { id: DEFAULT_ID },
      select: { maintenanceMode: true, updatedAt: true },
    });

    const config = toConfig(row);
    if (!isTestEnv()) {
      cachedConfig = config;
      cachedAt = now;
    }
    return config;
  },

  async setMaintenanceMode(maintenanceMode) {
    const row = await prisma.systemConfig.upsert({
      where: { id: DEFAULT_ID },
      create: { id: DEFAULT_ID, maintenanceMode },
      update: { maintenanceMode },
      select: { maintenanceMode: true, updatedAt: true },
    });

    const config = toConfig(row);
    if (!isTestEnv()) {
      cachedConfig = config;
      cachedAt = Date.now();
    } else {
      cachedConfig = null;
      cachedAt = 0;
    }
    return config;
  },
};
