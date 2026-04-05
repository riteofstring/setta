import Background from "forks/xyflow/background/Background";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  useLocalStorage,
  useMisc,
  useProjectState,
  useSettings,
} from "state/definitions";
import { useTabScope } from "utils/focusManager";
import { selectSettingsGraphSubstrateCanarySections } from "./settingsGraphSubstrateCanaryModel";
import { SettingsGraphSubstrateCanarySectionsLayer } from "./settingsGraphSubstrateCanarySectionsLayer";
import { useSettingsGraphSubstrateCanarySurfaceRuntime } from "./settingsGraphSubstrateCanarySurfaceRuntime";

const ROOT_STYLE: CSSProperties = {
  inset: 0,
  overflow: "hidden",
  position: "absolute",
  userSelect: "none",
  overflowAnchor: "none",
};

export function SettingsGraphSubstrateCanary() {
  const rootRef = useRef<HTMLDivElement>(null);
  useTabScope({
    scopeId: "canvas",
    order: 20,
    rootRef,
    behavior: "canvas",
  });
  const sections = useProjectState(
    selectSettingsGraphSubstrateCanarySections,
    _.isEqual,
  );
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

  return (
    <div
      ref={rootRef}
      style={{
        ...ROOT_STYLE,
        cursor: surfaceRuntime.isViewportPanning ? "grabbing" : "grab",
      }}
      className="react-flow setta-light dark:setta-dark"
      data-tab-scope="canvas"
      data-testid="graph-substrate-canary"
      onClick={handlePaneClick}
      onPointerDown={surfaceRuntime.handlePanePointerDown}
      onPointerMove={surfaceRuntime.handlePanePointerMove}
      onPointerUp={surfaceRuntime.finishPanePan}
      onPointerCancel={surfaceRuntime.finishPanePan}
      onWheel={surfaceRuntime.handlePaneWheel}
    >
      {snapToGrid && showGridLines && <Background />}
      <div
        className="react-flow__viewport"
        data-testid="graph-substrate-canary-viewport"
        style={{
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
          transform: surfaceRuntime.resolvedViewport
            ? `translate(${surfaceRuntime.resolvedViewport.x}px, ${surfaceRuntime.resolvedViewport.y}px) scale(${surfaceRuntime.resolvedViewport.zoom})`
            : undefined,
          transformOrigin: "0 0",
          zIndex: 1,
        }}
      >
        {surfaceRuntime.sceneSnapshot.sections.length > 0 ? (
          <SettingsGraphSubstrateCanarySectionsLayer
            draggingSectionId={surfaceRuntime.draggingSectionId}
            sceneSections={surfaceRuntime.sceneSnapshot.sections}
            sectionDragController={surfaceRuntime.sectionDragController}
          />
        ) : (
          <div
            className="flex h-full items-center justify-center text-xs text-setta-500 dark:text-setta-400"
            data-testid="graph-substrate-canary-empty"
          >
            No visible settings sections available for the graph substrate
            canary.
          </div>
        )}
      </div>
    </div>
  );
}
