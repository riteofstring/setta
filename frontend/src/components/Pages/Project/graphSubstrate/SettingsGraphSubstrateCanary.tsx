import Background from "forks/xyflow/background/Background";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  useLocalStorage,
  useMisc,
  useProjectState,
  useSettings,
} from "state/definitions";
import { useTabScope } from "utils/focusManager";
import { isMacOs } from "utils/utils";
import { selectSettingsGraphSubstrateCanarySections } from "./settingsGraphSubstrateCanaryModel";
import {
  createSettingsGraphSubstrateCanaryPaneInteractionController,
  type SettingsGraphSubstrateCanaryPaneInteractionController,
} from "./settingsGraphSubstrateCanaryPaneInteractionController";
import { useSettingsGraphSubstrateCanarySceneRuntime } from "./settingsGraphSubstrateCanarySceneRuntime";
import { useSettingsGraphSubstrateCanarySceneState } from "./settingsGraphSubstrateCanarySceneState";
import {
  createSettingsGraphSubstrateCanarySectionDragController,
  type SettingsGraphSubstrateCanarySectionDragController,
} from "./settingsGraphSubstrateCanarySectionDragController";
import { SettingsGraphSubstrateCanarySectionsLayer } from "./settingsGraphSubstrateCanarySectionsLayer";
import { useSettingsGraphSubstrateCanaryViewportRuntime } from "./settingsGraphSubstrateCanaryViewportRuntime";

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
  const {
    draggingSectionId,
    sectionById,
    sectionPositionOverride,
    setDraggingSectionId,
    setSectionPositionOverride,
  } = useSettingsGraphSubstrateCanarySceneState(sections);
  const sceneSnapshot = useSettingsGraphSubstrateCanarySceneRuntime({
    draggingSectionId,
    sectionPositionOverride,
    sections,
  });
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
  const { overviewVis, overviewTrueWidth, uiEditorVis, uiEditorTrueWidth } =
    useLocalStorage(
      (state) => ({
        overviewVis: state.overviewVis,
        overviewTrueWidth: state.overviewTrueWidth,
        uiEditorVis: state.uiEditorVis,
        uiEditorTrueWidth: state.uiEditorTrueWidth,
      }),
      _.isEqual,
    );
  const snapToGrid = useLocalStorage((state) => state.snapToGrid);
  const viewportRuntime = useSettingsGraphSubstrateCanaryViewportRuntime({
    defaultZoomLevel,
    maxZoom,
    minZoom,
    overviewTrueWidth,
    overviewVisible: overviewVis,
    rootRef,
    sceneSnapshot,
    sharedProjectViewport,
    uiEditorTrueWidth,
    uiEditorVisible: uiEditorVis,
  });
  const paneInteractionBehaviorRef = useRef({
    isMacOs: isMacOs(),
    maxZoom: 4,
    minZoom: 0.1,
    panOnScroll: false,
    panOnScrollMode,
    panOnScrollSpeed: 0,
    zoomActivationKeyPressed: false,
    zoomOnPinch: false,
    zoomOnScroll: false,
  });
  const paneInteractionControllerRef =
    useRef<SettingsGraphSubstrateCanaryPaneInteractionController | null>(null);
  const sectionDragControllerRef =
    useRef<SettingsGraphSubstrateCanarySectionDragController | null>(null);

  useEffect(() => {
    return () => {
      sectionDragControllerRef.current?.cleanup();
      paneInteractionControllerRef.current?.cleanup();
    };
  }, []);

  const sectionByIdRef = useRef(sectionById);
  sectionByIdRef.current = sectionById;

  paneInteractionBehaviorRef.current = {
    isMacOs: isMacOs(),
    maxZoom,
    minZoom,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    zoomActivationKeyPressed,
    zoomOnPinch,
    zoomOnScroll,
  };
  const sectionDragBehaviorRef = useRef({
    nodeDragThreshold: 0,
    snapGrid,
    snapToGrid,
  });
  sectionDragBehaviorRef.current = {
    nodeDragThreshold,
    snapGrid,
    snapToGrid,
  };

  if (paneInteractionControllerRef.current === null) {
    paneInteractionControllerRef.current =
      createSettingsGraphSubstrateCanaryPaneInteractionController({
        applyControlledViewportChange:
          viewportRuntime.applyControlledViewportChange,
        commitLocalViewport: viewportRuntime.commitLocalViewport,
        getResolvedViewport: viewportRuntime.getResolvedViewport,
        getRootBounds: viewportRuntime.getRootBounds,
        getWheelBehavior: () => paneInteractionBehaviorRef.current,
        onViewportPanningChange: viewportRuntime.onViewportPanningChange,
        syncViewportInteractionState:
          viewportRuntime.syncViewportInteractionState,
      });
  }
  const paneInteractionController = paneInteractionControllerRef.current;

  if (sectionDragControllerRef.current === null) {
    sectionDragControllerRef.current =
      createSettingsGraphSubstrateCanarySectionDragController({
        getNodeDragThreshold: () =>
          sectionDragBehaviorRef.current.nodeDragThreshold,
        getResolvedViewport: viewportRuntime.getResolvedViewport,
        getSectionById: (sectionId) => sectionByIdRef.current.get(sectionId),
        getSnapSettings: () => ({
          snapGrid: sectionDragBehaviorRef.current.snapGrid,
          snapToGrid: sectionDragBehaviorRef.current.snapToGrid,
        }),
        onDraggingSectionIdChange: setDraggingSectionId,
        onSectionPositionOverrideChange: setSectionPositionOverride,
      });
  }
  const sectionDragController = sectionDragControllerRef.current;

  useEffect(() => {
    if (
      (draggingSectionId && !sectionById.has(draggingSectionId)) ||
      (sectionPositionOverride &&
        !sectionById.has(sectionPositionOverride.sectionId)) ||
      sections.length === 0
    ) {
      sectionDragController.cancelSectionDrag();
    }
  }, [
    draggingSectionId,
    sectionById,
    sectionDragController,
    sectionPositionOverride,
    sections.length,
  ]);

  function handlePanePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.handlePanePointerDown({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        target: event.target,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePanePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.handlePanePointerMove({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    event.preventDefault();
  }

  function finishPanePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.finishPanePan({
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePaneWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (
      !paneInteractionController.handlePaneWheel({
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: event.ctrlKey,
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        shiftKey: event.shiftKey,
        target: event.target,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

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
        cursor: viewportRuntime.isViewportPanning ? "grabbing" : "grab",
      }}
      className="react-flow setta-light dark:setta-dark"
      data-tab-scope="canvas"
      data-testid="graph-substrate-canary"
      onClick={handlePaneClick}
      onPointerDown={handlePanePointerDown}
      onPointerMove={handlePanePointerMove}
      onPointerUp={finishPanePan}
      onPointerCancel={finishPanePan}
      onWheel={handlePaneWheel}
    >
      {snapToGrid && showGridLines && <Background />}
      <div
        className="react-flow__viewport"
        data-testid="graph-substrate-canary-viewport"
        style={{
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
          transform: viewportRuntime.resolvedViewport
            ? `translate(${viewportRuntime.resolvedViewport.x}px, ${viewportRuntime.resolvedViewport.y}px) scale(${viewportRuntime.resolvedViewport.zoom})`
            : undefined,
          transformOrigin: "0 0",
          zIndex: 1,
        }}
      >
        {sceneSnapshot.sections.length > 0 ? (
          <SettingsGraphSubstrateCanarySectionsLayer
            draggingSectionId={draggingSectionId}
            sceneSections={sceneSnapshot.sections}
            sectionDragController={sectionDragController}
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
