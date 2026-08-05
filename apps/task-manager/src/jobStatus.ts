export type SimplifiedStatus = "pending" | "active" | "completed" | "failed";

// Collapses BullMQ's internal states (waiting/delayed/paused/waiting-children/
// prioritized/unknown) into "pending", per the Jobs API contract in #241.
export function toSimplifiedStatus(bullState: string): SimplifiedStatus {
  if (bullState === "completed") return "completed";
  if (bullState === "failed") return "failed";
  if (bullState === "active") return "active";
  return "pending";
}
