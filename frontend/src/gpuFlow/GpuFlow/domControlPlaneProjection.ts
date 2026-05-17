import type { MutableRefObject } from "react";

import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";
import {
  flowToScreenPosition,
  getVisibleFlowRect,
  normalizeGpuViewport,
  type GpuRect,
  type GpuViewportInput,
} from "../viewportMath";
import {
  getGpuFlowDomControlPlaneViewportCanvasSize,
  type GpuFlowDomControlPlaneViewportSize,
} from "./domControlPlaneViewport";

export type GpuFlowRetainedScrollOffsetGetter = (
  surfaceId: string,
) => { readonly x: number; readonly y: number } | null | undefined;

export type GpuFlowDomControlPlaneMountedHost = {
  readonly controlId: string;
  readonly element: HTMLElement;
};

export type GpuFlowDomControlProjectionAssignment = {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly coverageState:
    | "blocked-awaiting-browser-visual"
    | "blocked-awaiting-live-host"
    | "compatible-previous"
    | "live"
    | "snapshot"
    | "true-hole";
  readonly phase: "prepare" | "project" | "promote";
  readonly priority: number;
  readonly reason:
    | "active-pinned"
    | "browser-visual-pending"
    | "clipped-empty"
    | "compatible-previous-proof"
    | "live-host-overflow"
    | "near-future-live"
    | "snapshot-promoted"
    | "visible-live";
};

export type GpuFlowDomControlPlaneDiagnostics = {
  activeControlId: string | null;
  clippedControlCount: number;
  committedFrameId: number;
  lastProjectionBatchDurationMs: number;
  mountedControlCount: number;
  projectionWriteCount: number;
  runtimeFrameId: number;
  visibleControlRectCount: number;
};

const GPU_FLOW_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX = 720;
const GPU_FLOW_DOM_CONTROL_MIN_VISIBLE_SCREEN_HEIGHT_CSS_PX = 8;
const GPU_FLOW_DOM_CONTROL_MAX_OVERSCAN_MOUNTED_CONTROLS = 8;
const GPU_FLOW_DOM_CONTROL_MAX_READABLE_MOUNTED_CONTROLS = 24;
const GPU_FLOW_DOM_CONTROL_SMALL_SCENE_LOW_LOD_CONTROL_LIMIT = 64;
const GPU_FLOW_DOM_CONTROL_MAX_MOUNTED_CONTROLS =
  GPU_FLOW_DOM_CONTROL_MAX_READABLE_MOUNTED_CONTROLS +
  GPU_FLOW_DOM_CONTROL_MAX_OVERSCAN_MOUNTED_CONTROLS;

export type GpuFlowDomControlProjectionManager = {
  prepare(input: {
    readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
    readonly getRetainedScrollOffset:
      | GpuFlowRetainedScrollOffsetGetter
      | undefined;
    readonly viewport: GpuViewportInput;
    readonly viewportSize?: GpuFlowDomControlPlaneViewportSize | undefined;
  }): readonly GpuFlowDomControlProjectionAssignment[];
  project(input: {
    readonly committedFrameId: number;
    readonly controlById: ReadonlyMap<
      string,
      GpuRetainedDomControlSourceDescriptor
    >;
    readonly diagnosticsRef: MutableRefObject<GpuFlowDomControlPlaneDiagnostics>;
    readonly getRetainedScrollOffset:
      | GpuFlowRetainedScrollOffsetGetter
      | undefined;
    readonly hostByControlId: ReadonlyMap<
      string,
      GpuFlowDomControlPlaneMountedHost
    >;
    readonly runtimeFrameId: number;
    readonly viewport: GpuViewportInput;
    readonly viewportSize: GpuFlowDomControlPlaneViewportSize;
  }): void;
  promote(
    assignments: readonly GpuFlowDomControlProjectionAssignment[],
  ): readonly GpuRetainedDomControlSourceDescriptor[];
};

