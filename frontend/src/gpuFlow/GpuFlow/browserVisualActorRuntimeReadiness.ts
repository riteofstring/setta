import { createGpuFlowDomControlSnapshotResourceHandle } from "../browserSnapshotResourceHandle";
import type {
  CommittedHtmlSurfaceTextureSnapshot,
  HtmlSurfaceTextureManager,
} from "../htmlSurfaces/textures";
import type {
  GpuRetainedDomControlSourceDescriptor,
  GpuRetainedDomControlTextCoverageState,
} from "../retainedDomControlScene";
import type { GpuDomIsland } from "../scene";
import type { BrowserVisualActorRepresentationReadiness } from "../surfaceCompositor/browserVisualActorAdapter";
import type { GpuFlowBrowserVisualActorRuntimeSnapshot } from "./browserVisualActorRuntime";
import { createGpuFlowCompatiblePreviousDomControlReadiness } from "./browserVisualActorRuntimeHelpers";
import {
  getDomControlHostSelectionState,
  isDomControlHostFocused,
} from "./browserVisualActorTextCoverage";
import type {
  GpuFlowDomControlPlaneMountedHost,
  GpuFlowDomControlProjectionAssignment,
} from "./domControlPlaneProjection";
import {
  createGpuRetainedDomControlTextCoverageState,
  withGpuRetainedDomControlTextCoverageState,
} from "./retainedDomControlSourceKeys";
import { getGpuRetainedDomControlResolvedSnapshotSurfaceId } from "./retainedDomControlSources";
import {
  readGpuFlowBrowserVisualFaultInjection,
  shouldGpuFlowBrowserVisualFaultInjectionWithholdDomControl,
  type GpuFlowBrowserVisualFaultInjectedDomControlReadiness,
} from "./visibleFrameActorAdapters/browserVisualFaultInjection";

export type GpuFlowDomControlHostReadinessDiagnostics = {
  readonly elementConnected: boolean;
  readonly hasHost: boolean;
  readonly matches: {
    readonly snapshotCacheKeyRevision: boolean;
    readonly sourceKey: boolean;
    readonly textCoverageRevision: boolean;
    readonly valueStyleRevision: boolean;
  };
  readonly ready: boolean;
};

type GpuFlowDomControlSnapshotTextureManager = Pick<
  HtmlSurfaceTextureManager,
  "getCommittedSurfaceTexture"
> | null;

export type GpuFlowDomControlReadinessContext = {
  readonly domControlSnapshotElementBySurfaceId: ReadonlyMap<
    string,
    HTMLElement
  >;
  readonly domControlSnapshotTextureManager: GpuFlowDomControlSnapshotTextureManager;
  readonly preparationDomControlHostById: ReadonlyMap<
    string,
    GpuFlowDomControlPlaneMountedHost
  >;
  readonly visibleDomControlHostById: ReadonlyMap<
    string,
    GpuFlowDomControlPlaneMountedHost
  >;
};

const BLOCKED_AWAITING_LIVE_HOST_READINESS: BrowserVisualActorRepresentationReadiness =
  Object.freeze({ coverageState: "blocked-awaiting-live-host" });
const BLOCKED_AWAITING_SNAPSHOT_READINESS: BrowserVisualActorRepresentationReadiness =
  Object.freeze({ coverageState: "blocked-awaiting-snapshot" });
const GPU_FLOW_FOCUSED_DOM_CONTROL_VISUAL_SEMANTICS = Object.freeze({
  accessibility: "active-browser-editor",
  focusable: true,
  pointer: "active-browser-editor",
  selectable: "browser-editor",
} satisfies GpuRetainedDomControlSourceDescriptor["visualSemantics"]);
const GPU_FLOW_PROJECTION_COVERAGE_REQUIRED_ASSIGNMENT_REASONS = new Set<
  GpuFlowDomControlProjectionAssignment["reason"]
