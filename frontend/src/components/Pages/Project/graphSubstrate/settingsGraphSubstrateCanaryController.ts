import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  useLocalStorage,
  useMisc,
  useNodeInternals,
  useProjectState,
  useSettings,
} from "state/definitions";
import { useTabScope } from "utils/focusManager";
import {
  resolveSettingsGraphSubstrateCanarySections,
  selectSettingsGraphSubstrateCanaryLayoutSections,
} from "./settingsGraphSubstrateCanaryModel";
import {
  useSettingsGraphSubstrateCanarySurfaceRuntime,
  type SettingsGraphSubstrateCanarySurfaceRuntime,
} from "./settingsGraphSubstrateCanarySurfaceRuntime";
import type { GraphViewport } from "./viewportTransform";

export type SettingsGraphSubstrateCanaryController = {
  draggingSectionId: string | null;
  finishPanePan: SettingsGraphSubstrateCanarySurfaceRuntime["finishPanePan"];
  handlePaneClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  handlePanePointerDown: SettingsGraphSubstrateCanarySurfaceRuntime["handlePanePointerDown"];
  handlePanePointerMove: SettingsGraphSubstrateCanarySurfaceRuntime["handlePanePointerMove"];
  handlePaneWheel: SettingsGraphSubstrateCanarySurfaceRuntime["handlePaneWheel"];
  resolvedViewport: GraphViewport | null;
  rootCursor: CSSProperties["cursor"];
  rootRef: RefObject<HTMLDivElement | null>;
  sceneSections: SettingsGraphSubstrateCanarySurfaceRuntime["sceneSnapshot"]["sections"];
  sectionDragController: SettingsGraphSubstrateCanarySurfaceRuntime["sectionDragController"];
  shouldShowGridLines: boolean;
  viewportTransform: string | undefined;
};

export function useSettingsGraphSubstrateCanaryController(): SettingsGraphSubstrateCanaryController {
  const rootRef = useRef<HTMLDivElement>(null);
  useTabScope({
    scopeId: "canvas",
    order: 20,
    rootRef,
    behavior: "canvas",
  });
  const layoutSections = useProjectState(
    selectSettingsGraphSubstrateCanaryLayoutSections,
    _.isEqual,
  );
  const sections = useNodeInternals((state) => {
    return resolveSettingsGraphSubstrateCanarySections(layoutSections, state.x);
  }, _.isEqual);
  const sharedProjectViewport = useProjectState((state) => {
    const { viewport, viewportInitialized } = state.projectConfig;
    if (!viewportInitialized || !viewport) {
      return null;
    }
    return {
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    };
  }, _.isEqual);
  const zoomActivationKeyPressed = useReactFlow(
    (state) => state.zoomActivationKeyPressed,
  );
  const nodeDragThreshold = useReactFlow((state) => state.nodeDragThreshold);
  const {
    minZoom,
    maxZoom,
    defaultZoomLevel,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    showGridLines,
    snapGrid,
    zoomOnPinch,
    zoomOnScroll,
  } = useSettings(
    (state) => ({
      minZoom: state.gui.minZoom,
      maxZoom: state.gui.maxZoom,
      defaultZoomLevel: state.gui.defaultZoomLevel,
      panOnScroll: state.gui.panOnScroll,
      panOnScrollMode: state.gui.panOnScrollMode,
      panOnScrollSpeed: state.gui.panOnScrollSpeed,
      showGridLines: !!state.gui.showGridLines,
      snapGrid: state.gui.snapGrid,
      zoomOnPinch: state.gui.zoomOnPinch,
      zoomOnScroll: state.gui.zoomOnScroll,
    }),
    _.isEqual,
  );
  const { overviewTrueWidth, uiEditorTrueWidth } = useLocalStorage(
    (state) => ({
      overviewTrueWidth: state.overviewTrueWidth,
      uiEditorTrueWidth: state.uiEditorTrueWidth,
    }),
    _.isEqual,
  );
  const snapToGrid = useLocalStorage((state) => state.snapToGrid);
  const surfaceRuntime = useSettingsGraphSubstrateCanarySurfaceRuntime({
    defaultZoomLevel,
    maxZoom,
    minZoom,
    nodeDragThreshold,
    overviewTrueWidth,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    rootRef,
    sections,
    sharedProjectViewport,
    snapGrid,
    snapToGrid,
    uiEditorTrueWidth,
    zoomActivationKeyPressed,
    zoomOnPinch,
    zoomOnScroll,
  });

  function handlePaneClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!rootRef.current || event.target !== rootRef.current) {
      return;
    }
    if (useMisc.getState().mouseDownDrawArea) {
      useMisc.setState({ mouseDownDrawArea: false });
      return;
    }

    applyActiveSectionChange({ interaction: "pane-click" });
    useMisc.setState({
      lastPaneClickLocation: screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      }),
    });
    useReactFlow.setState({ nodesSelectionDims: null });
  }

  return {
    draggingSectionId: surfaceRuntime.draggingSectionId,
    finishPanePan: surfaceRuntime.finishPanePan,
    handlePaneClick,
    handlePanePointerDown: surfaceRuntime.handlePanePointerDown,
    handlePanePointerMove: surfaceRuntime.handlePanePointerMove,
    handlePaneWheel: surfaceRuntime.handlePaneWheel,
    resolvedViewport: surfaceRuntime.resolvedViewport,
    rootCursor: surfaceRuntime.isViewportPanning ? "grabbing" : "grab",
    rootRef,
    sceneSections: surfaceRuntime.sceneSnapshot.sections,
    sectionDragController: surfaceRuntime.sectionDragController,
    shouldShowGridLines: snapToGrid && showGridLines,
    viewportTransform: resolveSettingsGraphSubstrateCanaryViewportTransform(
      surfaceRuntime.resolvedViewport,
    ),
  };
}

export function resolveSettingsGraphSubstrateCanaryViewportTransform(
  viewport: GraphViewport | null,
): string | undefined {
  if (!viewport) {
    return undefined;
  }
  return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
}
