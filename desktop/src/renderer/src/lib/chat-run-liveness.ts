import type { Run, RunLiveness, RunLivenessStatus } from "@generated/backend";

type ActiveRunPresentationKind = "idle" | "working" | "reconnecting" | "lost";

export interface ActiveRunPresentation {
  canRetry: boolean;
  canSteer: boolean;
  canStop: boolean;
  kind: ActiveRunPresentationKind;
  liveness: RunLiveness | null;
  running: boolean;
}

export function activeRunPresentation(
  activeRun: Run | null,
  liveness: RunLiveness | null,
): ActiveRunPresentation {
  if (activeRun?.status !== "running") {
    return idlePresentation;
  }
  const matched = matchingRunLiveness(activeRun, liveness);
  if (!matched) {
    return {
      ...idlePresentation,
      kind: "reconnecting",
      running: true,
    };
  }
  switch (matched.status) {
    case "attached":
      return {
        canRetry: false,
        canSteer: true,
        canStop: matched.cancellable,
        kind: "working",
        liveness: matched,
        running: true,
      };
    case "reconciling":
      return {
        canRetry: matched.retryable,
        canSteer: false,
        canStop: matched.cancellable,
        kind: "reconnecting",
        liveness: matched,
        running: true,
      };
    case "lost":
      return {
        canRetry: matched.retryable,
        canSteer: false,
        canStop: matched.cancellable,
        kind: "lost",
        liveness: matched,
        running: true,
      };
    case "terminal":
      return idlePresentation;
    default:
      return assertNever(matched.status);
  }
}

function matchingRunLiveness(
  activeRun: Run | null,
  liveness: RunLiveness | null,
): RunLiveness | null {
  if (
    activeRun === null ||
    liveness === null ||
    liveness.workspaceId !== activeRun.workspaceId ||
    liveness.conversationId !== activeRun.conversationId ||
    liveness.runId !== activeRun.id
  ) {
    return null;
  }
  return liveness;
}

export function runLivenessNeedsSnapshotResync(liveness: RunLiveness): boolean {
  return liveness.status === "lost";
}

export function runLivenessStatusLabel(status: RunLivenessStatus): string {
  switch (status) {
    case "attached":
      return "Working";
    case "reconciling":
      return "Reconnecting";
    case "lost":
      return "Connection lost";
    case "terminal":
      return "Finished";
    default:
      return assertNever(status);
  }
}

const idlePresentation = {
  canRetry: false,
  canSteer: false,
  canStop: false,
  kind: "idle",
  liveness: null,
  running: false,
} satisfies ActiveRunPresentation;

function assertNever(value: never): never {
  throw new Error(`Unhandled run liveness status: ${JSON.stringify(value)}`);
}