>([
  "active-pinned",
  "browser-visual-pending",
  "compatible-previous-proof",
  "live-host-overflow",
  "snapshot-promoted",
  "visible-live",
]);

export function withGpuFlowFocusedDomControlPins({
  composingDomControlIds,
  controls,
  visibleDomControlHostById,
}: {
  readonly composingDomControlIds: ReadonlySet<string>;
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly visibleDomControlHostById: ReadonlyMap<
    string,
    GpuFlowDomControlPlaneMountedHost
  >;
}): readonly GpuRetainedDomControlSourceDescriptor[] {
  let changed = false;
  const pinnedControls = controls.map((control) => {
    const textCoverageState = getRuntimeDomControlTextCoverageState({
      composingDomControlIds,
      control,
      visibleDomControlHostById,
    });
    const textStateChanged =
      control.textCoverageState.caret !== textCoverageState.caret ||
      control.textCoverageState.composition !== textCoverageState.composition ||
      control.textCoverageState.selection !== textCoverageState.selection;
    const shouldPinActive =
      control.active ||
      textCoverageState.caret === "visible" ||
      textCoverageState.composition === "active" ||
      textCoverageState.selection !== "none";
    if (!shouldPinActive && !textStateChanged) {
      return control;
    }
    changed = true;
    const nextControl = shouldPinActive
      ? ({
          ...control,
          active: true,
          layerSlot: "active-dom-control-plane",
          lifecycleState: "active-projected",
          visualSemantics: GPU_FLOW_FOCUSED_DOM_CONTROL_VISUAL_SEMANTICS,
        } satisfies GpuRetainedDomControlSourceDescriptor)
      : control;
    return withGpuRetainedDomControlTextCoverageState(
      nextControl,
      textCoverageState,
    );
  });
  return changed ? Object.freeze(pinnedControls) : controls;
}

export function createGpuFlowBrowserVisualDomControlReadinessByActorId({
  context,
  preparedDomControls,
}: {
  readonly context: GpuFlowDomControlReadinessContext;
  readonly preparedDomControls: GpuFlowBrowserVisualActorRuntimeSnapshot["domControls"];
}): ReadonlyMap<string, BrowserVisualActorRepresentationReadiness> {
  const assignmentByControlId = new Map(
    preparedDomControls.assignments.map((assignment) => [
      assignment.control.sourceId,
      assignment,
    ]),
  );
  const readinessByActorId = new Map<
    string,
    BrowserVisualActorRepresentationReadiness
  >();
  for (const control of preparedDomControls.controls) {
    const assignment = assignmentByControlId.get(control.sourceId);
    readinessByActorId.set(
      control.sourceId,
      createDomControlReadiness({ assignment, context, control }),
    );
  }
  return readinessByActorId;
}

export function createGpuFlowBrowserVisualDomIslandReadinessByActorId({
  domIslandElementById,
  islands,
}: {
  readonly domIslandElementById: ReadonlyMap<string, HTMLElement>;
  readonly islands: readonly GpuDomIsland[];
}): ReadonlyMap<string, BrowserVisualActorRepresentationReadiness> {
  const readinessByActorId = new Map<
    string,
    BrowserVisualActorRepresentationReadiness
  >();
  for (const island of islands) {
    const element = domIslandElementById.get(island.id);
    readinessByActorId.set(
      island.id,
      element?.isConnected
        ? Object.freeze({
            coverageState: "live-host-ready",
            resourceHandles: Object.freeze([
              Object.freeze({
                id: island.id,
                kind: "native-dom-island" as const,
              }),
            ]),
          })
        : BLOCKED_AWAITING_LIVE_HOST_READINESS,
    );
  }
  return readinessByActorId;
}