export function createGpuFlowDomControlProjectionManager(): GpuFlowDomControlProjectionManager {
  return {
    prepare(input) {
      return resolveGpuFlowDomControlPlaneProjectionAssignments(input);
    },
    project(input) {
      syncGpuFlowDomControlPlaneStyles(input);
    },
    promote(assignments) {
      const controls = assignments
        .filter(
          (assignment) =>
            assignment.coverageState === "live" ||
            assignment.coverageState === "compatible-previous",
        )
        .map((assignment) => assignment.control);
      return controls;
    },
  };
}

export function filterGpuFlowDomControlPlaneMountedControls({
  controls,
  getRetainedScrollOffset,
  viewport,
  viewportSize,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly viewport: GpuViewportInput;
  readonly viewportSize?: GpuFlowDomControlPlaneViewportSize | undefined;
}): readonly GpuRetainedDomControlSourceDescriptor[] {
  return resolveGpuFlowDomControlPlaneProjectionAssignments({
    controls,
    getRetainedScrollOffset,
    viewport,
    viewportSize,
  })
    .filter((assignment) => assignment.coverageState === "live")
    .map((assignment) => assignment.control);
}

export function resolveGpuFlowDomControlPlaneProjectionAssignments({
  controls,
  getRetainedScrollOffset,
  viewport,
  viewportSize,
}: {
  readonly controls: readonly GpuRetainedDomControlSourceDescriptor[];
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly viewport: GpuViewportInput;
  readonly viewportSize?: GpuFlowDomControlPlaneViewportSize | undefined;
}): readonly GpuFlowDomControlProjectionAssignment[] {
  const canvasSize = getGpuFlowDomControlPlaneViewportCanvasSize(viewportSize);
  const normalizedViewport = normalizeGpuViewport(viewport);
  const mountEligibleControls = controls.filter(
    (control) => control.active || control.visualPolicy === "live-dom",
  );
  if (
    controls.length <= GPU_FLOW_DOM_CONTROL_SMALL_SCENE_LOW_LOD_CONTROL_LIMIT
  ) {
    const mountedControlIds = new Set(
      mountEligibleControls.map((control) => control.sourceId),
    );
    return controls
      .map((control) =>
        createGpuFlowDomControlProjectionAssignment({
          control,
          mountedControlIds,
          priority: getGpuFlowDomControlPlanePinPriority(control),
          reason: control.active ? "active-pinned" : "visible-live",
        }),
      )
      .sort(compareGpuFlowDomControlProjectionAssignments);
  }
  const viewportFlowRect = getVisibleFlowRect({
    canvasHeight: canvasSize.height,
    canvasWidth: canvasSize.width,
    viewport,
  });
  const overscanFlowRect = getVisibleFlowRect({
    canvasHeight: canvasSize.height,
    canvasWidth: canvasSize.width,
    marginCssPx: GPU_FLOW_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX,
    viewport,
  });
  const candidates = mountEligibleControls
    .map((control) => {
      const geometry = projectGpuFlowDomControlPlaneGeometry({
        control,
        getRetainedScrollOffset,
      });
      if (!rectsIntersect(overscanFlowRect, geometry.worldRectFlowPx)) {
        return null;
      }
      return {
        control,
        distanceToViewportCenter: getGpuFlowDomControlPlaneDistanceToCenter({
          geometry,
          visibleFlowRect: viewportFlowRect,
        }),
        readableAtViewport:
          rectsIntersect(viewportFlowRect, geometry.worldRectFlowPx) &&
          isGpuFlowDomControlPlaneControlVisibleAtViewport({
            control,
            geometry,
            viewport: normalizedViewport,
          }),
      };
    })
    .filter((candidate) => candidate !== null);
  const activeControls = mountEligibleControls.filter(
    (control) => control.active,
  );
  const activeControlIds = new Set(
    activeControls.map((control) => control.sourceId),
  );
  const inactiveCandidates = candidates.filter(
    (candidate) => !activeControlIds.has(candidate.control.sourceId),
  );
  const inactiveLiveBudget = Math.max(
    0,
    GPU_FLOW_DOM_CONTROL_MAX_MOUNTED_CONTROLS - activeControlIds.size,
  );
  const readableControls = inactiveCandidates
    .filter((candidate) => candidate.readableAtViewport)
    .sort(
      (left, right) =>
        left.distanceToViewportCenter - right.distanceToViewportCenter ||
        compareGpuFlowDomControlPlaneControls(left.control, right.control),
    )
    .slice(
      0,
      Math.min(
        GPU_FLOW_DOM_CONTROL_MAX_READABLE_MOUNTED_CONTROLS,
        inactiveLiveBudget,
      ),
    )
    .map((candidate) => candidate.control);
  const readableControlIds = new Set(
    readableControls.map((control) => control.sourceId),
  );
  const overscanControls = inactiveCandidates
    .filter(
      (candidate) =>
        !candidate.readableAtViewport &&
        !readableControlIds.has(candidate.control.sourceId),
    )
    .sort(
      (left, right) =>
        left.distanceToViewportCenter - right.distanceToViewportCenter ||
        compareGpuFlowDomControlPlaneControls(left.control, right.control),
    )
    .slice(
      0,
      Math.min(
        GPU_FLOW_DOM_CONTROL_MAX_OVERSCAN_MOUNTED_CONTROLS,
        Math.max(0, inactiveLiveBudget - readableControls.length),
      ),
    )
    .map((candidate) => candidate.control);
  const mountedControlIds = new Set(
    [...activeControls, ...readableControls, ...overscanControls].map(
      (control) => control.sourceId,
    ),
  );
  const visibleCandidateIds = new Set(
    candidates
      .filter((candidate) => candidate.readableAtViewport)
      .map((candidate) => candidate.control.sourceId),
  );
  return controls
    .map((control) =>
      createGpuFlowDomControlProjectionAssignment({
        control,
        mountedControlIds,
        priority: getGpuFlowDomControlPlaneProjectionPriority({
          control,
          mountedControlIds,
          visibleCandidateIds,
        }),
        reason: getGpuFlowDomControlPlaneAssignmentReason({
          control,
          mountedControlIds,
          visibleCandidateIds,
        }),
      }),
    )
    .sort(compareGpuFlowDomControlProjectionAssignments);
}

