import type { Run, RunLiveness, RunLivenessReason } from "@generated/backend";

type ActiveRunPresentationKind = "idle" | "working" | "blocked" | "reconnecting" | "lost";
export type RunLivenessPresentationKind = "working" | "reconnecting" | "lost" | "terminal";

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
  const connectionKind = runLivenessPresentationKind(matched);
  switch (connectionKind) {
    case "working":
      if (activeRun.pendingApproval !== null) {
        return {
          canRetry: false,
          canSteer: false,
          canStop: matched.cancellable,
          kind: "blocked",
          liveness: matched,
          running: true,
        };
      }
      return {
        canRetry: false,
        canSteer: matched.status === "attached",
        canStop: matched.cancellable,
        kind: "working",
        liveness: matched,
        running: true,
      };
    case "reconnecting":
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
      return assertNever(connectionKind);
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

export function runLivenessPresentationKind(liveness: RunLiveness): RunLivenessPresentationKind {
  switch (liveness.status) {
    case "attached":
      return "working";
    case "reconciling":
      return reconcilingReasonPresentationKinds[liveness.reason];
    case "lost":
      return "lost";
    case "terminal":
      return "terminal";
    default:
      return assertNever(liveness.status);
  }
}

export function runLivenessPresentationLabel(kind: RunLivenessPresentationKind): string {
  switch (kind) {
    case "working":
      return "Working";
    case "reconnecting":
      return "Reconnecting";
    case "lost":
      return "Connection lost";
    case "terminal":
      return "Finished";
    default:
      return assertNever(kind);
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

const reconcilingReasonPresentationKinds = {
  attachment_missing: "lost",
  provider_ref_pending: "working",
  provider_restarted: "reconnecting",
  provider_turn_linked: "working",
  provider_unavailable: "lost",
  run_terminal: "terminal",
  snapshot_load: "working",
  stream_resync: "reconnecting",
  turn_not_found: "lost",
  user_retry: "reconnecting",
  wake_recheck: "working",
} satisfies Record<RunLivenessReason, RunLivenessPresentationKind>;

function assertNever(value: never): never {
  throw new Error(`Unhandled run liveness status: ${JSON.stringify(value)}`);
}