export function describeGpuFlowDomControlHostReadiness({
  context,
  control,
}: {
  readonly context: Pick<
    GpuFlowDomControlReadinessContext,
    "preparationDomControlHostById" | "visibleDomControlHostById"
  >;
  readonly control: GpuRetainedDomControlSourceDescriptor | null;
}): GpuFlowDomControlHostReadinessDiagnostics {
  const host = control
    ? getGpuFlowDomControlReadinessHost({ context, control })
    : null;
  const matches = createGpuFlowDomControlHostReadinessMatches(host, control);
  const elementConnected = Boolean(host?.element.isConnected);
  // Geometry and clip revisions are applied by the commit-token projection;
  // snapshot cache keys are texture-only; requiring either here would deadlock
  // already-mounted live hosts before commit.
  const ready = isGpuFlowDomControlHostReadyForDescriptor({
    control,
    elementConnected,
    host,
    matches,
  });
  return Object.freeze({
    elementConnected,
    hasHost: Boolean(host),
    matches: Object.freeze(matches),
    ready,
  });
}

export function isGpuFlowDomControlSnapshotReady({
  control,
  domControlSnapshotElementBySurfaceId,
  domControlSnapshotTextureManager,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly domControlSnapshotElementBySurfaceId: ReadonlyMap<
    string,
    HTMLElement
  >;
  readonly domControlSnapshotTextureManager: GpuFlowDomControlSnapshotTextureManager;
}): boolean {
  return (
    getReadyGpuFlowDomControlSnapshotTexture({
      control,
      domControlSnapshotElementBySurfaceId,
      domControlSnapshotTextureManager,
    }) !== null
  );
}

function getRuntimeDomControlTextCoverageState({
  composingDomControlIds,
  control,
  visibleDomControlHostById,
}: {
  readonly composingDomControlIds: ReadonlySet<string>;
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly visibleDomControlHostById: ReadonlyMap<
    string,
    GpuFlowDomControlPlaneMountedHost
  >;
}): GpuRetainedDomControlTextCoverageState {
  const host = visibleDomControlHostById.get(control.sourceId);
  const focused = host ? isDomControlHostFocused(host.element) : false;
  const composing = composingDomControlIds.has(control.sourceId);
  if (!control.active && !focused && !composing) {
    return createGpuRetainedDomControlTextCoverageState(false);
  }
  const selection = host
    ? getDomControlHostSelectionState(host.element, focused)
    : "collapsed";
  return {
    caret: "visible",
    composition: composing ? "active" : "inactive",
    selection,
  };
}