function createGpuFlowDomControlProjectionAssignment({
  control,
  mountedControlIds,
  priority,
  reason,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly mountedControlIds: ReadonlySet<string>;
  readonly priority: number;
  readonly reason: GpuFlowDomControlProjectionAssignment["reason"];
}): GpuFlowDomControlProjectionAssignment {
  if (mountedControlIds.has(control.sourceId)) {
    return {
      control,
      coverageState: "live",
      phase: "project",
      priority,
      reason,
    };
  }
  switch (control.visualPolicy) {
    case "snapshot":
      return {
        control,
        coverageState: "snapshot",
        phase: "promote",
        priority,
        reason: "snapshot-promoted",
      };
    case "blocked-awaiting-browser-visual":
      return {
        control,
        coverageState: "blocked-awaiting-browser-visual",
        phase: "prepare",
        priority,
        reason: "browser-visual-pending",
      };
    case "live-dom":
      return {
        control,
        coverageState: "blocked-awaiting-live-host",
        phase: "prepare",
        priority,
        reason: "live-host-overflow",
      };
    case "outside-viewport":
      return {
        control,
        coverageState: "blocked-awaiting-live-host",
        phase: "prepare",
        priority,
        reason: "near-future-live",
      };
    case "clipped-empty":
      return {
        control,
        coverageState: "true-hole",
        phase: "prepare",
        priority,
        reason: "clipped-empty",
      };
  }
}

function getGpuFlowDomControlPlaneProjectionPriority({
  control,
  mountedControlIds,
  visibleCandidateIds,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly mountedControlIds: ReadonlySet<string>;
  readonly visibleCandidateIds: ReadonlySet<string>;
}): number {
  if (control.active) {
    return 0;
  }
  if (mountedControlIds.has(control.sourceId)) {
    return visibleCandidateIds.has(control.sourceId) ? 3 : 5;
  }
  if (control.visualPolicy === "snapshot") {
    return 6;
  }
  if (visibleCandidateIds.has(control.sourceId)) {
    return 4;
  }
  return 7;
}

