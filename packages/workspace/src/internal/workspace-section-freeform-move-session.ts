import type { WorkspaceDocument, WorkspaceFreeformChildLayout, WorkspacePoint } from "../core.js";
import { clearCollisionTarget, type CollisionTrackerState } from "./collision-characterization.js";
import { clientPointToWorkspace, clientRectToWorkspace } from "./geometry-index.js";
import type { InteractionPoint } from "./interaction-geometry.js";
import {
  planSectionMove,
  serializeSectionMovePlan,
  validateWorkspaceSectionMovePlan,
  type SectionMoveDecision,
  type WorkspaceSectionMoveValidator,
} from "./section-move-planning.js";
import type { AdapterDndEvent } from "./upstream-dnd-adapter.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import {
  resolveWorkspaceFreeformKeyboardMove,
  resolveWorkspaceFreeformPointerMove,
  workspaceFreeformMoveIndicator,
  workspaceFreeformMoveTransforms,
} from "./workspace-section-freeform-movement.js";
import { workspaceSectionMovePreviewAnnouncement } from "./workspace-section-move-announcements.js";
import {
  workspaceScreenRect,
  type WorkspaceSectionFreeformRegion,
  type WorkspaceSectionMoveGeometryFrame,
} from "./workspace-section-move-regions.js";
import type {
  WorkspaceSectionMovePreviewResolution,
  WorkspaceSectionMoveSession,
} from "./workspace-section-move-session.js";

type SameParentFreeformSource = Readonly<{
  layout: WorkspaceFreeformChildLayout;
  parentSectionId: string;
  region: WorkspaceSectionFreeformRegion;
}>;

function sameParentFreeformSource<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  session: WorkspaceSectionMoveSession<TSectionData>,
): SameParentFreeformSource | null {
  const parentSectionId = session.sourceParentIds[0] ?? null;
  if (
    !parentSectionId ||
    !session.sourceParentIds.every((candidate) => candidate === parentSectionId)
  ) {
    return null;
  }
  const layout = document.sections[parentSectionId]?.childLayout;
  const region = session.freeformRegions.find(
    (candidate) => candidate.parentSectionId === parentSectionId,
  );
  return layout?.positioning === "freeform" && region ? { layout, parentSectionId, region } : null;
}

