/**
 * Who the user is talking to, and where that work runs.
 *
 * Every request goes to the Director, which is one app-scoped conversation with
 * no folder, no run, and no status of its own. A workstream is the opposite: it
 * is work, so it has a folder it runs in and a status that moves. The command
 * center reads both from here so the top bar, the composer, and the Now rail
 * cannot disagree about which of the two is in focus.
 */

import type { Workstream, WorkstreamResourceScope, WorkstreamStatus } from "@generated/backend";

import { directorWorkstreamStatusLabels } from "./director-workstream-status";

/**
 * Which milestone a status is still explained by. A running workstream is
 * explained by its own activity, not by the blocker it already cleared, so
 * these statuses only keep the milestone that matches what they are waiting on.
 */
const workstreamSummaryRules = {
  archived: "milestone",
  awaiting_approval: "milestone",
  awaiting_resource: "resource_required",
  blocked: "milestone",
  completed: "milestone",
  failed: "milestone",
  idle: "cancelled",
  queued: null,
  running: null,
} as const satisfies Record<
  WorkstreamStatus,
  "cancelled" | "milestone" | "resource_required" | null
>;

/** The folder a workstream runs in, or its deliberate absence. */
export interface DirectorFocusFolder {
  readonly label: string;
  /** Absolute path, or null when the workstream is folderless. */
  readonly path: string | null;
}

export type DirectorFocus =
  | {
      readonly kind: "director";
      readonly roleLabel: string;
      readonly title: string;
    }
  | {
      readonly kind: "workstream";
      /** The workstream is carrying work, or is waiting on the user to unblock it. */
      readonly active: boolean;
      readonly folder: DirectorFocusFolder;
      readonly status: WorkstreamStatus;
      readonly statusLabel: string;
      /** The milestone that still explains this status, when one does. */
      readonly summary: string | null;
      readonly title: string;
    };

export const directorTitle = "Director";
const directorNoWorkstreamLabel = "No workstream in focus";
const folderlessLabel = "No folder";

const activeWorkstreamStatuses = new Set<WorkstreamStatus>([
  "awaiting_approval",
  "awaiting_resource",
  "blocked",
  "queued",
  "running",
]);

export function directorFocus(workstream: Workstream | null): DirectorFocus {
  if (workstream === null) {
    return { kind: "director", roleLabel: directorNoWorkstreamLabel, title: directorTitle };
  }
  return {
    active: activeWorkstreamStatuses.has(workstream.status),
    folder: directorFocusFolder(workstream.resourceScope),
    kind: "workstream",
    status: workstream.status,
    statusLabel: directorWorkstreamStatusLabels[workstream.status],
    summary: directorWorkstreamSummary(workstream),
    title: workstream.title,
  };
}

export function directorWorkstreamSummary(workstream: Workstream): string | null {
  const milestone = workstream.lastMilestone;
  if (milestone === null) {
    return null;
  }
  const rule = workstreamSummaryRules[workstream.status];
  if (rule === null) {
    return null;
  }
  if (rule === "milestone") {
    return milestone.publicSummary;
  }
  return milestone.kind === rule ? milestone.publicSummary : null;
}

export function directorFocusFolder(scope: WorkstreamResourceScope): DirectorFocusFolder {
  switch (scope.kind) {
    case "folder":
      return { label: workspaceFolderName(scope.folder.rootPath), path: scope.folder.rootPath };
    case "folderless":
      return { label: folderlessLabel, path: null };
    default:
      return exhaustiveResourceScope(scope);
  }
}

/**
 * The workspace's own folder name. Paths are produced by the backend for the
 * platform the app is running on, so both separators are treated as one.
 */
function workspaceFolderName(rootPath: string): string {
  const segments = rootPath.split(/[/\\]+/u).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? rootPath;
}

function exhaustiveResourceScope(scope: never): never {
  throw new Error(`unsupported workstream resource scope ${JSON.stringify(scope)}`);
}
