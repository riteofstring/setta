import type { WorkstreamStatus } from "@generated/backend";

export const directorWorkstreamStatusLabels = {
  archived: "Archived",
  awaiting_approval: "Approval",
  awaiting_resource: "Needs folder",
  blocked: "Blocked",
  completed: "Done",
  failed: "Failed",
  idle: "Idle",
  queued: "Queued",
  running: "Running",
} as const satisfies Record<WorkstreamStatus, string>;