function createDomControlReadiness({
  assignment,
  context,
  control,
}: {
  readonly assignment: GpuFlowDomControlProjectionAssignment | undefined;
  readonly context: GpuFlowDomControlReadinessContext;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): BrowserVisualActorRepresentationReadiness {
  const readiness =
    createGpuFlowBrowserVisualFaultInjectedDomControlReadiness(control) ??
    createDomControlReadinessWithoutFaultInjection({
      assignment,
      context,
      control,
    });
  return withProjectionCoverageRequirement({
    assignment,
    readiness,
  });
}

function withProjectionCoverageRequirement({
  assignment,
  readiness,
}: {
  readonly assignment: GpuFlowDomControlProjectionAssignment | undefined;
  readonly readiness: BrowserVisualActorRepresentationReadiness;
}): BrowserVisualActorRepresentationReadiness {
  if (!isDomControlProjectionCoverageRequired(assignment)) {
    return readiness;
  }
  if (readiness.projectionCoverageRequired === true) {
    return readiness;
  }
  return Object.freeze({
    ...readiness,
    projectionCoverageRequired: true,
  } satisfies BrowserVisualActorRepresentationReadiness);
}

function isDomControlProjectionCoverageRequired(
  assignment: GpuFlowDomControlProjectionAssignment | undefined,
): boolean {
  return assignment
    ? GPU_FLOW_PROJECTION_COVERAGE_REQUIRED_ASSIGNMENT_REASONS.has(
        assignment.reason,
      )
    : false;
}

function createDomControlReadinessWithoutFaultInjection({
  assignment,
  context,
  control,
}: {
  readonly assignment: GpuFlowDomControlProjectionAssignment | undefined;
  readonly context: GpuFlowDomControlReadinessContext;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): BrowserVisualActorRepresentationReadiness {
  if (!assignment) {
    return createBlockedDomControlReadiness(control);
  }
  switch (assignment.coverageState) {
    case "live":
      return createLiveDomControlReadiness({ context, control });
    case "snapshot":
      return createSnapshotDomControlReadiness({ context, control });
    case "compatible-previous":
      return (
        createGpuFlowCompatiblePreviousDomControlReadiness({ assignment }) ??
        createBlockedDomControlReadiness(control)
      );
    case "blocked-awaiting-browser-visual":
      return createSnapshotDomControlReadiness({ context, control });
    case "blocked-awaiting-live-host":
      return createBlockedLiveHostDomControlReadiness({
        context,
        control,
        reason: assignment.reason,
      });
    case "true-hole":
      return Object.freeze({ coverageState: "true-hole" });
  }
}

function createBlockedLiveHostDomControlReadiness({
  context,
  control,
  reason,
}: {
  readonly context: GpuFlowDomControlReadinessContext;
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly reason: GpuFlowDomControlProjectionAssignment["reason"];
}): BrowserVisualActorRepresentationReadiness {
  if (reason === "near-future-live") {
    return Object.freeze({ coverageState: "coverage-exempt" });
  }
  if (reason === "live-host-overflow" && !control.active) {
    return createSnapshotDomControlReadiness({ context, control });
  }
  return BLOCKED_AWAITING_LIVE_HOST_READINESS;
}

function createLiveDomControlReadiness({
  context,
  control,
}: {
  readonly context: GpuFlowDomControlReadinessContext;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): BrowserVisualActorRepresentationReadiness {
  if (!isDomControlHostReady({ context, control })) {
    return BLOCKED_AWAITING_LIVE_HOST_READINESS;
  }
  return Object.freeze({
    coverageState: "live-host-ready",
    resourceHandles: Object.freeze([
      Object.freeze({
        id: control.sourceId,
        kind: "source" as const,
      }),
    ]),
  });
}

function createSnapshotDomControlReadiness({
  context,
  control,
}: {
  readonly context: GpuFlowDomControlReadinessContext;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): BrowserVisualActorRepresentationReadiness {
  const texture = getReadyGpuFlowDomControlSnapshotTexture({
    control,
    domControlSnapshotElementBySurfaceId:
      context.domControlSnapshotElementBySurfaceId,
    domControlSnapshotTextureManager: context.domControlSnapshotTextureManager,
  });
  if (!texture) {
    return BLOCKED_AWAITING_SNAPSHOT_READINESS;
  }
  return Object.freeze({
    coverageState: "exact-snapshot-ready",
    resourceHandles: Object.freeze([
      createGpuFlowDomControlSnapshotResourceHandle({
        control,
        texture,
      }),
    ]),
  });
}

function isDomControlHostReady({
  context,
  control,
}: {
  readonly context: GpuFlowDomControlReadinessContext;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): boolean {
  return describeGpuFlowDomControlHostReadiness({ context, control }).ready;
}

function getReadyGpuFlowDomControlSnapshotTexture({
  control,
  domControlSnapshotElementBySurfaceId,
  domControlSnapshotTextureManager,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly domControlSnapshotElementBySurfaceId: ReadonlyMap<
    string,
    HTMLElement
  >;
  readonly domControlSnapshotTextureManager: GpuFlowDomControlSnapshotTextureManager;
}): CommittedHtmlSurfaceTextureSnapshot | null {
  const snapshotSurfaceId =
    getGpuRetainedDomControlResolvedSnapshotSurfaceId(control);
  const element = domControlSnapshotElementBySurfaceId.get(snapshotSurfaceId);
  if (!element?.isConnected) {
    return null;
  }
  const texture =
    domControlSnapshotTextureManager?.getCommittedSurfaceTexture(
      snapshotSurfaceId,
    );
  if (
    texture &&
    texture.lastUploadFrame >= 0 &&
    !texture.dirtyContent &&
    !texture.dirtyResolution &&
    texture.textureContentKey === control.snapshotCacheKeyRevision
  ) {
    return texture;
  }
  return null;
}

function createBlockedDomControlReadiness(
  control: GpuRetainedDomControlSourceDescriptor,
): BrowserVisualActorRepresentationReadiness {
  if (control.visualPolicy === "snapshot") {
    return BLOCKED_AWAITING_SNAPSHOT_READINESS;
  }
  return BLOCKED_AWAITING_LIVE_HOST_READINESS;
}

function createGpuFlowBrowserVisualFaultInjectedDomControlReadiness(
  control: GpuRetainedDomControlSourceDescriptor,
): BrowserVisualActorRepresentationReadiness | null {
  const faultInjection = readGpuFlowBrowserVisualFaultInjection();
  if (!faultInjection) {
    return null;
  }
  if (
    !shouldGpuFlowBrowserVisualFaultInjectionWithholdDomControl({
      actorId: control.sourceId,
      faultInjection,
    })
  ) {
    return null;
  }
  const readiness: GpuFlowBrowserVisualFaultInjectedDomControlReadiness =
    faultInjection.domControlReadiness ??
    (control.visualPolicy === "snapshot"
      ? "blocked-awaiting-snapshot"
      : "blocked-awaiting-live-host");
  switch (readiness) {
    case "blocked-awaiting-live-host":
      return BLOCKED_AWAITING_LIVE_HOST_READINESS;
    case "blocked-awaiting-snapshot":
      return BLOCKED_AWAITING_SNAPSHOT_READINESS;
  }
}

function createGpuFlowDomControlHostReadinessMatches(
  host: GpuFlowDomControlPlaneMountedHost | null,
  control: GpuRetainedDomControlSourceDescriptor | null,
): GpuFlowDomControlHostReadinessDiagnostics["matches"] {
  return {
    snapshotCacheKeyRevision: domControlHostPropertyMatches(
      host,
      control,
      "snapshotCacheKeyRevision",
    ),
    sourceKey: domControlHostPropertyMatches(host, control, "sourceKey"),
    textCoverageRevision: domControlHostPropertyMatches(
      host,
      control,
      "textCoverageRevision",
    ),
    valueStyleRevision: domControlHostPropertyMatches(
      host,
      control,
      "valueStyleRevision",
    ),
  };
}

function domControlHostPropertyMatches(
  host: GpuFlowDomControlPlaneMountedHost | null,
  control: GpuRetainedDomControlSourceDescriptor | null,
  property:
    | "snapshotCacheKeyRevision"
    | "sourceKey"
    | "textCoverageRevision"
    | "valueStyleRevision",
): boolean {
  return Boolean(
    host && control && host.control[property] === control[property],
  );
}

function isGpuFlowDomControlHostReadyForDescriptor({
  control,
  elementConnected,
  host,
  matches,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor | null;
  readonly elementConnected: boolean;
  readonly host: GpuFlowDomControlPlaneMountedHost | null;
  readonly matches: GpuFlowDomControlHostReadinessDiagnostics["matches"];
}): boolean {
  if (!host || !control || !elementConnected) {
    return false;
  }
  if (host.control.sourceId !== control.sourceId) {
    return false;
  }
  return (
    matches.sourceKey &&
    matches.textCoverageRevision &&
    matches.valueStyleRevision
  );
}

function getGpuFlowDomControlReadinessHost({
  context,
  control,
}: {
  readonly context: Pick<
    GpuFlowDomControlReadinessContext,
    "preparationDomControlHostById" | "visibleDomControlHostById"
  >;
  readonly control: GpuRetainedDomControlSourceDescriptor;
}): GpuFlowDomControlPlaneMountedHost | null {
  return (
    context.preparationDomControlHostById.get(control.sourceId) ??
    context.visibleDomControlHostById.get(control.sourceId) ??
    null
  );
}
