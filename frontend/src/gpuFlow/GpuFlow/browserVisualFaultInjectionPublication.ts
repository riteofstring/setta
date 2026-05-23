import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFramePublicationContentPlan";
import type { GpuFlowBlockedVisibleReason } from "./visibleFramePublicationTokens";
import { GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID } from "./visibleFrameTypes";

type GpuFlowBrowserVisualFaultInjectedDomControlReadiness =
  | "blocked-awaiting-live-host"
  | "blocked-awaiting-snapshot";

type GpuFlowBrowserVisualFaultInjection = {
  readonly domControlReadiness?:
    | GpuFlowBrowserVisualFaultInjectedDomControlReadiness
    | undefined;
  readonly withholdAllDomControls?: boolean | undefined;
  readonly withholdDomControlActorIds?: readonly string[] | undefined;
};

type GpuFlowBrowserVisualFaultInjectionWindow = Window & {
  readonly __SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__?:
    | GpuFlowBrowserVisualFaultInjection
    | unknown;
};

export function createGpuFlowBrowserVisualFaultInjectedBlockedPublicationCandidate({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  const faultInjection = readGpuFlowBrowserVisualFaultInjection();
  if (!faultInjection) {
    return null;
  }
  const actorIds = faultInjection.withholdDomControlActorIds ?? [];
  if (faultInjection.withholdAllDomControls !== true && actorIds.length === 0) {
    return null;
  }
  const reason = getGpuFlowBrowserVisualFaultInjectionBlockedReason(
    faultInjection.domControlReadiness,
  );
  return Object.freeze({
    blockedReasons: createGpuFlowBrowserVisualFaultInjectionBlockedReasons({
      actorIds,
      reason,
    }),
    frozenFrameId:
      previousVisibleProjectionState?.committedFrame.displayFrameId ??
      GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  });
}

function readGpuFlowBrowserVisualFaultInjection(): GpuFlowBrowserVisualFaultInjection | null {
  if (!isGpuFlowBrowserVisualFaultInjectionEnabled()) {
    return null;
  }
  if (typeof window === "undefined") {
    return null;
  }
  const faultInjection = (window as GpuFlowBrowserVisualFaultInjectionWindow)
    .__SETTA_GPU_FLOW_BROWSER_VISUAL_FAULT_INJECTION__;
  if (faultInjection === undefined) {
    return null;
  }
  if (!isGpuFlowBrowserVisualFaultInjectionObject(faultInjection)) {
    throw new Error(
      "GPU Flow browser visual fault injection must be an object.",
    );
  }
  const {
    domControlReadiness,
    withholdAllDomControls,
    withholdDomControlActorIds,
  } = faultInjection;
  assertGpuFlowBrowserVisualFaultInjectionDomControlReadiness(
    domControlReadiness,
  );
  assertGpuFlowBrowserVisualFaultInjectionWithholdAllDomControls(
    withholdAllDomControls,
  );
  assertGpuFlowBrowserVisualFaultInjectionActorIds(withholdDomControlActorIds);
  return {
    domControlReadiness,
    withholdAllDomControls,
    withholdDomControlActorIds,
  };
}

function createGpuFlowBrowserVisualFaultInjectionBlockedReasons({
  actorIds,
  reason,
}: {
  readonly actorIds: readonly string[];
  readonly reason: string;
}): readonly GpuFlowBlockedVisibleReason[] {
  if (actorIds.length === 0) {
    return Object.freeze([
      Object.freeze({ actorId: null, family: "browser-visual", reason }),
    ]);
  }
  return Object.freeze(
    actorIds.map((actorId) =>
      Object.freeze({ actorId, family: "browser-visual", reason }),
    ),
  );
}

function getGpuFlowBrowserVisualFaultInjectionBlockedReason(
  readiness: GpuFlowBrowserVisualFaultInjection["domControlReadiness"],
): string {
  switch (readiness) {
    case "blocked-awaiting-live-host":
      return "live-dom-budget";
    case "blocked-awaiting-snapshot":
    case undefined:
      return "snapshot-pending";
  }
}

function isGpuFlowBrowserVisualFaultInjectionObject(
  faultInjection: unknown,
): faultInjection is GpuFlowBrowserVisualFaultInjection {
  return (
    faultInjection !== null &&
    typeof faultInjection === "object" &&
    !Array.isArray(faultInjection)
  );
}

function assertGpuFlowBrowserVisualFaultInjectionDomControlReadiness(
  readiness: GpuFlowBrowserVisualFaultInjection["domControlReadiness"],
): void {
  if (
    readiness !== undefined &&
    readiness !== "blocked-awaiting-live-host" &&
    readiness !== "blocked-awaiting-snapshot"
  ) {
    throw new Error(
      "GPU Flow browser visual fault injection has an invalid DOM-control readiness.",
    );
  }
}

function assertGpuFlowBrowserVisualFaultInjectionWithholdAllDomControls(
  withholdAllDomControls: GpuFlowBrowserVisualFaultInjection["withholdAllDomControls"],
): void {
  if (
    withholdAllDomControls !== undefined &&
    typeof withholdAllDomControls !== "boolean"
  ) {
    throw new Error(
      "GPU Flow browser visual fault injection withholdAllDomControls must be a boolean.",
    );
  }
}

function assertGpuFlowBrowserVisualFaultInjectionActorIds(
  withholdDomControlActorIds: GpuFlowBrowserVisualFaultInjection["withholdDomControlActorIds"],
): void {
  const hasInvalidActorIds =
    withholdDomControlActorIds !== undefined &&
    (!Array.isArray(withholdDomControlActorIds) ||
      withholdDomControlActorIds.some(
        (actorId) => typeof actorId !== "string",
      ));
  if (hasInvalidActorIds) {
    throw new Error(
      "GPU Flow browser visual fault injection withholdDomControlActorIds must be a string array.",
    );
  }
}

function isGpuFlowBrowserVisualFaultInjectionEnabled(): boolean {
  return (
    import.meta.env.DEV ||
    (typeof process !== "undefined" && process.env.NODE_ENV === "test")
  );
}