function pointInsideRegion(point: InteractionPoint, region: WorkspaceSectionFreeformRegion) {
  const rect = region.clientRect;
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function surfaceDelta(
  frame: WorkspaceSectionMoveGeometryFrame,
  region: WorkspaceSectionFreeformRegion,
): WorkspacePoint | null {
  if (!region.surface.isConnected) {
    return null;
  }
  const currentClientRect = workspaceScreenRect(region.surface.getBoundingClientRect());
  const currentWorkspaceRect = clientRectToWorkspace(
    currentClientRect,
    frame.canvasBounds,
    frame.viewport,
  );
  return {
    x: currentWorkspaceRect.x - region.surfaceWorkspaceRect.x,
    y: currentWorkspaceRect.y - region.surfaceWorkspaceRect.y,
  };
}

function pointerWorkspaceDelta(
  event: AdapterDndEvent,
  point: InteractionPoint,
  frame: WorkspaceSectionMoveGeometryFrame,
  session: WorkspaceSectionMoveSession,
): WorkspacePoint {
  if (session.startWorkspacePoint) {
    const current = clientPointToWorkspace(point, frame.canvasBounds, frame.viewport);
    return {
      x: current.x - session.startWorkspacePoint.x,
      y: current.y - session.startWorkspacePoint.y,
    };
  }
  return {
    x: event.transform.x / frame.viewport.zoom,
    y: event.transform.y / frame.viewport.zoom,
  };
}

function decisionReason(decision: SectionMoveDecision): string {
  return decision.status === "rejected"
    ? decision.reason
    : decision.status === "unchanged"
      ? "The section block is already at this location."
      : "Section movement was canceled.";
}

function freeformPlanPreview<TSectionData>({
  collisionState,
  currentPositions,
  document,
  movePositions,
  parentSectionId,
  session,
  surfaceMovement,
  validateSectionMove,
}: Readonly<{
  collisionState: CollisionTrackerState;
  currentPositions: Readonly<Record<string, WorkspacePoint>>;
  document: WorkspaceDocument<TSectionData>;
  movePositions: Readonly<Record<string, WorkspacePoint>>;
  parentSectionId: string;
  session: WorkspaceSectionMoveSession<TSectionData>;
  surfaceMovement: WorkspacePoint;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>): WorkspaceSectionMovePreviewResolution {
  const transforms = workspaceFreeformMoveTransforms(
    currentPositions,
    movePositions,
    session.sectionIds,
  );
  const anchorTransform = transforms[session.activeSelectionRootId];
  if (!anchorTransform || (anchorTransform.x === 0 && anchorTransform.y === 0)) {
    return {
      collisionState,
      preview: null,
      reason: "The section block is already at this location.",
    };
  }
  const decision = planSectionMove({
    destination: {
      parentId: parentSectionId,
      placement: { positions: movePositions, type: "freeform" },
    },
    hierarchy: session.hierarchy,
    mode: session.mode,
    selectedIds: session.sectionIds,
    validate: (plan) => validateWorkspaceSectionMovePlan(document, plan, validateSectionMove),
  });
  if (decision.status !== "planned") {
    return { collisionState, preview: null, reason: decisionReason(decision) };
  }
  return {
    collisionState,
    preview: {
      announcement: workspaceSectionMovePreviewAnnouncement(document, decision.plan),
      destinationKey: serializeSectionMovePlan(decision.plan),
      indicator: {
        kind: "freeform",
        rect: workspaceFreeformMoveIndicator(
          session.sourceWorkspaceBounds,
          surfaceMovement,
          anchorTransform,
        ),
      },
      plan: decision.plan,
      transformsById: transforms,
    },
    reason: "",
  };
}

export function resolveSameParentFreeformPointerPreview<TSectionData>({
  document,
  event,
  frame,
  gridOptions,
  point,
  session,
  validateSectionMove,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  event: AdapterDndEvent;
  frame: WorkspaceSectionMoveGeometryFrame;
  gridOptions: ResolvedWorkspaceGridOptions;
  point: InteractionPoint;
  session: WorkspaceSectionMoveSession<TSectionData>;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>): WorkspaceSectionMovePreviewResolution | null {
  const source = sameParentFreeformSource(document, session);
  if (!source || (session.mode !== "sort" && !pointInsideRegion(point, source.region))) {
    return null;
  }
  const currentSurfaceDelta = surfaceDelta(frame, source.region);
  if (!currentSurfaceDelta) {
    return {
      collisionState: clearCollisionTarget(session.collisionState),
      preview: null,
      reason: "The source freeform movement surface is unavailable.",
    };
  }
  const pointerDelta = pointerWorkspaceDelta(event, point, frame, session);
  const move = resolveWorkspaceFreeformPointerMove({
    activeSectionId: session.activeSelectionRootId,
    delta: {
      x: pointerDelta.x - currentSurfaceDelta.x,
      y: pointerDelta.y - currentSurfaceDelta.y,
    },
    gridOptions,
    positions: source.layout.positions,
    sectionIds: session.sectionIds,
  });
  return freeformPlanPreview({
    collisionState: clearCollisionTarget(session.collisionState),
    currentPositions: source.layout.positions,
    document,
    movePositions: move.positions,
    parentSectionId: source.parentSectionId,
    session,
    surfaceMovement: currentSurfaceDelta,
    validateSectionMove,
  });
}

export function resolveSameParentFreeformKeyboardPreview<TSectionData>({
  direction,
  document,
  geometry,
  gridOptions,
  session,
  validateSectionMove,
}: Readonly<{
  direction: NonNullable<AdapterDndEvent["keyboardDirection"]>;
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  gridOptions: ResolvedWorkspaceGridOptions;
  session: WorkspaceSectionMoveSession<TSectionData>;
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>): WorkspaceSectionMovePreviewResolution | null {
  const source = sameParentFreeformSource(document, session);
  if (!source) {
    return null;
  }
  const previewPlacement = session.preview?.plan.destination.placement;
  const currentPositions =
    session.preview?.plan.destination.parentId === source.parentSectionId &&
    previewPlacement?.type === "freeform"
      ? previewPlacement.positions
      : source.layout.positions;
  const move = resolveWorkspaceFreeformKeyboardMove({
    activeSectionId: session.activeSelectionRootId,
    direction,
    gridOptions,
    positions: currentPositions,
    sectionIds: session.sectionIds,
  });
  const currentSurfaceDelta = surfaceDelta(
    { canvasBounds: geometry.canvasBounds(), viewport: geometry.currentViewport() },
    source.region,
  );
  return currentSurfaceDelta
    ? freeformPlanPreview({
        collisionState: clearCollisionTarget(session.collisionState),
        currentPositions: source.layout.positions,
        document,
        movePositions: move.positions,
        parentSectionId: source.parentSectionId,
        session,
        surfaceMovement: currentSurfaceDelta,
        validateSectionMove,
      })
    : {
        collisionState: clearCollisionTarget(session.collisionState),
        preview: null,
        reason: "The source freeform movement surface is unavailable.",
      };
}