function getGpuFlowDomControlPlanePinPriority(
  control: GpuRetainedDomControlSourceDescriptor,
): number {
  return control.active ? 0 : 3;
}

function getGpuFlowDomControlPlaneAssignmentReason({
  control,
  mountedControlIds,
  visibleCandidateIds,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly mountedControlIds: ReadonlySet<string>;
  readonly visibleCandidateIds: ReadonlySet<string>;
}): GpuFlowDomControlProjectionAssignment["reason"] {
  if (control.active) {
    return "active-pinned";
  }
  if (mountedControlIds.has(control.sourceId)) {
    return visibleCandidateIds.has(control.sourceId)
      ? "visible-live"
      : "near-future-live";
  }
  if (control.visualPolicy === "snapshot") {
    return "snapshot-promoted";
  }
  if (control.visualPolicy === "blocked-awaiting-browser-visual") {
    return "browser-visual-pending";
  }
  if (control.visualPolicy === "clipped-empty") {
    return "clipped-empty";
  }
  return "live-host-overflow";
}

function compareGpuFlowDomControlProjectionAssignments(
  left: GpuFlowDomControlProjectionAssignment,
  right: GpuFlowDomControlProjectionAssignment,
): number {
  return (
    left.priority - right.priority ||
    compareGpuFlowDomControlPlaneControls(left.control, right.control)
  );
}

function getGpuFlowDomControlPlaneDistanceToCenter({
  geometry,
  visibleFlowRect,
}: {
  readonly geometry: Pick<
    ReturnType<typeof projectGpuFlowDomControlPlaneGeometry>,
    "worldRectFlowPx"
  >;
  readonly visibleFlowRect: GpuRect;
}): number {
  const controlCenterX =
    geometry.worldRectFlowPx.x + geometry.worldRectFlowPx.width / 2;
  const controlCenterY =
    geometry.worldRectFlowPx.y + geometry.worldRectFlowPx.height / 2;
  const viewportCenterX = visibleFlowRect.x + visibleFlowRect.width / 2;
  const viewportCenterY = visibleFlowRect.y + visibleFlowRect.height / 2;
  return Math.hypot(
    controlCenterX - viewportCenterX,
    controlCenterY - viewportCenterY,
  );
}

function compareGpuFlowDomControlPlaneControls(
  left: GpuRetainedDomControlSourceDescriptor,
  right: GpuRetainedDomControlSourceDescriptor,
): number {
  return (
    left.zOrder - right.zOrder ||
    left.surfaceId.localeCompare(right.surfaceId) ||
    left.rowId.localeCompare(right.rowId)
  );
}

