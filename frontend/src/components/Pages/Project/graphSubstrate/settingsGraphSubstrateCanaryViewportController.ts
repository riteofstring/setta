import type { CustomViewportController } from "forks/xyflow/core/types";
import {
  getSettingsGraphSubstrateCanarySceneBoundsForSections,
  type SettingsGraphSubstrateCanarySceneSnapshot,
} from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  resolveSettingsGraphSubstrateCanaryToolbarZoomViewport,
  resolveSettingsGraphSubstrateCanaryVisibleViewportSize,
} from "./settingsGraphSubstrateCanaryViewport";
import {
  centerViewportOnWorldPoint,
  fitViewportToWorldRect,
  translateViewport,
  type GraphViewport,
} from "./viewportTransform";

export type SettingsGraphSubstrateCanaryViewportControllerState = {
  resolvedViewport: GraphViewport | null;
  sceneSnapshot: SettingsGraphSubstrateCanarySceneSnapshot;
  wrapperDimensions: { width: number; height: number };
};

type SettingsGraphSubstrateCanaryViewportControllerDependencies = {
  applyControlledViewportChange: (
    buildNextViewport: (currentViewport: GraphViewport) => GraphViewport | null,
  ) => void;
  getPaneWidths: () => { overviewWidth: number; uiEditorWidth: number };
  getSettings: () => {
    defaultZoomLevel: number;
    maxZoom: number;
    minZoom: number;
  };
  getState: () => SettingsGraphSubstrateCanaryViewportControllerState;
  getToolbarZoomViewportBase: () => GraphViewport | null;
};

export function createSettingsGraphSubstrateCanaryViewportController({
  applyControlledViewportChange,
  getPaneWidths,
  getSettings,
  getState,
  getToolbarZoomViewportBase,
}: SettingsGraphSubstrateCanaryViewportControllerDependencies): CustomViewportController {
  return {
    panBy: (delta) => {
      if (!delta.x && !delta.y) {
        return false;
      }
      const { resolvedViewport } = getState();
      if (!resolvedViewport) {
        return false;
      }
      const nextViewport = translateViewport(resolvedViewport, delta);
      if (
        nextViewport.x === resolvedViewport.x &&
        nextViewport.y === resolvedViewport.y
      ) {
        return false;
      }
      applyControlledViewportChange((currentViewport) =>
        translateViewport(currentViewport, delta),
      );
      return true;
    },
    zoomBy: (factor: number) => {
      const { resolvedViewport, wrapperDimensions } = getState();
      if (!resolvedViewport || factor === 1) {
        return;
      }
      const toolbarZoomBaseViewport =
        getToolbarZoomViewportBase() ?? resolvedViewport;
      const { minZoom, maxZoom } = getSettings();
      const nextZoom = Math.min(
        maxZoom,
        Math.max(minZoom, resolvedViewport.zoom * factor),
      );
      applyControlledViewportChange(() =>
        resolveSettingsGraphSubstrateCanaryToolbarZoomViewport(
          toolbarZoomBaseViewport,
          wrapperDimensions,
          {
            maxZoom,
            minZoom,
            nextZoom,
          },
        ),
      );
    },
    zoomTo: (zoomLevel: number) => {
      const { resolvedViewport, wrapperDimensions } = getState();
      if (!resolvedViewport) {
        return;
      }
      const toolbarZoomBaseViewport =
        getToolbarZoomViewportBase() ?? resolvedViewport;
      const { minZoom, maxZoom } = getSettings();
      const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoomLevel));
      applyControlledViewportChange(() =>
        resolveSettingsGraphSubstrateCanaryToolbarZoomViewport(
          toolbarZoomBaseViewport,
          wrapperDimensions,
          {
            maxZoom,
            minZoom,
            nextZoom,
          },
        ),
      );
    },
    setViewport: (transform) => {
      applyControlledViewportChange((currentViewport) => ({
        x: transform.x ?? currentViewport.x,
        y: transform.y ?? currentViewport.y,
        zoom: transform.zoom ?? currentViewport.zoom,
      }));
    },
    setCenter: (x: number, y: number, options) => {
      const { wrapperDimensions } = getState();
      const centerScreenPoint =
        resolveSettingsGraphSubstrateCanaryViewportCenterScreenPoint(
          wrapperDimensions,
          getPaneWidths(),
        );
      if (!centerScreenPoint) {
        return;
      }
      const { maxZoom } = getSettings();
      const nextZoom =
        typeof options?.zoom === "number" ? options.zoom : maxZoom;
      applyControlledViewportChange((currentViewport) =>
        centerViewportOnWorldPoint(currentViewport, {
          worldPoint: { x, y },
          screenPoint: centerScreenPoint,
          zoom: nextZoom,
        }),
      );
    },
    fitView: (options) => {
      const { sceneSnapshot, wrapperDimensions } = getState();
      const targetSections = getSettingsGraphSubstrateCanaryFitViewSections(
        sceneSnapshot.sections,
        options?.nodes,
      );
      const bounds = getSettingsGraphSubstrateCanarySceneBoundsForSections(
        targetSections,
        sceneSnapshot.boundsSizeBySectionId,
      );
      if (!bounds) {
        return false;
      }
      const paneWidths = getPaneWidths();
      const centerScreenPoint =
        resolveSettingsGraphSubstrateCanaryViewportCenterScreenPoint(
          wrapperDimensions,
          paneWidths,
        );
      if (!centerScreenPoint) {
        return false;
      }
      const {
        defaultZoomLevel: settingsDefaultZoomLevel,
        minZoom: settingsMinZoom,
        maxZoom: settingsMaxZoom,
      } = getSettings();
      const resolvedMinZoom = options?.minZoom ?? settingsMinZoom;
      let resolvedMaxZoom = options?.maxZoom ?? settingsMaxZoom;
      if (options?.initial) {
        resolvedMaxZoom = Math.min(resolvedMaxZoom, settingsDefaultZoomLevel);
      }
      if (resolvedMaxZoom < resolvedMinZoom) {
        resolvedMaxZoom = resolvedMinZoom;
      }
      applyControlledViewportChange(() =>
        fitViewportToWorldRect(
          bounds,
          resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
            wrapperDimensions,
            paneWidths.overviewWidth,
            paneWidths.uiEditorWidth,
          ),
          {
            minZoom: resolvedMinZoom,
            maxZoom: resolvedMaxZoom,
            padding: options?.padding ?? 0.1,
            centerScreenPoint,
          },
        ),
      );
      return true;
    },
  };
}

export function resolveSettingsGraphSubstrateCanaryViewportCenterScreenPoint(
  wrapperDimensions: {
    width: number;
    height: number;
  },
  paneWidths: { overviewWidth: number; uiEditorWidth: number },
) {
  const visibleViewportSize =
    resolveSettingsGraphSubstrateCanaryVisibleViewportSize(
      wrapperDimensions,
      paneWidths.overviewWidth,
      paneWidths.uiEditorWidth,
    );
  if (visibleViewportSize.width <= 0 || visibleViewportSize.height <= 0) {
    return null;
  }
  return {
    x: paneWidths.overviewWidth + visibleViewportSize.width / 2,
    y: visibleViewportSize.height / 2,
  };
}

export function getSettingsGraphSubstrateCanaryFitViewSections<
  T extends { sectionId: string },
>(sections: Array<T>, nodes: Array<{ id: string }> | undefined): Array<T> {
  if (!nodes?.length) {
    return sections;
  }
  const targetSectionIds = new Set(nodes.map((node) => node.id));
  return sections.filter((section) => targetSectionIds.has(section.sectionId));
}
