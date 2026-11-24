import { apiRequest } from "@/lib/apiClient";

export function fetchSystemStatus() {
  return apiRequest("/system/status", {
    auth: false,
    retryOnAuth: false,
  });
}

export function fetchSystemConfig() {
  return apiRequest("/system/config");
}

export function updateSystemConfig({ maintenanceMode }) {
  return apiRequest("/system/config", {
    method: "PATCH",
    body: { maintenanceMode },
  });
}