export function syncGpuFlowDomControlPlaneStyles({
  committedFrameId,
  controlById,
  diagnosticsRef,
  getRetainedScrollOffset,
  hostByControlId,
  runtimeFrameId,
  viewport,
  viewportSize,
}: {
  readonly committedFrameId: number;
  readonly controlById: ReadonlyMap<
    string,
    GpuRetainedDomControlSourceDescriptor
  >;
  readonly diagnosticsRef: MutableRefObject<GpuFlowDomControlPlaneDiagnostics>;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly hostByControlId: ReadonlyMap<
    string,
    GpuFlowDomControlPlaneMountedHost
  >;
  readonly runtimeFrameId: number;
  readonly viewport: GpuViewportInput;
  readonly viewportSize: GpuFlowDomControlPlaneViewportSize;
}) {
  const startedAt = performance.now();
  const canvasSize = getGpuFlowDomControlPlaneViewportCanvasSize(viewportSize);
  const normalizedViewport = normalizeGpuViewport(viewport);
  let clippedControlCount = 0;
  let projectionWriteCount = 0;
  let visibleControlRectCount = 0;
  let activeControlId: string | null = null;
  const visibleFlowRect = getVisibleFlowRect({
    canvasHeight: canvasSize.height,
    canvasWidth: canvasSize.width,
    marginCssPx: GPU_FLOW_DOM_CONTROL_PROJECTION_HORIZON_CSS_PX,
    viewport,
  });
  for (const host of hostByControlId.values()) {
    const control = controlById.get(host.controlId);
    if (!control) {
      continue;
    }
    if (control.active) {
      activeControlId = control.sourceId;
    }
    const result = syncGpuFlowDomControlPlaneControlProjection({
      control,
      getRetainedScrollOffset,
      hostByControlId,
      normalizedViewport,
      visibleFlowRect,
      viewport,
    });
    clippedControlCount += result.clippedControlCount;
    projectionWriteCount += result.projectionWriteCount;
    visibleControlRectCount += result.visibleControlRectCount;
  }
  diagnosticsRef.current = {
    activeControlId,
    clippedControlCount,
    committedFrameId,
    lastProjectionBatchDurationMs: performance.now() - startedAt,
    mountedControlCount: hostByControlId.size,
    projectionWriteCount,
    runtimeFrameId,
    visibleControlRectCount,
  };
}

function syncGpuFlowDomControlPlaneControlProjection({
  control,
  getRetainedScrollOffset,
  hostByControlId,
  normalizedViewport,
  visibleFlowRect,
  viewport,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly hostByControlId: ReadonlyMap<
    string,
    GpuFlowDomControlPlaneMountedHost
  >;
  readonly normalizedViewport: ReturnType<typeof normalizeGpuViewport>;
  readonly visibleFlowRect: GpuRect;
  readonly viewport: GpuViewportInput;
}): Pick<
  GpuFlowDomControlPlaneDiagnostics,
  "clippedControlCount" | "projectionWriteCount" | "visibleControlRectCount"
> {
  const host = hostByControlId.get(control.sourceId);
  if (!host) {
    return emptyGpuFlowDomControlPlaneProjectionResult();
  }
  const geometry = projectGpuFlowDomControlPlaneGeometry({
    control,
    getRetainedScrollOffset,
  });
  if (
    !control.active &&
    !rectsIntersect(visibleFlowRect, geometry.worldRectFlowPx)
  ) {
    return {
      ...emptyGpuFlowDomControlPlaneProjectionResult(),
      projectionWriteCount: hideGpuFlowDomControlPlaneElement(host.element),
    };
  }
  if (
    !isGpuFlowDomControlPlaneControlVisibleAtViewport({
      control,
      geometry,
      viewport: normalizedViewport,
    })
  ) {
    return {
      ...emptyGpuFlowDomControlPlaneProjectionResult(),
      projectionWriteCount: hideGpuFlowDomControlPlaneElement(host.element),
    };
  }
  const clip = geometry.visibleClipFlowPx;
  if (clip.width <= 0 || clip.height <= 0) {
    return {
      ...emptyGpuFlowDomControlPlaneProjectionResult(),
      projectionWriteCount: hideGpuFlowDomControlPlaneElement(host.element),
    };
  }
  return {
    clippedControlCount: isGpuFlowDomControlPlaneClipPartial(geometry) ? 1 : 0,
    projectionWriteCount: syncGpuFlowDomControlPlaneElementStyle({
      control,
      element: host.element,
      getRetainedScrollOffset,
      viewport,
    }),
    visibleControlRectCount: 1,
  };
}

function emptyGpuFlowDomControlPlaneProjectionResult(): Pick<
  GpuFlowDomControlPlaneDiagnostics,
  "clippedControlCount" | "projectionWriteCount" | "visibleControlRectCount"
> {
  return {
    clippedControlCount: 0,
    projectionWriteCount: 0,
    visibleControlRectCount: 0,
  };
}

