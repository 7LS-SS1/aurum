import { ApiError } from "./api-response";

export function simulationEnabled() {
  // Fail closed: development/test and an explicit switch are both required.
  return process.env.NODE_ENV !== "production" && process.env.ADS_PAYMENT_MODE === "simulation";
}
export function requireSimulation() {
  if (!simulationEnabled()) throw new ApiError("simulation_disabled", 403);
}
