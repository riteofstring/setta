import { getViewportForBounds } from "@xyflow/react";

import type { WorkspaceFitOptions, WorkspacePoint, WorkspaceViewport } from "../core.js";
import type { WorkspaceRect } from "./geometry-index.js";
import { optionOverridesAt } from "./runtime-option-validation.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";

const WORKSPACE_DEFAULT_FIT_PADDING = 0.4;
const fitOptionKeys = ["padding"] as const;

export type WorkspaceCanvasController = Readonly<{
  captureFocus(): Element | null;
  clientPointToWorkspace(point: WorkspacePoint): WorkspacePoint;
  fitSections(
    sectionIds: readonly string[],
    options?: WorkspaceFitOptions,
  ): Promise<WorkspaceViewport>;
  focusElement(sectionId: string): void;
  focusElementWhenReady(sectionId: string): Promise<boolean>;
  focusSelectionControlWhenReady(sectionId: string): Promise<boolean>;
  focusSection(sectionId: string, viewport: WorkspaceViewport): Promise<WorkspaceViewport>;
  getSectionRect(sectionId: string): WorkspaceRect | undefined;
  getVisibleWorkspaceRect(): WorkspaceRect;
  recoverFocus(sectionId: string | null, focusAnchor: Element | null): Promise<boolean>;
  revealSection(sectionId: string): () => void;
  waitForViewport(viewport: WorkspaceViewport): Promise<boolean>;
  workspacePointToClient(point: WorkspacePoint): WorkspacePoint;
}>;

export function centerWorkspacePointInViewport(
  point: WorkspacePoint,
  viewport: WorkspaceViewport,
  canvasSize: Readonly<{ height: number; width: number }>,
): WorkspaceViewport {
  if (
    !Number.isFinite(canvasSize.width) ||
    canvasSize.width <= 0 ||
    !Number.isFinite(canvasSize.height) ||
    canvasSize.height <= 0
  ) {
    throw new Error("Workspace point navigation requires a canvas with positive dimensions.");
  }
  return {
    x: canvasSize.width / 2 - point.x * viewport.zoom,
    y: canvasSize.height / 2 - point.y * viewport.zoom,
    zoom: viewport.zoom,
  };
}

type WorkspaceZoomBounds = Readonly<{
  maxZoom: number;
  minZoom: number;
}>;

function fitPadding(options: WorkspaceFitOptions | undefined): number {
  const record = optionOverridesAt(
    options,
    fitOptionKeys,
    "Workspace fit options",
    "workspace fit option",
  );
  const padding = record.padding === undefined ? WORKSPACE_DEFAULT_FIT_PADDING : record.padding;
  if (typeof padding !== "number" || !Number.isFinite(padding) || padding < 0) {
    throw new TypeError("Workspace fit padding must be a finite non-negative number.");
  }
  return padding;
}

export function createWorkspaceCanvasController(
  geometry: WorkspaceGeometryMeasurements,
  getZoomBounds: () => WorkspaceZoomBounds,
  forceRevealSection?: (sectionId: string) => () => void,
): WorkspaceCanvasController {
  const focusWhenReady = (sectionId: string, focus: () => Promise<boolean>): Promise<boolean> => {
    const release = forceRevealSection?.(sectionId);
    const result = focus();
    return release ? result.finally(release) : result;
  };
  return {
    captureFocus: () => geometry.captureFocus(),
    clientPointToWorkspace: (point) => geometry.clientPointToWorkspace(point),
    fitSections: async (sectionIds, options) => {
      const padding = fitPadding(options);
      const bounds = await geometry.boundsWhenReady(sectionIds);
      const canvas = geometry.canvasBounds();
      if (canvas.width <= 0 || canvas.height <= 0) {
        throw new Error("Workspace fit requires a canvas with positive dimensions.");
      }
      const zoomBounds = getZoomBounds();
      return getViewportForBounds(
        bounds,
        canvas.width,
        canvas.height,
        zoomBounds.minZoom,
        zoomBounds.maxZoom,
        padding,
      );
    },
    focusElement: (sectionId) => geometry.focusSection(sectionId),
    focusElementWhenReady: (sectionId) =>
      focusWhenReady(sectionId, () => geometry.focusSectionWhenReady(sectionId)),
    focusSelectionControlWhenReady: (sectionId) =>
      focusWhenReady(sectionId, () => geometry.focusSelectionControlWhenReady(sectionId)),
    focusSection: async (sectionId, viewport) => {
      const bounds = await geometry.boundsWhenReady([sectionId]);
      const canvas = geometry.canvasBounds();
      return {
        x: canvas.width / 2 - (bounds.x + bounds.width / 2) * viewport.zoom,
        y: canvas.height / 2 - (bounds.y + bounds.height / 2) * viewport.zoom,
        zoom: viewport.zoom,
      };
    },
    getSectionRect: (sectionId) => geometry.workspaceRect(sectionId),
    getVisibleWorkspaceRect: () => geometry.visibleWorkspaceRect(),
    recoverFocus: (sectionId, focusAnchor) => geometry.recoverFocus(sectionId, focusAnchor),
    revealSection: forceRevealSection ?? (() => () => undefined),
    waitForViewport: (viewport) => geometry.waitForViewport(viewport),
    workspacePointToClient: (point) => geometry.workspacePointToClient(point),
  };
}