function isGpuFlowDomControlPlaneClipPartial({
  visibleClipFlowPx,
  worldRectFlowPx,
}: ReturnType<typeof projectGpuFlowDomControlPlaneGeometry>): boolean {
  return (
    visibleClipFlowPx.x !== worldRectFlowPx.x ||
    visibleClipFlowPx.y !== worldRectFlowPx.y ||
    visibleClipFlowPx.width !== worldRectFlowPx.width ||
    visibleClipFlowPx.height !== worldRectFlowPx.height
  );
}

export function syncGpuFlowDomControlPlaneElementStyle({
  control,
  element,
  getRetainedScrollOffset,
  viewport,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly element: HTMLElement;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly viewport: GpuViewportInput;
}): number {
  const projection = projectGpuFlowDomControlPlaneHost({
    control,
    getRetainedScrollOffset,
    viewport: normalizeGpuViewport(viewport),
  });
  let writes = 0;
  writes += setStyleValue(element, "display", projection.display);
  writes += setStyleValue(element, "height", `${projection.height}px`);
  writes += setStyleValue(element, "left", `${projection.left}px`);
  writes += setStyleValue(element, "pointerEvents", projection.pointerEvents);
  writes += setStyleValue(element, "top", `${projection.top}px`);
  writes += setStyleValue(element, "transform", projection.transform);
  writes += setStyleValue(
    element,
    "transformOrigin",
    projection.transformOrigin,
  );
  writes += setStyleValue(element, "width", `${projection.width}px`);
  writes += setStyleValue(element, "zIndex", String(projection.zIndex));
  writes += syncGpuFlowDomControlPlaneContentStyle({
    control,
    element,
    getRetainedScrollOffset,
  });
  return writes;
}

export function projectGpuFlowDomControlPlaneHost({
  control,
  getRetainedScrollOffset,
  viewport,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}) {
  const geometry = projectGpuFlowDomControlPlaneGeometry({
    control,
    getRetainedScrollOffset,
  });
  const clip = geometry.visibleClipFlowPx;
  const renderable = isGpuFlowDomControlPlaneControlVisibleAtViewport({
    control,
    geometry,
    viewport,
  });
  const position = flowToScreenPosition(clip, viewport);
  return {
    display: renderable ? "" : "none",
    height: clip.height,
    left: position.x,
    pointerEvents:
      renderable && control.active ? ("auto" as const) : ("none" as const),
    top: position.y,
    transform: `scale(${viewport.zoom})`,
    transformOrigin: "top left",
    width: clip.width,
    zIndex: control.zOrder,
  };
}

function isGpuFlowDomControlPlaneControlVisibleAtViewport({
  control,
  geometry,
  viewport,
}: {
  readonly control: Pick<GpuRetainedDomControlSourceDescriptor, "active">;
  readonly geometry: Pick<
    ReturnType<typeof projectGpuFlowDomControlPlaneGeometry>,
    "visibleClipFlowPx"
  >;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}): boolean {
  if (control.active) {
    return (
      geometry.visibleClipFlowPx.width > 0 &&
      geometry.visibleClipFlowPx.height > 0
    );
  }
  return isGpuFlowDomControlPlanePassiveRenderableAtViewport({
    geometry,
    minScreenHeightCssPx: GPU_FLOW_DOM_CONTROL_MIN_VISIBLE_SCREEN_HEIGHT_CSS_PX,
    viewport,
  });
}

function isGpuFlowDomControlPlanePassiveRenderableAtViewport({
  geometry,
  minScreenHeightCssPx,
  viewport,
}: {
  readonly geometry: Pick<
    ReturnType<typeof projectGpuFlowDomControlPlaneGeometry>,
    "visibleClipFlowPx"
  >;
  readonly minScreenHeightCssPx: number;
  readonly viewport: ReturnType<typeof normalizeGpuViewport>;
}): boolean {
  return (
    geometry.visibleClipFlowPx.width > 0 &&
    geometry.visibleClipFlowPx.height * viewport.zoom >= minScreenHeightCssPx
  );
}

