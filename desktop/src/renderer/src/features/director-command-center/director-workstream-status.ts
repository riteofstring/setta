import type { Workstream, WorkstreamStatus } from "@generated/backend";

export interface DirectorComposerCommitment {
  readonly active: boolean;
  readonly status: WorkstreamStatus;
  readonly statusLabel: string;
  readonly title: string;
}

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

const activeComposerStatuses = new Set<WorkstreamStatus>([
  "awaiting_approval",
  "awaiting_resource",
  "blocked",
  "queued",
  "running",
]);

export function directorComposerCommitment(
  workstream: Workstream | null,
): DirectorComposerCommitment {
  const status = workstream?.status ?? "idle";
  return {
    active: activeComposerStatuses.has(status),
    status,
    statusLabel: directorWorkstreamStatusLabels[status],
    title: workstreamTitle(workstream),
  };
}

function workstreamTitle(workstream: Workstream | null): string {
  const title = workstream?.title.trim();
  return title && title.length > 0 ? title : "Setta";
}
