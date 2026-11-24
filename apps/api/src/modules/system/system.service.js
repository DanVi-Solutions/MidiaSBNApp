import { AppError } from "../../shared/errors/AppError.js";
import { assertIsDeveloper } from "./system.policy.js";
import { systemRepository } from "./system.repository.js";

export const MAINTENANCE_ERROR_MESSAGE =
  "O sistema está em modo de manutenção no momento. Tente novamente mais tarde.";

export const createMaintenanceError = () =>
  AppError.serviceUnavailable(MAINTENANCE_ERROR_MESSAGE, { code: "MAINTENANCE_MODE" });

export function createSystemService({ repository = systemRepository } = {}) {
  return {
    async getStatus() {
      const config = await repository.getConfig();
      return { maintenanceMode: Boolean(config?.maintenanceMode) };
    },

    async isMaintenanceMode() {
      const config = await repository.getConfig();
      return Boolean(config?.maintenanceMode);
    },

    async getConfig(auth) {
      assertIsDeveloper(auth);
      return repository.getConfig();
    },

    async updateConfig(auth, { maintenanceMode }) {
      assertIsDeveloper(auth);
      return repository.setMaintenanceMode(maintenanceMode);
    },
  };
}

export const systemService = createSystemService();