function syncGpuFlowDomControlPlaneContentStyle({
  control,
  element,
  getRetainedScrollOffset,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly element: HTMLElement;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
}): number {
  const content = element.firstElementChild;
  if (!(content instanceof HTMLElement)) {
    return 0;
  }
  const geometry = projectGpuFlowDomControlPlaneGeometry({
    control,
    getRetainedScrollOffset,
  });
  const clip = geometry.visibleClipFlowPx;
  let writes = 0;
  writes += setStyleValue(
    content,
    "height",
    `${control.sourceRectCssPx.height}px`,
  );
  writes += setStyleValue(
    content,
    "left",
    `${-(clip.x - geometry.worldRectFlowPx.x)}px`,
  );
  writes += setStyleValue(
    content,
    "top",
    `${-(clip.y - geometry.worldRectFlowPx.y)}px`,
  );
  writes += setStyleValue(
    content,
    "width",
    `${control.sourceRectCssPx.width}px`,
  );
  return writes;
}

function hideGpuFlowDomControlPlaneElement(element: HTMLElement): number {
  let writes = 0;
  writes += setStyleValue(element, "display", "none");
  writes += setStyleValue(element, "pointerEvents", "none");
  return writes;
}

export function projectGpuFlowDomControlPlaneGeometry({
  control,
  getRetainedScrollOffset,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
}): {
  readonly visibleClipFlowPx: GpuRect;
  readonly worldRectFlowPx: GpuRect;
} {
  const worldRectFlowPx = projectGpuFlowDomControlPlaneWorldRect({
    control,
    getRetainedScrollOffset,
  });
  return {
    visibleClipFlowPx: getGpuFlowDomControlPlaneVisibleClip({
      control,
      worldRectFlowPx,
    }),
    worldRectFlowPx,
  };
}

function projectGpuFlowDomControlPlaneWorldRect({
  control,
  getRetainedScrollOffset,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly getRetainedScrollOffset:
    | GpuFlowRetainedScrollOffsetGetter
    | undefined;
}): GpuRect {
  const liveScrollOffset = getRetainedScrollOffset?.(control.surfaceId);
  if (!liveScrollOffset) {
    return control.worldRectFlowPx;
  }
  const scrollDeltaX = liveScrollOffset.x - control.sectionScrollOffset.x;
  const scrollDeltaY = liveScrollOffset.y - control.sectionScrollOffset.y;
  if (scrollDeltaX === 0 && scrollDeltaY === 0) {
    return control.worldRectFlowPx;
  }
  return {
    ...control.worldRectFlowPx,
    x: control.worldRectFlowPx.x - scrollDeltaX,
    y: control.worldRectFlowPx.y - scrollDeltaY,
  };
}

function getGpuFlowDomControlPlaneVisibleClip({
  control,
  worldRectFlowPx,
}: {
  readonly control: GpuRetainedDomControlSourceDescriptor;
  readonly worldRectFlowPx: GpuRect;
}): GpuRect {
  return intersectRects(worldRectFlowPx, control.sectionClipRectFlowPx);
}

export function createEmptyDomControlPlaneDiagnostics({
  committedFrameId,
  runtimeFrameId,
}: {
  readonly committedFrameId: number;
  readonly runtimeFrameId: number;
}): GpuFlowDomControlPlaneDiagnostics {
  return {
    activeControlId: null,
    clippedControlCount: 0,
    committedFrameId,
    lastProjectionBatchDurationMs: 0,
    mountedControlCount: 0,
    projectionWriteCount: 0,
    runtimeFrameId,
    visibleControlRectCount: 0,
  };
}

function intersectRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, bottomEdge - y),
    width: Math.max(0, rightEdge - x),
    x,
    y,
  };
}

function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function setStyleValue(
  element: HTMLElement,
  property:
    | "display"
    | "height"
    | "left"
    | "pointerEvents"
    | "top"
    | "transform"
    | "transformOrigin"
    | "width"
    | "zIndex",
  value: string,
): number {
  if (element.style[property] === value) {
    return 0;
  }
  element.style[property] = value;
  return 1;
}
